import os
import json
import logging
import boto3
from botocore.exceptions import ClientError

# initialize logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# initialize clients
cognito_client = boto3.client("cognito-idp")
dynamodb = boto3.resource("dynamodb")

try:
    # get environmental variables
    USERS_TABLE = os.environ['USERS_TABLE']
    USER_POOL_ID = os.environ["USER_POOL_ID"]
    CLIENT_ID = os.environ["CLIENT_ID"]
except KeyError as e:
    LOGGER.error(f"Error in environment variables : {e}")
    raise KeyError(f"Error in environment variables : {e}")

def generate_policy(principal_id, effect, resource, context=None):
    """function to generate an IAM policy document to control access to the API Gateway endpoint
        Args:
            principal_id (str) : The user id of the user
            effect (str) : The effect of the policy it can be Allow or Deny
            resource (str) : The arn of the api gateway method
            context (dict) : Key value pair of the user attributes
        Returns:
            dict : A dictionary containing the principal id, policy document and context
    """
    return {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [{
                "Action": "execute-api:Invoke",
                "Effect": effect,
                "Resource": resource
            }]
        },
        "context": context or {}
    }

def lambda_handler(event, context):
    """This function is the entry point for the lambda function
        Args:
            event (dict) : A dictionary containing the event data
            context (LambdaContext): The context in which the Lambda function is run.
        Returns:
            dict : A dictionary containing the Status code and Message
    """
    try:
        LOGGER.info(f"Event received: {event}")

        headers = event.get("headers", {})
        auth_header = headers.get("Authorization", "")
        method_arn = event.get("methodArn", "*")

        if not method_arn:
            LOGGER.error("Missing methodArn in event")
            return generate_policy("unauthorized", "Deny", "*")

        if not auth_header.startswith("Bearer "):
            LOGGER.warning("Authorization header is missing or invalid")
            return generate_policy("unauthorized", "Deny", method_arn)

        if auth_header.strip() == "Bearer guest":
            LOGGER.info("Guest token detected.")
            return generate_policy("guest", "Allow", method_arn, {"role": "guest"})

        access_token = auth_header.split(" ")[1]
        user = cognito_client.get_user(AccessToken=access_token)
        user_id = user["Username"]
        attributes = {attr["Name"]: attr["Value"] for attr in user.get("UserAttributes", [])}
        email = attributes.get("email")

        # Fetch user record from DynamoDB directly using boto3
        table = dynamodb.Table(USERS_TABLE)
        try:
            response = table.get_item(Key={"UserId": user_id})
            item = response.get("Item")
            LOGGER.info(f"User record from DynamoDB: {item}")
        except ClientError as e:
            LOGGER.error(f"Error fetching user from DynamoDB: {e.response['Error']['Message']}")
            return generate_policy("unauthorized", "Deny", method_arn)

        if not item:
            LOGGER.error(f"User not found: {user_id}")
            return generate_policy("unauthorized", "Deny", method_arn)

        role = item.get("Role")
        LOGGER.info(f"Authenticated user: {user_id}, role: {role}")

        return generate_policy(user_id, "Allow", method_arn, {
            "role": role,
            "user_id": user_id,
            "email": email
        })

    except Exception as e:
        LOGGER.exception(f"Unhandled exception: {e}")
        return generate_policy("unauthorized", "Deny", event.get("methodArn", "*"))
 