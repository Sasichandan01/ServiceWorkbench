import json
import re
import logging
import boto3
import hashlib
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
seen_hashes = set()

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



def find_code_variables(obj):
    variables = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'codeGenerated':
                variables.append((k, v))
            else:
                variables.extend(find_code_variables(v))
    elif isinstance(obj, list):
        for item in obj:
            variables.extend(find_code_variables(item))
    return variables


def clean_response_string(input_data):
  if isinstance(input_data, list):
    temp_strings = []
    for item in input_data:
      s_item = str(item)
      s_item = s_item.replace("\n", "")
      s_item = s_item.replace("\\", "")
      temp_strings.append(s_item)
    return " ".join(temp_strings)
  else:
    response_string = str(input_data)
    cleaned_string = response_string.replace("\n", "")
    cleaned_string = cleaned_string.replace("\\", "")

    return cleaned_string



def handle_send_message(event, apigw_client, connection_id, user_id):

    body = json.loads(event.get('body', '{}'))
    user_prompt = body.get('userMessage')

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
        agentId="TCMEZDRP4O",
        agentAliasId="BNWPCZI2IV",
        sessionId=connection_id[:-1],
        inputText=combined_prompt,
        bedrockModelConfigurations={'performanceConfig': {'latency': 'standard'}},
        enableTrace=True,
        endSession=False,
        sessionState={'sessionAttributes': {'user_id': user_id}},
        streamingConfigurations={'streamFinalResponse': False}
    )
    
    seen_code_vars = set()
    for event in invoke_agent_response["completion"]:
        trace = event.get("trace")
        print(trace)
        if trace:
            LOGGER.info("trace", trace)
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
             
                # elif observation_type == "ACTION_GROUP":
                    # response_obj["AITrace"] = [{
                    #     "Response from Lambda function" : trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                    # }]
                
                elif observation_type == "FINISH" and trace['agentId']=='TCMEZDRP4O':
                    response_obj["AIMessage"] = trace["trace"]["orchestrationTrace"]["observation"]["finalResponse"]["text"]
                    response_obj["Metadata"]["IsComplete"] = True
                

            
            # if "AITrace" in response_obj:
            #     response_obj["AITrace"] = clean_response_string(response_obj["AITrace"])
            # elif "AIMessage" in response_obj:
            #     response_obj["AIMessage"] = clean_response_string(response_obj["AIMessage"])

     
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




