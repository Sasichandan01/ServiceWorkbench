import json
import os
import os
import re
import logging
import boto3
from datetime import datetime
from decimal import Decimal
from botocore.config import Config
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
CONFIG = Config(retries={'mode':'adaptive','max_attempts':5}, connect_timeout=60,read_timeout=300)
bedrock_agent_runtime_client = boto3.client('bedrock-agent-runtime', config=CONFIG)
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)
look_up_table= os.environ.get('LOOK_UP_TABLE')

KEYWORD_MAP = {
    "cft": "cftgeneration",
    "code": "codegeneration",
    "architecture": "architecture",
    "query": "queryparser",
    "supervisor": "supervisor"
}

def extract_agent_info():
    table = dynamodb.Table(look_up_table)
    response = table.scan()
    items = response.get('Items', [])

    agents_info = {}
    for item in items:
        full_agent_id = item.get('AgentId', '')
        if not full_agent_id:
            continue

        normalized_id = full_agent_id.lower()

        # Try to match one of the known keywords
        matched_key = None
        for keyword, standard_key in KEYWORD_MAP.items():
            if keyword in normalized_id:
                matched_key = standard_key
                break

        if not matched_key:
            # Fallback: try to extract the second last part if it ends with 'Agent'
            parts = full_agent_id.split('-')
            if parts[-1].lower() == "agent" and len(parts) >= 3:
                matched_key = parts[-2].lower()
            else:
                matched_key = parts[-1].replace("Agent", "").lower()

        agents_info[matched_key] = {
            'AgentAliasId': item.get('AgentAliasId', ''),
            'AgentId': item.get('ReferenceId', '')
        }

    return agents_info

def generate_requirements():
    return ["boto3==1.28.63", "pyjwt==2.8.0", "requests==2.31.0"]

def read_s3_file(bucket: str, key: str, as_text: bool = True) -> str | None:
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response['Body'].read()
        return body.decode('utf-8') if as_text else body
    except ClientError as e:
        code = e.response['Error']['Code']
        LOGGER.warning(f"S3 error {code} for s3://{bucket}/{key}")
        return None

def send_message_to_websocket(client, conn_id, message):
    try:
        client.post_to_connection(
            ConnectionId=conn_id,
            Data=json.dumps(message).encode('utf-8')
        )
        LOGGER.info(f"Sent to {conn_id}: {message}")
    except Exception as e:
        LOGGER.error(f"WebSocket send failed for {conn_id}: {e}")



def read_all_files_from_prefix(bucket, prefix):
    files_content = {}

    try:
        # List all objects under the given prefix
        paginator = s3_client.get_paginator('list_objects_v2')
        page_iterator = paginator.paginate(Bucket=bucket, Prefix=prefix)

        for page in page_iterator:
            if 'Contents' not in page:
                continue
            for obj in page['Contents']:
                key = obj['Key']
                if key.endswith('/'):  # skip folders
                    continue
                try:
                    response = s3_client.get_object(Bucket=bucket, Key=key)
                    content = response['Body'].read().decode('utf-8')
                    filename = key.split('/')[-1]
                    files_content[filename] = content
                except Exception as e:
                    LOGGER.error(f"Failed to read {key}: {e}")
                    files_content[key] = f"<< Error reading file: {e} >>"
    except Exception as e:
        LOGGER.error(f" Failed to list objects from prefix '{prefix}': {e}")
    
    return files_content

def handle_send_message(event, apigw_client, connection_id, user_id):

    body = json.loads(event.get('body', '{}'))
    user_prompt = body.get('userMessage')
    agent_info=extract_agent_info()
    
    if 'workspaceid' not in body or 'solutionid' not in body:
        msg = "Missing WorkspaceId or SolutionId"
        LOGGER.error(msg)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})

        return {"statusCode": 400, "body": json.dumps({"message": msg})}

    if not user_prompt:
        msg = "Missing userMessage in body"
        LOGGER.warning(msg)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})
        return {"statusCode": 400, "body": json.dumps({"message": msg})}


    s3_key = f"{body['workspaceid']}/{body['solutionid']}/memory.txt"
    memory_content = read_s3_file( 'wb-bhargav-misc-bucket', s3_key)
    current_lambda_requirements = generate_requirements()
    combined_prompt = f"Here are the lambda dependencies: {current_lambda_requirements}. Here is the user prompt: {user_prompt}. Here is the workspace id {body['workspaceid']} and solution id {body['solutionid']}. Here is the username {user_id}"

    if memory_content:
        combined_prompt += f" Here is the memory context: {memory_content}"
    
    LOGGER.info(f"Prompt: {combined_prompt}")

    invoke_agent_response = bedrock_agent_runtime_client.invoke_agent(
        agentId=agent_info['supervisor'].get('AgentId'),
        agentAliasId=agent_info['supervisor'].get('AgentAliasId'),
        sessionId=connection_id[:-1],
        inputText=combined_prompt,
        bedrockModelConfigurations={'performanceConfig': {'latency': 'standard'}},
        enableTrace=True,
        endSession=False,
        sessionState={'sessionAttributes': {'user_id': user_id}},
        streamingConfigurations={'streamFinalResponse': False}
    )
    
    
    for event in invoke_agent_response["completion"]:
        trace = event.get("trace")
        print(trace)
        if trace:
            response_obj = {"Metadata": {"IsComplete": False}}

            if "failureTrace" in trace["trace"]:
                failure_reason = trace["trace"]["failureTrace"].get("failureReason", "Unknown failure. Please try again after some time.")
                if any(error in failure_reason for error in LAMBDA_ERROR):

                    response_obj["AITrace"] = "It seems like the Lambda function code contains unhandled errors.."
                    send_message_to_websocket( apigw_client, connection_id,response_obj)

                    response_obj.pop("AITrace")
                    response_obj["AIMessage"] = "ERROR : Your code contains unhandled errors. Check the agent logs for error details, then try again after fixing the error."
                else:
                    response_obj["AIMessage"] = failure_reason

                response_obj["Metadata"]["IsComplete"] = True
                send_message_to_websocket( apigw_client, connection_id,response_obj)
                return
            elif "rationale" in trace["trace"]["orchestrationTrace"]:
                response_obj["AITrace"] = trace["trace"]["orchestrationTrace"]["rationale"]["text"]
            
            elif "observation" in trace["trace"]["orchestrationTrace"]:
                observation_type = trace["trace"]["orchestrationTrace"]["observation"]["type"]
                
                if observation_type == "KNOWLEDGE_BASE":
                    response_obj["AITrace"] = [
                        {
                            "Dataset": reference["location"]["s3Location"]["uri"].split("/")[-3],
                            "Domain": reference["location"]["s3Location"]["uri"].split("/")[-4],
                            "File": reference["location"]["s3Location"]["uri"].split("/")[-1]
                        } for reference in trace["trace"]["orchestrationTrace"]["observation"]["knowledgeBaseLookupOutput"]["retrievedReferences"]
                    ]
             
                elif observation_type == "ACTION_GROUP" and trace['agentId']==agent_info['codegeneration'].get('AgentId'):
                    text= trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                    outer_json = json.loads(text)
                    code_generated = outer_json.get("<codegenerated>", "false")
                    
                    if code_generated == "true":
                        print("<codegenerated> is true")
                        code_payload = read_all_files_from_prefix("bhargav9938", f"workspaces/{body['workspaceid']}/solutions/{body['solutionid']}")
                        send_message_to_websocket(apigw_client, connection_id, code_payload)

                    else:
                        print("<codegenerated> is not true")
                
                elif observation_type == "FINISH" :
                    response_obj["AIMessage"] = trace["trace"]["orchestrationTrace"]["observation"]["finalResponse"]["text"]
                    response_obj["Metadata"]["IsComplete"] = True
                
            if "AITrace" in response_obj or "AIMessage" in response_obj:
                send_message_to_websocket(apigw_client, connection_id,response_obj)    



def lambda_handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event, default=str))
    
    rc = event['requestContext']
    cid = rc['connectionId']

    client = boto3.client('apigatewaymanagementapi', endpoint_url=f"https://{rc['domainName']}/{rc['stage']}")

    if rc['routeKey'] == '$connect':
        send_message_to_websocket(client, cid, {'status': 'connected', 'message': 'Welcome!'})
        return {'statusCode': 200}

    if rc['routeKey'] == '$disconnect':
        LOGGER.info(f"Disconnected: {cid}")
        return {'statusCode': 200}

    if rc['routeKey'] == 'sendMessage':
        handle_send_message(event, client, cid, rc['authorizer']['user_id'])
        # send_message_to_websocket(client, cid, {'status': 'Success', 'message': 'Completed'})

    return {'statusCode': 400}




