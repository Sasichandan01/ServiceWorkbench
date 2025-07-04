import json
import logging
import urllib3

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# http client to send response to cloudformation
http = urllib3.PoolManager()

def send_cfn_response(event, context, status, data=None, physical_id=None, reason=None):
    """
    Function to send a response to the CloudFormation stack to signal success or failure of the custom resource.
    Args:
        event (dict): The event dictionary from CloudFormation.
        context (LambdaContext): The Lambda execution context object.
        status (str): Status of the operation, either 'SUCCESS' or 'FAILED'.
        data (dict, optional): Additional data to return to CloudFormation.
        physical_id (str, optional): Unique ID for the custom resource.
        reason (str, optional): Reason for failure, if applicable.
    Raises:
        Exception: If the response cannot be sent to CloudFormation.
    """
    response_body = {
        "Status": status,
        "Reason": reason or f"See CloudWatch Logs: {context.log_stream_name}",
        "PhysicalResourceId": physical_id or context.log_stream_name,
        "StackId": event['StackId'],
        "RequestId": event['RequestId'],
        "LogicalResourceId": event['LogicalResourceId'],
        "Data": data or {}
    }
    try:
        encoded_body = json.dumps(response_body).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        resp = http.request('PUT', event['ResponseURL'], body=encoded_body, headers=headers)
        LOGGER.info("CloudFormation response sent: %s", resp.status)
    except Exception as e:
        LOGGER.exception("Failed to send CloudFormation response: %s", e)
        raise
