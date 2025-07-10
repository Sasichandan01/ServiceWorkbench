from executions import get_executions,run_solution,get_execution
from workspaces import create_workspace,update_workspace,get_workspace,get_workspaces,delete_workspace
from solutions import get_solution, update_solution, delete_solution, list_solutions, create_solution
from RBAC.rbac import is_user_action_valid
from Utils.utils import return_response
import json
import boto3
import os

dynamodb = boto3.resource("dynamodb")
roles_table = dynamodb.Table(os.environ.get('ROLES_TABLE'))

def lambda_handler(event, context):
    try:
        print(event)
        resource = event.get('resource')
        path = event.get('path')
        httpMethod = event.get('httpMethod')
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        # valid, msg = is_user_action_valid(user_id, role, resource, httpMethod, roles_table)
        # if not valid:
        #     return return_response(403, {"Error": msg})
        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}
        workspace_id = path_params.get('workspace_id',None)
        solution_id = path_params.get('solution_id',None)

        if httpMethod == 'POST' and path == '/workspaces':
            return create_workspace(event, context)

        elif httpMethod == 'GET' and path == '/workspaces':
            return get_workspaces(event, context)

        elif resource == '/workspaces/{workspace_id}/solutions':
            if httpMethod == 'GET':
                return list_solutions(workspace_id, query_params,user_id)
            elif httpMethod == 'POST':
                body = json.loads(event.get('body', '{}'))
                return create_solution(workspace_id, body,user_id)

        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}':
            if httpMethod == 'GET':
                return get_solution(workspace_id, solution_id, query_params,user_id)
            elif httpMethod == 'PUT':
                body = json.loads(event.get('body', '{}'))
                return update_solution(workspace_id, solution_id, body,user_id)
            elif httpMethod == 'DELETE':
                return delete_solution(workspace_id, solution_id,user_id)

        elif path.startswith('/workspaces/') and 'workspace_id' in event.get('pathParameters', {}) and 'solution_id' in event.get('pathParameters', {}):
            if httpMethod == 'GET':
                return get_executions(event, context)
            elif httpMethod == 'POST':
                return run_solution(event, context)
            elif httpMethod == 'GET' and 'execution_id' in event.get('pathParameters',{}):
                return get_execution(event, context)
        
        elif path.startswith('/workspaces/') and 'workspace_id' in event.get('pathParameters', {}):
            if httpMethod == 'GET':
                return get_workspace(event, context)
            elif httpMethod == 'PUT':
                return update_workspace(event, context)
            elif httpMethod == 'DELETE':
                return delete_workspace(event, context)

        return {"statusCode": 400, "body": "Bad Request"}
    except Exception as e:
        print(e)
        return {"statusCode": 500, "body": f"Internal Server Error, {e}"}
