import os
import json
import logging
import time
import urllib.request
import boto3
from jose import jwk, jwt
from jose.utils import base64url_decode
from botocore.exceptions import ClientError

# initialize logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

AWS_REGION = 'us-east-1'

# initialize cognito client
COGNITO_CLIENT = boto3.client("cognito-idp")
dynamodb = boto3.resource("dynamodb")

try:
    # get environmental variables
    USERS_TABLE = os.environ['USERS_TABLE']
    USER_POOL_ID = os.environ["USER_POOL_ID"]
    CLIENT_ID = os.environ["CLIENT_ID"]
except KeyError as e:
    LOGGER.error("Error in environment variables : %s", e)
    raise KeyError("Error in environment variables : %s", e)

# construct issuer and JWKS endpoint URLs
COGNITO_ISSUER = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}"
JWKS_URL = f"{COGNITO_ISSUER}/.well-known/jwks.json"

# load JWKS keys to verify the signature of JWT tokens
with urllib.request.urlopen(JWKS_URL) as response:
    jwks = json.loads(response.read().decode("utf-8"))["keys"]

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

def verify_jwt_token(token):
    """This method is used to Verify a JWT token using the Cognito JWKS public keys.
        Args:
            token (str): JWT token from Authorization header
        Returns:
            dict: Decoded and validated claims
    """
    try:
        headers = jwt.get_unverified_headers(token)
        kid = headers["kid"]
        key_index = next((i for i, key in enumerate(jwks) if key["kid"] == kid), None)
        if key_index is None:
            raise Exception("Public key not found in JWKS")

        public_key = jwks[key_index]
        # construct public key
        key = jwk.construct(public_key)
        # split token
        message, encoded_signature = token.rsplit('.', 1)
        decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))

        if not key.verify(message.encode("utf-8"), decoded_signature):
            raise Exception("Signature verification failed")
        claims = jwt.get_unverified_claims(token)
        LOGGER.info("Claims: %s", claims)
        if time.time() > claims["exp"]:
            raise Exception("Token is expired")

        if claims["iss"] != COGNITO_ISSUER:
            raise Exception("Invalid issuer")

        if claims.get("client_id") != CLIENT_ID and CLIENT_ID not in claims.get("aud", []):
            raise Exception("Invalid audience")

        return claims
    except Exception as e:
        LOGGER.error("JWT verification failed: %s", e)
        raise
    

def lambda_handler(event, context):
    """This function is the entry point for the lambda function
        Args:
            event (dict) : A dictionary containing the event data
            context (LambdaContext): The context in which the Lambda function is run.
        Returns:
            dict : A dictionary containing the Status code and Message
    """
    try:
        LOGGER.info("Event received: %s", event)
        route_key = event.get("requestContext", {}).get("routeKey")
        event_type = event.get("requestContext", {}).get("eventType")
        access_token = None
        method_arn = None

        if route_key == "$connect" or event_type == "CONNECT":
            access_token = event.get("queryStringParameters", {}).get("token")
            if not access_token:
                LOGGER.error("Missing access token in event")
                return generate_policy("unauthorized", "Deny", "*")
            method_arn = event.get("methodArn", "*")
        elif "httpMethod" in event:
            headers = {k.lower(): v for k, v in event.get("headers", {}).items()}
            auth_header = headers.get("authorization", "")
            method_arn = event.get("methodArn", "*")

            if not method_arn:
                LOGGER.error("Missing methodArn in event")
                return generate_policy("unauthorized", "Deny", "*")

            if not auth_header.startswith("Bearer "):
                LOGGER.warning("Authorization header is missing or invalid")
                return generate_policy("unauthorized", "Deny", method_arn)

            access_token = auth_header.split(" ")[1]
        else:
            LOGGER.error("Invalid event type")
            return generate_policy("unauthorized", "Deny", "*")

        claims = verify_jwt_token(access_token)

        user = COGNITO_CLIENT.get_user(AccessToken=access_token)
        user_id = user["Username"]
        attributes = {attr["Name"]: attr["Value"] for attr in user.get("UserAttributes", [])}
        email = attributes.get("email")

        # Fetch user record from DynamoDB directly using boto3
        table = dynamodb.Table(USERS_TABLE)
        try:
            response = table.get_item(Key={"UserId": user_id})
            item = response.get("Item")
            LOGGER.info("User record from DynamoDB: %s", item)
        except ClientError as e:
            LOGGER.error("Error fetching user from DynamoDB: %s", e.response['Error']['Message'])
            return generate_policy("unauthorized", "Deny", method_arn)

        if not item:
            LOGGER.error("User not found: %s", user_id)
            return generate_policy("unauthorized", "Deny", method_arn)

        role = item.get("LastAccessedRole")
        LOGGER.info("Authenticated user: %s, role: %s", user_id, role)

        return generate_policy(user_id, "Allow", method_arn, {
            "role": role,
            "user_id": user_id,
            "email": email
        })

    except Exception as e:
        LOGGER.exception("Unhandled exception: %s", e)
        return generate_policy("unauthorized", "Deny", event.get("methodArn", "*"))
