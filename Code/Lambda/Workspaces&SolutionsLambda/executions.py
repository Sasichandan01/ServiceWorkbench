import boto3
import json
import os
import uuid
from datetime import datetime, timezone
from botocore.exceptions import ClientError


dynamodb = boto3.resource('dynamodb')
executions_table = dynamodb.Table(os.environ['SOLUTION_EXECUTIONS_TABLE'])
workspaces_table = dynamodb.Table(os.environ['WORKSPACE_TABLE'])
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])

def put_log_items(action, resource_type, resource_name, user_id):
    """Log activity to the activity logs table."""
    try:
        timestamp = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        logs_item = {
            'LogId': str(uuid.uuid4()),
            'Action': action,
            'EventTime': timestamp,
            'ResourceType': resource_type,
            'ResourceName': resource_name,
            'UserId': user_id,
        }
        activity_logs_table.put_item(Item=logs_item)
        return True
    except ClientError as e:
        print(f"Error logging activity: {e}")
        return False

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
        
        
        if not put_log_items('RUN_SOLUTION', 'Solution', solution_id, 'system'):
            print("Failed to log activity but execution was created")

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