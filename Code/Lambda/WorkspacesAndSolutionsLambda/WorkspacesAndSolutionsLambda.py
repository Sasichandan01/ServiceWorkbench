from executions import get_executions,start_execution,get_execution, process_execution
from workspaces import create_workspace,update_workspace,get_workspace,get_workspaces,delete_workspace
from solutions import get_solution, update_solution, delete_solution, list_solutions, create_solution
from logs import generate_execution_logs,get_execution_logs,process_log_collection
from scripts import handle_get, handle_post
from RBAC.rbac import is_user_action_valid
from Utils.utils import return_response

import json
import boto3
import os
from boto3.dynamodb.conditions import Key
import logging
import traceback

LOGGER=logging.getLogger()
LOGGER.setLevel(logging.INFO)
s3=boto3.client('s3')
dynamodb = boto3.resource("dynamodb")
roles_table = dynamodb.Table(os.environ.get('ROLES_TABLE'))

chat_table = dynamodb.Table(os.environ.get('CHAT_TABLE'))

def build_chat_pk(solution_id, user_id):
    """
    Builds a primary key for chat table entries.
    Args:
        solution_id: Unique identifier for the solution
        user_id: Unique identifier for the user
    Returns:
        str: Formatted primary key string for chat table
    """
    return "%s#%s#AIChat" % (solution_id, user_id)

def read_multiple_s3_files(bucket: str, prefix: str) -> dict[str, str]:
    """
    Reads multiple files from S3 bucket with given prefix and returns their contents.
    Args:
        bucket: S3 bucket name
        prefix: S3 key prefix to filter files
    Returns:
        dict[str, str]: Dictionary mapping filenames to their content as strings
    """
    result = {}
    try:
        response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        if 'Contents' not in response:
            LOGGER.warning("No files found under s3://%s/%s", bucket, prefix)
            return result

        for obj in response['Contents']:
            key = obj['Key']
            if key.endswith('/'):  # skip folders
                continue
            file_obj = s3.get_object(Bucket=bucket, Key=key)
            body = file_obj['Body'].read()
            filename = key.split('/')[-1]
            result[filename] = body.decode('utf-8')
        return result

    except Exception as e:
        LOGGER.warning("Error reading S3 files for prefix s3://%s/%s: %s", bucket, prefix, str(e))
        return result


def get_chat_history(workspace_id, solution_id, user_id):
    """
    Retrieves chat history for a specific user and solution with associated S3 files.
    Args:
        workspace_id: Unique identifier for the workspace
        solution_id: Unique identifier for the solution
        user_id: Unique identifier for the user
    Returns:
        dict: HTTP response with status code 200 and list of chat messages with code files
    """
    pk = build_chat_pk(solution_id, user_id)
    response = chat_table.query(
        KeyConditionExpression=Key('ChatId').eq(pk),
        ScanIndexForward=True  # oldest first
    )
    items = response.get('Items', [])
    LOGGER.info("Chat history for %s by %s: %s", solution_id, user_id, items)
    chat_list = []
    
    for item in items:
        s3_key = item.get('S3Key')
        
        # Initialize default structure
        item_data = {
            "ChatId": item.get("ChatId"),
            "TimeStamp": item.get("Timestamp"),
            "Message": item.get("Message", ""),
            "MessageId": item.get("MessageId"),
            "Sender": item.get("Sender"),
            "S3key": item.get("S3Key", ""),
            "Code": []
        }
        
        if s3_key:
            LOGGER.info("IN WorkspacesAndSolutionsLambda.get_chat_history, processing S3 key: %s", s3_key)
            try:
                bucket = "develop-service-workbench-workspaces"
                
                # Read files from S3
                s3_files = read_multiple_s3_files(bucket, s3_key)
                
                if s3_files:
                    LOGGER.info("IN WorkspacesAndSolutionsLambda.get_chat_history, found S3 files: %s", list(s3_files.keys()))
                    
                    # Create code structure with metadata
                    code_response = {
                        'Metadata': {
                            'IsCode': True
                        }
                    }
                    
                    # Add files directly as filename: content pairs
                    for filename, content in s3_files.items():
                        code_response[filename] = content
                    item_data['Code'] = code_response
                    
                    LOGGER.info("Successfully read %s files for message with s3_key: %s", len(s3_files), s3_key)
                else:
                    LOGGER.info("No files found for s3_key: %s", s3_key)
                    
            except Exception as e:
                LOGGER.error("Failed to read S3 files for key %s: %s", s3_key, str(e))
                # Code remains empty list as initialized
        
        chat_list.append(item_data)
    
    return return_response(200, chat_list)

def delete_chat_history(workspace_id, solution_id, user_id):
    """
    Deletes all chat history for a specific user and solution.
    Args:
        workspace_id: Unique identifier for the workspace
        solution_id: Unique identifier for the solution
        user_id: Unique identifier for the user
    Returns:
        dict: HTTP response with status code 200 and success message
    """
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
    """
    Retrieves trace information for a specific chat message.
    Args:
        chat_id: Unique identifier for the chat message
    Returns:
        dict: HTTP response with status code 200 and trace data, or 404 if not found
    """
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
    """
    Main AWS Lambda handler that routes HTTP requests to appropriate service functions.
    Args:
        event: AWS Lambda event object containing HTTP request details
        context: AWS Lambda context object with runtime information
    Returns:
        dict: HTTP response with status code and response body
    """
    try:
        LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, processing incoming event")
        LOGGER.debug("IN WorkspacesAndSolutionsLambda.lambda_handler, event details: %s", event)

        if event.get('action') == 'execution-poll':
            return process_execution(event, context)
        if event.get('action')=='logs-poll':
            return process_log_collection(event, context)

        resource = event.get('resource')
        path = event.get('path')
        httpMethod = event.get('httpMethod')
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        
        LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, processing request for resource: %s, method: %s, user: %s", 
                   resource, httpMethod, user_id)
        
        # valid, msg = is_user_action_valid(user_id, role, resource, httpMethod, roles_table)
        # if not valid:
        #     return return_response(403, {"Error": msg})
        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}
        workspace_id = path_params.get('workspace_id',None)
        solution_id = path_params.get('solution_id',None)
        chat_id = path_params.get('chat_id', None)

        if resource == '/workspaces':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling workspaces endpoint with method: %s", httpMethod)
            if httpMethod == 'POST':
                return create_workspace(event, context)
            elif httpMethod == 'GET':
                return get_workspaces(event, context)

        elif resource == '/workspaces/{workspace_id}':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling workspace endpoint for workspace_id: %s, method: %s", 
                       workspace_id, httpMethod)
            if httpMethod == 'GET':
                return get_workspace(event,context)
            elif httpMethod == 'PUT':
                return update_workspace(event,context)
            elif httpMethod == 'DELETE':
                return delete_workspace(event,context)

        elif resource == '/workspaces/{workspace_id}/solutions':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling solutions endpoint for workspace_id: %s, method: %s", 
                        workspace_id, httpMethod)
            if httpMethod == 'GET':
                return list_solutions(workspace_id, query_params,user_id)
            elif httpMethod == 'POST':
                body = json.loads(event.get('body', '{}'))
                return create_solution(workspace_id, body,user_id)

        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling solution endpoint for workspace_id: %s, solution_id: %s, method: %s", 
                       workspace_id, solution_id, httpMethod)
            if httpMethod == 'GET':
                return get_solution(workspace_id, solution_id, query_params,user_id)
            elif httpMethod == 'PUT':
                body = json.loads(event.get('body', '{}'))
                return update_solution(workspace_id, solution_id, body,user_id,query_params)
            elif httpMethod == 'DELETE':
                return delete_solution(workspace_id, solution_id,user_id)

        elif resource== '/workspaces/{workspace_id}/solutions/{solution_id}/executions':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling executions endpoint for solution_id: %s, method: %s", 
                       solution_id, httpMethod)
            if httpMethod == 'GET':
                return get_executions(event, context)
            elif httpMethod == 'POST':
                return start_execution(event, context)

        elif resource== '/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling specific execution endpoint for execution_id, method: %s", 
                       httpMethod)
            if httpMethod == 'GET':
                return get_execution(event, context)
        
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/scripts':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling scripts endpoint for solution_id: %s, method: %s", 
                       solution_id, httpMethod)
            base_prefix = "workspaces/%s/solutions/%s" % (workspace_id, solution_id)
            if httpMethod == 'GET':
                return handle_get(base_prefix,solution_id)
            elif httpMethod == 'POST':
                body = json.loads(event.get('body', '{}'))
                return handle_post(base_prefix,body,solution_id, workspace_id ,user_id)
        
        elif resource== '/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}/logs':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling execution logs endpoint for execution_id, method: %s", 
                       httpMethod)
            if httpMethod == 'GET':
                return get_execution_logs(event, context)
            elif httpMethod == 'POST':
                return generate_execution_logs(event, context)

        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/chat':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling chat endpoint for solution_id: %s, method: %s", 
                       solution_id, httpMethod)
            if httpMethod == 'GET':
                return get_chat_history(workspace_id, solution_id, user_id)
            elif httpMethod == 'DELETE':
                return delete_chat_history(workspace_id, solution_id, user_id)
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/chat/{chat_id}':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling specific chat endpoint for chat_id: %s, method: %s", 
                       chat_id, httpMethod)
            if httpMethod == 'GET':
                return get_chat_trace(chat_id)

        LOGGER.warning("IN WorkspacesAndSolutionsLambda.lambda_handler, resource not found: %s", resource)
        return return_response(404, {"Error": "Resource not found"})
    except Exception as e:
        LOGGER.error("Unhandled exception: %s\n%s", e, traceback.format_exc())
        return return_response(500, {"Error": "Internal Server Error"})