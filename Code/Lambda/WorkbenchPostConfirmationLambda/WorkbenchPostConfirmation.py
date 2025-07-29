import json
from datetime import datetime, timezone
import boto3
import os 
import logging
import uuid
from FGAC.fgac import create_workspace_fgac, check_workspace_access

# Initialize logger with consistent format
LOGGER = logging.getLogger()
try:
    LOGGER.setLevel(logging.INFO)
    LOGGER.info("IN develop-PostConfirm, Logger initialized successfully")
except Exception as e:
    print(f"Failed to initialize logger: {str(e)}")
    raise

try:
    # Initialize AWS clients and resources
    cognito = boto3.client('cognito-idp')
    dynamodb = boto3.resource('dynamodb')
    ses = boto3.client('ses')

    # Load environment variables
    USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
    ROLE_TABLE_NAME = os.environ['ROLE_TABLE_NAME']
    WORKSPACES_TABLE_NAME = os.environ['WORKSPACES_TABLE_NAME']
    DOMAIN = os.environ['DOMAIN']
    SOURCE_EMAIL = os.environ['SOURCE_EMAIL']
    
    # Initialize DynamoDB tables
    ACTIVITY_LOGS_TABLE = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])
    RESOURCE_ACCESS_TABLE = dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])
    workspace_table = dynamodb.Table(WORKSPACES_TABLE_NAME)
    
    LOGGER.info("IN develop-PostConfirm, Global variables initialized successfully")
except Exception as e:
    LOGGER.error("IN develop-PostConfirm, Failed to initialize global variables: %s", str(e))
    raise


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
    LOGGER.info("IN develop-PostConfirm.send_email(), Attempting to send email to %s", recipient)
    try:
        response = ses.send_email(
            Source=SOURCE_EMAIL,
            Destination={'ToAddresses': [recipient]},
            Message={
                'Subject': {'Data': subject},
                'Body': {'Text': {'Data': body}}
            }
        )
        LOGGER.info("IN develop-PostConfirm.send_email(), Email sent successfully to %s", recipient)
        return response
    except Exception as e:
        LOGGER.error("IN develop-PostConfirm.send_email(), Failed to send email: %s", str(e))
        raise


def get_user_role():
    """
    Determine the appropriate role for a new user.
    
    Checks if 'ITAdmin' role has any users assigned. If not, assigns ITAdmin role,
    otherwise assigns Default role.
    
    Returns:
        str: The assigned role ('ITAdmin' or 'Default')
        
    Raises:
        Exception: If there's an error accessing the role table or if ITAdmin role is not found
    """
    LOGGER.info("IN develop-PostConfirm.get_user_role(), Checking user role assignment")
    table = dynamodb.Table(ROLE_TABLE_NAME)
    try:
        response = table.get_item(Key={'Role': 'ITAdmin'})
        role_item = response.get('Item')

        LOGGER.info("IN develop-PostConfirm.get_user_role(), Fetched role item: %s", role_item)
        if role_item:
            if 'Users' not in role_item:
                LOGGER.info("IN develop-PostConfirm.get_user_role(), Assigning ITAdmin role")
                return "ITAdmin"
            else:
                LOGGER.info("IN develop-PostConfirm.get_user_role(), Assigning Default role")
                return "Default"
        else:
            error_msg = "ITAdmin role not found or invalid."
            LOGGER.error("IN develop-PostConfirm.get_user_role(), %s", error_msg)
            raise Exception(error_msg)
    except Exception as e:
        LOGGER.error("IN develop-PostConfirm.get_user_role(), Error fetching role: %s", str(e))
        raise


def put_item(table_name, item):
    """
    Put a new item into the specified DynamoDB table.
    
    Args:
        table_name (str): Name of the DynamoDB table
        item (dict): Item to be inserted
        
    Raises:
        Exception: If the put operation fails
    """
    LOGGER.info("IN develop-PostConfirm.put_item(), Attempting to put item in %s", table_name)
    try:
        table = dynamodb.Table(table_name)
        table.put_item(Item=item)
        LOGGER.info("IN develop-PostConfirm.put_item(), Successfully put item in %s", table_name)
    except Exception as e:
        LOGGER.error("IN develop-PostConfirm.put_item(), Failed to put item in %s: %s", table_name, str(e))
        raise


def get_item(table_name, key):
    """
    Retrieve an item from the specified DynamoDB table by key.
    
    Args:
        table_name (str): Name of the DynamoDB table
        key (dict): Key to retrieve the item
        
    Returns:
        dict: The retrieved item or None if not found
        
    Raises:
        Exception: If the get operation fails
    """
    LOGGER.info("IN develop-PostConfirm.get_item(), Retrieving item from %s", table_name)
    try:
        table = dynamodb.Table(table_name)
        response = table.get_item(Key=key)
        item = response.get("Item")
        LOGGER.info("IN develop-PostConfirm.get_item(), Retrieved item from %s", table_name)
        return item
    except Exception as e:
        LOGGER.error("IN develop-PostConfirm.get_item(), Failed to retrieve item from %s: %s", table_name, str(e))
        raise


def delete_item(table_name, key):
    """
    Delete an item from the specified DynamoDB table by key.
    
    Args:
        table_name (str): Name of the DynamoDB table
        key (dict): Key of the item to delete
        
    Raises:
        Exception: If the delete operation fails
    """
    LOGGER.info("IN develop-PostConfirm.delete_item(), Deleting item from %s", table_name)
    try:
        table = dynamodb.Table(table_name)
        table.delete_item(Key=key)
        LOGGER.info("IN develop-PostConfirm.delete_item(), Successfully deleted item from %s", table_name)
    except Exception as e:
        LOGGER.error("IN develop-PostConfirm.delete_item(), Failed to delete item from %s: %s", table_name, str(e))
        raise


def add_user_to_role(role, user_id):
    """
    Add a user to a role in the Roles table.
    
    Args:
        role (str): The role to add the user to
        user_id (str): The ID of the user to add
        
    Raises:
        Exception: If the update operation fails
    """
    LOGGER.info("IN develop-PostConfirm.add_user_to_role(), Adding user %s to role %s", user_id, role)
    table = dynamodb.Table(ROLE_TABLE_NAME)
    try:
        table.update_item(
            Key={"Role": role},
            UpdateExpression="SET #u = list_append(if_not_exists(#u, :empty), :user)",
            ExpressionAttributeNames={"#u": "Users"},
            ExpressionAttributeValues={
                ":user": [user_id],
                ":empty": []
            },
            ReturnValues="UPDATED_NEW"
        )
        LOGGER.info("IN develop-PostConfirm.add_user_to_role(), Successfully added user %s to role %s", user_id, role)
    except Exception as e:
        LOGGER.error("IN develop-PostConfirm.add_user_to_role(), Failed to update role %s with user %s: %s", 
                    role, user_id, str(e))
        raise


def lambda_handler(event, context):
    """
    Handles post-confirmation trigger from AWS Cognito.
    
    This function is triggered after a user confirms their account in Cognito. It:
    1. Assigns a role (ITAdmin if first user, otherwise Default)
    2. Stores user details in DynamoDB
    3. Creates a default workspace for the user
    4. Sets up fine-grained access control for the workspace
    5. Logs the account creation activity
    6. Sends a welcome email
    
    Args:
        event (dict): Event data from AWS Lambda trigger containing user information
        context (LambdaContext): Runtime information from AWS Lambda
        
    Returns:
        dict: The input event, unmodified
        
    Raises:
        Exception: If any step fails, with cleanup of created resources
    """
    LOGGER.info("IN develop-PostConfirm.lambda_handler(), Received event: %s", json.dumps(event, default=str))
    user_id = None
    role = "Default"  # Default role if not set
        
    try:
        # Step 1: Determine and assign user role
        role = get_user_role()
        
        # Set custom role attribute in Cognito
        LOGGER.info("IN develop-PostConfirm.lambda_handler(), Setting role %s for user %s", 
                   role, event['userName'])
        cognito.admin_update_user_attributes(
            UserPoolId=event['userPoolId'],
            Username=event['userName'],
            UserAttributes=[{'Name': 'custom:Role', 'Value': role}]
        )

        # Extract user attributes from Cognito event
        userAttributes = event['request']['userAttributes']
        email = userAttributes.get('email', '')
        username = userAttributes.get('name', '')
        user_id = event.get('userName')
        
        if not user_id or not isinstance(user_id, str) or user_id.strip() == "":
            error_msg = "preferred_username is missing or invalid in Cognito attributes."
            LOGGER.error("IN develop-PostConfirm.lambda_handler(), %s", error_msg)
            raise ValueError(error_msg)

        # Step 2: Store user in DynamoDB
        current_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        dynamo_items = {
            'UserId': user_id,
            'Username': username,
            'Email': email,
            'CreationTime': current_time,
            "ProfileImageURL": "",
            'Role': [role],
            'LastUpdatedBy': user_id,
            'LastUpdatedTime': current_time,
            'LastLoginTime': current_time
        }
        put_item(USER_TABLE_NAME, dynamo_items)
        LOGGER.info("IN develop-PostConfirm.lambda_handler(), Successfully stored user %s in DynamoDB", username)

        # Step 3: Create default workspace
        workspace_id = str(uuid.uuid4())
        workspace_item = {
            'WorkspaceId': workspace_id,
            'CreatedBy': user_id,
            'CreationTime': current_time,
            'Description': 'Default workspace created for user',
            'LastUpdatedBy': user_id,
            'LastUpdationTime': current_time,
            'Tags': [{'Key': 'Type', 'Value': 'Default'}],
            'WorkspaceName': 'Default Workspace',
            'WorkspaceStatus': 'Active',
            'WorkspaceType': "DEFAULT"
        }
        workspace_table.put_item(Item=workspace_item)
        LOGGER.info("IN develop-PostConfirm.lambda_handler(), Created default workspace for user %s", user_id)

        # Step 4: Set up workspace access control
        create_workspace_fgac(RESOURCE_ACCESS_TABLE, user_id, "owner", workspace_id)
        LOGGER.info("IN develop-PostConfirm.lambda_handler(), Created FGAC for workspace %s", workspace_id)

        # Step 5: Log account creation activity
        log_item = {
            'LogId': str(uuid.uuid4()),
            'UserId': user_id,
            'Action': 'ACCOUNT CREATED',
            'Email': email,
            'EventTime': current_time,
            'ResourceName': 'CognitoPostAuth',
            'ResourceType': 'Cognito',
            'ResourceId': user_id
        }
        ACTIVITY_LOGS_TABLE.put_item(Item=log_item)
        LOGGER.info("IN develop-PostConfirm.lambda_handler(), Logged account creation for user %s", user_id)

        # Step 6: Add user to role in Roles table
        add_user_to_role(role, user_id)

        # Step 7: Send welcome email
        subject = f"Welcome to {DOMAIN}"
        body = f"Hi {username},\n\nWelcome to {DOMAIN}.\n\nRegards,\nTeam {DOMAIN}"
        send_email(subject, body, email)
        LOGGER.info("IN develop-PostConfirm.lambda_handler(), Sent welcome email to %s", email)
                
        return event
        
    except Exception as e:
        LOGGER.error("IN develop-PostConfirm.lambda_handler(), Error processing user: %s", str(e))
        
        # Cleanup: Delete user from Cognito if created
        if 'userName' in event:
            try:
                cognito.admin_delete_user(
                    UserPoolId=event['userPoolId'],
                    Username=event['userName']
                )
                LOGGER.info("IN develop-PostConfirm.lambda_handler(), Deleted Cognito user %s during cleanup", 
                           event['userName'])
            except Exception as delete_err:
                LOGGER.error("IN develop-PostConfirm.lambda_handler(), Failed to delete user from Cognito: %s", 
                            str(delete_err))

        # Cleanup: Delete user from DynamoDB if created
        if user_id:
            try:
                user_item = get_item(USER_TABLE_NAME, {'UserId': user_id})
                if user_item:
                    delete_item(USER_TABLE_NAME, {'UserId': user_id})
                    LOGGER.info("IN develop-PostConfirm.lambda_handler(), Deleted DynamoDB entry for user %s during cleanup", 
                               user_id)
            except Exception as ddb_err:
                LOGGER.error("IN develop-PostConfirm.lambda_handler(), Failed to delete user from DynamoDB: %s", 
                            str(ddb_err))
        
        raise e