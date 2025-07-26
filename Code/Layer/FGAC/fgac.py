import logging
import json
from datetime import datetime, timezone
import boto3
import os

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

LEVEL_RANK = {"read_only": 1, "editor": 2, "owner": 3}

dynamodb = boto3.resource('dynamodb') 
RESOURCE_ACCESS_TABLE= dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])
USERS_TABLE = dynamodb.Table(os.environ.get('USERS_TABLE'))
time=str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

def get_user_id_from_email(email):
    """
    Retrieves a user's ID from their email address.
    """
    try:
        response = USERS_TABLE.query(
            IndexName='EmailIndex',
            KeyConditionExpression='Email = :email',
            ExpressionAttributeValues={':email': email}
        )
        items = response.get('Items', [])
        if items:
            return items[0].get('UserId')
        return None
    except Exception as e:
        LOGGER.error(f"Error retrieving user ID for email {email}: {e}")
        return None

def create_workspace_fgac(table,user_id,access_type,workspace_id):
    user_access_type=f"{user_id}#{access_type}"
    access_key=f"WORKSPACE#{workspace_id}"

    table.put_item(Item={"Id": user_access_type, "AccessKey": access_key,"CreationTime":time})

def create_solution_fgac(table,user_id,access_type,workspace_id,solution_id):
    user_access_type=f"{user_id}#{access_type}"
    access_key=f"SOLUTION#{workspace_id}#{solution_id}"

    table.put_item(Item={"Id": user_access_type, "AccessKey": access_key,"CreationTime":time})

def create_datasource_fgac(table,user_id,access_type,datasource_id):
    user_access_type=f"{user_id}#{access_type}"
    access_key=f"DATASOURCE#{datasource_id}"

    table.put_item(Item={"Id": user_access_type, "AccessKey": access_key,"CreationTime":time})

def check_workspace_access(table, user_id, workspace_id):
    """
    Check what type of access a user has to a specific workspace.
    Assumes only one permission per user per resource.
    
    Args:
        table: DynamoDB table object
        user_id: The user ID or email to check access for
        workspace_id: The workspace ID to check access to
        
    Returns:
        str: The access type (read_only, editor, owner) or None if no access found
    """
    
    # If user_id is an email, get the actual user ID
    if '@' in user_id:
        user_id = get_user_id_from_email(user_id)
        if not user_id:
            return None  # User not found

    access_key = f"WORKSPACE#{workspace_id}"
    LOGGER.info(f"Checking access for user {user_id} to workspace {workspace_id} with access key {access_key}")
    
    # Query the table to find the access record for this user and workspace
    try:
        response = table.query(
            IndexName='AccessKey-Index',  # Assuming you have a GSI on AccessKey
            KeyConditionExpression='AccessKey = :access_key',
            FilterExpression='begins_with(Id, :user_id)',
            ExpressionAttributeValues={
                ':access_key': access_key,
                ':user_id': f"{user_id}#"
            }
        )
        LOGGER.info(f"Query response: {response}")
        
        items = response.get('Items', [])
        
        if not items:
            # No access found
            return None
        
        # Since there's only one permission per user per resource, take the first item
        item = items[0]
        item_id = item.get('Id', '')
        
        # Extract access type from the Id field (format: user_id#access_type)
        if '#' in item_id:
            access_type = item_id.split('#', 1)[1]
            return access_type
        
        return None
        
    except Exception as e:
        LOGGER.error(f"Error checking workspace access: {str(e)}")
        return None

def check_solution_access(table, user_id, workspace_id, solution_id):
    """
    Check what type of access a user has to a specific solution within a workspace.
    Assumes only one permission per user per resource.
    
    Args:
        table: DynamoDB table object
        user_id: The user ID or email to check access for
        workspace_id: The workspace ID that contains the solution
        solution_id: The solution ID to check access to
        
    Returns:
        str: The access type (read_only, editor, owner) or None if no access found
    """
    # If user_id is an email, get the actual user ID
    if '@' in user_id:
        user_id = get_user_id_from_email(user_id)
        if not user_id:
            return None # User not found

    access_key = f"SOLUTION#{workspace_id}#{solution_id}"
    
    # Query the table to find the access record for this user and solution
    try:
        response = table.query(
            IndexName='AccessKey-Index',
            KeyConditionExpression='AccessKey = :access_key',
            FilterExpression='begins_with(Id, :user_id)',
            ExpressionAttributeValues={
                ':access_key': access_key,
                ':user_id': f"{user_id}#"
            }
        )
        
        items = response.get('Items', [])
        
        if not items:
            # No access found
            return None
        
        # Since there's only one permission per user per resource, take the first item
        item = items[0]
        item_id = item.get('Id', '')
        
        # Extract access type from the Id field (format: user_id#access_type)
        if '#' in item_id:
            access_type = item_id.split('#', 1)[1]
            return access_type
        
        return None
        
    except Exception as e:
        LOGGER.error(f"Error checking solution access: {str(e)}")
        return None

def check_datasource_access(table, user_id, datasource_id):
    """
    Check what type of access a user has to a specific datasource.
    Assumes only one permission per user per resource.
    
    Args:
        table: DynamoDB table object
        user_id: The user ID or email to check access for
        datasource_id: The datasource ID to check access to
        
    Returns:
        str: The access type (read_only, editor, owner) or None if no access found
    """
    # If user_id is an email, get the actual user ID
    if '@' in user_id:
        user_id = get_user_id_from_email(user_id)
        if not user_id:
            return None # User not found
            
    access_key = f"DATASOURCE#{datasource_id}"
    
    # Query the table to find the access record for this user and datasource
    try:
        response = table.query(
            IndexName='AccessKey-Index',
            KeyConditionExpression='AccessKey = :access_key',
            FilterExpression='begins_with(Id, :user_id)',
            ExpressionAttributeValues={
                ':access_key': access_key,
                ':user_id': f"{user_id}#"
            }
        )
        
        items = response.get('Items', [])
        
        if not items:
            # No access found
            return None
        
        item = items[0]
        item_id = item.get('Id', '')
        
        if '#' in item_id:
            access_type = item_id.split('#', 1)[1]
            return access_type
        
        return None
        
    except Exception as e:
        LOGGER.error(f"Error checking datasource access: {str(e)}")
        return None
