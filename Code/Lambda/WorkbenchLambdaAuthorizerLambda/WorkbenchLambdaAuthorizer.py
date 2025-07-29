import os
import json
import logging
import time
import urllib.request
import boto3
from jose import jwk, jwt
from jose.utils import base64url_decode
from botocore.exceptions import ClientError

# Initialize logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

try:
    # Get environment variables with error handling
    USERS_TABLE = os.environ['USERS_TABLE']
    USER_POOL_ID = os.environ["USER_POOL_ID"]
    CLIENT_ID = os.environ["CLIENT_ID"]
    AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")  # Default to us-east-1 if not set
except KeyError as e:
    LOGGER.error(
        "IN develop-LambdaAuthorizer.lambda_handler(), Error loading environment variables: %s", e
    )
    raise

try:
    # Initialize AWS clients
    COGNITO_CLIENT = boto3.client("cognito-idp")
    dynamodb = boto3.resource("dynamodb")
except Exception as e:
    LOGGER.error(
        "IN develop-LambdaAuthorizer.lambda_handler(), Error initializing AWS clients: %s", e
    )
    raise

try:
    # Construct issuer and JWKS endpoint URLs
    COGNITO_ISSUER = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}"
    JWKS_URL = f"{COGNITO_ISSUER}/.well-known/jwks.json"

    # Load JWKS keys to verify the signature of JWT tokens
    with urllib.request.urlopen(JWKS_URL) as response:
        jwks = json.loads(response.read().decode("utf-8"))["keys"]
except Exception as e:
    LOGGER.error(
        "IN develop-LambdaAuthorizer.lambda_handler(), Error loading JWKS keys: %s", e
    )
    raise


def generate_policy(principal_id, effect, resource, context=None):
    """
    Generates an IAM policy document to control access to the API Gateway endpoint.

    Args:
        principal_id (str): The user id of the user.
        effect (str): The effect of the policy (Allow or Deny).
        resource (str): The ARN of the API Gateway method.
        context (dict): Key value pair of the user attributes.

    Returns:
        dict: A dictionary containing the principal id, policy document and context.
    """
    LOGGER.info(
        "IN develop-LambdaAuthorizer.generate_policy(), Generating policy for principal: %s", principal_id
    )
    
    policy = {
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
    
    LOGGER.debug(
        "IN develop-LambdaAuthorizer.generate_policy(), Generated policy: %s", policy
    )
    return policy


def verify_jwt_token(token):
    """
    Verifies a JWT token using the Cognito JWKS public keys.

    Args:
        token (str): JWT token from Authorization header.

    Returns:
        dict: Decoded and validated claims.

    Raises:
        Exception: If token verification fails for any reason.
    """
    LOGGER.info(
        "IN develop-LambdaAuthorizer.verify_jwt_token(), Verifying JWT token"
    )
    
    try:
        # Get unverified headers to find the key ID
        headers = jwt.get_unverified_headers(token)
        kid = headers["kid"]
        
        # Find the matching key in JWKS
        key_index = next((i for i, key in enumerate(jwks) if key["kid"] == kid), None)
        if key_index is None:
            raise Exception("Public key not found in JWKS")

        # Construct public key from JWKS data
        public_key = jwks[key_index]
        key = jwk.construct(public_key)
        
        # Split and decode token components
        message, encoded_signature = token.rsplit('.', 1)
        decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))

        # Verify the signature
        if not key.verify(message.encode("utf-8"), decoded_signature):
            raise Exception("Signature verification failed")
            
        # Get and validate claims
        claims = jwt.get_unverified_claims(token)
        LOGGER.debug(
            "IN develop-LambdaAuthorizer.verify_jwt_token(), Claims: %s", claims
        )
        
        # Check token expiration
        if time.time() > claims["exp"]:
            raise Exception("Token is expired")

        # Validate issuer
        if claims["iss"] != COGNITO_ISSUER:
            raise Exception("Invalid issuer")

        # Validate audience/client ID
        if claims.get("client_id") != CLIENT_ID and CLIENT_ID not in claims.get("aud", []):
            raise Exception("Invalid audience")

        return claims
        
    except Exception as e:
        LOGGER.error(
            "IN develop-LambdaAuthorizer.verify_jwt_token(), JWT verification failed: %s", e
        )
        raise


def get_custom_role(user_data):
    """
    Extracts the custom role from Cognito user attributes.

    Args:
        user_data (dict): User data from Cognito.

    Returns:
        str: The value of the custom:Role attribute, or None if not found.
    """
    LOGGER.info(
        "IN develop-LambdaAuthorizer.get_custom_role(), Getting custom role from user attributes"
    )
    
    for attr in user_data.get("UserAttributes", []):
        if attr["Name"] == "custom:Role":
            role = attr["Value"]
            LOGGER.debug(
                "IN develop-LambdaAuthorizer.get_custom_role(), Found role: %s", role
            )
            return role
    return None


def lambda_handler(event, context):
    """
    Entry point for the Lambda function. Authenticates API Gateway requests
    using Cognito JWT tokens and returns appropriate IAM policies.

    Args:
        event (dict): The event object from API Gateway.
        context (LambdaContext): The runtime context.

    Returns:
        dict: IAM policy document allowing or denying access to the API.
    """
    LOGGER.info(
        "IN develop-LambdaAuthorizer.lambda_handler(), Received event: %s", event
    )
    
    try:
        # Determine if this is a WebSocket connection or HTTP request
        route_key = event.get("requestContext", {}).get("routeKey")
        event_type = event.get("requestContext", {}).get("eventType")
        access_token = None
        method_arn = None

        # Handle WebSocket connection events
        if route_key == "$connect" or event_type == "CONNECT":
            LOGGER.info(
                "IN develop-LambdaAuthorizer.lambda_handler(), Handling WebSocket connection"
            )
            access_token = event.get("queryStringParameters", {}).get("token")
            if not access_token:
                LOGGER.error(
                    "IN develop-LambdaAuthorizer.lambda_handler(), Missing access token in WebSocket event"
                )
                return generate_policy("unauthorized", "Deny", "*")
            method_arn = event.get("methodArn", "*")
            
        # Handle HTTP requests
        elif "httpMethod" in event:
            LOGGER.info(
                "IN develop-LambdaAuthorizer.lambda_handler(), Handling HTTP request"
            )
            headers = {k.lower(): v for k, v in event.get("headers", {}).items()}
            auth_header = headers.get("authorization", "")
            method_arn = event.get("methodArn", "*")

            if not method_arn:
                LOGGER.error(
                    "IN develop-LambdaAuthorizer.lambda_handler(), Missing methodArn in HTTP event"
                )
                return generate_policy("unauthorized", "Deny", "*")

            if not auth_header.startswith("Bearer "):
                LOGGER.warning(
                    "IN develop-LambdaAuthorizer.lambda_handler(), Authorization header is missing or invalid"
                )
                return generate_policy("unauthorized", "Deny", method_arn)

            access_token = auth_header.split(" ")[1]
        else:
            LOGGER.error(
                "IN develop-LambdaAuthorizer.lambda_handler(), Invalid event type received"
            )
            return generate_policy("unauthorized", "Deny", "*")

        # Verify the JWT token
        claims = verify_jwt_token(access_token)

        # Get user details from Cognito
        user = COGNITO_CLIENT.get_user(AccessToken=access_token)
        LOGGER.debug(
            "IN develop-LambdaAuthorizer.lambda_handler(), Cognito user data: %s", user
        )
        
        user_id = user["Username"]
        attributes = {attr["Name"]: attr["Value"] for attr in user.get("UserAttributes", [])}
        email = attributes.get("email")

        # Fetch additional user data from DynamoDB
        table = dynamodb.Table(USERS_TABLE)
        try:
            response = table.get_item(Key={"UserId": user_id})
            item = response.get("Item")
            LOGGER.debug(
                "IN develop-LambdaAuthorizer.lambda_handler(), DynamoDB user record: %s", item
            )
        except ClientError as e:
            LOGGER.error(
                "IN develop-LambdaAuthorizer.lambda_handler(), Error fetching user from DynamoDB: %s", 
                e.response['Error']['Message']
            )
            return generate_policy("unauthorized", "Deny", method_arn)

        if not item:
            LOGGER.error(
                "IN develop-LambdaAuthorizer.lambda_handler(), User not found in DynamoDB: %s", user_id
            )
            return generate_policy("unauthorized", "Deny", method_arn)

        # Get custom role and generate allow policy
        role = get_custom_role(user)
        LOGGER.info(
            "IN develop-LambdaAuthorizer.lambda_handler(), Authenticated user: %s with role: %s", user_id, role
        )

        return generate_policy(user_id, "Allow", method_arn, {
            "role": role,
            "user_id": user_id,
            "email": email
        })

    except Exception as e:
        LOGGER.exception(
            "IN develop-LambdaAuthorizer.lambda_handler(), Unhandled exception: %s", e
        )
        return generate_policy("unauthorized", "Deny", event.get("methodArn", "*"))