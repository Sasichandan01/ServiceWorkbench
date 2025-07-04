import json
import boto3
import os
import logging
from boto3.dynamodb.conditions import Key

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

cognito_idp = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')

USER_POOL_ID = os.environ['USER_POOL_ID']
USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
USER_TABLE = dynamodb.Table(USER_TABLE_NAME)


def get_dynamodb_user(user_id):
    """
    Retrieve a user record from the DynamoDB table using the UserId key.

    Args:
        user_id (str): The unique user identifier from Cognito.

    Returns:
        dict or None: The user item if found, else None.
    """
    try:
        response = USER_TABLE.get_item(Key={'UserId': user_id})
        return response.get('Item')
    except Exception as e:
        LOGGER.error(f"Error fetching user from DynamoDB: {str(e)}")
        return None


def delete_dynamodb_user(user_id):
    """
    Delete a user record from DynamoDB based on the UserId.

    Args:
        user_id (str): The unique user identifier from Cognito.

    Returns:
        None: Logs the deletion outcome.
    """
    try:
        USER_TABLE.delete_item(Key={'UserId': user_id})
        LOGGER.info(f"Deleted user {user_id} from DynamoDB")
    except Exception as e:
        LOGGER.error(f"Error deleting user from DynamoDB: {str(e)}")


def lambda_handler(event, context):
    """
    AWS Lambda function to process SQS messages and delete unverified users from Cognito and DynamoDB.
    """
    LOGGER.info(f"Received event: {event}")
    for record in event['Records']:
        try:
            LOGGER.info(f"Processing record: {record}")
            message_body = json.loads(record['body'])
            user_email = message_body['email']
            LOGGER.info(f"Processing user with email: {user_email}")
        except Exception as e:
            LOGGER.error(f"Error parsing SQS message: {str(e)}")
            continue

        try:
            LOGGER.info(f"Getting user details from Cognito for email: {user_email}")
            response = cognito_idp.list_users(
                UserPoolId=USER_POOL_ID,
                Filter=f'email = "{user_email}"',
                Limit=1
            )
            LOGGER.info(f"Response from Cognito: {response}")
            if len(response['Users']) == 0:
                LOGGER.info(f"User not found in Cognito: {user_email}")
                continue

            user = response['Users'][0]
            username = user['Username']
            user_status = user.get('UserStatus')
            email_verified = False

            for attribute in user['Attributes']:
                if attribute['Name'] == 'email_verified':
                    email_verified = attribute['Value'] == 'true'

            # if user_status in ['FORCE_CHANGE_PASSWORD', 'CONFIRMED']:
            #     LOGGER.info(f"User {user_email} is in {user_status} state, skipping deletion.")
            #     continue

            if not email_verified:
                LOGGER.info(f"Email not verified for user: {user_email}, deleting from Cognito.")
                cognito_idp.admin_delete_user(
                    UserPoolId=USER_POOL_ID,
                    Username=username
                )

                # user_details = get_dynamodb_user(username)
                # if user_details:
                #     delete_dynamodb_user(username)
                # else:
                #     LOGGER.info(f"User not found in DynamoDB: {user_email}")
            else:
                LOGGER.info(f"Email verified for user: {user_email}, no action needed.")

        except Exception as e:
            LOGGER.error(f"Error processing user {user_email}: {str(e)}")
