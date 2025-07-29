import json
import boto3
import os
import logging
from boto3.dynamodb.conditions import Key

# Initialize logger
try:
    LOGGER = logging.getLogger()
    LOGGER.setLevel(logging.INFO)
except Exception as e:
    print(f"Failed to initialize logger: {str(e)}")
    raise

# Initialize AWS resources with error handling
try:
    cognito_idp = boto3.client('cognito-idp')
    dynamodb = boto3.resource('dynamodb')
except Exception as e:
    LOGGER.error("IN develop-Workbench-UserPool, Failed to initialize AWS resources")
    raise

# Load environment variables with error handling
try:
    USER_POOL_ID = os.environ['USER_POOL_ID']
    USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
    USER_TABLE = dynamodb.Table(USER_TABLE_NAME)
except KeyError as e:
    LOGGER.error(f"IN develop-Workbench-UserPool.initialization(), Missing required environment variable: {str(e)}")
    raise
except Exception as e:
    LOGGER.error(f"IN develop-Workbench-UserPool.initialization(), Error initializing DynamoDB table: {str(e)}")
    raise


def get_dynamodb_user(user_id):
    """
    Retrieve a user record from the DynamoDB table using the UserId key.

    Args:
        user_id (str): The unique user identifier from Cognito.

    Returns:
        dict or None: The user item if found, else None.

    Raises:
        Exception: Propagates any errors from DynamoDB operation.
    """
    try:
        LOGGER.info(f"IN develop-Workbench-UserPool.get_dynamodb_user(), Fetching user {user_id} from DynamoDB")
        response = USER_TABLE.get_item(Key={'UserId': user_id})
        return response.get('Item')
    except Exception as e:
        LOGGER.error(f"IN develop-Workbench-UserPool.get_dynamodb_user(), Error fetching user from DynamoDB: {str(e)}")
        return None


def delete_dynamodb_user(user_id):
    """
    Delete a user record from DynamoDB based on the UserId.

    Args:
        user_id (str): The unique user identifier from Cognito.

    Returns:
        None: Logs the deletion outcome.

    Raises:
        Exception: Propagates any errors from DynamoDB operation.
    """
    try:
        LOGGER.info(f"IN develop-Workbench-UserPool.delete_dynamodb_user(), Deleting user {user_id} from DynamoDB")
        USER_TABLE.delete_item(Key={'UserId': user_id})
        LOGGER.info(f"IN develop-Workbench-UserPool.delete_dynamodb_user(), Successfully deleted user {user_id} from DynamoDB")
    except Exception as e:
        LOGGER.error(f"IN develop-Workbench-UserPool.delete_dynamodb_user(), Error deleting user from DynamoDB: {str(e)}")
        raise


def lambda_handler(event, context):
    """
    AWS Lambda function to process SQS messages and delete unverified users from Cognito and DynamoDB.

    Args:
        event (dict): The SQS event containing user records to process.
        context (LambdaContext): The runtime context of the Lambda function.

    Returns:
        None: This function doesn't return anything but logs processing outcomes.

    Raises:
        Exception: Captures and logs any unexpected errors during processing.
    """
    try:
        LOGGER.info("IN develop-Workbench-UserPool.lambda_handler(), Received event from SQS")
        
        # Process each record in the SQS event
        for record in event['Records']:
            try:
                LOGGER.info("IN develop-Workbench-UserPool.lambda_handler(), Processing SQS record")
                message_body = json.loads(record['body'])
                user_email = message_body['email']
                LOGGER.info(f"IN develop-Workbench-UserPool.lambda_handler(), Processing user with email: {user_email}")
            except Exception as e:
                LOGGER.error(f"IN develop-Workbench-UserPool.lambda_handler(), Error parsing SQS message: {str(e)}")
                continue  # Skip to next record if current one fails

            try:
                # Query Cognito for user details
                LOGGER.info(f"IN develop-Workbench-UserPool.lambda_handler(), Getting user details from Cognito for email: {user_email}")
                response = cognito_idp.list_users(
                    UserPoolId=USER_POOL_ID,
                    Filter=f'email = "{user_email}"',
                    Limit=1
                )
                
                # Check if user exists in Cognito
                if len(response['Users']) == 0:
                    LOGGER.info(f"IN develop-Workbench-UserPool.lambda_handler(), User not found in Cognito: {user_email}")
                    continue

                user = response['Users'][0]
                username = user['Username']
                user_status = user.get('UserStatus')
                email_verified = False

                # Check email verification status
                for attribute in user['Attributes']:
                    if attribute['Name'] == 'email_verified':
                        email_verified = attribute['Value'] == 'true'

                # Skip deletion if email is verified
                if not email_verified:
                    LOGGER.info(f"IN develop-Workbench-UserPool.lambda_handler(), Email not verified for user: {user_email}, deleting from Cognito.")
                    cognito_idp.admin_delete_user(
                        UserPoolId=USER_POOL_ID,
                        Username=username
                    )
                    
                    # Optional: Delete from DynamoDB if needed
                    # user_details = get_dynamodb_user(username)
                    # if user_details:
                    #     delete_dynamodb_user(username)
                    # else:
                    #     LOGGER.info(f"IN develop-Workbench-UserPool.lambda_handler(), User not found in DynamoDB: {user_email}")
                else:
                    LOGGER.info(f"IN develop-Workbench-UserPool.lambda_handler(), Email verified for user: {user_email}, no action needed.")

            except Exception as e:
                LOGGER.error(f"IN develop-Workbench-UserPool.lambda_handler(), Error processing user {user_email}: {str(e)}")
                continue  # Continue with next record if current fails

    except Exception as e:
        LOGGER.error(f"IN develop-Workbench-UserPool.lambda_handler(), Unexpected error processing event: {str(e)}")
        raise  # Re-raise exception for AWS Lambda to handle