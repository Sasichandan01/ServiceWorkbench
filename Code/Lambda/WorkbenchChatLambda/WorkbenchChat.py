import json
import os
import re
import logging
import boto3
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from botocore.config import Config
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key


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

MAX_MESSAGES = 10
chat_table = dynamodb.Table(os.environ['CHAT_TABLE'])




def sanitize_for_dynamodb(obj):
    """Recursively convert data types to DynamoDB-safe types."""
    if isinstance(obj, dict):
        return {k: sanitize_for_dynamodb(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_dynamodb(i) for i in obj]
    elif isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, (int, Decimal)):
        return obj
    elif isinstance(obj, datetime):
        return obj.isoformat()
    else:
        return obj

def add_chat_message(workspace_id, solution_id, user_id, role, message=None, trace=None, message_id=None,s3_key=None, chat_context="AIChat"):
    timestamp = datetime.utcnow().isoformat()
    chat_id = f"{solution_id}#{user_id}#{chat_context}"

    # Convert trace string to list
    trace_list = []
    if trace:
        try:
            parsed_trace = json.loads(trace)
            trace_list = parsed_trace if isinstance(parsed_trace, list) else [parsed_trace]
        except json.JSONDecodeError:
            trace_list = [trace]

    # Check if message_id exists via GSI
    if message_id:
        response = chat_table.query(
            IndexName='MessageIdIndex',
            KeyConditionExpression=Key('MessageId').eq(message_id),
            Limit=1
        )
        items = response.get('Items', [])
        if items:
            # Message exists — perform update
            update_expr = []
            expr_attrs = {}

            if trace_list:
                update_expr.append("Trace = list_append(if_not_exists(Trace, :empty_trace), :new_trace)")
                expr_attrs[":new_trace"] = sanitize_for_dynamodb(trace_list)
                expr_attrs[":empty_trace"] = []

            if message:
                update_expr.append("Message = :msg")
                expr_attrs[":msg"] = message
            if s3_key:
                update_expr.append("S3Key = :s3_key")
                expr_attrs[":s3_key"] = s3_key
            if update_expr:
                chat_table.update_item(
                    Key={
                        'ChatId': items[0]['ChatId'],
                        'Timestamp': items[0]['Timestamp']
                    },
                    UpdateExpression="SET " + ", ".join(update_expr),
                    ExpressionAttributeValues=expr_attrs
                )
            return

    # No existing message — insert new item
    item = {
        'ChatId': chat_id,
        'Timestamp': timestamp,
        'Sender': role,
        'MessageId': message_id,
    }

    if message:
        item['Message'] = message
    if trace_list:
        item['Trace'] = sanitize_for_dynamodb(trace_list)

    chat_table.put_item(Item=item)


def get_latest_chat_messages(user_id, solution_id, limit=10):
    chat_id = f"{solution_id}#{user_id}#AIChat"

    # Step 1: Fetch latest N messages (reverse scan)
    response = chat_table.query(
        KeyConditionExpression=Key('ChatId').eq(chat_id),
        ScanIndexForward=False,  # Newest first
        Limit=limit
    )
    latest_items = response['Items']
    
    return list(reversed(latest_items))

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

def read_multiple_s3_files(bucket: str, prefix: str) -> dict[str, str]:
    result = {}
    try:
        response = s3_client.list_objects_v2(Bucket=bucket, Prefix=prefix)
        if 'Contents' not in response:
            LOGGER.warning(f"No files found under s3://{bucket}/{prefix}")
            return result

        for obj in response['Contents']:
            key = obj['Key']
            if key.endswith('/'):  # skip folders
                continue
            file_obj = s3_client.get_object(Bucket=bucket, Key=key)
            body = file_obj['Body'].read()
            filename = key.split('/')[-1]
            result[filename] = body.decode('utf-8')
        return result

    except ClientError as e:
        code = e.response['Error']['Code']
        LOGGER.warning(f"S3 error {code} for prefix s3://{bucket}/{prefix}")
        return result

def read_selected_s3_files(bucket: str, prefix: str, filenames: list[str]) -> dict[str, str]:

    result = {}

    if prefix and not prefix.endswith('/'):
        prefix += '/'
    
    for filename in filenames:
        try:
            # Construct the full S3 key
            key = f"{prefix}{filename}"
            
            # Get the specific file from S3
            file_obj = s3_client.get_object(Bucket=bucket, Key=key)
            body = file_obj['Body'].read()
            result[filename] = body.decode('utf-8')
            
        except ClientError as e:
            code = e.response['Error']['Code']
            if code == 'NoSuchKey':
                LOGGER.warning(f"File not found: s3://{bucket}/{key}")
                result[filename] = f"Error: File not found - s3://{bucket}/{key}"
            else:
                LOGGER.warning(f"S3 error {code} for file s3://{bucket}/{key}")
                result[filename] = f"Error: {code} - s3://{bucket}/{key}"

        except Exception as e:
            LOGGER.warning(f"Unexpected error reading s3://{bucket}/{key}: {str(e)}")
            result[filename] = f"Error: {str(e)} - s3://{bucket}/{key}"
    return result


def send_message_to_websocket(client, conn_id, message):
    try:
        client.post_to_connection(
            ConnectionId=conn_id,
            Data=json.dumps(message).encode('utf-8')
        )
        LOGGER.info(f"Sent to {conn_id}: {message}")
    except Exception as e:
        LOGGER.error(f"WebSocket send failed for {conn_id}: {e}")


def handle_send_message(event, apigw_client, connection_id, user_id):

    body = json.loads(event.get('body', '{}'))
    user_prompt = body.get('userMessage')
    agent_info=extract_agent_info()
    chat_context = body.get('Context', 'AIChat')
   
    combined_prompt=""
    if chat_context == 'AIChat':
        file_context=body.get('FileContext')
        if file_context:
            s3_data=read_selected_s3_files("develop-service-workbench-workspaces",f"workspaces/{body['workspaceid']}/solutions/{body['solutionid']}", file_context)
            combined_prompt = f"Here is the file context: {s3_data}."
    message_id = str(uuid.uuid4())
    user_message_id = str(uuid.uuid4())

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

    add_chat_message(body['workspaceid'], body['solutionid'], user_id, 'user', user_prompt, message_id=user_message_id, chat_context=chat_context)

    current_lambda_requirements = generate_requirements()
    
    # Get the last 10 chat messages
    chat_history = get_latest_chat_messages(user_id, body['solutionid'], limit=10)
    chat_context = ""
    if chat_history:
        chat_context = "\n\nChat History:\n"
        for msg in chat_history:
            role = msg.get('Sender', 'unknown')
            message = msg.get('Message', '')
            if message:
                chat_context += f"{role.capitalize()}: {message}\n"
    
    combined_prompt+= f"Here are the lambda dependencies: {current_lambda_requirements}. Here is the user prompt: {user_prompt}. Here is the workspace id {body['workspaceid']} and solution id {body['solutionid']}. Here is the user_id {user_id} and chat context is {chat_context}"

    # if memory_content:
    #     combined_prompt += f" Here is the memory context: {memory_content}"
    
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
    # Initialize state variables at the beginning of your function
    # Initialize state variables at the beginning of your function
    code_payload = {}
    code_generated = "false"
    cft_generated = "false"
    url_generated = "false" 
    code_s3_key = None
    cft_s3_key = None

    for event in invoke_agent_response["completion"]:
        trace = event.get("trace")
        if trace:
            LOGGER.info(f"Trace: {trace}")
            response_obj = {"Metadata": {"IsComplete": False}}

            if "failureTrace" in trace["trace"]:
                failure_reason = trace["trace"]["failureTrace"].get("failureReason", "Unknown failure. Please try again after some time.")
                
                response_obj["AITrace"] = "It seems like the Lambda function code contains unhandled errors.."
                send_message_to_websocket(apigw_client, connection_id, response_obj)

                response_obj.pop("AITrace")
                response_obj["AIMessage"] = "ERROR : Your code contains unhandled errors. Check the agent logs for error details, then try again after fixing the error."
                response_obj["Metadata"]["IsComplete"] = True
                send_message_to_websocket(apigw_client, connection_id, response_obj)
                return
                
            elif "rationale" in trace["trace"]["orchestrationTrace"]:
                response_obj["AITrace"] = trace["trace"]["orchestrationTrace"]["rationale"]["text"]
            
            elif "observation" in trace["trace"]["orchestrationTrace"]:
                observation_type = trace["trace"]["orchestrationTrace"]["observation"]["type"]
                
                if observation_type == "KNOWLEDGE_BASE":
                    LOGGER.info("Knowledge base observation")
            
                elif observation_type == "ACTION_GROUP" and trace['agentId'] == agent_info['codegeneration'].get('AgentId'):
                    try:
                        text = trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                        LOGGER.info(f"Code generation agent response: {text}")
                        
                        outer_json = json.loads(text)
                        code_generated = outer_json.get("<codegenerated>", "false")
                        function = outer_json.get("<function>", None)
                        
                        if code_generated == "true" and function == "storeServiceArtifactsInS3":
                            LOGGER.info("<codegenerated> is true")
                            s3_key = f"workspaces/{body['workspaceid']}/solutions/{body['solutionid']}/codes"
                            

                            code_payload = read_multiple_s3_files("develop-service-workbench-workspaces", s3_key)
                            if 'Metadata' not in code_payload:
                                code_payload['Metadata'] = {}
                            code_payload['Metadata']['IsCode'] = True

                            
                        else:
                            LOGGER.info("<codegenerated> is not true")
                            
                    except json.JSONDecodeError as e:
                        LOGGER.error(f"Error parsing code generation response: {e}")
                    except Exception as e:
                        LOGGER.error(f"Error processing code generation: {e}")

                elif observation_type == "ACTION_GROUP" and trace['agentId'] == agent_info['cftgeneration'].get('AgentId'):
                    try:
                        text = trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                        LOGGER.info(f"CFT generation agent response: {text}")
                        
                        outer_json = json.loads(text)
                        code_generated = outer_json.get("<codegenerated>", "false")
                        
                        if code_generated == "true":
                            LOGGER.info("<codegenerated> is true for CFT")
                            s3_key = f"workspaces/{body['workspaceid']}/solutions/{body['solutionid']}/cft"
                            
                            # Don't send code immediately, wait for completion
                            code_payload = read_multiple_s3_files("develop-service-workbench-workspaces", s3_key)
                            if 'Metadata' not in code_payload:
                                code_payload['Metadata'] = {}
                            code_payload['Metadata']['IsCode'] = True
                            # Don't set IsComplete here yet
                            
                        else:
                            LOGGER.info("<codegenerated> is not true for CFT")
                            
                    except json.JSONDecodeError as e:
                        LOGGER.error(f"Error parsing CFT generation response: {e}")
                    except Exception as e:
                        LOGGER.error(f"Error processing CFT generation: {e}")

                elif observation_type == "ACTION_GROUP" and trace['agentId'] == agent_info['architecture'].get('AgentId'):
                    try:
                        text = trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                        LOGGER.info(f"Architecture agent response: {text}")
                        
                        # Fix: Parse JSON to extract URL
                        outer_json = json.loads(text)
                        url_generated = outer_json.get('<PreSignedURL>', "false")
                    
                        if url_generated != "false":
                            LOGGER.info("URL generated is true")
                            
                            # Don't send immediately, wait for completion
                            if 'Metadata' not in code_payload:
                                code_payload['Metadata'] = {}
                            code_payload['PresignedURL'] = url_generated
                            code_payload['Metadata']['IsPresignedURL'] = True
                            # Don't set IsComplete here yet
                            
                        else:
                            LOGGER.info("URL generated is not true")
                            
                    except json.JSONDecodeError as e:
                        LOGGER.error(f"Error parsing architecture response: {e}")
                    except Exception as e:
                        LOGGER.error(f"Error processing architecture response: {e}")

                elif observation_type == "FINISH" and agent_info['supervisor'].get('AgentId') == trace['agentId']:
                    response_obj["AIMessage"] = trace["trace"]["orchestrationTrace"]["observation"]["finalResponse"]["text"]
                    response_obj["Metadata"]["IsComplete"] = True
                    
                    # Send the final AI message first
                    send_message_to_websocket(apigw_client, connection_id, response_obj)
                    
                    # Now send code/artifacts if they were generated
                    if code_generated == "true" and code_payload:
                        code_payload['Metadata']['IsComplete'] = True
                        send_message_to_websocket(apigw_client, connection_id, code_payload)
                        LOGGER.info("Code payload sent after completion")
                    
                    # Handle URL separately if generated
                    if url_generated != "false" and 'PresignedURL' in code_payload:
                        # URL payload was already prepared above
                        if 'Metadata' not in code_payload:
                            code_payload['Metadata'] = {}
                        code_payload['Metadata']['IsComplete'] = True
                        send_message_to_websocket(apigw_client, connection_id, code_payload)
                        LOGGER.info("URL payload sent after completion")
                    
                    # Store chat message with s3_key if available
                    if s3_key:
                        add_chat_message(
                            body['workspaceid'], 
                            body['solutionid'], 
                            user_id, 
                            'assistant', 
                            message=response_obj["AIMessage"], 
                            message_id=message_id,
                            s3_key=s3_key, 
                            chat_context=chat_context
                        )
                    else:
                        add_chat_message(
                            body['workspaceid'], 
                            body['solutionid'], 
                            user_id, 
                            'assistant', 
                            message=response_obj["AIMessage"], 
                            message_id=message_id, 
                            chat_context=chat_context
                        )
                    
                    # Reset state after completion
                    code_payload = {}
                    code_generated = "false"
                    url_generated = "false"
                    s3_key = None
                    
                    return  # Exit after handling completion

            # Send intermediate traces (rationale, knowledge base results, etc.)
            if "AITrace" in response_obj:
                send_message_to_websocket(apigw_client, connection_id, response_obj)
                # Store assistant trace
                add_chat_message(
                    body['workspaceid'], 
                    body['solutionid'], 
                    user_id, 
                    'assistant',
                    trace=response_obj.get('AITrace'), 
                    message_id=message_id, 
                    chat_context=chat_context
                )
                
            LOGGER.info(f"Current state - code_generated: {code_generated}, cft_generated: {cft_generated}, url_generated: {url_generated}")

        # Log final state if we exit the loop without FINISH
        LOGGER.warning(f"Exited trace loop without FINISH - Final state: code_generated={code_generated}, cft_generated={cft_generated}, url_generated={url_generated}")


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


    return {'statusCode': 400}
