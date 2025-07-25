import boto3
import json
import os
import uuid
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from Utils.utils import log_activity,return_response,paginate_list
from boto3.dynamodb.conditions import Attr,Key


dynamodb = boto3.resource('dynamodb')
executions_table = dynamodb.Table(os.environ['EXECUTIONS_TABLE'])
workspaces_table = dynamodb.Table(os.environ['WORKSPACES_TABLE'])
activity_logs_table = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])
solutions_table = dynamodb.Table(os.environ['SOLUTIONS_TABLE'])

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
    except ClientError as e:
    
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
        workspace_id = path_parameters['workspace_id']
        solution_id = path_parameters['solution_id']
        execution_id = str(uuid.uuid4())
        timestamp = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

        execution = {
            'ExecutionId': execution_id,
            'SolutionId': solution_id,
            'ExecutionStatus': 'STARTED',
            'StartTime': timestamp,
            'ExecutedBy': user_id,  
            'LogsStatus': 'NO',
            'LogsS3Path':''
        }

        executions_table.put_item(Item=execution)
        log_activity(activity_logs_table, 'Solution', solution_id,execution_id,user_id, 'EXECUTION_STARTED')
        
        response=solutions_table.get_item(
            Key= {'WorkspaceId':workspace_id,'SolutionId': solution_id},
        ).get('Item', {})
        resources=response.get('Resources',[])
        invocation=response.get('Invocation')
        if invocation is None:
            return return_response(400, {"Error": 'Resources not found'})
        invocation_type = None
        for res in resources:
          
            name = res.get('Name', {})
            rtype = res.get('Type', {})

            if name == invocation:
                invocation_type = rtype
                break

             
        if invocation_type=='lambda':
     
            lambda_client = boto3.client('lambda')
            lambda_client.invoke(
                FunctionName=invocation,
                InvocationType='Event',
                Payload=json.dumps({'execution_id': execution_id})
            )
        elif invocation_type =='stepfunction':

            stepfunctions_client = boto3.client('stepfunctions')
            stepfunctions_client.start_execution(
                stateMachineArn=invocation,
                input=json.dumps({'execution_id': execution_id})
            )
        elif invocation_type =='glue':
    
            glue_client = boto3.client('glue')
            glue_client.start_job_run(
                JobName=invocation
            )
            
        return return_response(201, {
            'Message': 'Execution started successfully',
            'ExecutionId': execution_id
        })
    except ClientError as e:
       
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
        
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        
        response = executions_table.get_item(
            Key= {'SolutionId': solution_id, 'ExecutionId':execution_id}
        )
        
        if 'Item' not in response:
            return return_response(404, {"Error": 'Execution not found'})


        return return_response(200, response['Item'])
    except ClientError as e:
       
        return return_response(500, {"Error": 'Internal server error retrieving execution'})