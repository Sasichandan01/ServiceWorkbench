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
PRESIGN_EXPIRES_IN = int(os.getenv('PRESIGN_EXPIRES_IN', '3600'))

# AWS clients
s3_client = boto3.client('s3')

# Type Aliases
Event = Dict[str, Any]
Response = Dict[str, Any]


def get_parameter_value(parameters: List[Dict[str, Any]], name: str) -> Optional[str]:
    """
    Extract a parameter value by name from a parameter list.
    """
    for param in parameters:
        if param.get('name') == name:
            return param.get('value')
    return None


def create_error_response(action_group: str, function: str, version: str, message: str) -> Response:
    """
    Build a standardized error response payload.
    """
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
    """
    return {
        'response': {
            'actionGroup': action_group,
            'function': function,
            'functionResponse': {
                'responseBody': {
                    'TEXT': {'body': body.get('body', '')}
                }
            }
        },
        'messageVersion': version
    }


def handle_presigned_url(event: Event) -> Response:
    """
    Generate an S3 presigned PUT URL for PNG files only.
    """
    action_group = event['actionGroup']
    function = event['function']
    version = event.get('messageVersion', '1.0')
    params = event.get('parameters', [])

    filename = get_parameter_value(params, 'filename')
    if not filename:
        return create_error_response(action_group, function, version, 'Missing "filename" parameter')

    if not filename.lower().endswith('.png'):
        return create_error_response(action_group, function, version, 'Only PNG files are allowed')

    url = s3_client.generate_presigned_url(
        ClientMethod='put_object',
        Params={'Bucket': S3_BUCKET, 'Key': filename, 'ContentType': 'image/png'},
        ExpiresIn=PRESIGN_EXPIRES_IN
    )
    return create_success_response(action_group, function, version, {'body': url})


def handle_update_memory(event: Event) -> Response:
    """
    Read a JSON memory file from S3, update or add a 'diagram' key, and write it back.
    """
    action_group = event['actionGroup']
    function = event['function']
    version = event.get('messageVersion', '1.0')
    params = event.get('parameters', [])

    new_diagram = get_parameter_value(params, 'diagram')
    filepath = get_parameter_value(params, 'filepath')
    missing = [p for p, v in [('diagram', new_diagram), ('filepath', filepath)] if not v]
    if missing:
        return create_error_response(action_group, function, version, f'Missing parameters: {", ".join(missing)}')

    try:
        # Fetch existing JSON memory
        existing = s3_client.get_object(Bucket=S3_BUCKET, Key=filepath)
        content_str = existing['Body'].read().decode('utf-8')
        memory = json.loads(content_str)
    except s3_client.exceptions.NoSuchKey:
        # If file doesn't exist, start with empty dict
        memory = {}
    except Exception as err:
        LOGGER.error('Failed to read memory file: %s', err)
        return create_error_response(action_group, function, version, f'Failed to read memory: {err}')

    # Update or add diagram
    memory['diagram'] = new_diagram

    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=filepath,
            Body=json.dumps(memory),
            ContentType='application/json'
        )
        message = f'Memory file "{filepath}" updated successfully'
        return create_success_response(action_group, function, version, {'body': message})
    except Exception as err:
        LOGGER.error('S3 upload failed: %s', err)
        return create_error_response(action_group, function, version, f'Failed to upload memory: {err}')


# Mapping of function names to handlers
HANDLERS: Dict[str, Callable[[Event], Response]] = {
    'PresignedURL': handle_presigned_url,
    'UpdateMemory': handle_update_memory,
}


def lambda_handler(event: Event, context: Any) -> Any:
    """
    Entrypoint for AWS Lambda to process Bedrock agent actions.
    """
    try:
        action_group = event['actionGroup']
        function = event['function']
    except KeyError as e:
        LOGGER.error('Missing event field: %s', e)
        return {
            'statusCode': HTTPStatus.BAD_REQUEST,
            'body': f'Missing required field: {e}'
        }

    LOGGER.info('Received action %s.%s', action_group, function)

    handler = HANDLERS.get(function)
    if not handler:
        LOGGER.error('Unsupported function: %s', function)
        return create_error_response(action_group, function, event.get('messageVersion', '1.0'), f'Unknown function: {function}')

    return handler(event)
