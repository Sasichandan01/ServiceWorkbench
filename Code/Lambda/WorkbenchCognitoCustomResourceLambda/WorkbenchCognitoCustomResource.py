"""
Lambda function to manage Cognito User Pool Lambda triggers via CloudFormation custom resource.
Handles creation, update, and deletion of Lambda trigger configurations.
"""

import json
import boto3
import urllib3
import logging

# Initialize logger with standard format
try:
    LOGGER = logging.getLogger()
    LOGGER.setLevel(logging.INFO)
except Exception as logger_error:
    print(f"Failed to initialize logger: {logger_error}")
    raise

# Initialize HTTP client for CloudFormation responses
try:
    HTTP = urllib3.PoolManager()
except Exception as http_error:
    LOGGER.error(f"Failed to initialize HTTP client: {http_error}")
    raise


def send_cfn_response(event, context, status, data=None, physical_id=None, reason=None):
    """
    Sends a response to CloudFormation signaling the status of the custom resource operation.

    Args:
        event (dict): The CloudFormation custom resource event.
        context (LambdaContext): The Lambda execution context.
        status (str): The status to send to CloudFormation ('SUCCESS', 'FAILED').
        data (dict, optional): Additional data to include in the response.
        physical_id (str, optional): The physical resource ID.
        reason (str, optional): Reason for failure if any.

    Raises:
        Exception: If sending the response fails.
    """
    try:
        response_body = {
            "Status": status,
            "Reason": reason or f"See CloudWatch Logs: {context.log_stream_name}",
            "PhysicalResourceId": physical_id or context.log_stream_name,
            "StackId": event['StackId'],
            "RequestId": event['RequestId'],
            "LogicalResourceId": event['LogicalResourceId'],
            "Data": data or {}
        }

        LOGGER.info(
            "IN develop-CognitoTriggersCustomResource.send_cfn_response(), "
            f"Sending response to CFN: {json.dumps(response_body)}"
        )
        LOGGER.info(
            "IN develop-CognitoTriggersCustomResource.send_cfn_response(), "
            f"Response URL: {event.get('ResponseURL')}"
        )
        
        encoded_body = json.dumps(response_body).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        resp = HTTP.request('PUT', event['ResponseURL'], body=encoded_body, headers=headers)
        LOGGER.info(
            "IN develop-CognitoTriggersCustomResource.send_cfn_response(), "
            f"CloudFormation response sent with status: {resp.status}"
        )
    except Exception as e:
        LOGGER.error(
            "IN develop-CognitoTriggersCustomResource.send_cfn_response(), "
            f"Failed to send CloudFormation response: {e}"
        )
        raise


def lambda_handler(event, context):
    """
    Entry point for the Lambda function. Handles CloudFormation custom resource events
    for managing Cognito User Pool Lambda triggers.

    Args:
        event (dict): The CloudFormation custom resource event.
        context (LambdaContext): The Lambda execution context.

    Returns:
        None: Response is sent via send_cfn_response() to CloudFormation.
    """
    physical_id = None
    status = 'FAILED'
    reason = None

    try:
        LOGGER.info(
            "IN develop-CognitoTriggersCustomResource.lambda_handler(), "
            f"Received event: {json.dumps(event)}"
        )

        request_type = event.get('RequestType')
        props = event.get('ResourceProperties', {})
        user_pool_id = props.get('UserPoolId')
        physical_id = f"CognitoTriggers-{user_pool_id or 'UNKNOWN'}"

        # Handle Delete operation - remove all Lambda triggers
        if request_type == 'Delete':
            if user_pool_id:
                LOGGER.info(
                    "IN develop-CognitoTriggersCustomResource.lambda_handler(), "
                    f"Clearing Lambda triggers for UserPool: {user_pool_id}"
                )
                cognito = boto3.client('cognito-idp')
                cognito.update_user_pool(
                    UserPoolId=user_pool_id,
                    LambdaConfig={}  # Empty config removes all triggers
                )
            else:
                LOGGER.warning(
                    "IN develop-CognitoTriggersCustomResource.lambda_handler(), "
                    "UserPoolId not provided during Delete. Skipping update."
                )
            status = 'SUCCESS'

        # Handle Create/Update operations - configure specified Lambda triggers
        elif request_type in ['Create', 'Update']:
            if not user_pool_id:
                raise ValueError("UserPoolId is required for Create/Update")

            # Map of possible Lambda triggers from CloudFormation properties
            lambda_config = {
                'PreSignUp': props.get('PreSignUpLambdaArn'),
                'PreAuthentication': props.get('PreAuthLambdaArn'),
                'PreTokenGeneration': props.get('PreTokenLambdaArn'),
                'PostConfirmation': props.get('PostConfirmationLambdaArn'),
                'PostAuthentication': props.get('PostAuthLambdaArn')
            }

            # Filter out None values (unconfigured triggers)
            lambda_config = {k: v for k, v in lambda_config.items() if v}

            if not lambda_config:
                raise ValueError("No valid Lambda triggers provided")

            LOGGER.info(
                "IN develop-CognitoTriggersCustomResource.lambda_handler(), "
                f"Updating UserPool {user_pool_id} with LambdaConfig: {lambda_config}"
            )
            cognito = boto3.client('cognito-idp')
            cognito.update_user_pool(
                UserPoolId=user_pool_id,
                LambdaConfig=lambda_config
            )
            status = 'SUCCESS'

        else:
            reason = f"Unsupported request type: {request_type}"
            LOGGER.warning(
                "IN develop-CognitoTriggersCustomResource.lambda_handler(), "
                f"{reason}"
            )

    except Exception as e:
        LOGGER.error(
            "IN develop-CognitoTriggersCustomResource.lambda_handler(), "
            f"Unhandled exception: {e}"
        )
        reason = str(e)

    finally:
        try:
            send_cfn_response(
                event,
                context,
                status=status,
                data={},
                physical_id=physical_id or context.log_stream_name,
                reason=reason
            )
        except Exception as final_err:
            LOGGER.error(
                "IN develop-CognitoTriggersCustomResource.lambda_handler(), "
                f"Final error sending response: {final_err}"
            )