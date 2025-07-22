import json
import logging
import boto3
import os
import uuid 
from botocore.config import Config
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)


dynamodb = boto3.resource('dynamodb')


def generate_requirements():
    """Generate requirements.txt with necessary packages"""
    requirements = [
        "boto3==1.28.63",
        "pyjwt==2.8.0",
        "requests==2.31.0"
    ]
    return requirements

CONFIG = Config(
    read_timeout=300,
    connect_timeout=60,
    retries={'max_attempts': 3}
)

bedrock_agent_runtime_client = boto3.client('bedrock-agent-runtime',config=CONFIG)
def send_message_to_websocket(apigw_client, connection_id, message_data):
    """
    Send message to WebSocket connection with robust error handling.
    Handles GoneException to clean up stale connections from DynamoDB.
    """
    try:
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(message_data)
        )
        LOGGER.info(f"Message sent to connection {connection_id}: {message_data.get('status')} - {message_data.get('message') or message_data.get('response')}")


    except Exception as e:
        LOGGER.error("Failed to send message to connection %s due to unexpected error: %s", connection_id, str(e))


def lambda_handler(event, context):
    """This function is the entry point for the lambda function"""
    LOGGER.info("Received event: %s", json.dumps(event))

    connection_id = event['requestContext']['connectionId']
    route_key = event['requestContext']['routeKey']

    domain_name = event['requestContext']['domainName']
    stage = event['requestContext']['stage']
    endpoint_url = f"https://{domain_name}/{stage}"

    apigw_client = boto3.client(
        'apigatewaymanagementapi',
        endpoint_url=endpoint_url
    )
 
    if route_key == '$connect':
        LOGGER.info("Connection %s connected", connection_id)
       
        bedrock_session_id = str(uuid.uuid4())
        try:
       
            send_message_to_websocket(apigw_client, connection_id, {"status": "connected", "message": "Welcome! Starting a new conversation."})
        except Exception as e:
            LOGGER.error(f"Error storing connection {connection_id} and session ID: {e}", exc_info=True)
            send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": "Failed to establish session data."})
            return {'statusCode': 500, 'body': json.dumps({'message': 'Failed to connect due to internal error.'})}

    elif route_key == '$disconnect':
        LOGGER.info("Connection %s disconnected", connection_id)
        try:
            connections_table.delete_item(Key={'connectionId': connection_id})
            LOGGER.info(f"Removed connection {connection_id} from DB.")
        except Exception as e:
            LOGGER.error(f"Error removing connection {connection_id} from DB: {e}", exc_info=True)

    elif route_key == 'sendMessage':
        LOGGER.info("Processing 'sendMessage' route for connection %s", connection_id)
        try:
            body = json.loads(event.get('body', '{}'))
            user_prompt = body.get('prompt')

            LOGGER.info(f"Received prompt from connection {connection_id}: '{user_prompt}'")


            if not user_prompt:
                LOGGER.warning("No 'prompt' found in message body from connection %s", connection_id)
                send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": "Please provide a 'prompt' in your message."})
                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": "Missing 'prompt' in message body"})
                }

            bedrock_session_id = connection_id[:-1]

            session_attributes = {}

            current_lambda_requirements = generate_requirements()

            session_attributes['lambdaDependencies'] = json.dumps(current_lambda_requirements)
            LOGGER.info(f"Sending lambdaDependencies to Bedrock Agent: {session_attributes['lambdaDependencies']}")
 
            send_message_to_websocket(apigw_client, connection_id, {"status": "processing", "message": "Processing your request with the AI agent..."})

            response = bedrock_agent_runtime_client.invoke_agent(
                agentId="TCMEZDRP4O",
                agentAliasId="BNWPCZI2IV",
                sessionId=bedrock_session_id,
                inputText=user_prompt,
                bedrockModelConfigurations={
                    'performanceConfig': {
                        'latency': 'standard'
                    }
                },
                enableTrace=True,
                endSession=False,
                sessionState={
                    'sessionAttributes': session_attributes
                   
                }
               
            )
            print(response)

            agent_response_full = ""

            for chunk in response['completion']:
                print(chunk)
                if 'chunk' in chunk:
                  
                    decoded_chunk = chunk['chunk']['bytes'].decode('utf-8')
                    agent_response_full += decoded_chunk

                 
            LOGGER.info(f"Bedrock Agent response for {connection_id}: '{agent_response_full}'")
            send_message_to_websocket(apigw_client, connection_id, {"status": "completed", "response": agent_response_full})

        except json.JSONDecodeError:
            LOGGER.error("Invalid JSON body from connection %s", connection_id)
            send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": "Invalid JSON format in your message."})
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "Invalid JSON format in body"})
            }
        except ClientError as e:

            error_code = e.response.get("Error", {}).get("Code")
            error_message_detail = e.response.get("Error", {}).get("Message", str(e))
            http_status_code = e.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 500)

            LOGGER.error(f"Bedrock Agent API error for {connection_id}: {type(e).__name__} - {error_code} - {error_message_detail}", exc_info=True)

            client_feedback_message = f"AI Agent Error: {error_message_detail}"

            if error_code == 'AccessDeniedException':
                client_feedback_message = "Access denied to AI Agent. Please check permissions or contact support."
            elif error_code == 'ValidationException':
                client_feedback_message = "AI Agent validation failed. Please check your request."
            elif error_code == 'ThrottlingException':
                client_feedback_message = "AI Agent is currently busy. Please try again shortly."

            send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": client_feedback_message})
            return {
                "statusCode": http_status_code,
                "body": json.dumps({"message": f"Error interacting with AI Agent: {error_message_detail}"})
            }
        except Exception as e:
            LOGGER.error("Unexpected error processing sendMessage for connection %s: %s", connection_id, str(e), exc_info=True)
            send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": "An unexpected server error occurred."})
            return {
                "statusCode": 500,
                "body": json.dumps({"message": "Internal server error."})
            }

    else:
        LOGGER.warning("Unhandled route key: %s from connection %s", route_key, connection_id)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": f"Unhandled route: {route_key}"})
        return {
            "statusCode": 400,
            "body": json.dumps({"message": f"Invalid or unhandled route key: {route_key}"})
        }

    return {"statusCode": 200, "body": json.dumps({"message": "Processing complete for route."})}