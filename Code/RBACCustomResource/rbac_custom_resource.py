import json
import logging
from datetime import datetime
import boto3
import urllib3
import botocore

# set up logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# http client to send response to cloudformation
http = urllib3.PoolManager()

DYNAMODB_RESOURCE = boto3.resource('dynamodb')

ROLE_MAPPING = {
    "ITAdmin": ["Users.fullaccess"],
    "Default": ["Users.view"]
}

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


def handler(event, context):
    """
    Custom resource to add roles to the Roles Table.
    """
    try:
        # get the resource properties that are passed from cloudformation to lambda function
        props = event.get('ResourceProperties', {})
        roles_table = props.get('RolesTable')
        table = DYNAMODB_RESOURCE.Table(roles_table)
        # add roles to the table in a batch writer
        with table.batch_writer() as batch:
            for role, permissions in ROLE_MAPPING.items():
                batch.put_item(
                    Item={
                        "Role": role,
                        "Permissions": permissions,
                        "CreationTime": datetime.now().isoformat(),
                        "CreatedBy": "SYSTEM"
                    }
                )
        send_cfn_response(event, context, "SUCCESS")
    except botocore.exceptions.ClientError as e:
        LOGGER.exception("AWS ClientError: %s", e)
        send_cfn_response(event, context, "FAILED", reason=str(e))
    except KeyError as e:
        LOGGER.exception("Missing key: %s", e)
        send_cfn_response(event, context, "FAILED", reason=f"Missing key: {e}")
    except TypeError as e:
        LOGGER.exception("Type error: %s", e)
        send_cfn_response(event, context, "FAILED", reason=str(e))
    except Exception as e:
        LOGGER.exception("Error in handler: %s", e)
        send_cfn_response(event, context, "FAILED", reason=str(e))
