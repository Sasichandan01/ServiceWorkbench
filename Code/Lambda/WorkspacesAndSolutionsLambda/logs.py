import json
import boto3
import os
import tempfile
from datetime import datetime, timedelta, timezone
import logging
from boto3.dynamodb.conditions import Attr,Key
from Utils.utils import log_activity,return_response,paginate_list
from botocore.exceptions import ClientError


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
logs_client = boto3.client('logs')
glue_client = boto3.client('glue')
lambda_client = boto3.client('lambda')
stepfunctions_client = boto3.client('stepfunctions')

try:
    activity_logs_table = dynamodb.Table(os.environ.get('ACTIVITY_LOGS_TABLE'))
except Exception as e:
    print(f"Error loading ACTIVITY_LOGS_TABLE env variable: {e}")
    activity_logs_table = None
try:
    executions_table = dynamodb.Table(os.environ.get('EXECUTIONS_TABLE'))
except Exception as e:
    print(f"Error loading EXECUTIONS_TABLE env variable: {e}")
    executions_table = None
try:
    solutions_table = dynamodb.Table(os.environ.get('SOLUTIONS_TABLE'))
except Exception as e:
    print(f"Error loading SOLUTIONS_TABLE env variable: {e}")
    solutions_table = None
try:
    workspaces_bucket = os.environ.get('WORKSPACES_BUCKET')
except Exception as e:
    print(f"Error loading WORKSPACES_BUCKET env variable: {e}")
    workspaces_bucket = None

def convert_utc_to_ist_iso_format(time_str):
    """
    Converts a UTC time string to IST timezone as a datetime object.
    Args:
        time_str: UTC time string in '%Y-%m-%d %H:%M:%S.%f %z' format (str).
    Returns:
        datetime: Time converted to IST timezone.
    """
    logger.info("Logs.convert_utc_to_ist_iso_format() called")
    # Parse input string: "2025-07-26 17:53:26.818 +0000"
    dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S.%f %z")
    # Convert to IST timezone
    ist_offset = timedelta(hours=5, minutes=30)
    ist_time = dt.astimezone(timezone(ist_offset))
    
    # Format in ISO 8601 with milliseconds and timezone
    return ist_time
    
def format_to_ist(dt_utc: datetime) -> str:
    """
    Converts a UTC datetime object to IST formatted string.
    Args:
        dt_utc: UTC datetime object.
    Returns:
        str: IST formatted datetime string.
    """
    logger.info("Logs.format_to_ist() called")
    # Define IST timezone
    ist = timezone(timedelta(hours=5, minutes=30))
    
    # Convert to IST
    dt_ist = dt_utc.astimezone(ist)

    formatted = dt_ist.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + dt_ist.strftime('%z')

    return formatted[:-2] + ':' + formatted[-2:]


def update_execution_status(solution_id, execution_id, status):
    """
    Updates the log status for a given execution in the executions table.
    Args:
        solution_id: Solution ID (str).
        execution_id: Execution ID (str).
        status: New status to set (str).
    Returns:
        None
    """
    logger.info("Logs.update_execution_status() called for solution_id=%s, execution_id=%s, status=%s", solution_id, execution_id, status)
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

def fetch_resources_for_solution(workspace_id, solution_id):
    """
    Fetches resources for a given solution from the solutions table.
    Args:
        workspace_id: Workspace ID (str).
        solution_id: Solution ID (str).
    Returns:
        list: List of resources for the solution.
    """
    logger.info("Logs.fetch_resources_for_solution() called for workspace_id=%s, solution_id=%s", workspace_id, solution_id)
    try:
        response = solutions_table.get_item(Key={'WorkspaceId':workspace_id,'SolutionId': solution_id})
        
        return response.get('Item', {}).get('Resource', [])
    except Exception as e:
        logger.error(f"Error fetching resources for solution: {str(e)}")
        raise

def fetch_execution_details(solution_id, execution_id):
    """
    Fetches execution details (start/end time) from executions table.
    Args:
        solution_id: Solution ID (str).
        execution_id: Execution ID (str).
    Returns:
        dict: Execution details item.
    """
    logger.info("Logs.fetch_execution_details() called for solution_id=%s, execution_id=%s", solution_id, execution_id)
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
    Fetches logs for a resource between start and end times, stores in temp file, and returns file path.
    Args:
        resource: Resource dict or string.
        start_time: Start time (datetime).
        end_time: End time (datetime).
    Returns:
        str: Path to the temporary file containing logs.
    """
    logger.info("Logs.fetch_logs_for_resource() called for resource=%s", resource)
    try:
        resource_type = resource.get('Type', '').lower() if isinstance(resource, dict) else str(resource).lower()
        resource_name = resource.get('ResourceId') if isinstance(resource, dict) else str(resource)
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
    Merges logs, stores in temp file, uploads to S3, and returns S3 path.
    Args:
        logs: List of log strings (list).
        s3_bucket: S3 bucket name (str).
        s3_key: S3 key for the merged log file (str).
    Returns:
        str: S3 URI of the uploaded log file.
    """
    logger.info("Logs.merge_and_upload_logs() called for s3_bucket=%s, s3_key=%s", s3_bucket, s3_key)
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
    Fetches Glue job logs for a given job name between start_time and end_time.
    Args:
        job_name: Glue job name (str).
        start_time: Start time (datetime).
        end_time: End time (datetime).
    Returns:
        str: Logs content for the Glue job.
    """
    logger.info("Logs.fetch_glue_logs_by_time() called for job_name=%s", job_name)
    try:
        response = glue_client.get_job_runs(JobName=job_name, MaxResults=50)
        
        logs_content = f"=== GLUE JOB LOGS: {job_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        log_groups = [f"/aws-glue/jobs/output"]
        
        for job_run in response.get('JobRuns', []):
            print(job_run)
            run_id = job_run.get('Id')
            run_start = job_run.get('StartedOn')
            print(run_start)
            run_end = job_run.get('CompletedOn')
            print(run_end)
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
        print(logs_content)
        return logs_content
    except Exception as e:
        logger.error(f"Error fetching Glue logs for {job_name}: {str(e)}")
        return f"Error fetching Glue logs: {str(e)}"

def fetch_lambda_logs_by_time(function_name, start_time, end_time):
    """
    Fetches Lambda function logs from CloudWatch within specified time range.
    Args:
        function_name: Lambda function name (str).
        start_time: Start time (datetime).
        end_time: End time (datetime).
    Returns:
        str: Logs content for the Lambda function.
    """
    logger.info("Logs.fetch_lambda_logs_by_time() called for function_name=%s", function_name)
    try:
        log_group_name = f"/aws/lambda/{function_name}"
        
        # Handle log group existence
        try:
            logs_client.describe_log_groups(logGroupNamePrefix=log_group_name, limit=1)
        except logs_client.exceptions.ResourceNotFoundException:
            return f"Log group {log_group_name} not found for function {function_name}"
        
        logs_content = f"=== LAMBDA LOGS: {function_name} ===\nTime Range: {start_time} to {end_time}\n\n"
        

        
        start_time = int(start_time.timestamp() * 1000)
        end_time = int(end_time.timestamp() * 1000)       
        
        found_logs = False
        next_token = None
        
        try:
            while True:
                params = {
                    'logGroupName': log_group_name,
                    'startTime': start_time,
                    'endTime': end_time
                }
                
                if next_token:
                    params['nextToken'] = next_token
                
                response = logs_client.filter_log_events(**params)
                events = response.get('events', [])
                
                if events:
                    found_logs = True
                    logs_content += f"\n--- Found {len(events)} log events ---\n"
                    
                    for event in events:
                        # Convert timestamp back to readable format
                        event_time = datetime.fromtimestamp(
                            event['timestamp'] / 1000, 
                            tz=timezone.utc
                        )
                        event_time_ist = format_to_ist(event_time)
                        
                        # Add log stream info and timestamp
                        logs_content += f"[{event_time_ist}] [{event.get('logStreamName', 'unknown')}]\n"
                        logs_content += f"{event['message']}\n"
                        
                        if not event['message'].endswith('\n'):
                            logs_content += "\n"
                
                # Check for more pages
                next_token = response.get('nextToken')
                if not next_token:
                    break
                    
        except logs_client.exceptions.ResourceNotFoundException:
            logs_content += f"Log group {log_group_name} not found.\n"
            logger.error(f"Log group {log_group_name} not found.")
        except Exception as e:
            logs_content += f"Error fetching log events: {str(e)}\n"
            logger.error(f"Error fetching log events: {str(e)}")

        if not found_logs:
            logs_content += "\nNo logs found in the specified time range.\n"
        
        logger.info(f"Lambda logs fetched for {function_name} in range {start_time} to {end_time}")
        return logs_content
        
    except logs_client.exceptions.ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        logger.error(f"AWS ClientError fetching Lambda logs for {function_name}: {error_code} - {error_message}")
        return f"AWS Error fetching Lambda logs: {error_code} - {error_message}"
    except Exception as e:
        logger.error(f"Error fetching Lambda logs for {function_name}: {str(e)}")
        return f"Error fetching Lambda logs: {str(e)}"


def fetch_cloudwatch_logs(log_group_name, stream_name, start_time, end_time):
    """
    Fetches log events from a specific log stream within time range.
    Args:
        log_group_name: CloudWatch log group name (str).
        stream_name: Log stream name (str).
        start_time: Start time (datetime).
        end_time: End time (datetime).
    Returns:
        str: Log content from the stream.
    """
    logger.info("Logs.fetch_cloudwatch_logs() called for log_group_name=%s, stream_name=%s", log_group_name, stream_name)
    try:

        start_time_ms = int(start_time.timestamp() * 1000)
        end_time_ms = int(end_time.timestamp() * 1000)
        
        print(f"Querying CloudWatch with UTC times: {start_time} to {end_time}")
        print(f"Timestamp range (ms): {start_time_ms} to {end_time_ms}")
        
        response = logs_client.get_log_events(
            logGroupName=log_group_name,
            logStreamName=stream_name,
            startTime=start_time_ms,
            endTime=end_time_ms,
            startFromHead=True
        )
        print(response)
        log_content = ""
        events = response.get('events', [])
        
        if not events:
            return "No events found in this time range.\n"
        
        print(f"Found {len(events)} events in time range")
        
        # IST timezone for display (if needed)
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        
        for event in events:
            # CloudWatch event timestamp is always in UTC
            utc_timestamp = datetime.fromtimestamp(
                event['timestamp'] / 1000, 
                tz=timezone.utc
            )
            
            # Convert to IST for display (optional)
            ist_timestamp = utc_timestamp.astimezone(ist_tz)
            
            message = event.get('message', '')  # Use .get() to avoid KeyError
            
            # Display both UTC and IST timestamps for clarity
            log_content += f"[UTC: {utc_timestamp}] [IST: {ist_timestamp}] {message}\n"
        
        return log_content if log_content else "No log content available.\n"
        
    except Exception as e:
        logger.error(f"Error fetching log events: {str(e)}")
        return f"Error fetching log events: {str(e)}\n"  # Always return a string


def fetch_stepfunction_logs_by_time(state_machine_name, start_time, end_time):
    """
    Fetches Step Function logs from CloudWatch for a specific time window.
    Args:
        state_machine_name: Name of the Step Function state machine (str).
        start_time: Start time (datetime).
        end_time: End time (datetime).
    Returns:
        str: Logs content for the Step Function.
    """
    logger.info("Logs.fetch_stepfunction_logs_by_time() called for state_machine_name=%s", state_machine_name)
    try:
        log_group_prefix = "/aws/vendedlogs/states/"
        logs_content = f"=== STEP FUNCTION LOGS: {state_machine_name} ===\nTime Range: {start_time} to {end_time}\n\n"

        # Convert times to epoch ms
        start_time_ms = int(start_time.timestamp() * 1000)
        end_time_ms = int(end_time.timestamp() * 1000)

        # Paginated call to fetch all log groups
        paginator = logs_client.get_paginator('describe_log_groups')
        for page in paginator.paginate(logGroupNamePrefix=log_group_prefix):
            for log_group in page.get('logGroups', []):
                log_group_name = log_group['logGroupName']

                # Match log group containing the state machine name (partial match)
                if state_machine_name in log_group_name:
                    streams_resp = logs_client.describe_log_streams(
                        logGroupName=log_group_name,
                        orderBy='LastEventTime',
                        descending=True,
                        limit=20
                    )

                    for stream in streams_resp.get('logStreams', []):
                        stream_name = stream['logStreamName']
                        stream_start = stream.get('firstEventTimestamp', 0)
                        stream_end = stream.get('lastEventTimestamp', 0)

                        # Match if stream overlaps time range
                        if stream_end >= start_time_ms and stream_start <= end_time_ms:
                            logs_content += f"\n--- Log Stream: {stream_name} ---\n"
                            logs_content += f"Stream Time: {datetime.fromtimestamp(stream_start / 1000)} to {datetime.fromtimestamp(stream_end / 1000)}\n"

                            # Inline fetch_cloudwatch_logs logic
                            events = []
                            next_token = None
                            while True:
                                kwargs = {
                                    'logGroupName': log_group_name,
                                    'logStreamName': stream_name,
                                    'startTime': start_time_ms,
                                    'endTime': end_time_ms,
                                    'limit': 10000
                                }
                                if next_token:
                                    kwargs['nextToken'] = next_token

                                response = logs_client.get_log_events(**kwargs)
                                events.extend(response['events'])
                                next_token = response.get('nextForwardToken')
                                if not response['events'] or not next_token:
                                    break

                            for event in events:
                                timestamp = datetime.fromtimestamp(event['timestamp'] / 1000, tz=timezone.utc)
                                message = event['message'].strip()
                                logs_content += f"[{timestamp}] {message}\n"

                            logger.info(f"Step Function logs fetched for {state_machine_name}")
                            return logs_content  # Return early after finding one matching stream

        logger.info(f"No matching log streams found for {state_machine_name}")
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
        update_execution_status(solution_id, execution_id, "COMPLETED")
        logger.error(f"Error fetching CloudWatch logs: {str(e)}")
        return f"Error fetching CloudWatch logs: {str(e)}"

def process_log_collection(event, context):
    """
    Main function to process log collection for a solution execution and upload to S3.
    Args:
        event: Lambda event dict (dict).
        context: Lambda context object.
    Returns:
        dict: Response with S3 location or error.
    """
    logger.info("Logs.process_log_collection() called")
    try:
        solution_id = event.get('solution_id')
        execution_id = event.get('execution_id')
        workspace_id = event.get('workspace_id')
        user_id=event.get('user_id')
        if not solution_id or not execution_id or not workspace_id:
            return return_response(400, "Missing required parameters")
        
        logger.info("Logs generation started successfully")
        update_execution_status(solution_id, execution_id, "GENERATING")

        resources = fetch_resources_for_solution(workspace_id,solution_id)
        print(resources)
        execution_details = fetch_execution_details(solution_id, execution_id)
        print(execution_details)
        
        start_time = execution_details.get('StartTime')
        end_time = execution_details.get('EndTime')

        if isinstance(start_time, str):
            start_time = convert_utc_to_ist_iso_format(start_time)

        if isinstance(end_time, str):
            end_time = convert_utc_to_ist_iso_format(end_time)

        if not hasattr(start_time, 'timestamp'):
            raise ValueError(f"start_time is not a datetime object: {type(start_time)}, value: {start_time}")
        if not hasattr(end_time, 'timestamp'):
            raise ValueError(f"end_time is not a datetime object: {type(end_time)}, value: {end_time}")

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
        # log_activity(activity_logs_table,'Log',solution_id, execution_id, user_id, "LOGS GENERATED")
        return return_response(200, {
            's3_location': f's3://{workspaces_bucket}/{s3_key}',
            'processed_executions': len(resources)
        })
    except Exception as e:
        update_execution_status(solution_id, execution_id, "FAILED")
        logger.error(str(e))
        return return_response(400, str(e))

def get_execution_logs(event, context):
    """
    Gets a presigned URL for execution logs if available.
    Args:
        event: Lambda event dict (dict).
        context: Lambda context object.
    Returns:
        dict: Response with presigned URL or status message.
    """
    logger.info("Logs.get_execution_logs() called")
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
    """
    Triggers the log generation process for a solution execution.
    Args:
        event: Lambda event dict (dict).
        context: Lambda context object.
    Returns:
        dict: Response indicating log collection trigger status.
    """
    logger.info("Logs.generate_execution_logs() called")
    try:
        path_parameters = event.get('pathParameters', {})
        workspace_id = path_parameters.get('workspace_id')
        solution_id = path_parameters.get('solution_id')
        execution_id = path_parameters.get('execution_id')
        user_id=event.get('requestContext', {}).get('authorizer', {}).get('user_id')
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
            'action': 'logs-poll',
            'user_id': user_id
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