import boto3
from datetime import datetime
import uuid
import os
import logging

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
ACTIVITY_LOGS_TABLE = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])

def lambda_handler(event, context):
    """
    Lambda function to log user login activity.
    """
    try:
        LOGGER.info("Event received: %s", event.get("userName"))

        user_attributes = event['request']['userAttributes']
        user_id = event.get('userName')
        email = user_attributes.get('email')

        log_item = {
            'LogId': str(uuid.uuid4()),
            'UserId': user_id,
            'Action': 'LOGIN',
            'Email': email,
            'EventTime': str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
            'ResourceName': 'CognitoPostAuth',
            'ResourceType': 'Cognito',
            'ResourceId': user_id
        }

        LOGGER.info(f"Logging login for user {user_id}")
        ACTIVITY_LOGS_TABLE.put_item(Item=log_item)
        LOGGER.info(f"Login logged successfully for user {user_id}")
    except Exception as e:
        LOGGER.error(f"Error logging login: {e}")

    return event
