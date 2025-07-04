import json
import boto3
import os
import requests
import logging

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

SQS = boto3.client('sqs')
QUEUE_URL = os.environ['QUEUE_URL']

def is_temp_email_disify(email):
    """
    Checks whether an email address is a temporary/disposable address using the Disify API.

    Args:
        email (str): The email address to check.

    Returns:
        bool: True if the email is disposable, False otherwise.
    """
    try:
        LOGGER.info(f"Checking if {email} is disposable")
        response = requests.get(f"https://www.disify.com/api/email/{email}")
        result = response.json()
        return result.get("disposable", False)
    except Exception as e:
        LOGGER.error(f"Disify API error: {str(e)}")
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
