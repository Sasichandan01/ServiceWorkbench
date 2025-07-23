from executions import get_executions,run_solution,get_execution
from workspaces import create_workspace,update_workspace,get_workspace,get_workspaces,delete_workspace
from solutions import get_solution, update_solution, delete_solution, list_solutions, create_solution
from logs import generate_execution_logs,get_execution_logs,process_log_collection
from scripts import handle_get, handle_post
from RBAC.rbac import is_user_action_valid
from Utils.utils import return_response
import asyncio
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

        if resource == '/workspaces':
            if httpMethod == 'POST':
                return create_workspace(event, context)
            elif httpMethod == 'GET':
                return get_workspaces(event, context)

        elif resource == '/workspaces/{workspace_id}':
            if httpMethod == 'GET':
                return get_workspace(event,context)
            elif httpMethod == 'PUT':
                
                return update_workspace(event,context)
            elif httpMethod == 'DELETE':
                return delete_workspace(event,context)

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
                return update_solution(workspace_id, solution_id, body,user_id,query_params)
            elif httpMethod == 'DELETE':
                return delete_solution(workspace_id, solution_id,user_id)

        elif resource== '/workspaces/{workspace_id}/solutions/{solution_id}/executions':
            if httpMethod == 'GET':
                return get_executions(event, context)
            elif httpMethod == 'POST':
                return run_solution(event, context)

        elif resource== '/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}':
            if httpMethod == 'GET':
                return get_execution(event, context)
        
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/scripts':
            base_prefix = f"workspaces/{workspace_id}/solutions/{solution_id}"
            if httpMethod == 'GET':
                return handle_get(base_prefix,solution_id)
            elif httpMethod == 'POST':
                body = json.loads(event.get('body', '{}'))
                return handle_post(base_prefix,body,solution_id, workspace_id ,user_id)
        
        elif resource== '/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}/logs':
            if httpMethod == 'GET':
                return get_execution_logs(event, context)
            elif httpMethod == 'POST':
                return generate_execution_logs(event, context)
            elif event.get('InvokedBy')=='lambda':
                return asyncio.run(process_log_collection(event, context))

        return return_response(404, {"Error": "Resource not found"})
    except Exception as e:
        print(e)
        return return_response(500, {"Error": "Internal Server Error"})
