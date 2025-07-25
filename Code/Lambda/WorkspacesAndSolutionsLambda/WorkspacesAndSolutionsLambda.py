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
from boto3.dynamodb.conditions import Key
import logging

LOGGER=logging.getLogger()
LOGGER.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
roles_table = dynamodb.Table(os.environ.get('ROLES_TABLE'))

chat_table = dynamodb.Table(os.environ.get('CHAT_TABLE'))

def build_chat_pk(solution_id, user_id):
    return f"{solution_id}#{user_id}"

def get_chat_history(workspace_id, solution_id, user_id):
    pk = build_chat_pk(solution_id, user_id)
    response = chat_table.query(
        KeyConditionExpression=Key('ChatId').eq(pk),
        ScanIndexForward=True  # oldest first
    )
    items = response.get('Items', [])
    LOGGER.info(f"Chat history for {solution_id} by {user_id}: {items}")
    chat_list = []
    for item in items:
        trace = item.get("Trace", [])
        # Ensure trace is always a list
        if not isinstance(trace, list):
            try:
                import json
                trace = json.loads(trace) if trace else []
            except Exception:
                trace = [trace] if trace else []
        chat_list.append({
            "ChatId": item.get("ChatId"),
            "TimeStamp": item.get("Timestamp"),
            "Message": item.get("Message", ""),
            "MessageId": item.get("MessageId"),
            "Sender": item.get("Sender"),
            "Trace": trace
        })
    return return_response(200, chat_list)

def delete_chat_history(workspace_id, solution_id, user_id):
    pk = build_chat_pk(solution_id, user_id)
    response = chat_table.query(
        KeyConditionExpression=Key('ChatId').eq(pk),
        ProjectionExpression='ChatId, #ts',
        ExpressionAttributeNames={
            '#ts': 'Timestamp'
        }
    )
    items = response.get('Items', [])
    for item in items:
        chat_table.delete_item(Key={
            'ChatId': item['ChatId'],
            'Timestamp': item['Timestamp']
        })
    return return_response(200, {"Message": "All chat messages deleted"})

def get_chat_trace(chat_id):
    # Query the GSI on MessageId

    response = chat_table.query(
        IndexName='MessageIdIndex',
        KeyConditionExpression=Key('MessageId').eq(chat_id)
    )
    items = response.get('Items', [])
    if not items:
        return return_response(404, {"Message": "Chat message not found"})
    item = items[0]
    trace = item.get("Trace", [])
    # Ensure trace is always a list
    if not isinstance(trace, list):
        try:
            import json
            trace = json.loads(trace) if trace else []
        except Exception:
            trace = [trace] if trace else []
    return return_response(200, {"Trace": trace})

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
        chat_id = path_params.get('chat_id', None)

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

        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/chat':
            if httpMethod == 'GET':
                return get_chat_history(workspace_id, solution_id, user_id)
            elif httpMethod == 'DELETE':
                return delete_chat_history(workspace_id, solution_id, user_id)
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/chat/{chat_id}':
            if httpMethod == 'GET':
                return get_chat_trace(chat_id)

        return return_response(404, {"Error": "Resource not found"})
    except Exception as e:
        print(e)
        return return_response(500, {"Error": "Internal Server Error"})
