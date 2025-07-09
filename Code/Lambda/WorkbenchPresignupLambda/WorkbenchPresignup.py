import json
import boto3
import os
import requests
import logging

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

SQS = boto3.client('sqs')
QUEUE_URL = os.environ['QUEUE_URL']
USER_TABLE_NAME = os.environ['USER_TABLE_NAME']

DYNAMODB = boto3.resource('dynamodb')
USER_TABLE = DYNAMODB.Table(USER_TABLE_NAME)

def is_temp_email_disify(email):
    """
    Checks whether an email address is a temporary/disposable address using the Disify API.
    """
    try:
        LOGGER.info(f"Checking if {email} is disposable")
        response = requests.get(f"https://www.disify.com/api/email/{email}")
        result = response.json()
        return result.get("disposable", False)
    except Exception as e:
        LOGGER.error(f"Disify API error: {str(e)}")
        return False

def is_email_already_registered(email):
    """
    Checks if the given email is already present in the DynamoDB user table using the EmailIndex GSI.
    """
    try:
        LOGGER.info(f"Checking if {email} is already registered")
        response = USER_TABLE.query(
            IndexName="EmailIndex",
            KeyConditionExpression=boto3.dynamodb.conditions.Key('Email').eq(email)
        )
        if response.get("Items"):
            LOGGER.info(f"Email {email} is already registered.")
            return True
        return False
    except Exception as e:
        LOGGER.error(f"Error checking email existence in table: {str(e)}")
        return False

def lambda_handler(event, context):
    """
    AWS Lambda function triggered by Amazon Cognito during the Pre Sign-up or Post Confirmation phase.
    """
    try:
        LOGGER.info(f"Event: {json.dumps(event)}")
        email = event['request']['userAttributes'].get('email', '')

        if is_temp_email_disify(email):
            LOGGER.error(f"Email {email} is disposable.")
            raise Exception("Temporary or disposable emails are not allowed.")

        if is_email_already_registered(email):
            LOGGER.error(f"Email {email} already exists in the system.")
            raise Exception("This email is already registered.")

        # Send email to SQS for async post-processing
        message_body = { "email": email }

        LOGGER.info(f"Sending message to SQS: {json.dumps(message_body)}")

        SQS.send_message(
            QueueUrl=QUEUE_URL,
            DelaySeconds=900,
            MessageBody=json.dumps(message_body)
        )

    except Exception as e:
        LOGGER.error(f"Error: {str(e)}")
        raise Exception(str(e))  

    return event