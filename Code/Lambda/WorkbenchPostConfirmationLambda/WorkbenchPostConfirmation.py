import json
from datetime import datetime 
import boto3
import os 
import logging
import uuid

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

cognito = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')
ses = boto3.client('ses')

USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
ROLE_TABLE_NAME = os.environ['ROLE_TABLE_NAME']
DOMAIN = os.environ['DOMAIN']
SOURCE_EMAIL = os.environ['SOURCE_EMAIL']
ACTIVITY_LOGS_TABLE = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])


def send_email(subject, body, recipient):
    """
    Send an email to a recipient using the configured source email.
    
    Args:
        subject (str): Email subject
        body (str): Email body content
        recipient (str): Recipient email address
        
    Returns:
        None: Logs success or failure
    """
    LOGGER.info("Inside Workbench-PostConfirmation.send_email - Attempting to send email to %s", recipient)
    try:
        ses.send_email(
            Source=SOURCE_EMAIL,
            Destination={'ToAddresses': [recipient]},
            Message={
                'Subject': {'Data': subject},
                'Body': {'Text': {'Data': body}}
            }
        )
        LOGGER.info("Inside Workbench-PostConfirmation.send_email - Email sent successfully to %s", recipient)
    except Exception as e:
        LOGGER.error("Inside Workbench-PostConfirmation.send_email - Failed to send email: %s", str(e))

def get_user_role():
    """Check if 'ITAdmin' role has any users assigned. If not, assign ITAdmin, else Default."""
    table = dynamodb.Table(ROLE_TABLE_NAME)
    try:
        response = table.get_item(Key={'Role': 'ITAdmin'})
        role_item = response.get('Item')

        LOGGER.info("Fetched role item: %s", role_item)
        LOGGER.info("Role item type: %s", type(role_item))
        if role_item :
            if 'Users' not in role_item:
                return "ITAdmin"
            else:
                return "Default"
        else:
            LOGGER.info("No valid ITAdmin role item found, defaulting role to Default.")
            raise Exception("ITAdmin role not found or invalid.")
    except Exception as e:
        LOGGER.error("Error fetching role from Roles table: %s", str(e))
        raise


def put_item(table_name, item):
    """Put a new item into the specified DynamoDB table."""
    try:
        table = dynamodb.Table(table_name)
        table.put_item(Item=item)
        LOGGER.info("put_item - Successfully put item in %s", table_name)
    except Exception as e:
        LOGGER.error("put_item - Failed to put item in %s: %s", table_name, str(e))

def get_item(table_name, key):
    """Retrieve an item from the specified DynamoDB table by key."""
    try:
        table = dynamodb.Table(table_name)
        response = table.get_item(Key=key)
        item = response.get("Item")
        LOGGER.info("get_item - Retrieved item from %s: %s", table_name, item)
        return item
    except Exception as e:
        LOGGER.error("get_item - Failed to retrieve item from %s: %s", table_name, str(e))
        return None

def delete_item(table_name, key):
    """Delete an item from the specified DynamoDB table by key."""
    try:
        table = dynamodb.Table(table_name)
        table.delete_item(Key=key)
        LOGGER.info("delete_item - Deleted item from %s with key %s", table_name, key)
    except Exception as e:
        LOGGER.error("delete_item - Failed to delete item from %s: %s", table_name, str(e))

def add_user_to_role(role, user_id):
    table = dynamodb.Table(ROLE_TABLE_NAME)
    try:
        table.update_item(
            Key={"Role": role},
            UpdateExpression="SET #u = list_append(if_not_exists(#u, :empty), :user)",
            ExpressionAttributeNames={
                "#u": "Users" 
            },
            ExpressionAttributeValues={
                ":user": [user_id],
                ":empty": []
            },
            ReturnValues="UPDATED_NEW"
        )
        LOGGER.info("Successfully added user %s to role %s", user_id, role)
    except Exception as e:
        LOGGER.error("Failed to update role %s with user %s: %s", role, user_id, str(e))
        raise


def lambda_handler(event, context):
    """Handles post-confirmation trigger from AWS Cognito.

    Assigns a role (SuperAdmin or Users), adds the user to a Cognito group,
    stores user details in DYNAMODB, and sends a welcome email.

    Args:
        event (dict): Event data from AWS Lambda trigger.
        context (LambdaContext): Runtime information.

    Returns:
        dict: The input event, unmodified.

    Raises:
        Exception: Reraises any errors after cleaning up resources (user from Cognito and DYNAMODB).
    """
    LOGGER.info(event)
    user_id = None
        
    try:
        role = get_user_role()

        # attributes we get from cognito
        LOGGER.info("PostConfirmation_ConfirmSignUp")
        userAttributes = event['request']['userAttributes']
        email = userAttributes.get('email', '')
        username = userAttributes.get('name', '')
        user_id = event.get('userName')
        if not user_id or not isinstance(user_id, str) or user_id.strip() == "":
            raise ValueError("preferred_username is missing or invalid in Cognito attributes.")

        # attributes to DYNAMODB
        dynamo_items = {
            'UserId': user_id,
            'Username': username,
            'Email': email,
            'CreationTime': str(datetime.utcnow()),
            "ProfileImage": "",
            'Role': role,
            'LastUpdatedBy': user_id,
            'LastUpdatedTime': str(datetime.utcnow())
        }
        put_item(USER_TABLE_NAME, dynamo_items)
        LOGGER.info("engagements.cognito, added user %s ", username)

        log_item = {
            'LogId': str(uuid.uuid4()),
            'UserId': user_id,
            'Action': 'ACCOUNT CREATED - FIRST LOGIN',
            'Email': email,
            'EventTime': datetime.utcnow().isoformat(),
            'ResourceName': 'CognitoPostAuth',
            'ResourceType': 'Cognito'
        }
        LOGGER.info(f"Logging login for user {user_id}")
        ACTIVITY_LOGS_TABLE.put_item(Item=log_item)

        add_user_to_role(role, user_id)

        subject = f"Welcome to {DOMAIN}"
        body = f"Hi {username},\n\nWelcome to {DOMAIN}.\n\nRegards,\nTeam {DOMAIN}"
        send_email(subject, body, email)
                
        return event
    except Exception as e:
        # delete user from cognito user pool
        try:
            cognito.admin_delete_user(
                UserPoolId=event['userPoolId'],
                Username=event['userName']
            )
            LOGGER.info("engagements.cognito, deleted Cognito user %s", event['userName'])
        except Exception as delete_err:
            LOGGER.error("Failed to delete user from Cognito: %s", delete_err)

        if user_id:  # Only attempt cleanup if we have a user_id
            try:
                user_item = get_item(USER_TABLE_NAME, {'UserId': user_id})
                if user_item:
                    delete_item(USER_TABLE_NAME, {'UserId': user_id})
                    LOGGER.info("Deleted dynamodb entry for user %s", user_id)
            except Exception as ddb_err:
                LOGGER.error(f"Failed to delete user from DYNAMODB: {ddb_err}")
        
        # user_item = get_item(USER_TABLE_NAME, {'UserId': user_id})
        # if user_item:
        #     try:
        #         delete_item(USER_TABLE_NAME, {'UserId': user_id})
        #         LOGGER.info("engagements.dynamodb, deleted dynamodb entry for user %s", user_id)
        #     except Exception as ddb_err:
        #         LOGGER.error(f"Failed to delete user from DYNAMODB: {ddb_err}")
        
        raise e
