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
dynamodb=boto3.resource('dynamodb')
table=dynamodb.Table(SOLUTIONS_TABLE)

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
    ans={}
    if body.get('PresignedURL'):
        ans['<PresignedURL>']=body.get('PresignedURL')
    else:
        ans['message']=body.get('message')
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
    return create_success_response(action_group, function, version, {'PresignedURL': url})

# Mapping of function names to handlers
HANDLERS: Dict[str, Callable[[Event], Response]] = {
    'PresignedURL': handle_presigned_url
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
