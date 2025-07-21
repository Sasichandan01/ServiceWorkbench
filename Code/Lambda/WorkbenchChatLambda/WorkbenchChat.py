import json
import logging
import boto3
import os
import uuid # For generating session IDs
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# Initialize Bedrock Agent Runtime client
bedrock_agent_runtime_client = boto3.client('bedrock-agent-runtime')

# Environment variables for your Bedrock Agent
BEDROCK_AGENT_ID = os.environ.get('BEDROCK_AGENT_ID')
BEDROCK_AGENT_ALIAS_ID = os.environ.get('BEDROCK_AGENT_ALIAS_ID')

# DynamoDB table for managing WebSocket connections and Bedrock session IDs
dynamodb = boto3.resource('dynamodb')
# Make sure this matches your DynamoDB table name for connections
CONNECTIONS_TABLE_NAME = os.environ.get('CONNECTIONS_TABLE_NAME', 'WebSocketConnections')
connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)

# --- Function to generate requirements list ---
# This function is primarily intended to be run locally or in a CI/CD pipeline
# to create the `requirements.txt` file for bundling dependencies during deployment.
# When called within the Lambda at runtime, it simply returns the predefined list.
def generate_requirements():
    """Generate requirements.txt with necessary packages"""
    requirements = [
        "boto3==1.28.63",
        "pyjwt==2.8.0",
        "requests==2.31.0"
    ]
    return requirements
# --- End of generate_requirements function ---


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
    except ClientError as e:
        # Catch specific Boto3 ClientError exceptions
        error_code = e.response.get("Error", {}).get("Code")
        if error_code == 'GoneException':
            # This exception means the connection is gone. Clean up DynamoDB.
            LOGGER.warning("Connection %s no longer exists (GoneException). Removing from DB.", connection_id)
            try:
                connections_table.delete_item(Key={'connectionId': connection_id})
                LOGGER.info(f"Removed stale connection {connection_id} from DynamoDB.")
            except Exception as db_e:
                LOGGER.error("Error removing stale connection %s from DB: %s", connection_id, str(db_e))
        else:
            LOGGER.error("Failed to send message to connection %s due to ClientError: %s (Code: %s)",
                         connection_id, e, error_code)
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
        # Store connection_id and potentially initialize a new Bedrock session ID
        # For a new connection, generate a new session ID for the Bedrock Agent
        bedrock_session_id = str(uuid.uuid4())
        try:
            connections_table.put_item(
                Item={
                    'connectionId': connection_id,
                    'bedrockSessionId': bedrock_session_id,
                    'connectedAt': event['requestContext']['requestTimeEpoch'] # Add timestamp
                }
            )
            LOGGER.info(f"Stored connection {connection_id} with new Bedrock session ID {bedrock_session_id}")
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
            # Extract JWT token. Best practice is via API Gateway Lambda Authorizer.
            # If using Lambda Authorizer, access via event['requestContext']['authorizer']['claims']['jwtToken']
            jwt_token = body.get('jwtToken') # Client sends {'prompt': '...', 'jwtToken': '...'}
            LOGGER.info(f"Received prompt from connection {connection_id}: '{user_prompt}'")
            # Log JWT only if necessary for debugging, avoid logging sensitive data in production
            # LOGGER.info(f"Received JWT token from connection {connection_id}: {jwt_token}") 

            if not user_prompt:
                LOGGER.warning("No 'prompt' found in message body from connection %s", connection_id)
                send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": "Please provide a 'prompt' in your message."})
                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": "Missing 'prompt' in message body"})
                }

            if not BEDROCK_AGENT_ID or not BEDROCK_AGENT_ALIAS_ID:
                LOGGER.error("Bedrock Agent ID or Alias ID environment variables are not configured.")
                send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": "AI Agent is not configured. Please contact support."})
                return {
                    "statusCode": 500,
                    "body": json.dumps({"message": "Bedrock Agent configuration missing."})
                }

            # Retrieve the Bedrock session ID for this connection from DynamoDB
            item = connections_table.get_item(Key={'connectionId': connection_id}).get('Item')
            bedrock_session_id = item.get('bedrockSessionId') if item else None
            LOGGER.info(f"Retrieved Bedrock session ID '{bedrock_session_id}' for connection {connection_id}")

            # If no session ID found (e.g., stale entry or direct sendMessage without $connect)
            if not bedrock_session_id:
                LOGGER.warning(f"No existing Bedrock session ID found for connection {connection_id}. Generating a new one.")
                bedrock_session_id = str(uuid.uuid4())
                connections_table.put_item(
                    Item={
                        'connectionId': connection_id,
                        'bedrockSessionId': bedrock_session_id,
                        'connectedAt': event['requestContext']['requestTimeEpoch']
                    }
                )
                send_message_to_websocket(apigw_client, connection_id, {"status": "warning", "message": "Starting a new conversation session for you."})


            # Prepare session attributes to pass to Bedrock Agent
            session_attributes = {}
            if jwt_token:
                session_attributes['jwtToken'] = jwt_token

            # --- ADDING PACKAGE INFORMATION TO SESSION ATTRIBUTES ---
            # Call the generate_requirements function to get the list of packages
            current_lambda_requirements = generate_requirements()
            # Bedrock session attributes must be strings, so JSON.stringify the list
            session_attributes['lambdaDependencies'] = json.dumps(current_lambda_requirements)
            LOGGER.info(f"Sending lambdaDependencies to Bedrock Agent: {session_attributes['lambdaDependencies']}")
            # --- End of adding package information ---


            # --- Invoke the Bedrock Agent ---
            LOGGER.info(f"Invoking Bedrock Agent '{BEDROCK_AGENT_ID}' (Alias: '{BEDROCK_AGENT_ALIAS_ID}') for session '{bedrock_session_id}' with prompt: '{user_prompt}'")
            send_message_to_websocket(apigw_client, connection_id, {"status": "processing", "message": "Processing your request with the AI agent..."})

            response = bedrock_agent_runtime_client.invoke_agent(
                agentId=BEDROCK_AGENT_ID,
                agentAliasId=BEDROCK_AGENT_ALIAS_ID,
                sessionId=bedrock_session_id, # Use the persistent session ID
                inputText=user_prompt,
                sessionState={
                    'sessionAttributes': session_attributes
                    # 'promptSessionAttributes': {} # Can be used for prompt-specific attributes
                }
                # enableTrace=True # Uncomment for debugging agent's thought process in CloudWatch logs
            )

            # Process the streaming response from Bedrock Agent
            agent_response_full = ""
            # The 'completion' object is a streaming iterator
            for chunk in response['completion']:
                if 'chunk' in chunk:
                    # Decode the bytes to a string
                    decoded_chunk = chunk['chunk']['bytes'].decode('utf-8')
                    agent_response_full += decoded_chunk
                    # Optional: Send partial responses to the client as they arrive
                    # send_message_to_websocket(apigw_client, connection_id, {"status": "streaming", "content": decoded_chunk})

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
            # Catch specific Boto3 ClientError exceptions from bedrock-agent-runtime
            error_code = e.response.get("Error", {}).get("Code")
            error_message_detail = e.response.get("Error", {}).get("Message", str(e))
            http_status_code = e.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 500)

            LOGGER.error(f"Bedrock Agent API error for {connection_id}: {type(e).__name__} - {error_code} - {error_message_detail}", exc_info=True)

            client_feedback_message = f"AI Agent Error: {error_message_detail}"
            # Customize client feedback for specific common errors if desired
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