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
            LOGGER.warning(f"In WorkspacesAndSolutionsLambda.py.read_multiple_s3_files(), no files found under s3://{bucket}/{prefix}")
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

            # Handle other exceptions (like NameError, etc.)
        LOGGER.warning(f"In WorkspacesAndSolutionsLambda.py.read_multiple_s3_files(), error reading S3 files for prefix s3://{bucket}/{prefix}: {str(e)}")
        return result


def get_chat_history(workspace_id, solution_id, user_id):
    """
    Retrieves chat history for a specific solution and user.
    
    Key Steps:
        1. Build primary key for chat query
        2. Query chat table with solution and user identifiers
        3. Format chat messages with required fields
        4. Return formatted chat history
    
    Parameters:
        workspace_id (str): ID of the workspace
        solution_id (str): ID of the solution
        user_id (str): ID of the user requesting chat history
    
    Returns:
        dict: HTTP response with chat history list
    """
    # Build primary key for chat query using solution and user IDs
    pk = build_chat_pk(solution_id, user_id)
    response = chat_table.query(
        KeyConditionExpression=Key('ChatId').eq(pk),
        ScanIndexForward=True  # oldest first
    )
    items = response.get('Items', [])
    LOGGER.info(f"In WorkspacesAndSolutionsLambda.py.get_chat_history(), retrieved {len(items)} chat messages for solution {solution_id} by user {user_id}")
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
                    
                    LOGGER.info(f"In WorkspacesAndSolutionsLambda.py.get_chat_history(), successfully read {len(s3_files)} files for message with s3_key: {s3_key}")
                else:
                    LOGGER.info(f"In WorkspacesAndSolutionsLambda.py.get_chat_history(), no files found for s3_key: {s3_key}")
                    
            except Exception as e:
                LOGGER.error(f"In WorkspacesAndSolutionsLambda.py.get_chat_history(), failed to read S3 files for key {s3_key}: {str(e)}")
                # Code remains empty list as initialized
        
        chat_list.append(item_data)
    
    return return_response(200, chat_list)

def delete_chat_history(workspace_id, solution_id, user_id):
    """
    Deletes all chat messages for a specific solution and user.
    
    Key Steps:
        1. Build primary key for chat query
        2. Query all chat messages for the solution and user
        3. Delete each chat message from the table
        4. Return success response
    
    Parameters:
        workspace_id (str): ID of the workspace
        solution_id (str): ID of the solution
        user_id (str): ID of the user whose chat history to delete
    
    Returns:
        dict: HTTP response with deletion confirmation
    """
    # Build primary key for chat query using solution and user IDs
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
    
    Key Steps:
        1. Query chat table using MessageId index
        2. Extract trace information from the message
        3. Ensure trace is properly formatted as a list
        4. Return trace data or error if message not found
    
    Parameters:
        chat_id (str): ID of the chat message to get trace for
    
    Returns:
        dict: HTTP response with trace data or error message
    """
    # Query the GSI on MessageId to find the specific chat message
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
    Main Lambda handler that routes API Gateway requests to appropriate functions.
    
    Key Steps:
        1. Log incoming event for debugging
        2. Handle special polling actions (execution-poll, logs-poll)
        3. Extract request details (resource, path, method, auth)
        4. Route requests based on resource path and HTTP method
        5. Handle workspace, solution, execution, script, and chat operations
        6. Return appropriate HTTP responses or error messages
    
    Parameters:
        event (dict): API Gateway event containing request details
        context (object): Lambda context object
    
    Returns:
        dict: HTTP response with status code and body
    """
    try:
        LOGGER.info(f"In WorkspacesAndSolutionsLambda.py.lambda_handler(), received event: {event}")

        if event.get('action') == 'execution-poll':
            return process_execution(event, context)
        if event.get('action')=='logs-poll':
            return process_log_collection(event, context)

        resource = event.get('resource')
        path = event.get('path')
        httpMethod = event.get('httpMethod')
        # Extract authentication and authorization information
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        
        
        # Extract path and query parameters for routing
        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}
        workspace_id = path_params.get('workspace_id',None)
        solution_id = path_params.get('solution_id',None)
        chat_id = path_params.get('chat_id', None)

        # Route workspace operations
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

        # Route solution collection operations
        elif resource == '/workspaces/{workspace_id}/solutions':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling solutions endpoint for workspace_id: %s, method: %s", 
                        workspace_id, httpMethod)
            if httpMethod == 'GET':
                return list_solutions(workspace_id, query_params, user_id)
            elif httpMethod == 'POST':
                body = json.loads(event.get('body', '{}'))
                return create_solution(workspace_id, body, user_id)

        # Route individual solution operations
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling solution endpoint for workspace_id: %s, solution_id: %s, method: %s", 
                       workspace_id, solution_id, httpMethod)
            if httpMethod == 'GET':
                return get_solution(workspace_id, solution_id, query_params, user_id)
            elif httpMethod == 'PUT':
                body = json.loads(event.get('body', '{}'))
                return update_solution(workspace_id, solution_id, body, user_id, query_params)
            elif httpMethod == 'DELETE':
                return delete_solution(workspace_id, solution_id, user_id)

        # Route execution operations
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/executions':
            if httpMethod == 'GET':
                return get_executions(event, context)
            elif httpMethod == 'POST':
                return start_execution(event, context)

        # Route individual execution operations
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}':
            if httpMethod == 'GET':
                return get_execution(event, context)
        
        # Route script operations
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/scripts':
            LOGGER.info("IN WorkspacesAndSolutionsLambda.lambda_handler, handling scripts endpoint for solution_id: %s, method: %s", 
                       solution_id, httpMethod)
            base_prefix = "workspaces/%s/solutions/%s" % (workspace_id, solution_id)
            if httpMethod == 'GET':
                return handle_get(base_prefix, solution_id)
            elif httpMethod == 'POST':
                body = json.loads(event.get('body', '{}'))
                return handle_post(base_prefix, body, solution_id, workspace_id, user_id)
        
        # Route execution log operations
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}/logs':
            if httpMethod == 'GET':
                return get_execution_logs(event, context)
            elif httpMethod == 'POST':
                return generate_execution_logs(event, context)


        # Route chat operations
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/chat':
            if httpMethod == 'GET':
                return get_chat_history(workspace_id, solution_id, user_id)
            elif httpMethod == 'DELETE':
                return delete_chat_history(workspace_id, solution_id, user_id)
        elif resource == '/workspaces/{workspace_id}/solutions/{solution_id}/chat/{chat_id}':
            if httpMethod == 'GET':
                return get_chat_trace(chat_id)

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

        # No matching resource found
        LOGGER.warning(f"In WorkspacesAndSolutionsLambda.py.lambda_handler(), no matching resource found for: {resource} with method: {httpMethod}")
        return return_response(404, {"Error": "Resource not found"})
    except Exception as e:
        LOGGER.error(f"In WorkspacesAndSolutionsLambda.py.lambda_handler(), unexpected error in lambda_handler: {e}")
        return return_response(500, {"Error": "Internal Server Error"})
