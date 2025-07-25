import boto3
import json
import os
import uuid
from datetime import datetime,timezone
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key, Attr
from Utils.utils import log_activity,return_response,paginate_list
from FGAC.fgac import create_workspace_fgac, check_workspace_access
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
workspace_table=dynamodb.Table(os.environ['WORKSPACES_TABLE'])  
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])  
resource_access_table= dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])
users_table=dynamodb.Table(os.environ['USERS_TABLE'])

def create_workspace(event,context):
    """Create a new workspace with the provided details."""
    try:
        body =json.loads(event.get('body'))
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        if not all(key in body for key in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']):
            return return_response(400, {"Error": "Bad Request"})
        
        for item in body:
            if item not in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']:
                return return_response(400, {"Error": "Bad Request"})
        if len(body.get('Description'))==0:
            return return_response(400, {"Error": "Description cannot be empty"})

        if body.get('WorkspaceType') not in ['Private', 'Public']:
            return return_response(400, {"Error": "WorkspaceType is not valid"})
        tags=body.get('Tags')
        if isinstance(tags, list):
            if len(tags)==0:
                return return_response(400, {"Error": "Tags cannot be empty"})
        else:
            return return_response(400, {"Error": "Tags should be sent as list"})

        response = workspace_table.query(
            IndexName='CreatedBy-index',
            KeyConditionExpression=Key('CreatedBy').eq(user_id) & Key('WorkspaceName').eq(body.get('WorkspaceName'))
        )
        logger.info("Workspace query response: %s", response)
        if response.get('Count')>0:
            return return_response(400, {"Error": "Workspace already exists"})

        timestamp = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        workspace_id=str(uuid.uuid4())
        item={
            'WorkspaceId': workspace_id,
            'WorkspaceName': body.get('WorkspaceName'),
            'Description': body.get('Description'),
            'Tags': tags,
            'WorkspaceType': body.get('WorkspaceType'),
            'WorkspaceStatus': 'Active',
            'CreatedBy': user_id,
            'LastUpdatedBy': user_id,
            'LastUpdationTime': timestamp,
            'CreationTime': timestamp
        }
        workspace_response=workspace_table.put_item(Item=item)
        resp=log_activity(activity_logs_table, 'Workspace', body.get('WorkspaceName'),workspace_id, user_id, 'WORKSPACE_CREATED')
        
        create_workspace_fgac(resource_access_table,user_id,"owner",workspace_id)

        logger.info("Activity log response: %s", resp)
        return return_response(201, {"Message": "Workspace created successfully", "WorkspaceId": workspace_id})
        
    except Exception as e:
        logger.error("Error in create_workspace: %s", e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})

def update_workspace(event, context):
    """Update the details or status of an existing workspace."""
    try:
        path_params=event.get('pathParameters')
        workspace_id=path_params.get('workspace_id')
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}).get('Item')
        if not workspace_response:
            return return_response(404, {"Error": "Workspace does not exist"})
        
        access_type = check_workspace_access(resource_access_table, user_id, workspace_id)
        if not access_type:
            return return_response(403, {"Error": "Not authorized to perform this action"})
        
        if access_type not in ['editor', 'owner']:
            return return_response(403, {"Error": "Not authorized to perform this action"})
        
        queryParams=event.get('queryStringParameters')
        timestamp=str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        if queryParams and queryParams.get('action'):
            action = queryParams.get('action')
            if action not in ['enable', 'disable']:
                return return_response(400, {"Error": "Invalid action parameter"})
            elif action == 'enable':
                if workspace_response.get('WorkspaceStatus') == 'Active':
                    return return_response(400, {"Error": "Workspace is already active"})
                elif workspace_response.get('WorkspaceStatus') == 'Inactive':
                    workspace_table.update_item(Key={'WorkspaceId': workspace_id}, UpdateExpression='SET WorkspaceStatus = :val1, LastUpdatedBy = :user ,LastUpdationTime =:time', ExpressionAttributeValues={':val1': 'Active',':user':user_id,':time':timestamp})
                    log_activity(activity_logs_table, 'Workspace', workspace_response.get('WorkspaceName'),workspace_id, user_id, 'WORKSPACE_UPDATED')
                    return return_response(200, {"Message": "Workspace enabled successfully"})
                return return_response(400, {"Error": "Workspace status is invalid"})
            else:
                if workspace_response.get('WorkspaceStatus') == 'Inactive':
                    return return_response(400, {"Error": "Workspace is already inactive"})
                elif workspace_response.get('WorkspaceStatus') == 'Active':
                    workspace_table.update_item(Key={'WorkspaceId': workspace_id}, UpdateExpression='SET WorkspaceStatus = :val1, LastUpdatedBy = :user, LastUpdationTime =:time', ExpressionAttributeValues={':val1': 'Inactive', ':user':user_id, ':time':timestamp})
                    log_activity(activity_logs_table, 'Workspace', workspace_response.get('WorkspaceName'), workspace_id, user_id, 'WORKSPACE_UPDATED')
                    return return_response(200, {"Message": "Workspace disabled successfully"})
                else:
                    return return_response(400, {"Error": "Workspace status is invalid"})

        else:
            body=json.loads(event.get('body'))

            if workspace_response.get('WorkspaceStatus') == 'Inactive':
                return return_response(400, {"Error": "Workspace is inactive"})
            if not any(key in body for key in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']):
                return return_response(400, {"Error": "Bad Request"})
            for item in body:
                if item not in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']:
                    return return_response(400, {"Error": "Bad Request"})

            if body.get('WorkspaceType') and body.get('WorkspaceType') not in ['Private', 'Public']:
                return return_response(400, {"Error": "WorkspaceType is not valid"})



            if body.get('WorkspaceName'):
                response = workspace_table.query(
                    IndexName='CreatedBy-index',
                    KeyConditionExpression=Key('CreatedBy').eq(str(user_id)) & Key('WorkspaceName').eq(str(body.get('WorkspaceName')))
                )

                if response.get('Count')>0:
                    return return_response(400, {"Error": "Workspace already exists"})
            if body.get('Tags'):
                tags=body.get('Tags')
                if isinstance(tags, list):
                    if len(tags)==0:
                        return return_response(400, {"Error": "Tags cannot be empty"})
                else:
                    return return_response(400, {"Error": "Tags should be sent as list"})

            expressionAttributeNames = {}
            expressionAttributeValues = {':time' : timestamp, ':user' : user_id}
            updateExpression = 'SET LastUpdationTime= :time, LastUpdatedBy= :user'

            for item in body:
                expressionAttributeNames['#'+item] = item
                expressionAttributeValues[':'+item] = body.get(item)
                updateExpression += ', #'+item+' = :'+item

            response = workspace_table.update_item(
                Key={'WorkspaceId': workspace_id},
                UpdateExpression=updateExpression,
                ExpressionAttributeNames=expressionAttributeNames,
                ExpressionAttributeValues=expressionAttributeValues,
                ReturnValues='UPDATED_NEW'
            )
            log_activity(activity_logs_table, 'Workspace', workspace_response.get('WorkspaceName'), workspace_id, user_id, 'WORKSPACE_UPDATED')
            return return_response(200, {"Message": "Workspace updated successfully"})
    except Exception as e:
        logger.error("Error in update_workspace: %s", e)
        return return_response(500, {"Error": f"{e}"})

def delete_workspace(event,context):
    """Delete a workspace if the user has owner access and it is inactive."""
    try:
        path_params=event.get('pathParameters')
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}).get('Item')

        if not workspace_response:
            return return_response(404, {"Error": "Workspace does not exist"})
        
        # Check user's access to the workspace
        access_type = check_workspace_access(resource_access_table, user_id, workspace_id)
        if not access_type:
            return return_response(403, {"Error": "Not authorized to perform this action"})
        
        # Only allow owner permissions to delete workspace
        if access_type != 'owner':
            return return_response(403, {"Error": "Not authorized to perform this action"})

        if workspace_response.get('WorkspaceStatus') == 'Active':
            return return_response(400, {"Error": "Workspace is already Active, cannot be deleted, disable the workspace"})
        
        if workspace_response.get('WorkspaceStatus') == 'Inactive':
            # Delete all related permissions from resource_access_table
            access_key = f"WORKSPACE#{workspace_id}"
            try:
                permission_items = resource_access_table.query(
                    IndexName='AccessKey-Index',
                    KeyConditionExpression=Key('AccessKey').eq(access_key)
                ).get('Items', [])
                for item in permission_items:
                    resource_access_table.delete_item(Key={'Id': item['Id'], 'AccessKey': item['AccessKey']})
            except Exception as e:
                print(f"Error deleting workspace permissions: {e}")
            workspace_table.delete_item(Key={'WorkspaceId': workspace_id})
            log_activity(activity_logs_table, 'Workspace', workspace_response.get('WorkspaceName'), workspace_id, user_id, 'WORKSPACE_DELETED')
            return return_response(200, {"Message": "Workspace deleted successfully"})

        return return_response(400, {"Error": "Workspace status is invalid"})
    except Exception as e:
        logger.error("Error in delete_workspace: %s", e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})               
            
def get_workspace(event,context):
    """Retrieve details and users of a specific workspace."""
    try:
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        path_params=event.get('pathParameters')
        limit= path_params.get('limit', 10)
        offset= path_params.get('offset', 1)
        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}).get('Item')

        if not workspace_response:
            return return_response(404, {"Error": "Workspace does not exist"})
        
        access_type = check_workspace_access(resource_access_table, user_id, workspace_id)
        if not access_type:
            return return_response(403, {"Error": "Not authorized to perform this action"})

        access_resource_response = resource_access_table.query(
            IndexName='AccessKey-Index',
            KeyConditionExpression=Key('AccessKey').eq(f'WORKSPACE#{workspace_id}')
        ).get('Items')
        logger.info("Access resource response: %s", access_resource_response)
        users=[]
        user_flag=0
        for item in access_resource_response:
            
            user,access_type=item.get('Id').split('#')
            if user==user_id and access_type=='owner':
                user_flag=1
            user_response = users_table.get_item(
                Key={'UserId': user},
                ProjectionExpression="UserId, Username, Email, #rls",
                ExpressionAttributeNames={
                    "#rls": "Role"
                }
            ).get('Item')
            # Not important, so removed
            user_response['Access'] = access_type
            user_response['CreationTime']=item.get('CreationTime')
            users.append(user_response)

        resp=paginate_list('Users',users,['Username'],offset,limit,None,'asc')
        body=resp.get('body')
        if user_flag==1:
            workspace_response.update(json.loads(body))
        
        return return_response(200, workspace_response)
    except Exception as e:
        logger.error("Error in get_workspace: %s", e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})

def get_workspaces(event, context):
    """Retrieve a list of workspaces accessible to the user, with optional filtering and pagination."""
    try:
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        queryParams = event.get('queryStringParameters') or {}

        filter_by = queryParams.get('filterBy')
        sort_order = queryParams.get('sortBy')
        limit = queryParams.get('limit', 10)
        offset = queryParams.get('offset', 1)

        if sort_order and sort_order not in ['asc', 'desc']:
            return return_response(400, {"Error": "Invalid sort_by parameter. Must be 'asc' or 'desc'."})

        if limit is not None:
            try:
                limit = int(limit)
            except ValueError:
                return return_response(400, {"Error": "Invalid limit parameter. Must be an integer."})

        if offset is not None:
            try:
                offset = int(offset)
            except ValueError:
                return return_response(400, {"Error": "Invalid offset parameter. Must be an integer."})

        if role == 'ITAdmin':
            
            response = workspace_table.scan(
                ProjectionExpression='WorkspaceId, WorkspaceName, WorkspaceType, WorkspaceStatus, CreatedBy, LastUpdationTime,Tags'
            )
            workspace_items = response.get('Items', [])
            workspace_items = [item for item in workspace_items if item.get('WorkspaceType') != 'DEFAULT']
            
            if filter_by:
                workspace_items = [item for item in workspace_items
                                 if filter_by.lower() in item.get('WorkspaceName', '').lower()]

            
            pagination_response = paginate_list(
                name='Workspaces',
                data=workspace_items,
                valid_keys=['WorkspaceName'],
                offset=offset,
                limit=limit,
                sort_by='WorkspaceName',
                sort_order=sort_order or 'asc'
            )
            return pagination_response



        else:

            resource_access_response = resource_access_table.scan(
                FilterExpression=Attr('Id').begins_with(f"{user_id}#"),
                ProjectionExpression='AccessKey'
            )
            
            # Extract workspace IDs from access keys (format: WORKSPACE#workspace_id)
            workspace_ids = []
            for item in resource_access_response.get('Items', []):
                access_key = item.get('AccessKey', '')
                if access_key.startswith('WORKSPACE#'):
                    workspace_id = access_key.split('#')[1]
                    workspace_ids.append(workspace_id)
            
            # Get workspace details for all accessible workspaces
            workspace_items = []
            for workspace_id in workspace_ids:
                response = workspace_table.get_item(
                    Key={'WorkspaceId': workspace_id},
                    ProjectionExpression='WorkspaceId, WorkspaceName, WorkspaceType, WorkspaceStatus, CreatedBy, LastUpdationTime,Tags,LastUpdatedBy,CreationTime'
                )
                item = response.get('Item')
                if item:
                    workspace_items.append(item)

            # Apply filtering if specified
            if filter_by:
                workspace_items = [item for item in workspace_items 
                                if filter_by.lower() in item.get('WorkspaceName', '').lower()]

            # Apply pagination and sorting
            pagination_response = paginate_list(
                name='Workspaces',
                data=workspace_items,
                valid_keys=['WorkspaceName'],
                offset=offset,
                limit=limit,
                sort_by='WorkspaceName',   
                sort_order=sort_order or 'asc'
            )
            return pagination_response

    except Exception as e:
        logger.error("Error in get_workspaces: %s", e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})
  