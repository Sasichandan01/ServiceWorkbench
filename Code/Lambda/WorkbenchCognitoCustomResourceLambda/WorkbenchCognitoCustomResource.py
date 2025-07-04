import json
import boto3
import urllib3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)
http = urllib3.PoolManager()

def send_cfn_response(event, context, status, data=None, physical_id=None, reason=None):
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
        logger.info(f"CloudFormation response sent: {resp.status}")
    except Exception as e:
        logger.error(f"Failed to send CloudFormation response: {e}")
        raise

def lambda_handler(event, context):
    logger.info("Received event: " + json.dumps(event))
    
    request_type = event.get('RequestType')
    props = event.get('ResourceProperties', {})
    physical_id = f"CognitoTriggers-{props.get('UserPoolId', 'UNKNOWN')}"
    
    # Skip if not Create or Update
    if request_type not in ['Create', 'Update']:
        logger.info(f"No action required for request type: {request_type}")
        send_cfn_response(event, context, 'SUCCESS', {}, physical_id)
        return
    
    try:
        cognito = boto3.client('cognito-idp')
        user_pool_id = props['UserPoolId']
        
        # Configure all four triggers from your template
        lambda_config = {
            'PreSignUp': props.get('PreSignUpLambdaArn'),
            'PreAuthentication': props.get('PreAuthLambdaArn'),
            'PreTokenGeneration': props.get('PreTokenLambdaArn'),
            'PostConfirmation': props.get('PostConfirmationLambdaArn'),
            'PostAuthentication': props.get('PostAuthLambdaArn') 
        }
        
        # Remove None values
        lambda_config = {k: v for k, v in lambda_config.items() if v}
        
        if not lambda_config:
            raise ValueError("No valid Lambda triggers provided")
        
        logger.info(f"Updating UserPool {user_pool_id} with LambdaConfig: {lambda_config}")
        cognito.update_user_pool(
            UserPoolId=user_pool_id,
            LambdaConfig=lambda_config
        )
        
        send_cfn_response(event, context, 'SUCCESS', {}, physical_id)
    
    except Exception as e:
        logger.error(f"Error updating Cognito triggers: {e}")
        send_cfn_response(event, context, 'FAILED', {}, physical_id, reason=str(e))