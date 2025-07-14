import json
import boto3
from RBAC.rbac import is_user_action_valid
import os
from datetime import datetime, timezone
from Utils.utils import log_activity, paginate_list, return_response
from boto3.dynamodb.conditions import Attr, Key

DYNAMO_DB = boto3.resource('dynamodb')
RESOURCE_ACCESS_TABLE = DYNAMO_DB.Table(os.environ.get('RESOURCE_ACCESS_TABLE'))
ROLES_TABLE = DYNAMO_DB.Table(os.environ.get('ROLES_TABLE'))

ACTIVITY_LOGS_TABLE = DYNAMO_DB.Table(os.environ.get('ACTIVITY_LOGS_TABLE')) 
SOLUTIONS_TABLE = DYNAMO_DB.Table(os.environ.get('SOLUTIONS_TABLE'))
USERS_TABLE = DYNAMO_DB.Table(os.environ.get('USERS_TABLE'))

def validate_user_exists(user_id):
    """
    Validate if a user exists in the users table
    """
    try:
        response = USERS_TABLE.get_item(Key={'UserId': user_id})
        print(response)
        return 'Item' in response
    except Exception as e:
        print(f"Error validating user {user_id}: {e}")
        return False

def lambda_handler(event, context):
    print(event)

    resource = event.get('resource')
    path = event.get('path')
    httpMethod = event.get('httpMethod')
    auth = event.get("requestContext", {}).get("authorizer", {})
    user_id = auth.get("user_id")
    role = auth.get("role")

    

    if httpMethod == 'GET':
        return get_access(event)
    elif httpMethod == 'POST':
        return share_resource(event)
    elif httpMethod == 'DELETE':
        return revoke_access(event)
    else:
        return return_response(405, {'Message': 'Method not allowed'})

def get_access(event):
    params = event.get('queryStringParameters') or {}
    resource_type = params.get('resourceType')
    resource_id = params.get('resourceId')

    if not resource_type or not resource_id:
        return return_response(400, {'Message': 'Both resourceType and resourceId are required'})

    if resource_type.upper() == 'SOLUTION':
        if '#' in resource_id:
            workspace_id, solution_id = resource_id.split('#', 1)
            access_key = f'SOLUTION#{workspace_id}#{solution_id}'
        else:
            return return_response(400, {'Message': 'workspaceId is required for solution access when resourceId is not in workspace#solution format'})
    elif resource_type.upper() == 'WORKSPACE':
        access_key = f'WORKSPACE#{resource_id}'
    elif resource_type.upper() == 'DATASOURCE':
        access_key = f'DATASOURCE#{resource_id}'
    else:
        return return_response(400, {'Message': f'Unsupported resource type: {resource_type}'})

    print(access_key)

    # response = RESOURCE_ACCESS_TABLE.scan(
    #     FilterExpression=Attr('AccessKey-Index').eq(access_key)
    # )

    response = RESOURCE_ACCESS_TABLE.query(
        IndexName='AccessKey-Index',
        KeyConditionExpression=Key('AccessKey').eq(access_key)
    )
    print(response)

    items = response.get('Items', [])
    formatted_items = []
    for item in items:
        item_id = item.get('Id', '')
        if '#' in item_id:
            user_id, access_type = item_id.split('#', 1)
            formatted_items.append({
                'UserId': user_id,
                'AccessType': access_type
            })
    # Use paginate_list for the response
    return paginate_list('ResourceAccess', formatted_items, ['UserId', 'AccessType'], offset=int(params.get('offset', 1)), limit=int(params.get('limit', 10)), sort_by=params.get('sortBy'), sort_order=params.get('sortOrder', 'asc'))

def share_resource(event):
    body = json.loads(event['body'])

    required_keys = ['UserId', 'ResourceType', 'ResourceId', 'AccessType']
    if not all(k in body for k in required_keys):
        return return_response(400, {'Message': 'Missing required fields'})

    if not validate_user_exists(body['UserId']):
        return return_response(400, {'Message': 'Invalid user ID provided'})

    valid_access_types = ['read_only', 'editor', 'owner']
    if body['AccessType'] not in valid_access_types:
        return return_response(400, {'Message': f'Invalid access type. Must be one of: {valid_access_types}'})

    user_id = body['UserId']
    access_type = body['AccessType']
    resource_type = body['ResourceType'].upper()
    resource_id = body['ResourceId']

    # Build access key
    if resource_type == 'SOLUTION':
        if '#' not in resource_id:
            return return_response(400, {'Message': 'For solution, pass resourceId in format: {workspace_id}#{solution_id}'})
        workspace_id, solution_id = resource_id.split('#', 1)
        access_key = f'SOLUTION#{workspace_id}#{solution_id}'
    elif resource_type == 'WORKSPACE':
        access_key = f'WORKSPACE#{resource_id}'
    elif resource_type == 'DATASOURCE':
        access_key = f'DATASOURCE#{resource_id}'
    else:
        return return_response(400, {'Message': f'Unsupported resource type: {resource_type}'})

    # Revoke any existing access entry for the same user and resource
    existing_items = RESOURCE_ACCESS_TABLE.scan(
        FilterExpression=Attr('Id').begins_with(f"{user_id}#") & Attr('AccessKey').eq(access_key),
        ProjectionExpression='Id, AccessKey'
    ).get('Items', [])

    for item in existing_items:
        RESOURCE_ACCESS_TABLE.delete_item(Key={
            'Id': item['Id'],
            'AccessKey': item['AccessKey']
        })

    # Grant new access
    RESOURCE_ACCESS_TABLE.put_item(Item={
        'Id': f"{user_id}#{access_type}",
        'AccessKey': access_key,
        'CreationTime': datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    })

    if ACTIVITY_LOGS_TABLE:
        log_activity(
            ACTIVITY_LOGS_TABLE,
            resource_type=body['ResourceType'],
            resource_name=body['ResourceId'],
            resource_id=body['ResourceId'],
            user_id=user_id,
            action=f'GRANT_{access_type.upper()}_ACCESS'
        )

    # Grant to all solutions if workspace
    if resource_type == 'WORKSPACE':
        workspace_id = resource_id
        solutions_granted = 0
        solutions_updated = 0

        try:
            solutions_response = SOLUTIONS_TABLE.query(
                KeyConditionExpression=Key('WorkspaceId').eq(workspace_id),
                ProjectionExpression='SolutionId'
            )

            for sol in solutions_response.get('Items', []):
                solution_id = sol['SolutionId']
                solution_access_key = f'SOLUTION#{workspace_id}#{solution_id}'

                # Delete existing access if present
                existing_solution_items = RESOURCE_ACCESS_TABLE.scan(
                    FilterExpression=Attr('Id').begins_with(f"{user_id}#") & Attr('AccessKey').eq(solution_access_key),
                    ProjectionExpression='Id, AccessKey'
                ).get('Items', [])

                for item in existing_solution_items:
                    RESOURCE_ACCESS_TABLE.delete_item(Key={
                        'Id': item['Id'],
                        'AccessKey': item['AccessKey']
                    })

                # Grant access
                RESOURCE_ACCESS_TABLE.put_item(Item={
                    'Id': f"{user_id}#{access_type}",
                    'AccessKey': solution_access_key,
                    'CreationTime': datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                })

                if ACTIVITY_LOGS_TABLE:
                    log_activity(
                        ACTIVITY_LOGS_TABLE,
                        resource_type='SOLUTION',
                        resource_name=f'Solution in workspace {workspace_id}',
                        resource_id=f'{workspace_id}#{solution_id}',
                        user_id=user_id,
                        action=f'GRANT_{access_type.upper()}_ACCESS'
                    )

                if existing_solution_items:
                    solutions_updated += 1
                else:
                    solutions_granted += 1

        except Exception as e:
            print(f"Error granting solution access: {e}")

        msg = f"Access granted to workspace. {solutions_granted} solution(s) granted, {solutions_updated} updated."
        return return_response(200, {'Message': msg})

    return return_response(200, {'Message': 'Access granted'})
    
def revoke_access(event):
    body = json.loads(event['body'])
    print("inside revoke access")

    required_keys = ['UserId', 'ResourceType', 'ResourceId']
    if not all(k in body for k in required_keys):
        return return_response(400, {'Message': 'Missing required fields'})

    # Validate that the user exists
    if not validate_user_exists(body['UserId']):
        return return_response(400, {'Message': 'Invalid user ID provided'})

    resource_type = body['ResourceType'].upper()
    resource_id = body['ResourceId']
    if resource_type == 'SOLUTION':
        if '#' in resource_id:
            workspace_id, solution_id = resource_id.split('#', 1)
            access_key = f'SOLUTION#{workspace_id}#{solution_id}'
        else:
            return return_response(400, {'Message': 'For solution, pass resourceId in format: {workspace_id}#{solution_id}'})
    elif resource_type == 'WORKSPACE':
        access_key = f'WORKSPACE#{resource_id}'
    elif resource_type == 'DATASOURCE':
        access_key = f'DATASOURCE#{resource_id}'
    else:
        return return_response(400, {'Message': f'Unsupported resource type: {resource_type}'})
    
    print(access_key)

    #Revoke access to the main resource
    # response = RESOURCE_ACCESS_TABLE.scan(
    #     FilterExpression=Attr('Id').begins_with(f"{body['UserId']}#") & Attr('AccessKey-Index').eq(access_key)
    # )

    response = RESOURCE_ACCESS_TABLE.query(
        IndexName='AccessKey-Index',
        KeyConditionExpression=Key('AccessKey').eq(access_key)
    )

    print(response)
    
    items = [
        item for item in response.get('Items', [])
        if item['Id'].startswith(f"{body['UserId']}#")
    ]

    deleted_count = 0
    for item in items:
        key = {
            'Id': item['Id'],
            'AccessKey': item['AccessKey']
        }
        RESOURCE_ACCESS_TABLE.delete_item(Key=key)
        deleted_count += 1

    # If revoking workspace access, also revoke access to all solutions in that workspace
    if resource_type == 'WORKSPACE':
        workspace_id = resource_id
        solutions_revoked = 0
        
        # Get all solutions in the workspace
        try:
            solutions_response = SOLUTIONS_TABLE.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('WorkspaceId').eq(workspace_id),
                ProjectionExpression='SolutionId'
            )
            
            for solution_item in solutions_response.get('Items', []):
                solution_id = solution_item.get('SolutionId')
                solution_access_key = f'SOLUTION#{workspace_id}#{solution_id}'
                
                # Revoke access to the solution
                solution_response = RESOURCE_ACCESS_TABLE.query(
                    IndexName='AccessKey-Index',
                    KeyConditionExpression=Key('AccessKey').eq(solution_access_key)
                )

                print(solution_response)

                items = [
                    item for item in solution_response.get('Items', [])
                    if item['Id'].startswith(f"{body['UserId']}#")
                ]

                print(items)
                
                for solution_access_item in items:
                    solution_key = {
                        'Id': solution_access_item['Id'],
                        'AccessKey': solution_access_item['AccessKey']
                    }
                    RESOURCE_ACCESS_TABLE.delete_item(Key=solution_key)
                    solutions_revoked += 1
                    
                    # Log the solution access revocation
                    if ACTIVITY_LOGS_TABLE:
                        log_activity(
                            ACTIVITY_LOGS_TABLE,
                            resource_type='SOLUTION',
                            resource_name=f'Solution in workspace {workspace_id}',
                            resource_id=f'{workspace_id}#{solution_id}',
                            user_id=body['UserId'],
                            action='REVOKE_ACCESS'
                        )
        
        except Exception as e:
            print(f"Error revoking access to solutions in workspace {workspace_id}: {e}")
            # Continue with workspace access revocation even if solution access revocation fails

    if ACTIVITY_LOGS_TABLE:
        log_activity(
            ACTIVITY_LOGS_TABLE,
            resource_type=body['ResourceType'],
            resource_name=body['ResourceId'],
            resource_id=body['ResourceId'],
            user_id=body['UserId'],
            action='REVOKE_ACCESS'
        )

    if resource_type == 'WORKSPACE':
        return return_response(200, {'Message': f'Access revoked for workspace and {solutions_revoked} solutions ({deleted_count + solutions_revoked} total records)'})
    else:
        return return_response(200, {'Message': f'Access revoked for {deleted_count} record(s)'})
