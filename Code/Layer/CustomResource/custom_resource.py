import json
import logging
from typing import Dict, Any, Optional
import urllib3

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

# HTTP client to send response to CloudFormation
http = urllib3.PoolManager()


def send_cfn_response(event: Dict[str, Any], context: Any, status: str, data: Optional[Dict[str, Any]] = None, physical_id: Optional[str] = None, reason: Optional[str] = None) -> None:
    """
    Send a response to CloudFormation for a custom resource request.

    Key steps:
        1. Build the response body with status, reason, IDs, and data.
        2. Encode and send an HTTP PUT to the provided ResponseURL.
        3. Log the delivery status or raise on failure.

    Params:
        event [Dict[str, Any]]: The event payload from CloudFormation.
        context [Any]: The AWS Lambda context object.
        status [str]: 'SUCCESS' or 'FAILED' to indicate operation result.
        data [Optional[Dict[str, Any]]]: Additional data to return to CloudFormation.
        physical_id [Optional[str]]: Unique identifier for the custom resource.
        reason [Optional[str]]: Explanation for failure, if any.

    Returns:
        None
    """
    response_body = {
        "Status": status,
        "Reason": reason or f"See CloudWatch Logs: {context.log_stream_name}",
        "PhysicalResourceId": physical_id or context.log_stream_name,
        "StackId": event["StackId"],
        "RequestId": event["RequestId"],
        "LogicalResourceId": event["LogicalResourceId"],
        "Data": data or {}
    }

    try:
        LOGGER.info("IN custom_resource.send_cfn_response: Sending CloudFormation response: %s", response_body)
        encoded_body = json.dumps(response_body).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        resp = http.request("PUT", event["ResponseURL"], body=encoded_body, headers=headers)
        LOGGER.info("IN custom_resource.send_cfn_response: CloudFormation response sent with status %s", resp.status)
    except Exception as e:
        LOGGER.exception("IN custom_resource.send_cfn_response: Failed to send CloudFormation response: %s", e)
        raise
