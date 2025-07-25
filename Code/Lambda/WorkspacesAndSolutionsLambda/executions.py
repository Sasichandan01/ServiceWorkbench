import json
import boto3
import os
import tempfile
from datetime import datetime, timedelta, timezone
import logging
from boto3.dynamodb.conditions import Attr,Key
from Utils.utils import log_activity,return_response,paginate_list
from botocore.exceptions import ClientError


logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
logs_client = boto3.client('logs')
glue_client = boto3.client('glue')
lambda_client = boto3.client('lambda')
stepfunctions_client = boto3.client('stepfunctions')

activity_logs_table = dynamodb.Table(os.environ.get('ACTIVITY_LOGS_TABLE'))
executions_table = dynamodb.Table(os.environ.get('EXECUTIONS_TABLE'))
solutions_table = dynamodb.Table(os.environ.get('SOLUTIONS_TABLE'))
workspaces_bucket = os.environ.get('WORKSPACES_BUCKET')

def update_execution_status(solution_id, execution_id, status):
    """Update the log status for a given execution in the executions table."""
    try:
        executions_table.update_item(
            Key={
                'SolutionId': solution_id,
                'ExecutionId': execution_id
            },
            UpdateExpression='SET LogsStatus = :status',
            ExpressionAttributeValues={
                ':status': status
            }
        )
    except Exception as e:
        logger.error(f"Error updating execution status: {str(e)}")
        raise

def fetch_resources_for_solution(workspace_id,solution_id):
    """Fetch resources for a given solution from the solutions table."""
    try:
        response = solutions_table.get_item(Key={'WorkspaceId':workspace_id,'SolutionId': solution_id})
        print(response)
        return response.get('Item', {}).get('Resources', [])
    except Exception as e:
        logger.error(f"Error fetching resources for solution: {str(e)}")
        raise

def fetch_execution_details(solution_id, execution_id):
    """Fetch execution details (start/end time) from executions table."""
    try:
        response = executions_table.get_item(
            Key={'SolutionId': solution_id, 'ExecutionId': execution_id}
        )
        item = response.get('Item')
        return item
    except Exception as e:
        logger.error(f"Error fetching execution details: {str(e)}")
        raise

def fetch_logs_for_resource(resource, start_time, end_time):
    """
    Fetch logs for a resource between start and end times.
    Determines the resource type and fetches logs from CloudWatch or Glue accordingly.
    Stores logs in a temp file and returns the file path.
    """
    try:
        resource_type = resource.get('Type', '').lower() if isinstance(resource, dict) else str(resource).lower()
        resource_name = resource.get('Name') if isinstance(resource, dict) else str(resource)
        logs_content = ""
        print(resource_type)
        print(resource_name)
        if 'glue' in resource_type:
            logs_content = fetch_glue_logs_by_time(resource_name, start_time, end_time)
        elif 'lambda' in resource_type:
            logs_content = fetch_lambda_logs_by_time(resource_name, start_time, end_time)
        elif 'stepfunction' in resource_type or 'step' in resource_type:
            logs_content = fetch_stepfunction_logs_by_time(resource_name, start_time, end_time)
        else:
            logs_content = f"Unsupported resource type: {resource_type} for resource {resource_name}"

        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp_file:
            tmp_file.write(logs_content)
            tmp_file_path = tmp_file.name
        return tmp_file_path
    except Exception as e:
        logger.error(f"Error fetching logs for resource {resource}: {str(e)}")
        raise

def merge_and_upload_logs(logs, s3_bucket, s3_key):
    """
    Merge logs, store in temp file, and upload to S3. Return S3 path.
    """
    try:
        combined_content = '\n'.join(logs)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp_file:
            tmp_file.write(combined_content)
            tmp_file_path = tmp_file.name
        
        s3_client.upload_file(tmp_file_path, s3_bucket, s3_key)
        os.unlink(tmp_file_path)
        return f"s3://{s3_bucket}/{s3_key}"
    except Exception as e:
        logger.error(f"Error merging/uploading logs: {str(e)}")
        raise

def fetch_glue_logs_by_time(job_name, start_time, end_time):
    """
    Fetch Glue job logs for a given job name between start_time and end_time.
    """
    try:
        response = glue_client.get_job_runs(JobName=job_name, MaxResults=50)
        
        logs_content = f"=== GLUE JOB LOGS: {job_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        log_groups = [f"/aws-glue/jobs/output"]
        
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
                    streams_resp = logs_client.describe_log_streams(
                        logGroupName=log_group_name,
                        logStreamNamePrefix=run_id,
                        orderBy='LogStreamName',
                        descending=False
                    )
                    for stream in streams_resp.get('logStreams', []):
                        stream_name = stream['logStreamName']
                        found_stream = True
                        try:
                            log_events = fetch_cloudwatch_logs(log_group_name, stream_name, start_time, end_time)
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

def fetch_lambda_logs_by_time(function_name, start_time, end_time):
    """Fetch Lambda function logs from CloudWatch."""
    try:
        log_group_name = f"/aws/lambda/{function_name}"
        response = logs_client.describe_log_streams(
            logGroupName=log_group_name,
            orderBy='LastEventTime',
            descending=True,
            limit=20
        )
        
        logs_content = f"=== LAMBDA LOGS: {function_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        
        for stream in response.get('logStreams', []):
            stream_name = stream['logStreamName']
            stream_start = datetime.fromtimestamp(stream.get('creationTime', 0) / 1000, tz=timezone.utc)
            print(stream_start)
            print(start_time)
            print(end_time)
            if (stream_start <= end_time and stream_start >= start_time):
                logs_content += f"\n--- Log Stream: {stream_name} ---\n"
                logs_content += f"Stream Time: {stream_start}\n"
                log_events = fetch_cloudwatch_logs(log_group_name, stream_name, start_time, end_time)
                logs_content += log_events
        
        logger.info(f"Lambda logs fetched for {function_name}")
        return logs_content
    except Exception as e:
        logger.error(f"Error fetching Lambda logs for {function_name}: {str(e)}")
        return f"Error fetching Lambda logs: {str(e)}"

def fetch_stepfunction_logs_by_time(state_machine_name, start_time, end_time):
    """Fetch Step Function logs from CloudWatch."""
    try:
        log_group_prefix = f"/aws/vendedlogs/states/{state_machine_name}"
        log_groups_resp = logs_client.describe_log_groups(logGroupNamePrefix=log_group_prefix)
        
        logs_content = f"=== STEP FUNCTION LOGS: {state_machine_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        
        for log_group in log_groups_resp.get('logGroups', []):
            log_group_name = log_group['logGroupName']
            
            streams_resp = logs_client.describe_log_streams(
                logGroupName=log_group_name,
                orderBy='LastEventTime',
                descending=True,
                limit=20
            )
                
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
            
            for stream in response.get('logStreams', []):
                stream_name = stream['logStreamName']
                stream_start = datetime.fromtimestamp(stream.get('creationTime', 0) / 1000, tz=timezone.utc)
                
                if (stream_start <= end_time and stream_start >= start_time):
                    logs_content += f"\n--- Log Stream: {stream_name} ---\n"
                    logs_content += f"Stream Time: {stream_start} \n"
                    log_events = fetch_cloudwatch_logs(log_group_name, stream_name, start_time, end_time)
                    logs_content += log_events
        
        logger.info(f"Step Function logs fetched for {state_machine_name}")
        return logs_content
    except Exception as e:
        logger.error(f"Error fetching Step Function logs for {state_machine_name}: {str(e)}")
        return f"Error fetching Step Function logs: {str(e)}"

def fetch_cloudwatch_logs(log_group_name, log_stream_name, start_time, end_time):
    """Fetch log events from CloudWatch Logs."""
    try:
        start_timestamp = int(start_time.timestamp() * 1000)
        end_timestamp = int(end_time.timestamp() * 1000)
        
        response = logs_client.get_log_events(
            logGroupName=log_group_name,
            logStreamName=log_stream_name,
            startTime=start_timestamp,
            endTime=end_timestamp
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

def process_log_collection(event, context):
    """Main function to process log collection."""
    try:
        solution_id = event.get('solution_id')
        execution_id = event.get('execution_id')
        workspace_id = event.get('workspace_id')
        
        if not solution_id or not execution_id or not workspace_id:
            return return_response(400, "Missing required parameters")
        
        logger.info("Started generating log collection")
        update_execution_status(solution_id, execution_id, "RUNNING")

        resources = fetch_resources_for_solution(workspace_id,solution_id)
        print(resources)
        execution_details = fetch_execution_details(solution_id, execution_id)
        print(execution_details)
        
        start_time = execution_details.get('StartTime')
        end_time = execution_details.get('EndTime')

        if isinstance(start_time, str):
            start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        if isinstance(end_time, str):
            end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00'))

        logs_contents = []
        for resource in resources:
            logs_contents.append(fetch_logs_for_resource(resource, start_time, end_time))

        merged_logs = ""
        for log_file in logs_contents:
            if os.path.exists(log_file):
                with open(log_file, 'r') as f:
                    merged_logs += f.read() + "\n"
                os.unlink(log_file)

        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp_file:
            tmp_file.write(merged_logs)
            merged_log_file = tmp_file.name

        s3_key = f"workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}/logs.txt"
        
        try:
            s3_client.upload_file(merged_log_file, workspaces_bucket, s3_key)
            logger.info("Upload successful")
        except Exception as upload_exc:
            logger.error(f"Upload failed: {upload_exc}")
            return return_response(500, f"S3 upload failed: {upload_exc}")
        
        os.unlink(merged_log_file)
        update_execution_status(solution_id, execution_id, "COMPLETED")
        
        return return_response(200, {
            's3_location': f's3://{workspaces_bucket}/{s3_key}',
            'processed_executions': len(resources)
        })
    except Exception as e:
        logger.error(str(e))
        return return_response(400, str(e))

def get_execution_logs(event, context):
    """Get presigned URL for execution logs."""
    try:
        path_parameters = event.get('pathParameters', {})
        workspace_id = path_parameters.get('workspace_id')
        solution_id = path_parameters.get('solution_id')
        execution_id = path_parameters.get('execution_id')
        
        execution = executions_table.get_item(
            Key={'SolutionId': solution_id, 'ExecutionId': execution_id}
        ).get('Item', {})
        
        logs_status = execution.get('LogsStatus')
        

        if logs_status == 'COMPLETED' :
            pre_signed_url = s3_client.generate_presigned_url(
                ClientMethod='get_object',
                Params={
                    'Bucket': workspaces_bucket,
                    'Key': f"workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}/logs.txt"
                },
                ExpiresIn=3600
            )
            return return_response(200, {"PresignedURL":pre_signed_url})
        
        return return_response(202, "Logs are being generated. Please try again later.")
    except Exception as e:
        logger.error(str(e))
        return return_response(400, str(e))

def generate_execution_logs(event, context):
    """Trigger log generation process."""
    try:
        path_parameters = event.get('pathParameters', {})
        workspace_id = path_parameters.get('workspace_id')
        solution_id = path_parameters.get('solution_id')
        execution_id = path_parameters.get('execution_id')

        execution_response = executions_table.get_item(
            Key={'SolutionId': solution_id, 'ExecutionId': execution_id},
            ProjectionExpression='ExecutionStatus,LogsStatus'
        ).get('Item', {})
        
        if execution_response.get('ExecutionStatus') == 'RUNNING':
            return return_response(400, "Solution is executing. Please try again later.")
        if execution_response.get('LogsStatus') in ['RUNNING', 'COMPLETED']:
            return return_response(400, "Logs are already being generated or completed.")

        payload = {
            'workspace_id': workspace_id,
            'solution_id': solution_id,
            'execution_id': execution_id,
            'background': True,
            'resource': f'/workspaces/{workspace_id}/solutions/{solution_id}/executions/{execution_id}/logs',
            'action': 'logs-poll'
        }

        lambda_client.invoke(
            FunctionName=context.function_name,
            InvocationType='Event',
            Payload=json.dumps(payload)
        )

        return return_response(200, "Log collection triggered successfully")
    except Exception as e:
        logger.error(str(e))
        return return_response(500, {"Error": f"Internal Server Error: {e}"})