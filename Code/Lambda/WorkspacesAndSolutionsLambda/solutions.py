import os
import uuid
import json
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone
from Utils.utils import log_activity, paginate_list,return_response
from FGAC.fgac import create_solution_fgac, check_solution_access
from boto3.dynamodb.conditions import Key, Attr

import logging

LOGGER=logging.getLogger()
LOGGER.setLevel(logging.INFO)

DYNAMO_DB = boto3.resource('dynamodb')

SOLUTIONS_TABLE_NAME = os.environ.get('SOLUTIONS_TABLE')
WORKSPACES_TABLE_NAME = os.environ.get('WORKSPACES_TABLE')
TEMPLATES_TABLE_NAME = os.environ.get('TEMPLATES_TABLE')
ACTIVITY_LOGS_TABLE_NAME = os.environ.get('ACTIVITY_LOGS_TABLE')
DATASOURCES_TABLE_NAME = os.environ.get('DATASOURCES_TABLE')
SOLUTION_EXECUTIONS_TABLE_NAME = os.environ.get('EXECUTIONS_TABLE')
RESOURCE_ACCESS_TABLE_NAME = os.environ.get('RESOURCE_ACCESS_TABLE')
USERS_TABLE_NAME = os.environ.get('USERS_TABLE')

SOLUTIONS_TABLE = DYNAMO_DB.Table(SOLUTIONS_TABLE_NAME)
WORKSPACES_TABLE = DYNAMO_DB.Table(WORKSPACES_TABLE_NAME)
TEMPLATES_TABLE = DYNAMO_DB.Table(TEMPLATES_TABLE_NAME)
ACTIVITY_LOGS_TABLE = DYNAMO_DB.Table(ACTIVITY_LOGS_TABLE_NAME)
DATASOURCES_TABLE = DYNAMO_DB.Table(DATASOURCES_TABLE_NAME)
SOLUTION_EXECUTIONS_TABLE = DYNAMO_DB.Table(SOLUTION_EXECUTIONS_TABLE_NAME)
RESOURCE_ACCESS_TABLE = DYNAMO_DB.Table(RESOURCE_ACCESS_TABLE_NAME)
USERS_TABLE = DYNAMO_DB.Table(USERS_TABLE_NAME)

def list_solutions(workspace_id, params, user_id):
    """
    Lists solutions in a workspace with filtering, sorting, and pagination support.
    
    Key Steps:
        1. Validate and parse pagination parameters (limit, offset, sort order)
        2. Verify workspace exists in the system
        3. Query user's resource access permissions for the workspace
        4. Extract solution IDs from access keys
        5. Retrieve solution details from DynamoDB
        6. Apply filtering and sorting
        7. Format response with solution information
        8. Return paginated results
    
    Parameters:
        workspace_id (str): ID of the workspace to list solutions for
        params (dict): Query parameters including filterBy, sortBy, limit, offset
        user_id (str): ID of the user requesting the list
    
    Returns:
        dict: Paginated list of solutions with metadata
    """
    filter_by = params.get('filterBy')
    sort_order = params.get('sortBy','asc')
    limit = int(params.get('limit', 10))
    offset = int(params.get('offset', 1))

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
        FilterExpression=Attr('Id').begins_with(f"{user_id}#"),
        ProjectionExpression='AccessKey'
    )
    LOGGER.debug(f"In solutions.py.list_solutions(), resource access response: {resource_access_response}")
    
    solution_ids = []
    for item in resource_access_response.get('Items', []):
        access_key = item.get('AccessKey', '')
        LOGGER.debug(f"In solutions.py.list_solutions(), processing access key: {access_key}")
        if access_key.startswith(f'SOLUTION#{workspace_id}#'):
            solution_id = access_key.split('#')[2]
            LOGGER.debug(f"In solutions.py.list_solutions(), found solution ID: {solution_id}")
            solution_ids.append(solution_id)
            
    LOGGER.debug(f"In solutions.py.list_solutions(), solution IDs found: {solution_ids}")
    
    items = []
    for solution_id in solution_ids:
        response = SOLUTIONS_TABLE.get_item(
            Key={"WorkspaceId": workspace_id, "SolutionId": solution_id}
        )
        item = response.get('Item')
        if item:
            items.append(item)

    LOGGER.debug(f"In solutions.py.list_solutions(), items before filtering: {items}")

    if filter_by:
        items = [item for item in items if filter_by in item.get('SolutionName', '').lower()]

    LOGGER.debug(f"In solutions.py.list_solutions(), items after filtering: {items}")

    solutions = [{
        "SolutionId": item.get("SolutionId"),
        "SolutionName": item.get("SolutionName"),
        "Description": item.get("Description"),
        "Tags": item.get("Tags", []),
        "SolutionStatus": item.get("SolutionStatus",""),
        "CreatedBy": item.get("CreatedBy"),
        "CreationTime": item.get("CreationTime"),
        "LastUpdatedBy": item.get("LastUpdatedBy"),
        "LastUpdationTime": item.get("LastUpdationTime")
    } for item in items]

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
    """
    Creates a new solution in the specified workspace with proper permissions.
    
    Key Steps:
        1. Validate required fields (SolutionName, Description, Tags)
        2. Check for duplicate solution names in the workspace
        3. Verify workspace exists
        4. Generate unique solution ID
        5. Create solution item in DynamoDB
        6. Log activity for solution creation
        7. Grant owner permissions to creator
        8. Grant owner permissions to all ITAdmin users
        9. Return success response with solution ID
    
    Parameters:
        workspace_id (str): ID of the workspace to create solution in
        body (dict): Request body containing solution details
        user_id (str): ID of the user creating the solution
    
    Returns:
        dict: Success response with solution ID
    """
    # Check for duplicate solution name in the same workspace
    solution_name = body.get("SolutionName")
    if not solution_name:
        return return_response(400, {"Message": "SolutionName is required"})
    
    description=body.get("Description")
    if not description:
        return return_response(400, {"Message": "Description is required"})
    
    tags = body.get("Tags", [])
    if not isinstance(tags, list):
        return return_response(400, {"Message": "Tags must be a list"})
    
    if len(tags) == 0:
        return return_response(400, {"Message": "At least one tag is required"})

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
        "Description": description,
        "Tags": tags,
        "SolutionStatus":"YET_TO_BE_PREPARED",
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
        action="Solution Created"
    )

    # Grant owner permissions to the creator
    create_solution_fgac(RESOURCE_ACCESS_TABLE, user_id, "owner", workspace_id, solution_id)
    
    # Grant owner permissions to all ITAdmin users
    try:
        # Query all users and check if their role list contains ITAdmin
        all_users_response = USERS_TABLE.scan(
            ProjectionExpression='UserId, #rls',
            ExpressionAttributeNames={
                "#rls": "Role"
            }
        )
        
        for user_item in all_users_response.get('Items', []):
            admin_user_id = user_item.get('UserId')
            user_roles = user_item.get('Role', [])
            
            # Handle role as a list and check if it contains ITAdmin
            if not isinstance(user_roles, list):
                user_roles = [user_roles] if user_roles else []
            
            if 'ITAdmin' in user_roles and admin_user_id and admin_user_id != user_id:  # Don't duplicate for creator
                create_solution_fgac(RESOURCE_ACCESS_TABLE, admin_user_id, "owner", workspace_id, solution_id)
                LOGGER.info(f"In solutions.py.create_solution(), granted owner permissions to ITAdmin user: {admin_user_id} for solution: {solution_id}")
    except Exception as e:
        LOGGER.error(f"In solutions.py.create_solution(), error granting ITAdmin permissions for solution {solution_id}: {e}")
        # Continue with solution creation even if ITAdmin permission granting fails

    body = {
        "Message": "Solution created successfully",
        "SolutionId": solution_id
    }
    return return_response(200, body)

def get_solution(workspace_id, solution_id, params, user_id):
    """
    Retrieves detailed information about a specific solution including user access.
    
    Key Steps:
        1. Check user's access permissions for the solution
        2. Verify workspace exists in the system
        3. Retrieve solution details from DynamoDB
        4. Query all users with access to this solution
        5. Fetch user details and access types
        6. Format response with solution and user information
        7. Return complete solution details
    
    Parameters:
        workspace_id (str): ID of the workspace containing the solution
        solution_id (str): ID of the solution to retrieve
        params (dict): Query parameters (currently unused)
        user_id (str): ID of the user requesting the solution
    
    Returns:
        dict: Complete solution details including user access information
    """

    access_type = check_solution_access(RESOURCE_ACCESS_TABLE, user_id, workspace_id, solution_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})

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
    
    # Fetch users with access to this solution
    access_key = f"SOLUTION#{workspace_id}#{solution_id}"
    users = []
    try:
        permission_items = RESOURCE_ACCESS_TABLE.query(
            IndexName='AccessKey-Index',
            KeyConditionExpression=Key('AccessKey').eq(access_key)
        ).get('Items', [])
        for perm in permission_items:
            user_id_access = perm.get('Id', '')
            if '#' in user_id_access:
                user_id_part, access_type_part = user_id_access.split('#', 1)
                # Fetch user details
                user_resp = USERS_TABLE.get_item(
                    Key={'UserId': user_id_part},
                    ProjectionExpression="UserId, Username, Email, #rls",
                    ExpressionAttributeNames={
                        "#rls": "Role"
                    }
                )
                user_item = user_resp.get('Item')
                if user_item:
                    # Handle role as a list
                    user_roles = user_item.get("Role", [])
                    if not isinstance(user_roles, list):
                        user_roles = [user_roles] if user_roles else []
                    
                    users.append({
                        "UserId": user_item.get("UserId"),
                        "Username": user_item.get("Username", ""),
                        "Email": user_item.get("Email", ""),
                        "Role": user_roles,
                        "Access": access_type_part,
                        "CreationTime": perm.get("CreationTime", "")
                    })
    except Exception as e:
        LOGGER.error(f"In solutions.py.get_solution(), error fetching users for solution {solution_id}: {e}")
    item["Users"] = users
    return return_response(200,item)

def update_solution(workspace_id, solution_id, body, user_id, params=None):
    """
    Updates solution details or datasources based on user permissions and action type.
    
    Key Steps:
        1. Check user's access permissions (editor or owner required)
        2. Verify workspace and solution exist
        3. Handle datasource updates if action is 'datasource'
        4. Validate datasource IDs and fetch details
        5. Update solution fields (SolutionName, Description, Tags)
        6. Update timestamps and user information
        7. Log activity for the update
        8. Return success response
    
    Parameters:
        workspace_id (str): ID of the workspace containing the solution
        solution_id (str): ID of the solution to update
        body (dict): Request body containing update fields
        user_id (str): ID of the user performing the update
        params (dict, optional): Query parameters including action type
    
    Returns:
        dict: Success response with update confirmation
    """
    action = None
    if params and isinstance(params, dict):
        action = params.get('action')

    access_type = check_solution_access(RESOURCE_ACCESS_TABLE, user_id, workspace_id, solution_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type not in ['editor', 'owner']:
        return return_response(403, {"Error": "Not authorized to perform this action"})

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

    if action == "datasource":
        # Only update Datasources field
        datasources = body.get("Datasources")
        if not isinstance(datasources, list):
            return {"statusCode": 400, "body": json.dumps({"Message": "Datasources must be a list"})}
        datasource_objs = []
        invalid = []
        for ds_id in datasources:
            ds_resp = DATASOURCES_TABLE.get_item(Key={"DatasourceId": ds_id})
            ds_item = ds_resp.get('Item')
            if not ds_item:
                invalid.append(ds_id)
            else:
                datasource_objs.append({
                    "DatasourceId": ds_id,
                    "DatasourceName": ds_item.get("DatasourceName", "")
                })
        if invalid:
            return {"statusCode": 400, "body": json.dumps({"Message": f"Invalid datasources: {invalid}"})}
        update_expr.append("Datasources = :Datasources")
        expr_attr_values[":Datasources"] = datasource_objs
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
        log_activity(
            ACTIVITY_LOGS_TABLE,
            resource_type="Solutions",
            resource_name=solution_name,
            resource_id=solution_id,
            user_id=user_id,
            action="Datasource Updated"
        )
        return return_response(200, {"Message": "Solution datasources updated"})
    else:
        # Normal update, do not allow Datasources update
        for field in ["SolutionName", "Description", "Tags"]:
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
            action="Solution Updated"
        )
        return return_response(200, {"Message": "Solution updated"})

def delete_solution(workspace_id, solution_id, user_id):
    """
    Deletes a solution and all associated permissions from the system.
    
    Key Steps:
        1. Check user's access permissions (owner required)
        2. Verify workspace and solution exist
        3. Query all permission records for the solution
        4. Delete all permission entries from resource access table
        5. Delete solution from solutions table
        6. Log activity for solution deletion
        7. Return success response
    
    Parameters:
        workspace_id (str): ID of the workspace containing the solution
        solution_id (str): ID of the solution to delete
        user_id (str): ID of the user performing the deletion
    
    Returns:
        dict: Success response with deletion confirmation
    """

    access_type = check_solution_access(RESOURCE_ACCESS_TABLE, user_id, workspace_id, solution_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type != 'owner':
        return return_response(403, {"Error": "Not authorized to perform this action"})

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

    # Delete all related permissions from RESOURCE_ACCESS_TABLE
    access_key = f"SOLUTION#{workspace_id}#{solution_id}"
    try:
        # Query all permission records for this solution
        permission_items = RESOURCE_ACCESS_TABLE.query(
            IndexName='AccessKey-Index',
            KeyConditionExpression=Key('AccessKey').eq(access_key)
        ).get('Items', [])
        for item in permission_items:
            RESOURCE_ACCESS_TABLE.delete_item(Key={'Id': item['Id'], 'AccessKey': item['AccessKey']})
    except Exception as e:
        LOGGER.error(f"In solutions.py.delete_solution(), error deleting solution permissions: {e}")

    SOLUTIONS_TABLE.delete_item(Key=key)

    log_activity(
        ACTIVITY_LOGS_TABLE,
        resource_type="Solutions",
        resource_name=solution_name,
        resource_id=solution_id,
        user_id=user_id,
        action="Solution Deleted"
    )

    return return_response(200,{"Message": "Solution deleted"})