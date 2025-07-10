import boto3
import json
import os
import uuid
from datetime import datetime,timezone
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key, Attr
from Utils.utils import return_response,paginate_list


dynamodb = boto3.resource('dynamodb')
workspace_table=dynamodb.Table(os.environ['WORKSPACES_TABLE'])  
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])  
resource_access_table= dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])


def log_activity(table, resource_type, resource_name, user_id, action):
    """
    Log an activity to the DynamoDB activity logs table.
    Args:
        table: DynamoDB Table resource
        resource_type: Type of the resource (e.g., 'Solutions')
        resource_name: Name of the resource
        resource_id: ID of the resource
        user_id: ID of the user performing the action
        message: Description of the activity
    """
    log_id = str(uuid.uuid4())
    activity_log = {
        "LogId": log_id,
        "ResourceType": resource_type,
        "ResourceName": resource_name,
        "UserId": user_id,
        "EventTime": str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        "Action": action
    }
    table.put_item(Item=activity_log)
    return return_response(200, "Log Activity added successfully")

def create_workspace(event,context):
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
        print(response)
        if response.get('Count')>0:
            return return_response(200, {"Message": "Workspace already exists"})

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
        log_activity(activity_logs_table, 'Workspace', body.get('WorkspaceName'), user_id, 'CREATE_WORKSPACE')
        return return_response(200, {"Message": "Workspace created successfully"})
        
    except Exception as e:
        print(e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})

def update_workspace(event, context):
    try:
        path_params=event.get('pathParameters')
        workspace_id=path_params.get('workspace_id')
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}).get('Item')
        if not workspace_response:
            return return_response(400, {"Error": "Workspace does not exist"})
        queryParams=event.get('queryStringParameters')
        timestamp=str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        if queryParams and queryParams.get('action'):
            action = queryParams.get('action')
            if action not in ['Enable', 'Disable']:
                return return_response(400, {"Error": "Invalid action parameter"})
            elif action == 'Enable':
                if workspace_response.get('WorkspaceStatus') == 'Active':
                    return return_response(400, {"Error": "Workspace is already active"})
                elif workspace_response.get('WorkspaceStatus') == 'Inactive':
                    workspace_table.update_item(Key={'WorkspaceId': workspace_id}, UpdateExpression='SET WorkspaceStatus = :val1, LastUpdatedBy = :user ,LastUpdationTime =:time', ExpressionAttributeValues={':val1': 'Active',':user':user_id,':time':timestamp})
                    log_activity(activity_logs_table, 'Workspace', workspace_id, user_id, 'UPDATE_WORKSPACE')
                    return return_response(200, {"Message": "Workspace enabled successfully"})
                    
                else:
                    return return_response(400, {"Error": "Workspace status is invalid"})
            else:
                if workspace_response.get('WorkspaceStatus') == 'Inactive':
                    return return_response(400, {"Error": "Workspace is already inactive"})
                elif workspace_response.get('WorkspaceStatus') == 'Active':
                    workspace_table.update_item(Key={'WorkspaceId': workspace_id}, UpdateExpression='SET WorkspaceStatus = :val1, LastUpdatedBy = :user, LastUpdationTime =:time', ExpressionAttributeValues={':val1': 'Inactive', ':user':user_id, ':time':timestamp})
                    log_activity(activity_logs_table, 'Workspace', workspace_id, user_id, 'UPDATE_WORKSPACE')
                    return return_response(200, {"Message": "Workspace disabled successfully"})
                else:
                    return return_response(400, {"Error": "Workspace status is invalid"})

        else:
            body=json.loads(event.get('body'))

            print(workspace_response)
            if workspace_response.get('WorkspaceStatus') == 'Inactive':
                return return_response(400, {"Error": "Workspace is inactive"})
            if not any(key in body for key in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']):
                return return_response(400, {"Error": "Bad Request"})
            for item in body:
                if item not in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']:
                    return return_response(400, {"Error": "Bad Request"})

            if body.get('WorkspaceType') and body.get('WorkspaceType') not in ['Private', 'Public']:
                return return_response(400, {"Error": "WorkspaceType is not valid"})
            if body.get('WorkspaceType') and  body.get('WorkspaceType') == workspace_response.get('WorkspaceType'):
                return return_response(400, {"Error": "Workspace is already in same type"})

            if body.get('WorkspaceName') and body.get('WorkspaceName') == workspace_response.get('WorkspaceName'):
                return return_response(400, {"Error": "Workspace is already in same name"})
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
            log_activity(activity_logs_table, 'Workspace', workspace_id, user_id, 'UPDATE_WORKSPACE')
            return return_response(200, {"Message": "Workspace updated successfully"})
    except Exception as e:
        print(e)
        return return_response(500, {"Error": f"{e}"})

def delete_workspace(event,context):
    try:
        path_params=event.get('pathParameters')
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}, ProjectionExpression='WorkspaceStatus').get('Item')

        if not workspace_response:
            return return_response(400, {"Error": "Workspace does not exist"})

        if workspace_response.get('WorkspaceStatus') == 'Active':
            return return_response(400, {"Error": "Workspace is already Active, cannot be deleted, Disable the workspace"})
        
        if workspace_response.get('WorkspaceStatus') == 'Inactive':
            workspace_table.delete_item(Key={'WorkspaceId': workspace_id})
            log_activity(activity_logs_table, 'Workspace', workspace_id, user_id, 'DELETE_WORKSPACE')
            return return_response(200, {"Message": "Workspace deleted successfully"})

        return return_response(400, {"Error": "Workspace status is invalid"})
    except Exception as e:
        print(e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})               
            
def get_workspace(event,context):
    try:
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        path_params=event.get('pathParameters')
        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}).get('Item')
        if not workspace_response:
            return return_response(400, {"Error": "Workspace does not exist"})
        
        

        return return_response(200, workspace_response)
    except Exception as e:
        print(e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})

def get_workspaces(event, context):
    try:
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        queryParams=event.get('queryStringParameters')
        if queryParams and queryParams.get('sort_by'):
            sort_by = queryParams.get('sort_by')
            if sort_by not in ['asc','desc']:
                return return_response(400, {"Error": "Invalid sort_by parameter"})
        if queryParams and queryParams.get('filter_by'):
            filter_by = queryParams.get('filter_by')
        if queryParams and queryParams.get('limit'):
            limit = queryParams.get('limit')
            if not isinstance(limit, int):
                return return_response(400, {"Error": "Invalid limit parameter"})
        if queryParams and queryParams.get('offset'):
            offset = queryParams.get('offset')
            if not isinstance(offset, int):
                return return_response(400, {"Error": "Invalid offset parameter"})
            
        resource_access_response= resource_access_table.scan(
            FilterExpression= Attr('Id').contains(user_id) & Attr('WorkspaceName').contains(filter_by),
            ProjectionExpression='AccessKey'
        )
            
        response=workspace_table.scan(ProjectionExpression='WorkspaceId, WorkspaceName, WorkspaceType, WorkspaceStatus, CreatedBy')

        paginate_list('Workspaces',response,offset,limit,'Workspace_Name',sort_by)
        items=response.get('Items')
        return return_response(200, items)
    except Exception as e:
        print(e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})
 