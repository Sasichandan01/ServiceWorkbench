def handler(event, context):
    return {"statusCode": 200, "body": "Hello from Lambda!"}
import os
import uuid
import json
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone

DYNAMO_DB = boto3.resource('dynamodb')
SOLUTIONS_TABLE_NAME = os.environ.get('SOLUTIONS_TABLE')
WORKSPACES_TABLE_NAME = os.environ.get('WORKSPACES_TABLE')
TEMPLATES_TABLE_NAME = os.environ.get('TEMPLATES_TABLE')
ACTIVITY_LOGS_TABLE_NAME = os.environ.get('ACTIVITY_LOGS_TABLE')

SOLUTIONS_TABLE = DYNAMO_DB.Table(SOLUTIONS_TABLE_NAME)
WORKSPACES_TABLE = DYNAMO_DB.Table(WORKSPACES_TABLE_NAME)
TEMPLATES_TABLE = DYNAMO_DB.Table(TEMPLATES_TABLE_NAME)
ACTIVITY_LOGS_TABLE = DYNAMO_DB.Table(ACTIVITY_LOGS_TABLE_NAME)

def list_solutions(workspace_id, params):
    print("inside listing call...")

    filter_by = params.get('filterBy', '').strip().lower()
    sort_by = params.get('sortBy', 'SolutionName')
    limit = int(params.get('limit', 10))
    offset = int(params.get('offset', 0))

    response = WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Workspace not found"})
        }

    response = SOLUTIONS_TABLE.query(
        KeyConditionExpression=Key('WorkspaceId').eq(workspace_id),
        Limit=limit + offset
    )
    items = response.get('Items', [])

    if filter_by:
        items = [item for item in items if filter_by in item.get('SolutionName', '').lower()]

    if sort_by == 'SolutionName':
        items = sorted(items, key=lambda x: x.get(sort_by, ''))
    else:
        items = sorted(items, key=lambda x: x.get(sort_by, ''),reverse=descending)

    # items = sorted(items, key=lambda x: x.get(sort_by, ''))

    items = items[offset:offset + limit]

    solutions = [{
        "SolutionId": item.get("SolutionId"),
        "SolutionName": item.get("SolutionName"),
        "Description": item.get("Description"),
        "CreatedBy": item.get("CreatedBy"),
        "CreationTime": item.get("CreationTime"),
        "LastUpdatedBy": item.get("LastUpdatedBy"),
        "LastUpdationTime": item.get("LastUpdationTime")
    } for item in items]

    return {
        "statusCode": 200,
        "body": json.dumps({
            "Solutions": solutions
        })
    }

def create_solution(workspace_id, body):

    response=WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Workspace not found"})
        }

    solution_id = str(uuid.uuid4())

    item = {
        "WorkspaceId": workspace_id,
        "SolutionId": solution_id,
        "SolutionName": body.get("SolutionName"),
        "Description": body.get("Description"),
        "CreatedBy": "user",
        "CreationTime": str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        "LastUpdatedBy": "user",
        "LastUpdationTime": str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    }
    
    SOLUTIONS_TABLE.put_item(Item=item)

    log_id=str(uuid.uuid4())
    activity_log={
        "LogId":log_id,
        "ResourceType":"Solutions",
        "ResourceName":body.get("SolutionName"),
        "ResourceId":solution_id,
        "UserId":"user",
        "EventTime":str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        "Message":"Created new solution"
    }
    ACTIVITY_LOGS_TABLE.put_item(Item=activity_log)

    return {
        "statusCode": 201,
        "body": json.dumps({"Message": "Solution created", "SolutionId": solution_id})
    }

def get_solution(workspace_id, solution_id, params):

    response=WORKSPACES_TABLE.get_item(Key={"WorkspaceId": workspace_id})
    if 'Item' not in response:
        return {
            "statusCode": 404,
            "body": json.dumps({"Message": "Workspace not found"})
        }

    version = params.get('version')

    if version:
        key={
            "SolutionId":solution_id,
            "Version":version
        }
        response=TEMPLATES_TABLE.get_item(Key=key)
        item = response.get('Item')

    else :
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

    return {
        "statusCode": 200,
        "body": json.dumps(item)
    }

def update_solution(workspace_id, solution_id, body):

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

    for field in ["SolutionName", "Description", "Tags", "Datasources"]:
        if field in body:
            update_expr.append(f"{field} = :{field}")
            expr_attr_values[f":{field}"] = body[field]

    if not update_expr:
        return {"statusCode": 400, "body": json.dumps({"Message": "No fields to update"})}
    
    update_expr.append("LastUpdationTime = :LastUpdationTime")
    expr_attr_values[":LastUpdationTime"] = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

    update_expr.append("LastUpdatedBy= :LastUpdatedBy")
    expr_attr_values[":LastUpdatedBy"] = "user"

    update_expression = "SET " + ", ".join(update_expr)

    SOLUTIONS_TABLE.update_item(
        Key=key,
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expr_attr_values
    )
    if body.get("SolutionName"):
        solution_name = body.get("SolutionName")

    log_id=str(uuid.uuid4())
    activity_log={
        "LogId":log_id,
        "ResourceType":"Solutions",
        "ResourceName":body.get("SolutionName"),
        "ResourceId":solution_id,
        "UserId":"user",
        "EventTime":str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        "Message":"Updated Solution"
    }
    ACTIVITY_LOGS_TABLE.put_item(Item=activity_log)

    return {
        "statusCode": 200,
        "body": json.dumps({"Message": "Solution updated"})
    }

def delete_solution(workspace_id, solution_id):

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

    log_id=str(uuid.uuid4())
    activity_log={
        "LogId":log_id,
        "ResourceType":"Solutions",
        "ResourceName":body.get("SolutionName"),
        "ResourceId":solution_id,
        "UserId":"user",
        "EventTime":str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        "Message":"Solution deleted"
    }
    ACTIVITY_LOGS_TABLE.put_item(Item=activity_log)

    return {
        "statusCode": 200,
        "body": json.dumps({"Message": "Solution deleted"})
    } 