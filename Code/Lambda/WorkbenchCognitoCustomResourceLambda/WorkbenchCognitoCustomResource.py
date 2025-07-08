import json
import boto3
import urllib3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)
http = urllib3.PoolManager()

def send_cfn_response(event, context, status, data=None, physical_id=None, reason=None):
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

        logger.info(f"Sending response to CFN: {json.dumps(response_body)}")
        logger.info(f"Response URL: {event.get('ResponseURL')}")
        
        encoded_body = json.dumps(response_body).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        resp = http.request('PUT', event['ResponseURL'], body=encoded_body, headers=headers)
        logger.info(f"CloudFormation response sent: {resp.status}")
    except Exception as e:
        logger.error(f"Failed to send CloudFormation response: {e}")
        raise

def lambda_handler(event, context):
    physical_id = None
    status = 'FAILED'
    reason = None

    try:
        logger.info("Received event: " + json.dumps(event))

        request_type = event.get('RequestType')
        props = event.get('ResourceProperties', {})
        user_pool_id = props.get('UserPoolId')
        physical_id = f"CognitoTriggers-{user_pool_id or 'UNKNOWN'}"

        if request_type == 'Delete':
            if user_pool_id:
                logger.info(f"Clearing Lambda triggers for UserPool: {user_pool_id}")
                cognito = boto3.client('cognito-idp')
                cognito.update_user_pool(
                    UserPoolId=user_pool_id,
                    LambdaConfig={}  # remove all triggers
                )
            else:
                logger.warning("UserPoolId not provided during Delete. Skipping update.")
            status = 'SUCCESS'

        elif request_type in ['Create', 'Update']:
            if not user_pool_id:
                raise ValueError("UserPoolId is required for Create/Update")

            lambda_config = {
                'PreSignUp': props.get('PreSignUpLambdaArn'),
                'PreAuthentication': props.get('PreAuthLambdaArn'),
                'PreTokenGeneration': props.get('PreTokenLambdaArn'),
                'PostConfirmation': props.get('PostConfirmationLambdaArn'),
                'PostAuthentication': props.get('PostAuthLambdaArn')
            }

            lambda_config = {k: v for k, v in lambda_config.items() if v}

            if not lambda_config:
                raise ValueError("No valid Lambda triggers provided")

            logger.info(f"Updating UserPool {user_pool_id} with LambdaConfig: {lambda_config}")
            cognito = boto3.client('cognito-idp')
            cognito.update_user_pool(
                UserPoolId=user_pool_id,
                LambdaConfig=lambda_config
            )
            status = 'SUCCESS'

        else:
            reason = f"Unsupported request type: {request_type}"
            logger.warning(reason)

    except Exception as e:
        logger.error(f"Unhandled exception: {e}")
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
            logger.error(f"Final error sending response: {final_err}")
