import boto3
import json
import os
import uuid
import time
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from Utils.utils import log_activity,return_response,paginate_list
from boto3.dynamodb.conditions import Attr,Key


dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
sfn_client=boto3.client('stepfunctions')
glue_client=boto3.client('glue')
executions_table = dynamodb.Table(os.environ['EXECUTIONS_TABLE'])
workspaces_table = dynamodb.Table(os.environ['WORKSPACES_TABLE'])
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])
solutions_table = dynamodb.Table(os.environ['SOLUTIONS_TABLE'])


def current_time():
    return f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]} {datetime.now(timezone.utc).strftime('%z')}"

def timestamp_str_to_ms(ts_str):
    dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S.%f %z")
    return int(dt.timestamp() * 1000)

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
        queryParams = event.get('queryStringParameters') or {}
        is_valid, message = validate_path_parameters(path_parameters, ['workspace_id', 'solution_id'])
        if not is_valid:
            return return_response(400, {"Error": message})

        solution_id = path_parameters['solution_id']
        
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")

        limit = queryParams.get('limit', 10)
        offset = queryParams.get('offset', 1)    

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

        execution_items = executions_table.query(
            KeyConditionExpression=Key('SolutionId').eq(solution_id),
            ProjectionExpression="ExecutionId, ExecutionStatus, StartTime, EndTime, ExecutedBy"
        ).get('Items', [])

        pagination_response = paginate_list(
            name='Execution',
            data=execution_items,
            valid_keys=['StartTime'],
            offset=offset,
            limit=limit,
            sort_by='StartTime',   
            sort_order='desc'
        )
        return pagination_response
        # return return_response(200, response)
    except ClientError:
        return return_response(500, {"Error": 'Internal server error retrieving execution'})
    except Exception as e:
        return return_response(500,{"Error": str(e)})


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
        
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        
        response = executions_table.get_item(
            Key= {'SolutionId': solution_id, 'ExecutionId':execution_id}
        )
        
        if 'Item' not in response:
            return return_response(404, {"Error": 'Execution not found'})


        return return_response(200, response['Item'])
    except ClientError:
        return return_response(500, {"Error": 'Internal server error retrieving execution'})
    except Exception as e:
        return return_response(500,{"Error": str(e)})

def start_execution(event, context):
    """Start a new solution execution"""
    try:
        # Extract parameters
        path_parameters = event.get('pathParameters', {})
        workspace_id = path_parameters['workspace_id']
        solution_id = path_parameters['solution_id']
        execution_id = str(uuid.uuid4())
        timestamp = current_time()
        # Get solution details
        solution = solutions_table.get_item(
            Key={'WorkspaceId': workspace_id, 'SolutionId': solution_id}
        ).get('Item', {})
        
        if not solution:
            return return_response(404, {"Error": "Solution not found"})
        execution_response = executions_table.query(
            KeyConditionExpression=Key('SolutionId').eq(solution_id),
            FilterExpression=Attr('ExecutionStatus').eq('GENERATING')
        )
        if execution_response.get('Count', 0) > 0:
            return return_response(400, {"Error": "Another execution is already in progress"})
        # Create execution record
        user_id=event.get('requestContext', {}).get('authorizer', {}).get('user_id')
        execution = {
            'ExecutionId': execution_id,
            'SolutionId': solution_id,
            'WorkspaceId': workspace_id,
            'ExecutionStatus': 'RUNNING',
            'StartTime': timestamp,
            'ExecutedBy': user_id,
            'LogsStatus': 'INCOMPLETE'
        }
        executions_table.put_item(Item=execution)
        log_activity(activity_logs_table, 'Solution', execution_id, solution_id, user_id, 'EXECUTION STARTED')

        # Start all resources
        time.sleep(2)
        resource_statuses = {}
        invocation = solution.get('Invocation')
        if invocation is None:
            return return_response(400, {"Error": "Invocation not found"})

        for resource in solution.get('Resources', []):
            resource_name = resource['Name']
            resource_type = resource['Type']
            
            if resource_name == invocation and 'lambda' in resource_type:
                response=lambda_client.invoke(
                    FunctionName=resource_name,
                    InvocationType='Event',
                    Payload=json.dumps({
                        'execution_id': execution_id,
                        'solution_id': solution_id
                    })
                )
                resource_statuses[resource_name] = {
                    'type': 'lambda',
                    'status': 'GENERATING'
                }

            elif resource_name == invocation and 'stepfunction' in resource_type:
                resource_arn="arn:aws:states:us-east-1:043309350924:stateMachine:"+resource_name
                response = sfn_client.start_execution(
                    stateMachineArn=resource_arn,
                    input=json.dumps({'execution_id': execution_id})
                )
                resource_statuses[resource_name] = {
                    'type': 'stepfunction',
                    'status': 'GENERATING',
                    'executionArn': response['executionArn']
                }

            elif resource_name == invocation and 'glue' in resource_type :
                
                response = glue_client.start_job_run(JobName=resource_name)
                resource_statuses[resource_name] = {
                    'type': 'glue',
                    'status': 'GENERATING',
                    'runId': response['JobRunId']
                }
            else:
                executions_table.update_item(
                    Key={'ExecutionId': execution_id, 'SolutionId': solution_id},
                    UpdateExpression="SET ExecutionStatus = :status, EndTime = :end_time",
                    ExpressionAttributeValues={
                        ':status': "FAILED",
                        ':end_time': current_time()
                    }
                )
                return return_response(400, {"Error": "Invalid invocation, resource not found"})

        payload = {
            "execution_id": execution_id,
            "solution_id": solution_id,
            "workspace_id": workspace_id,
            "resource_statuses": resource_statuses,
            "start_time": timestamp,
            "action": "execution-poll"
        }
        lambda_client.invoke(
            FunctionName='wb-bhargav-workspacesandsolutions-lambda',  
            InvocationType='Event', 
            Payload=json.dumps(payload)
        )       

        return return_response(201, {
            'Message': 'Execution started successfully',
            'ExecutionId': execution_id
        })

    except Exception as e:
        executions_table.update_item(
            Key={'ExecutionId': execution_id, 'SolutionId': solution_id},
            UpdateExpression="SET ExecutionStatus = :status, EndTime = :end_time",
            ExpressionAttributeValues={
                ':status': "FAILED",
                ':end_time': current_time()
            }
        )
        return return_response(500, {"Error": str(e)})

def process_execution(event, context):
    """Poll resource statuses for up to 10 minutes"""
    print(event)
    execution_id = event['execution_id']
    solution_id = event['solution_id']
    workspace_id = event['workspace_id']
    resource_statuses = event['resource_statuses']
    start_time = timestamp_str_to_ms(event['start_time'])
    max_duration = 10 * 60 * 1000  # 10 minutes
    poll_interval = 5 
    try:
        print(start_time)
        print(timestamp_str_to_ms(current_time()))
        print(timestamp_str_to_ms(current_time()) - start_time)
        
        while (timestamp_str_to_ms(current_time()) - start_time) < max_duration:
            print("Polling resources")
            all_completed = True
            any_failed = False
            
            # Check each resource's status
            for resource_name, status_info in resource_statuses.items():
                if status_info['status'] in ['COMPLETED', 'FAILED']:
                    if status_info['status'] == 'FAILED':
                        any_failed = True
                    continue
                
                try:
                    if 'lambda' in status_info['type'] :
                        # Implement your Lambda status check here
                        # Example: Query DynamoDB where worker Lambda reports status
                        any_failed= True
                        time.sleep(4)
                        continue
                        
                    elif 'stepfunction' in status_info['type']:
                        response = sfn_client.describe_execution(
                            executionArn=status_info['executionArn']
                        )
                        print(response)
                        if response['status'] != 'RUNNING':
                            status_info['status'] = 'COMPLETED' if response['status'] == 'SUCCEEDED' else 'FAILED'
                    
                    elif 'glue' in status_info['type']:
                        response = glue_client.get_job_run(
                            JobName=resource_name,
                            RunId=status_info['runId']
                        )
                        print(response)
                        if response['JobRun']['JobRunState'] in ['SUCCEEDED', 'FAILED', 'STOPPED']:
                            status_info['status'] = 'COMPLETED' if response['JobRun']['JobRunState'] == 'SUCCEEDED' else 'FAILED'
                
                except ClientError as e:
                    print(f"Error checking {resource_name}: {str(e)}")
                    continue
                
                if status_info.get('status') not in ['COMPLETED', 'FAILED']:
                    all_completed = False
                elif status_info['status'] == 'FAILED':
                    any_failed = True
            
 
            # Exit if all completed
            if all_completed:
                final_status = 'FAILED' if any_failed else 'GENERATED'
                time.sleep(1)
                executions_table.update_item(
                    Key={'ExecutionId': execution_id, 'SolutionId': solution_id},
                    UpdateExpression="SET ExecutionStatus = :status, EndTime = :end_time",
                    ExpressionAttributeValues={
                        ':status': final_status,
                        ':end_time': current_time()
                    }
                )
                print(f"Execution completed with status: {final_status}")
                return return_response(200, {
                    'status': final_status,
                    'execution_id': execution_id
                })
            
            # Wait before next poll
            time.sleep(poll_interval)
        
        # Timeout reached
        executions_table.update_item(
            Key={'ExecutionId': execution_id, 'SolutionId': solution_id},
            UpdateExpression="SET ExecutionStatus = :status, EndTime = :end_time",
            ExpressionAttributeValues={
                ':status': 'FAILED',
                ':end_time': current_time()
            }
        )
        return return_response(200, {
            'status': 'FAILED',
            'execution_id': execution_id
        })
    
    except Exception as e:
        print(f"Error during execution polling: {str(e)}")
        executions_table.update_item(
            Key={'ExecutionId': execution_id, 'SolutionId': solution_id},
            UpdateExpression="SET ExecutionStatus = :status, EndTime = :end_time",
            ExpressionAttributeValues={
                ':status': "FAILED",
                ':end_time': current_time()
            }
        )
        return return_response(500, {"Error": str(e)})

