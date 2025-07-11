import json
import boto3
import asyncio
import os
import tempfile
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from Utils.utils import log_activity,return_response,paginate_list
import logging
#test

logger = logging.getLogger()
logger.setLevel(logging.INFO)


dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
logs_client = boto3.client('logs')
glue_client = boto3.client('glue')
lambda_client = boto3.client('lambda')
stepfunctions_client = boto3.client('stepfunctions')

executions_table = os.environ.get('EXECUTIONS_TABLE')
solutions_table = os.environ.get('SOLUTIONS_TABLE')
workspaces_bucket = os.environ.get('WORKSPACES_BUCKET')

async def update_execution_status(solution_id, execution_id, status):
    """
    Update the log status for a given execution in the executions table.
    """
    try:
        table = dynamodb.Table(executions_table)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: table.update_item(
                Key={
                    'SolutionId': solution_id,
                    'ExecutionId': execution_id
                },
                UpdateExpression='SET LogsStatus = :status',
                ExpressionAttributeValues={
                    ':status': status
                }
            )
        )
    except Exception as e:
        logger.error(f"Error updating execution status: {str(e)}")
        raise

async def fetch_resources_for_solution(solution_id):
    """
    Fetch resources for a given solution from the solutions table.
    """
    try:
        
        table = dynamodb.Table(solutions_table)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: table.get_item(Key={'SolutionId': solution_id})
        )
        return response.get('Item', {}).get('Resources', [])
    except Exception as e:
        logger.error(f"Error fetching resources for solution: {str(e)}")
        raise

async def fetch_execution_details(solution_id, execution_id):
    """
    Fetch execution details (start/end time) from executions table.
    """
    try:
        table = dynamodb.Table(executions_table)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: table.get_item(Key={'SolutionId': solution_id, 'ExecutionId': execution_id})
        )
        item = response.get('Item')
        if not item or 'StartTime' not in item or 'EndTime' not in item:
            raise Exception("StartTime or EndTime missing in execution details")
        return item
    except Exception as e:
        logger.error(f"Error fetching execution details: {str(e)}")
        raise

async def fetch_logs_for_resource(resource, start_time, end_time):
    """
    Fetch logs for a resource between start and end times.
    Determines the resource type and fetches logs from CloudWatch or Glue accordingly.
    Stores logs in a temp file and returns the file path.
    """
    try:
        resource_type = resource.get('Type', '').lower() if isinstance(resource, dict) else str(resource).lower()
        resource_name = resource.get('Name') if isinstance(resource, dict) else str(resource)
        logs_content = ""

        if 'glue' in resource_type:
            logs_content = await fetch_glue_logs_by_time(resource_name, start_time, end_time)
        if 'lambda' in resource_type:
            logs_content = await fetch_lambda_logs_by_time(resource_name, start_time, end_time)
        if 'stepfunction' in resource_type or 'step' in resource_type:
            logs_content = await fetch_stepfunction_logs_by_time(resource_name, start_time, end_time)
        if not logs_content:
            logs_content = f"Unsupported resource type: {resource_type} for resource {resource_name}"

        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp_file:
            tmp_file.write(logs_content)
            tmp_file_path = tmp_file.name
        return tmp_file_path
    except Exception as e:
        logger.error(f"Error fetching logs for resource {resource}: {str(e)}")
        raise

async def merge_and_upload_logs(logs, s3_bucket, s3_key):
    """
    Merge logs, store in temp file, and upload to S3. Return S3 path.
    """
    try:
        combined_content = '\n'.join(logs)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp_file:
            tmp_file.write(combined_content)
            tmp_file_path = tmp_file.name
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: s3_client.upload_file(tmp_file_path, s3_bucket, s3_key)
        )
        os.unlink(tmp_file_path)
        return f"s3://{s3_bucket}/{s3_key}"
    except Exception as e:
        logger.error(f"Error merging/uploading logs: {str(e)}")
        raise

async def update_execution_status_and_s3(solution_id, execution_id, status, s3_path):
    """
    Update execution status and S3 path in executions table.
    """
    try:
        table = dynamodb.Table(executions_table)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: table.update_item(
                Key={
                    'SolutionId': solution_id,
                    'ExecutionId': execution_id
                },
                UpdateExpression='SET LogsStatus = :status, LogsS3Path = :s3_path',
                ExpressionAttributeValues={
                    ':status': status,
                    ':s3_path': s3_path
                }
            )
        )
    except Exception as e:
        logger.error(f"Error updating execution status and S3 path: {str(e)}")
        raise

async def fetch_glue_logs_by_time(job_name, start_time, end_time):
    """
    Fetch Glue job logs for a given job name between start_time and end_time.
    Only checks /aws-glue/jobs/output and /aws-glue/jobs/error log groups.
    Uses logStreamNamePrefix=run_id in describe_log_streams for efficiency.
    """
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: glue_client.get_job_runs(JobName=job_name, MaxResults=50)
        )
        
        logs_content = f"=== GLUE JOB LOGS: {job_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        log_groups = [f"/aws-glue/jobs/output", f"/aws-glue/jobs/error"]
        for job_run in response.get('JobRuns', []):
            run_id = job_run.get('Id')
            run_start = job_run.get('StartedOn')
            run_end = job_run.get('CompletedOn')
            
            status = job_run.get('JobRunState')
            
            if run_start and run_start >= start_time and run_end <= end_time:
                logs_content += f"\n--- Job Run ID: {run_id} (Status: {status}) ---\n"
                logs_content += f"Started: {run_start}, Completed: {run_end}\n"
                
                found_stream = False
                for log_group_name in log_groups:
                    streams_resp = await loop.run_in_executor(
                        None,
                        lambda: logs_client.describe_log_streams(
                            logGroupName=log_group_name,
                            logStreamNamePrefix=run_id,
                            orderBy='LogStreamName',
                            descending=False
                        )
                    )
                    for stream in streams_resp.get('logStreams', []):
                        stream_name = stream['logStreamName']
                        found_stream = True
                        try:
                            log_events = await fetch_cloudwatch_logs(log_group_name, stream_name, start_time, end_time)
                            logs_content += f"[{log_group_name}]\n"
                            logs_content += log_events
                        except Exception as e:
                            logs_content += f"Error fetching logs for stream {stream_name} in {log_group_name}: {str(e)}\n"
                if not found_stream:
                    logs_content += f"No log stream found for run ID: {run_id} in output/error log groups\n"
        
        return logs_content
    except Exception as e:
        logger.error(f"Error fetching Glue logs for {job_name}: {str(e)}")
        return f"Error fetching Glue logs: {str(e)}"

async def fetch_lambda_logs_by_time(function_name, start_time, end_time):
    """
    Fetch Lambda function logs from CloudWatch for a given function name between start_time and end_time.
    """
    try:
        log_group_name = f"/aws/lambda/{function_name}"
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: logs_client.describe_log_streams(
                logGroupName=log_group_name,
                orderBy='LastEventTime',
                descending=True,
                limit=20
            )
        )
        logs_content = f"=== LAMBDA LOGS: {function_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        for stream in response.get('logStreams', []):
            
            stream_name = stream['logStreamName']
            stream_start = datetime.fromtimestamp(stream.get('creationTime', 0) / 1000, tz=timezone.utc)
            
            
            if (stream_start <= end_time and stream_start >= start_time):
                
                logs_content += f"\n--- Log Stream: {stream_name} ---\n"
                logs_content += f"Stream Time: {stream_start}\n"
                log_events = await fetch_cloudwatch_logs(log_group_name, stream_name, start_time, end_time)
                logs_content += log_events
        logger.info(f"Lambda logs fetched for {function_name}")
        
        return logs_content
    except Exception as e:
        logger.error(f"Error fetching Lambda logs for {function_name}: {str(e)}")
        return f"Error fetching Lambda logs: {str(e)}"

async def fetch_stepfunction_logs_by_time(state_machine_name, start_time, end_time):
    """
    Fetch Step Function logs from CloudWatch for a given state machine name between start_time and end_time.
    """
    try:
     
        log_group_prefix = f"/aws/vendedlogs/states/{state_machine_name}"
        loop = asyncio.get_event_loop()
       
        log_groups_resp = await loop.run_in_executor(
            None,
            lambda: logs_client.describe_log_groups(logGroupNamePrefix=log_group_prefix)
        )
        print(log_groups_resp)
        logs_content = f"=== STEP FUNCTION LOGS: {state_machine_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        for log_group in log_groups_resp.get('logGroups', []):
            log_group_name = log_group['logGroupName']
            
            streams_resp = await loop.run_in_executor(
                None,
                lambda: logs_client.describe_log_streams(
                    logGroupName=log_group_name,
                    orderBy='LastEventTime',
                    descending=True,
                    limit=20
                )
            )
            
            for stream in streams_resp.get('logStreams', []):
                print(stream)
                stream_name = stream['logStreamName']
                stream_start = datetime.fromtimestamp(stream.get('creationTime', 0) / 1000, tz=timezone.utc)
                # stream_last = datetime.fromtimestamp(stream.get('lastEventTimeStamp', 0) / 1000, tz=timezone.utc)
                print(stream_start)
                if (stream_start <= end_time and stream_start >= start_time):
                    print(stream)
                    logs_content += f"\n--- Log Stream: {stream_name} ---\n"
                    logs_content += f"Stream Time: {stream_start} \n"
                    log_events = await fetch_cloudwatch_logs(log_group_name, stream_name, start_time, end_time)
                    logs_content += log_events
            print(logs_content)
        logger.info(f"Step Function logs fetched for {state_machine_name}")
       
        return logs_content
    except Exception as e:
        logger.error(f"Error fetching Step Function logs for {state_machine_name}: {str(e)}")
        return f"Error fetching Step Function logs: {str(e)}"

async def fetch_cloudwatch_logs(log_group_name, log_stream_name, start_time, end_time):
    """
    Fetch log events from CloudWatch Logs for a given log group and stream between start_time and end_time.
    Returns logs as a string.
    """
    try:
        loop = asyncio.get_event_loop()
        
        start_timestamp = int(start_time.timestamp() * 1000)
        end_timestamp = int(end_time.timestamp() * 1000)
        response = await loop.run_in_executor(
            None,
            lambda: logs_client.get_log_events(
                logGroupName=log_group_name,
                logStreamName=log_stream_name,
                startTime=start_timestamp,
                endTime=end_timestamp
            )
        )
        logs_content = ""
        for event in response.get('events', []):
            timestamp = datetime.fromtimestamp(event['timestamp'] / 1000)
            message = event['message']
            logs_content += f"{timestamp}: {message}\n"
        return logs_content
    except Exception as e:
        logger.error(f"Error fetching CloudWatch logs: {str(e)}")
        return f"Error fetching CloudWatch logs: {str(e)}"

async def process_log_collection(event,context):
    try:
        solution_id=event.get('solution_id','bvjfhkbk')
        execution_id=event.get('execution_id','bkjyuy')
        workspace_id=event.get('workspace_id','jvjyuvhjkk')
        # await update_execution_status(solution_id, execution_id, "RUNNING")

        # resources = await fetch_resources_for_solution(solution_id)
        
        # execution_details = await fetch_execution_details(solution_id, execution_id)
        # start_time = execution_details['StartTime']
        # end_time = execution_details['EndTime']
        start_time = '2025-04-01T00:00:00Z'
        end_time = '2025-04-05T20:53:59Z'
        resources=[
            {'Type':'glue','Name':'test-automated-kb-processor'},
            {'Type':'lambda','Name':'RAGCustomResourceLambda'},
            {'Type':'stepfunction','Name':'sfa2-stepfunction-shashank-videoprocessingworkflow'}
        ]
        if isinstance(start_time, str):
            start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        if isinstance(end_time, str):
            end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00'))


        logs_contents = await asyncio.gather(*[
            fetch_logs_for_resource(resource, start_time, end_time)
            for resource in resources
        ])

        print("logs_contents:", logs_contents)
        for log_file in logs_contents:
            print("Checking log file:", log_file)
            print("Exists:", os.path.exists(log_file))
            if os.path.exists(log_file):
                print("Size:", os.path.getsize(log_file))

        merged_logs = ""
        for log_file in logs_contents:
            if os.path.exists(log_file):
                with open(log_file, 'r') as f:
                    merged_logs += f.read() + "\n"
                os.unlink(log_file)
            else:
                print(f"Log file missing: {log_file}")

        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp_file:
            tmp_file.write(merged_logs)
            merged_log_file = tmp_file.name

        print("Merged log file path:", merged_log_file)
        with open(merged_log_file, 'r') as f:
            print("Merged log file content (first 500 chars):", f.read(500))
        
        s3_bucket = workspaces_bucket
        print(s3_bucket)
        s3_key = f"{workspace_id}/{solution_id}/{execution_id}/logs.txt"
        print(s3_key)
        try:
            print(f"Uploading {merged_log_file} to bucket {s3_bucket} with key {s3_key}")
            s3_client.upload_file(merged_log_file, s3_bucket, s3_key)
            print("Upload successful")
        except Exception as upload_exc:
            print(f"Upload failed: {upload_exc}")
            return return_response(500, f"S3 upload failed: {upload_exc}")
        os.unlink(merged_log_file)
        print("done")
        # await update_execution_status_and_s3(solution_id, execution_id, "COMPLETED", s3_key)

        return return_response(200, {
            's3_location': f's3://{s3_bucket}/{s3_key}',
            'processed_executions': len(resources)
        })
    except Exception as e:
        print(e)
        return return_response(400, str(e))


def get_execution_logs(event, context):
    try:
        path_parameters = event.get('pathParameters')
        workspace_id = path_parameters.get('workspace_id')
        solution_id = path_parameters.get('solution_id')
        execution_id = path_parameters.get('execution_id')
        s3_bucket = workspaces_bucket
        s3_key = f"{workspace_id}/{solution_id}/{execution_id}/logs.txt"

        table = dynamodb.Table(executions_table)
        execution = table.get_item(Key={'SolutionId': solution_id, 'ExecutionId': execution_id}).get('Item', {})
        logs_status = execution.get('LogsStatus')
        logs_s3_path = execution.get('LogsS3Path')

        if logs_status == 'COMPLETED' and logs_s3_path:
            pre_signed_url = s3_client.generate_presigned_url(
                ClientMethod='get_object',
                Params={
                    'Bucket': s3_bucket,
                    'Key': s3_key
                },
                ExpiresIn=3600
            )
            return return_response(200, pre_signed_url)
        

        return return_response(202, "Logs are being generated. Please try again later.")
    except Exception as e:
        print(e)
        return return_response(400, str(e))

def generate_execution_logs(event, context):
    try:
        # path_parameters = event.get('pathParameters', {})
        # workspace_id = path_parameters.get('workspace_id')
        # solution_id = path_parameters.get('solution_id')
        # execution_id = path_parameters.get('execution_id')

        payload = {
            # 'workspace_id': workspace_id,
            # 'solution_id': solution_id,
            # 'execution_id': execution_id,
            'background': True,
            'resource': '/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}/logs',
            'InvokedBy': 'lambda'
        }

        lambda_client.invoke(
            FunctionName='wb-bhargav-workspacesandsolutions-lambda',  
            InvocationType='Event', 
            Payload=json.dumps(payload)
        )

        return return_response(200, "Log collection triggered successfully")
    except Exception as e:
        print(e)
        return return_response(500, {"Error": f"Internal Server Error, {e}"})
