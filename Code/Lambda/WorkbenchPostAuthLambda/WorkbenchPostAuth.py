import boto3
from datetime import datetime, timezone
import uuid
import os
import logging

# Initialize logger with proper format
try:
    LOGGER = logging.getLogger()
    LOGGER.setLevel(logging.INFO)
except Exception as e:
    print(f"Error initializing logger: {e}")
    raise

# Initialize DynamoDB resources with error handling
try:
    dynamodb = boto3.resource('dynamodb')
    ACTIVITY_LOGS_TABLE = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])
    USERS_TABLE = dynamodb.Table(os.environ['USERS_TABLE'])
except Exception as e:
    LOGGER.error(
        "IN develop-PostAuth, Error initializing DynamoDB resources"
    )
    raise

def lambda_handler(event, context):
    """
    Entry point for the Lambda function. Handles post-authentication events from Cognito,
    logs user login activity, and updates last login time in the users table.

    Args:
        event (dict): The event object from Cognito containing user attributes.
        context (LambdaContext): The runtime context of the Lambda function.

    Returns:
        dict: The original event object passed from Cognito.
    """
    try:
        LOGGER.info(
            "IN develop-PostAuth.lambda_handler(), Event received for user: %s", 
            event.get("userName")
        )

        # Extract user attributes from the event
        user_attributes = event['request']['userAttributes']
        user_id = event.get('userName')
        email = user_attributes.get('email')

        # Prepare activity log item
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

        # Log the login activity
        LOGGER.info(
            "IN develop-PostAuth.lambda_handler(), Logging login for user %s", 
            user_id
        )
        ACTIVITY_LOGS_TABLE.put_item(Item=log_item)
        LOGGER.info(
            "IN develop-PostAuth.lambda_handler(), Login logged successfully for user %s", 
            user_id
        )

        # Update last login time in users table
        now_iso = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        LOGGER.info(
            "IN develop-PostAuth.lambda_handler(), Updating LastLoginTime for user %s", 
            user_id
        )
        USERS_TABLE.update_item(
            Key={'UserId': user_id},
            UpdateExpression='SET LastLoginTime = :login_time',
            ExpressionAttributeValues={':login_time': now_iso}
        )
        LOGGER.info(
            "IN develop-PostAuth.lambda_handler(), LastLoginTime updated successfully for user %s", 
            user_id
        )

    except Exception as e:
        LOGGER.error(
            "IN develop-PostAuth.lambda_handler(), Error logging login: %s", 
            str(e)
        )
        # Re-raise the exception to ensure Cognito is aware of the failure
        raise

    return event