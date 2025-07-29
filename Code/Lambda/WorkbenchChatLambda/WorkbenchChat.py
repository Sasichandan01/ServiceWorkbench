import json
import os
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
    """
    Recursively converts data types to DynamoDB-compatible types.
    Args:
        obj: Object to sanitize (dict, list, float, datetime, etc.)
    Returns:
        Object with DynamoDB-safe data types
    """
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
    """
    Adds or updates a chat message in DynamoDB with optional trace and S3 key information.
    Args:
        workspace_id: Unique identifier for the workspace
        solution_id: Unique identifier for the solution
        user_id: Unique identifier for the user
        role: Role of the message sender (user/assistant)
        message: Optional message content
        trace: Optional trace information (string or list)
        message_id: Optional unique message identifier
        s3_key: Optional S3 key for associated files
        chat_context: Context type for the chat (default "AIChat")
    Returns:
        None - performs DynamoDB operations
    """
    LOGGER.info("IN websocket_handler.add_chat_message, adding message for user %s in solution %s", user_id, solution_id)

    timestamp = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    chat_id = "%s#%s#%s" % (solution_id, user_id, chat_context)

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
            LOGGER.info("IN websocket_handler.add_chat_message, updating existing message with ID %s", message_id)
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
    LOGGER.info("IN websocket_handler.add_chat_message, creating new message for user %s", user_id)
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


def get_latest_chat_messages(user_id, solution_id, limit=10,chat_context="AIChat"):
    """
    Retrieves the latest chat messages for a user and solution in chronological order.
    Args:
        user_id: Unique identifier for the user
        solution_id: Unique identifier for the solution
        limit: Maximum number of messages to retrieve (default 10)
        chat_context: Context type for the chat (default "AIChat")
    Returns:
        list: List of chat message items in chronological order
    """
    LOGGER.info("IN websocket_handler.get_latest_chat_messages, fetching %s messages for user %s in solution %s", limit, user_id, solution_id)
    
    chat_id = "%s#%s#%s" % (solution_id, user_id, chat_context)

    # Step 1: Fetch latest N messages (reverse scan)
    response = chat_table.query(
        KeyConditionExpression=Key('ChatId').eq(chat_id),
        ScanIndexForward=False,  # Newest first
        Limit=limit
    )
    latest_items = response['Items']
    
    return list(reversed(latest_items))

def extract_agent_info():
    """
    Extracts agent configuration information from the lookup table.
    Args:
        None
    Returns:
        dict: Dictionary mapping agent types to their AgentId and AgentAliasId
    """
    LOGGER.info("IN websocket_handler.extract_agent_info, retrieving agent configurations from lookup table")
    
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

    LOGGER.info("IN websocket_handler.extract_agent_info, successfully extracted %s agent configurations", len(agents_info))
    return agents_info

def generate_requirements():
    """
    Generates a list of Python package requirements for Lambda functions.
    Args:
        None
    Returns:
        list: List of package requirement strings with versions
    """
    return ["boto3==1.28.63", "pyjwt==2.8.0", "requests==2.31.0"]

def read_multiple_s3_files(bucket: str, prefix: str) -> dict[str, str]:
    """
    Reads multiple files from S3 bucket with given prefix and returns their contents.
    Args:
        bucket: S3 bucket name
        prefix: S3 key prefix to filter files
    Returns:
        dict[str, str]: Dictionary mapping filenames to their content as strings
    """
    LOGGER.info("IN websocket_handler.read_multiple_s3_files, reading files from s3://%s/%s", bucket, prefix)
    
    result = {}
    try:
        response = s3_client.list_objects_v2(Bucket=bucket, Prefix=prefix)
        if 'Contents' not in response:
            LOGGER.warning("No files found under s3://%s/%s", bucket, prefix)
            return result

        for obj in response['Contents']:
            key = obj['Key']
            if key.endswith('/'):  # skip folders
                continue
            file_obj = s3_client.get_object(Bucket=bucket, Key=key)
            body = file_obj['Body'].read()
            filename = key.split('/')[-1]
            result[filename] = body.decode('utf-8')
        
        LOGGER.info("IN websocket_handler.read_multiple_s3_files, successfully read %s files", len(result))
        return result

    except ClientError as e:
        code = e.response['Error']['Code']
        LOGGER.warning("S3 error %s for prefix s3://%s/%s", code, bucket, prefix)
        return result

def read_selected_s3_files(bucket: str, prefix: str, filenames: list[str]) -> dict[str, str]:
    """
    Reads specific files from S3 bucket using provided filenames and prefix.
    Args:
        bucket: S3 bucket name
        prefix: S3 key prefix for file location
        filenames: List of specific filenames to read
    Returns:
        dict[str, str]: Dictionary mapping filenames to their content or error messages
    """
    LOGGER.info("IN websocket_handler.read_selected_s3_files, reading %s specific files from s3://%s/%s", len(filenames), bucket, prefix)

    result = {}

    if prefix and not prefix.endswith('/'):
        prefix += '/'
    
    for filename in filenames:
        try:
            if 'code' in filename:
                filename.replace('code', 'codes')
            # Construct the full S3 key
            key = "%s%s" % (prefix, filename)
            
            # Get the specific file from S3
            file_obj = s3_client.get_object(Bucket=bucket, Key=key)
            body = file_obj['Body'].read()
            result[filename] = body.decode('utf-8')
            
        except ClientError as e:
            code = e.response['Error']['Code']
            if code == 'NoSuchKey':
                LOGGER.warning("File not found: s3://%s/%s", bucket, key)
                result[filename] = "Error: File not found - s3://%s/%s" % (bucket, key)
            else:
                LOGGER.warning("S3 error %s for file s3://%s/%s", code, bucket, key)
                result[filename] = "Error: %s - s3://%s/%s" % (code, bucket, key)

        except Exception as e:
            LOGGER.warning("Unexpected error reading s3://%s/%s: %s", bucket, key, str(e))
            result[filename] = "Error: %s - s3://%s/%s" % (str(e), bucket, key)
    
    LOGGER.info("IN websocket_handler.read_selected_s3_files, processed %s files", len(result))
    return result


def send_message_to_websocket(client, conn_id, message):
    """
    Sends a message to a WebSocket connection through API Gateway.
    Args:
        client: API Gateway management client
        conn_id: WebSocket connection ID
        message: Message object to send (will be JSON serialized)
    Returns:
        None - performs WebSocket send operation
    """
    try:
        client.post_to_connection(
            ConnectionId=conn_id,
            Data=json.dumps(message).encode('utf-8')
        )
        LOGGER.info("IN websocket_handler.send_message_to_websocket, successfully sent message to %s", conn_id)
    except Exception as e:
        LOGGER.error("IN websocket_handler.send_message_to_websocket, WebSocket send failed for %s: %s", conn_id, e)


def handle_send_message(event, apigw_client, connection_id, user_id):
    """
    Handles incoming user messages and orchestrates AI agent responses through Bedrock.
    Args:
        event: WebSocket event containing message body
        apigw_client: API Gateway management client for WebSocket responses
        connection_id: WebSocket connection identifier
        user_id: Unique identifier for the user
    Returns:
        dict: Status response with statusCode and body, or None for successful processing
    """
    LOGGER.info("IN websocket_handler.handle_send_message, handling message for user %s", user_id)
    
    body = json.loads(event.get('body', '{}'))
    LOGGER.info("IN websocket_handler.handle_send_message, received body: %s", body)
    
    user_prompt = body.get('userMessage')
    agent_info=extract_agent_info()
    chatcontext =body.get('Context', 'AIChat')
    LOGGER.info("IN websocket_handler.handle_send_message, received chat context: %s", chatcontext)
   
    combined_prompt=""
    if chatcontext == 'Editor':
        file_context=body.get('FileContext')
        LOGGER.info("IN websocket_handler.handle_send_message, processing file context: %s", file_context)
        if file_context:
            s3_data=read_selected_s3_files("develop-service-workbench-workspaces","workspaces/%s/solutions/%s" % (body['workspaceid'], body['solutionid']), file_context)
            combined_prompt = "Here is the file context: %s." % s3_data
    message_id = str(uuid.uuid4())
    user_message_id = str(uuid.uuid4())

    if 'workspaceid' not in body or 'solutionid' not in body:
        msg = "Missing WorkspaceId or SolutionId"
        LOGGER.error("IN websocket_handler.handle_send_message, %s", msg)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})

        return {"statusCode": 400, "body": json.dumps({"message": msg})}

    if not user_prompt:
        msg = "Missing userMessage in body"
        LOGGER.warning("IN websocket_handler.handle_send_message, %s", msg)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})
        return {"statusCode": 400, "body": json.dumps({"message": msg})}

    add_chat_message(body['workspaceid'], body['solutionid'], user_id, 'user', user_prompt, message_id=user_message_id, chat_context=chatcontext)

    current_lambda_requirements = generate_requirements()
    
    # Get the last 10 chat messages
    chat_history = get_latest_chat_messages(user_id, body['solutionid'], limit=10,chat_context=chatcontext)
    chat_context = ""
    if chat_history:
        chat_context = "\n\nChat History:\n"
        for msg in chat_history:
            role = msg.get('Sender', 'unknown')
            message = msg.get('Message', '')
            if message:
                chat_context += "%s: %s\n" % (role.capitalize(), message)
    
    combined_prompt+= "Here are the lambda dependencies: %s. Here is the user prompt: %s. Here is the workspace id %s and solution id %s. Here is the user_id %s and chat context is %s" % (
        current_lambda_requirements, user_prompt, body['workspaceid'], body['solutionid'], user_id, chat_context
    )

    LOGGER.info("IN websocket_handler.handle_send_message, invoking Bedrock agent with prompt length: %s", len(combined_prompt))

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
    s3_key=None
    
    for event in invoke_agent_response["completion"]:
        trace = event.get("trace")
        if trace:
            LOGGER.info("IN websocket_handler.handle_send_message, processing trace from agent")
            response_obj = {"Metadata": {"IsComplete": False}}

            if "failureTrace" in trace["trace"]:
                failure_reason = trace["trace"]["failureTrace"].get("failureReason", "Unknown failure. Please try again after some time.")
                LOGGER.error("IN websocket_handler.handle_send_message, agent failure: %s", failure_reason)
                
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
                    LOGGER.info("IN websocket_handler.handle_send_message, knowledge base observation received")
            
                elif observation_type == "ACTION_GROUP" and trace['agentId'] == agent_info['codegeneration'].get('AgentId'):
                    try:
                        text = trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                        LOGGER.info("IN websocket_handler.handle_send_message, code generation agent response received")
                        
                        outer_json = json.loads(text)
                        code_generated = outer_json.get("<codegenerated>", "false")
                        function = outer_json.get("<function>", None)
                        
                        if code_generated == "true" and function == "storeServiceArtifactsInS3":
                            LOGGER.info("IN websocket_handler.handle_send_message, code generation completed successfully")
                            s3_key = "workspaces/%s/solutions/%s/codes" % (body['workspaceid'], body['solutionid'])
                            
                        else:
                            LOGGER.info("IN websocket_handler.handle_send_message, code generation not completed")
                            
                    except json.JSONDecodeError as e:
                        LOGGER.error("IN websocket_handler.handle_send_message, error parsing code generation response: %s", e)
                    except Exception as e:
                        LOGGER.error("IN websocket_handler.handle_send_message, error processing code generation: %s", e)

                elif observation_type == "ACTION_GROUP" and trace['agentId'] == agent_info['cftgeneration'].get('AgentId'):
                    try:
                        text = trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                        LOGGER.info("IN websocket_handler.handle_send_message, CFT generation agent response received")
                        
                        outer_json = json.loads(text)
                        cft_generated = outer_json.get("<codegenerated>", "false")
                        
                        if cft_generated == "true":
                            LOGGER.info("IN websocket_handler.handle_send_message, CFT generation completed successfully")
                            s3_key = "workspaces/%s/solutions/%s/cft" % (body['workspaceid'], body['solutionid'])
                            
                            # Don't send code immediately, wait for completion
                            code_payload = read_multiple_s3_files("develop-service-workbench-workspaces", s3_key)
                            if 'Metadata' not in code_payload:
                                code_payload['Metadata'] = {}
                            code_payload['Metadata']['IsCode'] = True
                            # Don't set IsComplete here yet
                            
                        else:
                            LOGGER.info("IN websocket_handler.handle_send_message, CFT generation not completed")
                            
                    except json.JSONDecodeError as e:
                        LOGGER.error("IN websocket_handler.handle_send_message, error parsing CFT generation response: %s", e)
                    except Exception as e:
                        LOGGER.error("IN websocket_handler.handle_send_message, error processing CFT generation: %s", e)

                elif observation_type == "ACTION_GROUP" and trace['agentId'] == agent_info['architecture'].get('AgentId'):
                    try:
                        text = trace['trace']['orchestrationTrace']['observation']['actionGroupInvocationOutput']['text']
                        LOGGER.info("IN websocket_handler.handle_send_message, architecture agent response received")
                        
                        # Fix: Parse JSON to extract URL
                        outer_json = json.loads(text)
                        url_generated = outer_json.get('<PresignedURL>', "false")
                    
                        if url_generated != "false":
                            LOGGER.info("IN websocket_handler.handle_send_message, architecture URL generated successfully")
                            
                            # Don't send immediately, wait for completion
                            if 'Metadata' not in code_payload:
                                code_payload['Metadata'] = {}
                            code_payload['PresignedURL'] = url_generated
                            code_payload['Metadata']['IsPresignedURL'] = True
                            # Don't set IsComplete here yet
                            
                        else:
                            LOGGER.info("IN websocket_handler.handle_send_message, architecture URL not generated")
                            
                    except json.JSONDecodeError as e:
                        LOGGER.error("IN websocket_handler.handle_send_message, error parsing architecture response: %s", e)
                    except Exception as e:
                        LOGGER.error("IN websocket_handler.handle_send_message, error processing architecture response: %s", e)

                elif observation_type == "FINISH" and agent_info['supervisor'].get('AgentId') == trace['agentId']:
                    LOGGER.info("IN websocket_handler.handle_send_message, supervisor agent completed processing")
                    
                    response_obj["AIMessage"] = trace["trace"]["orchestrationTrace"]["observation"]["finalResponse"]["text"]
                    response_obj["Metadata"]["IsComplete"] = True
                    
                    # Send the final AI message first
                    send_message_to_websocket(apigw_client, connection_id, response_obj)
                    
                    # Now send code/artifacts if they were generated
                    if code_generated == "true" :
                        s3_key = "workspaces/%s/solutions/%s/codes" % (body['workspaceid'], body['solutionid'])
                        code_payload = read_multiple_s3_files("develop-service-workbench-workspaces", s3_key)
                        if 'Metadata' not in code_payload:
                            code_payload['Metadata'] = {}
                        code_payload['Metadata']['IsCode'] = True
                        send_message_to_websocket(apigw_client, connection_id, code_payload)
                        LOGGER.info("IN websocket_handler.handle_send_message, code payload sent after completion")
                    
                    # Handle URL separately if generated
                    if url_generated != "false" and 'PresignedURL' in code_payload:
                        # URL payload was already prepared above
                        if 'Metadata' not in code_payload:
                            code_payload['Metadata'] = {}
                        code_payload['Metadata']['IsComplete'] = True
                        send_message_to_websocket(apigw_client, connection_id, code_payload)
                        LOGGER.info("IN websocket_handler.handle_send_message, URL payload sent after completion")
                    
                    if cft_generated == "true" and 'Metadata' in code_payload:
                        code_payload['Metadata']['IsComplete'] = True
                        send_message_to_websocket(apigw_client, connection_id, code_payload)
                        LOGGER.info("IN websocket_handler.handle_send_message, CFT payload sent after completion")
                    
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
                            chat_context=chatcontext
                        )
                    else:
                        add_chat_message(
                            body['workspaceid'], 
                            body['solutionid'], 
                            user_id, 
                            'assistant', 
                            message=response_obj["AIMessage"], 
                            message_id=message_id, 
                            chat_context=chatcontext
                        )
                    
                    # Reset state after completion
                    code_payload = {}
                    code_generated = "false"
                    cft_generated = "false"
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
                    chat_context=chatcontext
                )
                
            LOGGER.debug("IN websocket_handler.handle_send_message, current state - code_generated: %s, cft_generated: %s, url_generated: %s", code_generated, cft_generated, url_generated)

        # Log final state if we exit the loop without FINISH
        LOGGER.warning("IN websocket_handler.handle_send_message, exited trace loop without FINISH - Final state: code_generated=%s, cft_generated=%s, url_generated=%s", code_generated, cft_generated, url_generated)


def lambda_handler(event, context):
    """
    Main AWS Lambda handler for WebSocket API Gateway events.
    Args:
        event: AWS Lambda event object containing WebSocket request details
        context: AWS Lambda context object with runtime information
    Returns:
        dict: HTTP response with statusCode for WebSocket connection management
    """
    LOGGER.info("IN websocket_handler.lambda_handler, processing WebSocket event")
    LOGGER.debug("IN websocket_handler.lambda_handler, event details: %s", json.dumps(event, default=str))
    
    rc = event['requestContext']
    cid = rc['connectionId']

    client = boto3.client('apigatewaymanagementapi', endpoint_url="https://%s/%s" % (rc['domainName'], rc['stage']))

    if rc['routeKey'] == '$connect':
        LOGGER.info("IN websocket_handler.lambda_handler, WebSocket connection established for %s", cid)
        send_message_to_websocket(client, cid, {'status': 'connected', 'message': 'Welcome!'})
        return {'statusCode': 200}

    if rc['routeKey'] == '$disconnect':
        LOGGER.info("IN websocket_handler.lambda_handler, WebSocket disconnected: %s", cid)
        return {'statusCode': 200}

    if rc['routeKey'] == 'sendMessage':
        LOGGER.info("IN websocket_handler.lambda_handler, processing sendMessage route for connection %s", cid)
        handle_send_message(event, client, cid, rc['authorizer']['user_id'])

    LOGGER.warning("IN websocket_handler.lambda_handler, unhandled route key: %s", rc.get('routeKey'))
    return {'statusCode': 400}