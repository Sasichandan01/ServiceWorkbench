import boto3
import json
import os
import uuid
from datetime import datetime,timezone
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key, Attr
from Utils.utils import log_activity,return_response,paginate_list


dynamodb = boto3.resource('dynamodb')
workspace_table=dynamodb.Table(os.environ['WORKSPACES_TABLE'])  
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])  
resource_access_table= dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])



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
        resp=log_activity(activity_logs_table, 'Workspace', body.get('WorkspaceName'), user_id, 'CREATE_WORKSPACE')
        print(resp)
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
        limit= path_parameters.get('limit', 10)
        offset= path_parameters.get('offset', 1)
        workspace_id=path_params.get('workspace_id')
        workspace_response=workspace_table.get_item(Key={'WorkspaceId': workspace_id}).get('Item')

        access_resource_response = resource_access_table.query(
            KeyConditionExpression=Key('AccessKey').eq(f'Solution#{solution_id}'),
            ProjectionExpression='Id'
        ).get('Items')
        users=[]
        for item in access_resource_response:
            user_id,access_type=item.get('Id').split('#')
            user_response = users_table.get_item(Key={'Id': item.get('Id')},ProjectionExpression="UserId,Username,Email,Roles").get('Item')
            user_response['Access'] = access_type
            users.append(user_response)
        resp=paginate_list('Users',users,['Username'],offset,limit,None,'asc')
        body={
            'WorkspaceId':workspace_response.get('WorkspaceId'),
            'WorkspaceName':workspace_response.get('WorkspaceName'),
            'Description':workspace_response.get('Description'),
            'Tags':workspace_response.get('Tags'),
            'WorkspaceType':workspace_response.get('WorkspaceType'),
            'WorkspaceStatus':workspace_response.get('WorkspaceStatus'),
            'CreatedBy':workspace_response.get('CreatedBy'),
            'CreatinTime':workspace_response.get('CreationTime'),
            'LastUpdatedBy':workspace_response.get('LastUpdatedBy'),
            'LastUpdationTime':workspace_response.get('LastUpdationTime'),
            'Users':resp.get('body')
        }
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

        queryParams = event.get('queryStringParameters') or {}

        filter_by = queryParams.get('filterBy')
        sort_order = queryParams.get('sortBy')
        limit = queryParams.get('limit',10)
        offset = queryParams.get('offset',1)

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


        filter_expression = Attr('Id').contains(user_id)
        if filter_by:
            filter_expression &= Attr('WorkspaceName').contains(filter_by)

        resource_access_response = resource_access_table.scan(
            FilterExpression=filter_expression,
            ProjectionExpression='AccessKey'
        )
        workspace_items = []
        workspace_response= workspace_table.scan(
            FilterExpression=Attr('CreatedBy').eq(user_id),
            ProjectionExpression='WorkspaceId, WorkspaceName, WorkspaceType, WorkspaceStatus, CreatedBy, LastUpdationTime'
        ).get('Items')
        workspace_items.extend(workspace_response)
        workspace_ids = [item['AccessKey'].split('#')[1] for item in resource_access_response.get('Items', [])]

        
        for workspace_id in workspace_ids:
            response = workspace_table.get_item(
                Key={'WorkspaceId': workspace_id},
                ProjectionExpression='WorkspaceId, WorkspaceName, WorkspaceType, WorkspaceStatus, CreatedBy, LastUpdationTime'
            )
            item = response.get('Item')
            if item:
                workspace_items.append(item)


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
        print(e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})
