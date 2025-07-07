import boto3
import os
import logging
from boto3.dynamodb.conditions import Key

# Initialize logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB table
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['USER_TABLE_NAME'])

def lambda_handler(event, context):
    """
        Validates that the Cognito user exists in the DynamoDB table.
    """
    try:
        username = event['userName']
        logger.info(f"Checking if user {username} exists in the table.")

        response = table.query(
            KeyConditionExpression=Key('UserId').eq(username)
        )

        if response.get('Count', 0) == 0:
            logger.warning(f"User {username} does not exist in the table.")
            raise Exception("User does not exist.")

        logger.info(f"User {username} found in the table.")
        return event

    except Exception as e:
        logger.error(f"Error checking user in DynamoDB: {str(e)}")
        raise e 
