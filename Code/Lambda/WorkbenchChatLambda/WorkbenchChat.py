import json
import logging
import boto3
import os
import uuid 
from botocore.config import Config
from botocore.exceptions import ClientError

# Initialize clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

CONFIG = Config(read_timeout=300, connect_timeout=60, retries={'max_attempts': 3})
bedrock_agent_runtime_client = boto3.client('bedrock-agent-runtime', config=CONFIG)

# Logger setup
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)


def generate_requirements():
    return ["boto3==1.28.63", "pyjwt==2.8.0", "requests==2.31.0"]


def read_s3_file(bucket: str, key: str, as_text: bool = True) -> str | None:
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response['Body'].read()
        return body.decode('utf-8') if as_text else body
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code in ['NoSuchKey', 'NoSuchBucket', 'AccessDenied']:
            LOGGER.warning(f"S3 Error [{error_code}]: s3://{bucket}/{key}")
            return None
        raise
    except Exception as e:
        LOGGER.error(f"Unexpected error reading S3 file: {e}")
        return None


def send_message_to_websocket(apigw_client, connection_id, message_data):
    try:
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(message_data)
        )
        LOGGER.info(f"Sent to {connection_id}: {message_data.get('status')} - {message_data.get('message') or message_data.get('response')}")
    except Exception as e:
        LOGGER.error(f"WebSocket send failed for {connection_id}: {e}")





def handle_send_message(event, apigw_client, connection_id, user_id):

    

    try:
        body = json.loads(event.get('body', '{}'))
        user_prompt = body.get('prompt')
        if  'WorkspaceId' not in body or 'SolutionId' not in body:
            msg = "Missing WorkspaceId or SolutionId"
            LOGGER.error(msg)
            send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})
            return {"statusCode": 400, "body": json.dumps({"message": msg})}
        if not user_prompt:
            msg = "Missing 'prompt' in body"
            LOGGER.warning(msg)
            send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})
            return {"statusCode": 400, "body": json.dumps({"message": msg})}

        bedrock_session_id = connection_id[:-1]
        s3_key = f"{body['WorkspaceId']}/{body['SolutionId']}/memory.txt"
        memory_content = read_s3_file('wb-bhargav-misc-bucket', s3_key)
        current_lambda_requirements = generate_requirements()

        combined_prompt = f"Here are the lambda dependencies: {current_lambda_requirements}. Here is the user prompt: {user_prompt}"
        if memory_content:
            combined_prompt += f" Here is the memory context: {memory_content}"

        send_message_to_websocket(apigw_client, connection_id, {"status": "processing", "message": "Processing your request with the AI agent..."})

        response = bedrock_agent_runtime_client.invoke_agent(
            agentId="TCMEZDRP4O",
            agentAliasId="BNWPCZI2IV",
            sessionId=bedrock_session_id,
            inputText=combined_prompt,
            bedrockModelConfigurations={'performanceConfig': {'latency': 'standard'}},
            enableTrace=True,
            endSession=False,
            sessionState={'sessionAttributes': {'user_id': user_id}}
        )

        agent_response_full = ""
        for chunk in response['completion']:
            if 'chunk' in chunk:
                agent_response_full += chunk['chunk']['bytes'].decode('utf-8')

        send_message_to_websocket(apigw_client, connection_id, {"status": "completed", "response": agent_response_full})
        return {"statusCode": 200, "body": json.dumps({"message": "Response sent."})}

    except json.JSONDecodeError:
        msg = "Invalid JSON format in body"
        LOGGER.error(msg)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})
        return {"statusCode": 400, "body": json.dumps({"message": msg})}

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        error_message = e.response.get("Error", {}).get("Message", str(e))
        http_status = e.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 500)
        LOGGER.error(f"Bedrock error [{error_code}]: {error_message}")

        client_message = {
            'AccessDeniedException': "Access denied to AI Agent.",
            'ValidationException': "Validation failed.",
            'ThrottlingException': "AI Agent is busy. Try again later."
        }.get(error_code, error_message)

        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": client_message})
        return {"statusCode": http_status, "body": json.dumps({"message": client_message})}

    except Exception as e:
        LOGGER.error(f"Unexpected error: {e}", exc_info=True)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": "Server error occurred."})
        return {"statusCode": 500, "body": json.dumps({"message": "Internal server error."})}


def lambda_handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))

    request_context = event['requestContext']
    connection_id = request_context['connectionId']
    route_key = request_context['routeKey']
    user_id = request_context['authorizer']['user_id']
    endpoint_url = f"https://{request_context['domainName']}/{request_context['stage']}"

    apigw_client = boto3.client('apigatewaymanagementapi', endpoint_url=endpoint_url)

    if route_key == '$connect':
        LOGGER.info("%s connected", connection_id)
        send_message_to_websocket(apigw_client, connection_id, {"status": "connected", "message": "Welcome! Starting a new conversation."})

    elif route_key == '$disconnect':
        LOGGER.info("%s disconnected", connection_id)
        # try:
        #     connections_table.delete_item(Key={'connectionId': connection_id})
        #     LOGGER.info(f"Deleted connection {connection_id}")
        # except Exception as e:
        #     LOGGER.error(f"Failed to delete connection {connection_id}: {e}")

    elif route_key == 'sendMessage':
        return handle_send_message(event, apigw_client, connection_id, user_id)

    else:
        LOGGER.warning("Unhandled route key: %s", route_key)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": f"Unhandled route: {route_key}"})
        return {"statusCode": 400, "body": json.dumps({"message": f"Invalid or unhandled route key: {route_key}"})}

    return {"statusCode": 200, "body": json.dumps({"message": "Processing complete."})}