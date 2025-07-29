import logging
import os
import json
from typing import Dict, Any, List, Optional, Callable
from http import HTTPStatus
import boto3

# Configuration
LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

S3_BUCKET = os.getenv('WORKSPACES_BUCKET', '')
SOLUTIONS_TABLE = os.getenv('SOLUTIONS_TABLE', '')
PRESIGN_EXPIRES_IN = int(os.getenv('PRESIGN_EXPIRES_IN', '3600'))

# AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(SOLUTIONS_TABLE)

# Type Aliases
Event = Dict[str, Any]
Response = Dict[str, Any]


def get_parameter_value(parameters: List[Dict[str, Any]], name: str) -> Optional[str]:
    """
    Extract a parameter value by name from a list of parameter dicts.

    Key steps:
        1. Iterate through each parameter in the list.
        2. Match the 'name' key against the provided name.
        3. Return the corresponding 'value' if found.

    Params:
        parameters [List[Dict[str, Any]]]: list of {'name': ..., 'value': ...} dicts
        name [str]: parameter name to search for

    Returns:
        Optional[str]: the matched parameter value, or None if not found
    """
    for param in parameters:
        if param.get('name') == name:
            return param.get('value')
    return None


def create_error_response(action_group: str, function: str, version: str, message: str) -> Response:
    """
    Build a standardized error response payload.

    Key steps:
        1. Populate the 'response' structure with actionGroup, function, and error body.
        2. Include the messageVersion for client compatibility.

    Params:
        action_group [str]: identifier of the action group
        function [str]: name of the function being invoked
        version [str]: message version identifier
        message [str]: descriptive error message

    Returns:
        Response: formatted error payload
    """
    LOGGER.info("IN ArchitectureAgentAG.create_error_response: Building error response for %s.%s: %s", action_group, function, message)
    return {
        'response': {
            'actionGroup': action_group,
            'function': function,
            'functionResponse': {
                'responseBody': {
                    'TEXT': {'body': f'Error: {message}'}
                }
            }
        },
        'messageVersion': version
    }


def create_success_response(action_group: str, function: str, version: str, body: Dict[str, str]) -> Response:
    """
    Build a standardized success response payload.

    Key steps:
        1. Determine if a PresignedURL is provided or a simple message.
        2. Serialize the response body accordingly.
        3. Wrap in the standard response structure with version.

    Params:
        action_group [str]: identifier of the action group
        function [str]: name of the function being invoked
        version [str]: message version identifier
        body [Dict[str, str]]: dictionary containing either 'PresignedURL' or 'message'

    Returns:
        Response: formatted success payload
    """
    LOGGER.info("IN ArchitectureAgentAG.create_success_response: Building success response for %s.%s", action_group, function)
    ans: Dict[str, str] = {}
    if 'PresignedURL' in body:
        ans['<PresignedURL>'] = body['PresignedURL']
    else:
        ans['message'] = body.get('message', '')
    return {
        'response': {
            'actionGroup': action_group,
            'function': function,
            'functionResponse': {
                'responseBody': {
                    'TEXT': {'body': json.dumps(ans)}
                }
            }
        },
        'messageVersion': version
    }


def handle_presigned_url(event: Event) -> Response:
    """
    Generate an S3 presigned PUT URL for PNG files only.

    Key steps:
        1. Extract filename parameter and validate presence.
        2. Enforce .png extension requirement.
        3. Generate and return the presigned URL.

    Params:
        event [Event]: the incoming Bedrock agent event payload

    Returns:
        Response: either an error or success payload with the presigned URL
    """
    LOGGER.info("IN ArchitectureAgentAG.handle_presigned_url: Starting PresignedURL handler")
    action_group = event['actionGroup']
    function = event['function']
    version = event.get('messageVersion', '1.0')
    params = event.get('parameters', [])

    filename = get_parameter_value(params, 'filename')
    if not filename:
        LOGGER.error("IN ArchitectureAgentAG.handle_presigned_url: Missing 'filename' parameter")
        return create_error_response(action_group, function, version, 'Missing "filename" parameter')

    if not filename.lower().endswith('.png'):
        LOGGER.error("IN ArchitectureAgentAG.handle_presigned_url: Invalid file extension for %s", filename)
        return create_error_response(action_group, function, version, 'Only PNG files are allowed')

    url = s3_client.generate_presigned_url(ClientMethod='put_object', Params={'Bucket': S3_BUCKET, 'Key': filename, 'ContentType': 'image/png'}, ExpiresIn=PRESIGN_EXPIRES_IN)
    LOGGER.info("IN ArchitectureAgentAG.handle_presigned_url: Generated presigned URL for %s", filename)
    return create_success_response(action_group, function, version, {'PresignedURL': url})


# Mapping of function names to handlers
HANDLERS: Dict[str, Callable[[Event], Response]] = {
    'PresignedURL': handle_presigned_url
}


def lambda_handler(event: Event, context: Any) -> Any:
    """
    Entrypoint for AWS Lambda to process Bedrock agent actions.

    Key steps:
        1. Validate required event fields.
        2. Dispatch to the appropriate handler based on 'function'.
        3. Return HTTP or agent-style response.

    Params:
        event [Event]: AWS Lambda event payload
        context [Any]: AWS Lambda context object

    Returns:
        Any: either an HTTP response dict or an agent response payload
    """
    LOGGER.info("IN ArchitectureAgentAG.lambda_handler: Received event: %s", event)
    try:
        action_group = event['actionGroup']
        function = event['function']
    except KeyError as e:
        LOGGER.error("IN ArchitectureAgentAG.lambda_handler: Missing event field: %s", e)
        return {
            'statusCode': HTTPStatus.BAD_REQUEST,
            'body': f'Missing required field: {e}'
        }

    LOGGER.info("IN ArchitectureAgentAG.lambda_handler: Dispatching to handler for %s.%s", action_group, function)
    handler = HANDLERS.get(function)
    if not handler:
        LOGGER.error("IN ArchitectureAgentAG.lambda_handler: Unsupported function: %s", function)
        return create_error_response(action_group, function, event.get('messageVersion', '1.0'), f'Unknown function: {function}')

    return handler(event)
