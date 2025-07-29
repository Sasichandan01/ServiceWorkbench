import json
import boto3
import os
import requests
import logging

# Initialize logger with consistent format
try:
    LOGGER = logging.getLogger()
    LOGGER.setLevel(logging.INFO)
except Exception as e:
    print(f"Failed to initialize logger: {str(e)}")
    raise

# Initialize AWS services with error handling
try:
    # Get environment variables
    QUEUE_URL = os.environ['QUEUE_URL']
    USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
    
    # Initialize AWS clients
    SQS = boto3.client('sqs')
    DYNAMODB = boto3.resource('dynamodb')
    USER_TABLE = DYNAMODB.Table(USER_TABLE_NAME)
except KeyError as e:
    LOGGER.error(f"Missing required environment variable: {str(e)}")
    raise
except Exception as e:
    LOGGER.error(f"Failed to initialize AWS services: {str(e)}")
    raise

def is_temp_email_disify(email):
    """
    Checks whether an email address is a temporary/disposable address using the Disify API.

    Args:
        email (str): The email address to validate.

    Returns:
        bool: True if email is disposable, False otherwise or on error.
    """
    try:
        LOGGER.info(
            "IN develop-PreSignUp.is_temp_email_disify(), checking disposable email status"
        )
        response = requests.get(f"https://www.disify.com/api/email/{email}")
        result = response.json()
        return result.get("disposable", False)
    except requests.exceptions.RequestException as e:
        LOGGER.error(
            "IN develop-PreSignUp.is_temp_email_disify(), API request failed"
        )
        return False
    except Exception as e:
        LOGGER.error(
            f"IN develop-PreSignUp.is_temp_email_disify(), unexpected error: {str(e)}"
        )
        return False

def is_email_already_registered(email):
    """
    Checks if the given email is already present in the DynamoDB user table.

    Args:
        email (str): The email address to check for existing registration.

    Returns:
        bool: True if email exists, False otherwise or on error.
    """
    try:
        LOGGER.info(
            "IN develop-PreSignUp.is_email_already_registered(), checking email existence"
        )
        response = USER_TABLE.query(
            IndexName="EmailIndex",
            KeyConditionExpression=boto3.dynamodb.conditions.Key('Email').eq(email)
        )
        return bool(response.get("Items"))
    except USER_TABLE.meta.client.exceptions.ResourceNotFoundException as e:
        LOGGER.error(
            "IN develop-PreSignUp.is_email_already_registered(), table or index not found"
        )
        return False
    except Exception as e:
        LOGGER.error(
            f"IN develop-PreSignUp.is_email_already_registered(), unexpected error: {str(e)}"
        )
        return False

def lambda_handler(event, context):
    """
    AWS Lambda function triggered by Amazon Cognito during user registration.

    Validates email address (disposable check and uniqueness) and queues valid emails
    for post-processing.

    Args:
        event (dict): The Cognito trigger event object.
        context (LambdaContext): The runtime context.

    Returns:
        dict: The original event if successful, raises exception on validation failure.

    Raises:
        Exception: If email validation fails (disposable or duplicate).
    """
    try:
        LOGGER.info(
            "IN develop-PreSignUp.lambda_handler(), processing Cognito trigger"
        )
        LOGGER.debug(
            f"IN develop-PreSignUp.lambda_handler(), event: {json.dumps(event)}"
        )

        # Extract email from Cognito event
        email = event['request']['userAttributes'].get('email', '')
        if not email:
            raise ValueError("No email address provided in user attributes")

        # Validate email is not disposable
        if is_temp_email_disify(email):
            raise ValueError("Temporary or disposable emails are not allowed")

        # Validate email is not already registered
        if is_email_already_registered(email):
            raise ValueError("This email is already registered")

        # Prepare message for post-processing queue
        message_body = {"email": email}
        LOGGER.info(
            f"IN develop-PreSignUp.lambda_handler(), queuing email for processing: {email}"
        )

        # Send to SQS with 15 minute delay
        SQS.send_message(
            QueueUrl=QUEUE_URL,
            DelaySeconds=900,  # 15 minutes delay
            MessageBody=json.dumps(message_body)
        )

        return event

    except ValueError as e:
        LOGGER.error(
            f"IN develop-PreSignUp.lambda_handler(), validation error: {str(e)}"
        )
        raise Exception(str(e))
    except Exception as e:
        LOGGER.error(
            f"IN develop-PreSignUp.lambda_handler(), unexpected error: {str(e)}"
        )
        raise Exception("Internal server error during email validation")