import boto3
import json
import os
import uuid
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from Utils.utils import log_activity, return_response
from boto3.dynamodb.conditions import Attr,Key


dynamodb = boto3.resource('dynamodb')
executions_table = dynamodb.Table(os.environ['EXECUTIONS_TABLE'])
workspaces_table = dynamodb.Table(os.environ['WORKSPACES_TABLE'])
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])


def validate_path_parameters(params, required_keys):
    """Validate that required path parameters exist and are not empty."""
    if not params:
        return False, "Missing path parameters"
    
    for key in required_keys:
        if key not in params or not params[key]:
            return False, f"Missing or empty {key}"
    return True, ""

def get_executions(event, context):
    """Retrieve all executions for a solution."""
    try:

        path_parameters = event.get('pathParameters', {})
        is_valid, message = validate_path_parameters(path_parameters, ['workspace_id', 'solution_id'])
        if not is_valid:
            return return_response(400, {"Error": message})

        solution_id = path_parameters['solution_id']
        
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        
        response = executions_table.query(
            KeyConditionExpression=Key('SolutionId').eq(solution_id),
            ProjectionExpression="ExecutionId, ExecutionStatus, StartTime, EndTime, ExecutedBy"
        ).get('Items', [])
        
        return return_response(200, response)
    except ClientError as e:
        print(f"Error retrieving executions: {e}")
        return return_response(500, {"Error": 'Internal server error retrieving executions'})

def run_solution(event, context):
    """Initiate a solution execution."""
    try:
        path_parameters = event.get('pathParameters', {})
        is_valid, message = validate_path_parameters(path_parameters, ['workspace_id', 'solution_id'])
        if not is_valid:
            return return_response(400, {"Error": message})
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        solution_id = path_parameters['solution_id']
        execution_id = str(uuid.uuid4())
        timestamp = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

        execution = {
            'ExecutionId': execution_id,
            'SolutionId': solution_id,
            'ExecutionStatus': 'STARTED',
            'StartTime': timestamp,
            'ExecutedBy': user_id,  
        }

        executions_table.put_item(Item=execution)
        
        log_activity(activity_logs_table, 'Solution', solution_id, user_id, 'RUN_SOLUTION')

        return return_response(201, {
            'execution': execution,
            'message': 'Execution started successfully'
        })
    except ClientError as e:
        print(f"Error starting execution: {e}")
        return return_response(500, {"Error": 'Internal server error starting execution'})

def get_execution(event, context):
    """Retrieve details of a specific execution."""
    try:
       
        path_parameters = event.get('pathParameters', {})
        is_valid, message = validate_path_parameters(path_parameters, ['workspace_id', 'solution_id', 'execution_id'])
        if not is_valid:
            return return_response(400, {"Error": message})

        execution_id = path_parameters['execution_id']
        solution_id = path_parameters['solution_id']
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        
        # Get user context
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        
        response = executions_table.get_item(
            Key= {'SolutionId': solution_id},
            FilterExpression=Attr('ExecutionId').eq(execution_id)
        )
        
        if 'Item' not in response:
            return return_response(404, {"Error": 'Execution not found'})


        return return_response(200, response['Item'])
    except ClientError as e:
        print(f"Error retrieving execution: {e}")
        return return_response(500, {"Error": 'Internal server error retrieving execution'})