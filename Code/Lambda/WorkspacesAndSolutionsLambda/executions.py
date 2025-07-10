import boto3
import json
import os
import uuid
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from Utils.utils import log_activity, paginate_list

dynamodb = boto3.resource('dynamodb')
executions_table = dynamodb.Table(os.environ['EXECUTIONS_TABLE'])
workspaces_table = dynamodb.Table(os.environ['WORKSPACE_TABLE'])
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
        # Validate input
        path_parameters = event.get('pathParameters', {})
        is_valid, message = validate_path_parameters(path_parameters, ['workspace_id', 'solution_id'])
        if not is_valid:
            return {'statusCode': 400, 'body': json.dumps({'message': message})}

        solution_id = path_parameters['solution_id']
        
        # Query executions
        response = executions_table.query(
            KeyConditionExpression=Key('SolutionId').eq(solution_id),
            ProjectionExpression="ExecutionId, SolutionId, ExecutionStatus, StartTime, EndTime"
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'executions': response.get('Items', []),
                'count': response.get('Count', 0)
            })
        }
    except ClientError as e:
        print(f"Error retrieving executions: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Internal server error retrieving executions'})
        }

def run_solution(event, context):
    """Initiate a solution execution."""
    try:
        path_parameters = event.get('pathParameters', {})
        is_valid, message = validate_path_parameters(path_parameters, ['workspace_id', 'solution_id'])
        if not is_valid:
            return {'statusCode': 400, 'body': json.dumps({'message': message})}

        solution_id = path_parameters['solution_id']
        execution_id = str(uuid.uuid4())
        timestamp = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

        execution = {
            'ExecutionId': execution_id,
            'SolutionId': solution_id,
            'ExecutionStatus': 'STARTED',
            'StartTime': timestamp.isoformat(),
            'ExecutedBy': 'system',  
        }

        executions_table.put_item(Item=execution)
        
        log_activity(
            activity_logs_table,
            resource_type="Solution",
            resource_name=solution_id,
            resource_id=solution_id,
            user_id="system",
            message="RUN_SOLUTION"
        )

        return {
            'statusCode': 201,
            'body': json.dumps({
                'execution': execution,
                'message': 'Execution started successfully'
            })
        }
    except ClientError as e:
        print(f"Error starting execution: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Internal server error starting execution'})
        }

def get_execution(event, context):
    """Retrieve details of a specific execution."""
    try:
       
        path_parameters = event.get('pathParameters', {})
        is_valid, message = validate_path_parameters(path_parameters, ['workspace_id', 'solution_id', 'execution_id'])
        if not is_valid:
            return {'statusCode': 400, 'body': json.dumps({'message': message})}

        execution_id = path_parameters['execution_id']
        
        response = executions_table.get_item(
            Key={'ExecutionId': execution_id}
        )
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': json.dumps({'message': 'Execution not found'})
            }

        return {
            'statusCode': 200,
            'body': json.dumps(response['Item'])
        }
    except ClientError as e:
        print(f"Error retrieving execution: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Internal server error retrieving execution'})
        }