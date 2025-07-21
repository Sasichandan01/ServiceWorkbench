import json
import logging
import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

def send_message(apigw_client, connection_id, message):
    """Send message to WebSocket connection with error handling"""
    try:
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({"response": message})
        )
    except Exception as e:
        LOGGER.error("Failed to send message to connection %s: %s", connection_id, str(e))


def lambda_handler(event,context):
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
    elif route_key == '$disconnect':
        LOGGER.info("Connection %s disconnected", connection_id)
    elif route_key == 'sendMessage':
        LOGGER.info("Sending message to connection %s", connection_id)
        send_message(apigw_client, connection_id, "Hello")
    else:
        LOGGER.error("Invalid route key: %s", route_key)
        return {
            "statusCode": 400,
            "body": json.dumps({"message": "Invalid route key"})
        }

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Message sent successfully"})
    }
