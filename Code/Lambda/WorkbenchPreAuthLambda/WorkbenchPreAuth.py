import boto3
import os
import logging
from boto3.dynamodb.conditions import Key

# Initialize logger with standard format
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

try:
    # Initialize DynamoDB resource and table
    dynamodb = boto3.resource('dynamodb')
    TABLE = dynamodb.Table(os.environ['USER_TABLE_NAME'])
except Exception as e:
    LOGGER.error("IN develop-PreAuth, Failed to initialize DynamoDB resources")
    raise

def lambda_handler(event, context):
    """
    Validates that the Cognito user exists in the DynamoDB table.
    
    This Lambda function is triggered by Cognito during user authentication/signup.
    It checks if the user exists in the DynamoDB table before allowing the operation to proceed.

    Args:
        event (dict): The event object from Cognito containing user information.
        context (LambdaContext): The runtime context of the Lambda function.

    Returns:
        dict: The original event if validation succeeds.

    Raises:
        Exception: If the user doesn't exist in DynamoDB or if any other error occurs.
    """
    try:
        username = event['userName']
        LOGGER.info(
            "IN develop-PreAuth.lambda_handler(), Checking if user %s exists in the table.",
            username
        )

        # Query DynamoDB for the user
        response = TABLE.query(
            KeyConditionExpression=Key('UserId').eq(username)
        )

        if response.get('Count', 0) == 0:
            LOGGER.warning(
                "IN develop-PreAuth.lambda_handler(), User %s does not exist in the table.",
                username
            )
            raise Exception("User does not exist in DynamoDB table.")

        LOGGER.info(
            "IN develop-PreAuth.lambda_handler(), User %s found in the table.",
            username
        )
        return event

    except KeyError as ke:
        LOGGER.error(
            "IN develop-PreAuth.lambda_handler(), Missing required field in event: %s",
            str(ke)
        )
        raise Exception("Invalid event structure - missing userName field.") from ke
    except Exception as e:
        LOGGER.error(
            "IN develop-PreAuth.lambda_handler(), Error checking user in DynamoDB: %s",
            str(e)
        )
        raise