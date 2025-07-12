import os
import uuid
import json
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone
from Utils.utils import log_activity, paginate_list,return_response
from FGAC.fgac import create_solution_fgac
from boto3.dynamodb.conditions import Key, Attr

DYNAMO_DB = boto3.resource('dynamodb')


SOLUTIONS_TABLE_NAME = os.environ.get('SOLUTIONS_TABLE')
WORKSPACES_TABLE_NAME = os.environ.get('WORKSPACES_TABLE')
TEMPLATES_TABLE_NAME = os.environ.get('TEMPLATES_TABLE')
ACTIVITY_LOGS_TABLE_NAME = os.environ.get('ACTIVITY_LOGS_TABLE')
DATASOURCES_TABLE_NAME = os.environ.get('DATASOURCES_TABLE')
SOLUTION_EXECUTIONS_TABLE_NAME = os.environ.get('EXECUTIONS_TABLE')
RESOURCE_ACCESS_TABLE_NAME = os.environ.get('RESOURCE_ACCESS_TABLE')

SOLUTIONS_TABLE = DYNAMO_DB.Table(SOLUTIONS_TABLE_NAME)
WORKSPACES_TABLE = DYNAMO_DB.Table(WORKSPACES_TABLE_NAME)
TEMPLATES_TABLE = DYNAMO_DB.Table(TEMPLATES_TABLE_NAME)
ACTIVITY_LOGS_TABLE = DYNAMO_DB.Table(ACTIVITY_LOGS_TABLE_NAME)
DATASOURCES_TABLE = DYNAMO_DB.Table(DATASOURCES_TABLE_NAME)
SOLUTION_EXECUTIONS_TABLE = DYNAMO_DB.Table(SOLUTION_EXECUTIONS_TABLE_NAME)
RESOURCE_ACCESS_TABLE = DYNAMO_DB.Table(RESOURCE_ACCESS_TABLE_NAME)

def list_solutions(workspace_id, params,user_id):
    filter_by = params.get('filterBy', '').strip().lower()
    sort_order = params.get('sortBy', 'SolutionName')
    limit = int(params.get('limit', 10))
    offset = int(params.get('offset', 0))

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

    response = WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Workspace not found"})
        }

    resource_access_response = RESOURCE_ACCESS_TABLE.scan(
        FilterExpression=Key('Id').begins_with(f"{user_id}#"),
        ProjectionExpression='AccessKey'
    )

    print(resource_access_response)
    
    # Extract solution IDs from access keys (format: solution#{workspace_id}#{solution_id})
    solution_ids = []
    for item in resource_access_response.get('Items', []):
        access_key = item.get('AccessKey', '')
        print(access_key)
        if access_key.startswith(f'SOLUTION#{workspace_id}#'):
            solution_id = access_key.split('#')[2]
            print(solution_id)
            solution_ids.append(solution_id)
            
    print(solution_ids)
    
    # Get solution details for all accessible solutions in this workspace
    items = []
    for solution_id in solution_ids:
        response = SOLUTIONS_TABLE.get_item(
            Key={"WorkspaceId": workspace_id, "SolutionId": solution_id}
        )
        item = response.get('Item')
        if item:
            items.append(item)

    print(items)

    if filter_by:
        items = [item for item in items if filter_by in item.get('SolutionName', '').lower()]

    # if sort_by == 'SolutionName':
    #     items = sorted(items, key=lambda x: x.get(sort_by, ''))
    # # else:
    # #     items = sorted(items, key=lambda x: x.get(sort_by, ''),reverse="decending")

    # # items = sorted(items, key=lambda x: x.get(sort_by, ''))

    print(items)

    solutions = [{
        "SolutionId": item.get("SolutionId"),
        "SolutionName": item.get("SolutionName"),
        "Description": item.get("Description"),
        "CreatedBy": item.get("CreatedBy"),
        "CreationTime": item.get("CreationTime"),
        "LastUpdatedBy": item.get("LastUpdatedBy"),
        "LastUpdationTime": item.get("LastUpdationTime")
    } for item in items]

    print(solutions)

    pagination_response = paginate_list(
        name='Solutions',
        data=solutions,
        valid_keys=['SolutionName'],
        offset=offset,
        limit=limit,
        sort_by='SolutionName',   
        sort_order=sort_order or 'asc'
    )
    return pagination_response

def create_solution(workspace_id, body, user_id):
    # Check for duplicate solution name in the same workspace
    solution_name = body.get("SolutionName")
    if not solution_name:
        return return_response(400, {"Message": "SolutionName is required"})

    # Query for existing solutions with the same name in this workspace
    response = SOLUTIONS_TABLE.query(
        KeyConditionExpression=Key('WorkspaceId').eq(workspace_id),
        ProjectionExpression='SolutionName'
    )
    existing_names = [item.get('SolutionName', '').lower() for item in response.get('Items', [])]
    if solution_name.lower() in existing_names:
        return return_response(400, {"Message": "Solution with this name already exists in the workspace"})

    response = WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return return_response(404, {"Message": "Workspace not found"})

    solution_id = str(uuid.uuid4())

    item = {
        "WorkspaceId": workspace_id,
        "SolutionId": solution_id,
        "SolutionName": solution_name,
        "Description": body.get("Description"),
        "CreatedBy": user_id,
        "CreationTime": str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        "LastUpdatedBy": user_id,
        "LastUpdationTime": str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    }
    SOLUTIONS_TABLE.put_item(Item=item)

    log_activity(
        ACTIVITY_LOGS_TABLE,
        resource_type="Solutions",
        resource_name=solution_name,
        resource_id=solution_id,
        user_id=user_id,
        action="CREATE_SOLUTION"
    )

    create_solution_fgac(RESOURCE_ACCESS_TABLE, user_id, "owner", workspace_id, solution_id)

    body = {
        "Message": "Solution created successfully",
        "SolutionId": solution_id
    }
    return return_response(200, body)

def get_solution(workspace_id, solution_id, params,user_id):

    response=WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Workspace not found"})
        }

    key = {
        "WorkspaceId": workspace_id, 
        "SolutionId": solution_id
    }

    response = SOLUTIONS_TABLE.get_item(Key=key)

    item = response.get('Item')

    if not item:
        return {
            "statusCode": 404, 
            "body": json.dumps({"Message": "Solution not found"})
        }

    return return_response(200,item)

def update_solution(workspace_id, solution_id, body,user_id):

    response=WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Workspace not found"})
        }

    response=SOLUTIONS_TABLE.get_item(Key={"WorkspaceId": workspace_id, "SolutionId": solution_id})
    if not response.get("Item"):
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Solution not found"})
        }
    item = response.get("Item")
    solution_name = item.get("SolutionName")
    
    key = {
        "WorkspaceId": workspace_id, 
        "SolutionId": solution_id
    }

    update_expr = []
    expr_attr_values = {}

    if body.get("Datasources"):
        datasources = body.get("Datasources")
        if not isinstance(datasources, list):
            return {"statusCode": 400, "body": json.dumps({"Message": "Datasources must be a list"})}
        invalid = []
        for ds in datasources:
            ds_resp = DATASOURCES_TABLE.get_item(Key={"DatasourceId": ds})
            if 'Item' not in ds_resp:
                invalid.append(ds)
        if invalid:
            return {"statusCode": 400, "body": json.dumps({"Message": f"Invalid datasources: {invalid}"})}

    for field in ["SolutionName", "Description", "Tags", "Datasources"]:
        if field in body:
            update_expr.append(f"{field} = :{field}")
            expr_attr_values[f":{field}"] = body[field]

    if not update_expr:
        return {"statusCode": 400, "body": json.dumps({"Message": "No fields to update"})}
    
    update_expr.append("LastUpdationTime = :LastUpdationTime")
    expr_attr_values[":LastUpdationTime"] = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

    update_expr.append("LastUpdatedBy= :LastUpdatedBy")
    expr_attr_values[":LastUpdatedBy"] = user_id

    update_expression = "SET " + ", ".join(update_expr)

    SOLUTIONS_TABLE.update_item(
        Key=key,
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expr_attr_values
    )
    if body.get("SolutionName"):
        solution_name = body.get("SolutionName")

    log_activity(
        ACTIVITY_LOGS_TABLE,
        resource_type="Solutions",
        resource_name=body.get("SolutionName"),
        resource_id=solution_id,
        user_id=user_id,
        action="UPDATE_SOLUTION"
    )

    return return_response(200,{"Message": "Solution updated"})

def delete_solution(workspace_id, solution_id,user_id):

    response=WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Workspace not found"})
        }

    response=SOLUTIONS_TABLE.get_item(Key={"WorkspaceId": workspace_id, "SolutionId": solution_id})
    if not response.get("Item"):
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Solution not found"})
        }

    item = response.get("Item")
    solution_name = item.get("SolutionName")

    key = {"WorkspaceId": workspace_id, "SolutionId": solution_id}

    response=SOLUTIONS_TABLE.get_item(Key=key)
    if not response.get("Item"):
        return {
            "statusCode": 400, 
            "body": json.dumps(
                {
                    "Message": "Solution not found"
                }
            )
        }

    SOLUTIONS_TABLE.delete_item(Key=key)

    log_activity(
        ACTIVITY_LOGS_TABLE,
        resource_type="Solutions",
        resource_name=solution_name,
        resource_id=solution_id,
        user_id=user_id,
        action="DELETE_SOLUTION"
    )

    return return_response(200,{"Message": "Solution deleted"})