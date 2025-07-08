import os
import logging
import jwt

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

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

        if not auth_header.startswith("Bearer "):
            LOGGER.warning("Missing or invalid Authorization header")
            return generate_policy("unauthorized", "Deny", method_arn)

        access_token = auth_header.split(" ")[1]

        # Decode JWT locally without verifying signature (for testing purposes)
        decoded_token = jwt.decode(access_token, options={"verify_signature": False})

        user_id = decoded_token.get("sub", "unknown")
        email = decoded_token.get("email", "")
        role = decoded_token.get("custom:role", "Default")

        LOGGER.info(f"Decoded token: {decoded_token}")
        LOGGER.info(f"Authenticated user: {user_id}, role: {role}")

        return generate_policy(user_id, "Allow", method_arn, {
            "role": role,
            "user_id": user_id,
            "email": email
        })

    except Exception as e:
        LOGGER.exception(f"Unhandled exception: {e}")
        return generate_policy("unauthorized", "Deny", event.get("methodArn", "*"))
