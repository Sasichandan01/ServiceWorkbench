import boto3
import json
import os
import uuid
from datetime import datetime,timezone
from boto3.dynamodb.conditions import Key, Attr
from Layer.Utils.utils import log_activity,return_response,paginate_list
import sys

# sys.path.append('/opt/python/lib/python3.9/site-packages')

dynamodb = boto3.resource('dynamodb')
workspace_table=dynamodb.Table(os.environ['WORKSPACE_TABLE'])  
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])  
resource_access_table = dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])

def create_workspace(event,context):
    try:
        body =json.loads(event.get('body'))
        print(body)

        if not all(key in body for key in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']):
            return {"statusCode": 400, "body": "Bad Request"}
        
        
        for item in body:
            if item not in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']:
                return {"statusCode": 400, "body": "Bad Request"}
        if len(body.get('Description'))==0:
            return {"statusCode": 400, "body": "Description cannot be empty"}

        if body.get('WorkspaceType') not in ['Private', 'Public']:
            return {"statusCode": 400, "body": "WorkspaceType is not valid"}
        tags=body.get('Tags')
        if isinstance(tags, list):
            if len(tags)==0:
                return {"statusCode": 400, "body": "Tags cannot be empty"}
        else:
            return {"statusCode": 400, "body": "Tags should be sent as list"}

        response=workspace_table.query(IndexName='CreatedBy-Index', KeyConditionExpression=Key('CreatedBy').eq('user'),FilterExpression=Attr('WorkspaceName').eq(body.get('WorkspaceName')))

        if response.get('Count')>0:
            return {"statusCode": 400, "body": "Workspace already exists"}

        timestamp = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        workspace_id=str(uuid.uuid4())
        item={
            'WorkspaceId': workspace_id,
            'WorkspaceName': body.get('WorkspaceName'),
            'Description': body.get('Description'),
            'Tags': tags,
            'WorkspaceType': body.get('WorkspaceType'),
            'WorkspaceStatus': 'Active',
            'CreatedBy': '',
            'LastUpdatedBy':'',
            'LastUpdationTime': timestamp,
            'CreationTime': timestamp
        }
        workspace_response=workspace_table.put_item(Item=item)
        log_activity('CREATE_WORKSPACE', 'Workspace', workspace_id, '')
        return {"statusCode": 200, "body": "Workspace created successfully"}
        
    except Exception as e:
        print(e)
        return {"statusCode": 500, "body": f"Internal Server Error, {e}"}

def update_workspace(event, context):
    try:
        path_params=event.get('pathParameters')
        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id},ProjectionExpression='WorkspaceStatus').get('Item')
        if not workspace_response:
            return {"statusCode": 400, "body": "Workspace does not exist"}
        queryParams=event.get('queryStringParameters')
        timestamp=str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        if queryParams and queryParams.get('action'):
            action = queryParams.get('action')
            if action not in ['Enable', 'Disable']:
                return {"statusCode": 400, "body": "Invalid action parameter"}
            elif action == 'Enable':
                if workspace_response.get('WorkspaceStatus') == 'Active':
                    return {"statusCode": 400, "body": "Workspace is already active"}
                elif workspace_response.get('WorkspaceStatus') == 'Inactive':
                    workspace_table.update_item(Key={'WorkspaceId': workspace_id}, UpdateExpression='SET WorkspaceStatus = :val1, LastUpdatedBy = :user ,LastUpdationTime =:time', ExpressionAttributeValues={':val1': 'Active',':user':'',':time':timestamp})
                    log_activity('UPDATE_WORKSPACE', 'Workspace', workspace_id, '')
                    return {"statusCode": 200, "body": "Workspace enabled successfully"}
                    
                else:
                    return {"statusCode": 400, "body": "Workspace status is invalid"}
            else:
                if workspace_response.get('WorkspaceStatus') == 'Inactive':
                    return {"statusCode": 400, "body": "Workspace is already inactive"}
                elif workspace_response.get('WorkspaceStatus') == 'Active':
                    workspace_table.update_item(Key={'WorkspaceId': workspace_id}, UpdateExpression='SET WorkspaceStatus = :val1, LastUpdatedBy = :user, LastUpdationTime =:time', ExpressionAttributeValues={':val1': 'Inactive', ':user':'', ':time':timestamp})
                    log_activity('UPDATE_WORKSPACE', 'Workspace', workspace_id, '')
                    return {"statusCode": 200, "body": "Workspace enabled successfully"}
                else:
                    return {"statusCode": 400, "body": "Workspace status is invalid"}

        else:
            body=json.loads(event.get('body'))
            if workspace_response.get('WorkspaceStatus') == 'Inactive':
                return {"statusCode": 400, "body": "Workspace is inactive"}
            if not all(key in body for key in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']):
                return {"statusCode": 400, "body": "Bad Request"}
            for item in body:
                if item not in ['WorkspaceName', 'Description', 'Tags', 'WorkspaceType']:
                    return {"statusCode": 400, "body": "Bad Request"}
            if len(body.get('Description'))==0:
                return {"statusCode": 400, "body": "Description cannot be empty"}
            if body.get('WorkspaceType') not in ['Private', 'Public']:
                return {"statusCode": 400, "body": "WorkspaceType is not valid"}
            if body.get('WorkspaceType') == workspace_response.get('WorkspaceType'):
                return {"statusCode": 400, "body": "Workspace is already in same type"}
            if body.get('WorkspaceName'):
                response=workspace_table.query(IndexName='CreatedBy-index', KeyConditionExpression=Key('CreatedBy').eq(), FilterExpression=Attr('WorkspaceName').eq(body.get('WorkspaceName')))
                if response.get('Count')>0:
                    return {"statusCode": 400, "body": "Workspace already exists"}
            if body.get('Tags'):
                tags=body.get('Tags')
                if isinstance(tags, list):
                    if len(tags)==0:
                        return {"statusCode": 400, "body": "Tags cannot be empty"}
                else:
                    return {"statusCode": 400, "body": "Tags should be sent as list"}

            expressionAttributeNames = {}
            expressionAttributeValues = {':time' : timestamp, ':user' : ''}
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
            log_activity('UPDATE_WORKSPACE', 'Workspace', workspace_id, '')
            return {"statusCode": 200, "body": "Workspace updated successfully"}
    except Exception as e:
        print(e)
        return {'statusCode': 500, 'body':''}

def delete_workspace(event,context):
    try:
        path_params=event.get('pathParameters')
        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}, ProjectionExpression='WorkspaceStatus').get('Item')

        if not workspace_response:
            return {"statusCode": 400, "body": "Workspace does not exist"}

        if workspace_response.get('WorkspaceStatus') == 'Active':
            return {"statusCode": 400, "body": "Workspace is already Active, cannot be deleted, Disable the workspace"}
        
        if workspace_response.get('WorkspaceStatus') == 'Inactive':
            workspace_table.delete_item(Key={'WorkspaceId': workspace_id})
            log_activity('DELETE_WORKSPACE', 'Workspace', workspace_id, '')
            return {"statusCode": 200, "body": "Workspace deleted successfully"}

        return {"statusCode": 400, "body": "Workspace status is invalid"}
    except Exception as e:
        print(e)
        return {"statusCode": 500, "body": f"Internal Server Error, {e}"}               
            
def get_workspace(event,context):
    try:
        path_params=event.get('pathParameters')
        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}).get('Item')
        if not workspace_response:
            return {"statusCode": 400, "body": "Workspace does not exist"}
        
        

        return {"statusCode": 200, "body": json.dumps(workspace_response)} 
    except Exception as e:
        print(e)
        return {"statusCode": 500, "body": f"Internal Server Error, {e}"}

def get_workspaces(event, context):
    try:
        
        requestContext= event.get('requestContext')
        authorizer= requestContext.get('authorizer')
        user_id= requestContext.get('user_id')
        role= requestContext.get('role')
        email= requestContext.get('email')
        queryParams=event.get('queryStringParameters')
        if queryParams and queryParams.get('sort_by'):
            sort_by = queryParams.get('sort_by')
            if sort_by not in ['asc','desc']:
                return {"statusCode": 400, "body": "Invalid sort_by parameter"}
        if queryParams and queryParams.get('filter_by'):
            filter_by = queryParams.get('filter_by')
        if queryParams and queryParams.get('limit'):
            limit = queryParams.get('limit')
            if not isinstance(limit, int):
                return {"statusCode": 400, "body": "Invalid limit parameter"}
        if queryParams and queryParams.get('offset'):
            offset = queryParams.get('offset')
            if not isinstance(offset, int):
                return {"statusCode": 400, "body": "Invalid offset parameter"}
            
        resource_access_response= resource_access_table.scan(
            FilterExpression= Attr('Id').contains(user_id) & Attr('WorkspaceName').contains(filter_by),
            ProjectionExpression='AccessKey'
        )
            
        if filter_by:
            response=workspace_table.scan(
                FilterExpression= Attr('WorkspaceName').contains(filter_by),
                ProjectionExpression='WorkspaceId, WorkspaceName, WorkspaceType, WorkspaceStatus, CreatedBy'
                )
        else:
            response=workspace_table.scan(ProjectionExpression='WorkspaceId, WorkspaceName, WorkspaceType, WorkspaceStatus, CreatedBy')

        paginate_list('Workspaces',response,offset,limit,'Workspace_Name',sort_by)
        items=response.get('Items')
        return {"statusCode": 200, "body": json.dumps(items)}
    except Exception as e:
        print(e)
        return {"statusCode": 500, "body": f"Internal Server Error, {e}"}
