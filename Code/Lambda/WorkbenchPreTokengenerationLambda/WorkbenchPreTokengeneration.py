import boto3
import os
import logging
from boto3.dynamodb.conditions import Key

# Initialize logger with standard format
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

try:
    # Initialize DynamoDB resource and table from environment variable
    dynamodb = boto3.resource('dynamodb')
    USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
    table = dynamodb.Table(USER_TABLE_NAME)
    
    # Define role hierarchy from highest to lowest priority
    ROLE_HIERARCHY = [
        "ItAdmin",
        "Solution Architect",
        "Developer",
        "Data Engineer",
        "Data Analyst",
        "Data Scientist",
        "Default"
    ]
except Exception as e:
    LOGGER.error(
        "IN develop-PreTokenGen, "
        f"Error initializing global variables: {str(e)}"
    )
    raise


def lambda_handler(event, context):
    """
    Lambda function to add the user's highest-priority role from DynamoDB as a custom:role claim in the token.
    This is triggered after token generation in Cognito's authentication flow.

    Args:
        event (dict): The event object containing user information from Cognito.
        context (LambdaContext): The runtime context of the Lambda function.

    Returns:
        dict: The modified event object with added role claim.
        
    Raises:
        Exception: Propagates any exceptions that occur during execution.
    """
    try:
        user_id = event['userName']
        LOGGER.info(
            "IN develop-PreTokenGen.lambda_handler(), "
            f"Fetching roles for user: {user_id}"
        )

        # Query DynamoDB for user's roles
        response = table.query(
            KeyConditionExpression=Key('UserId').eq(user_id)
        )

        # Handle case when no roles are found for user
        if response.get('Count', 0) == 0:
            LOGGER.warning(
                "IN develop-PreTokenGen.lambda_handler(), "
                f"No roles found for user {user_id}, assigning Default."
            )
            highest_role = "Default"
        else:
            item = response['Items'][0]
            user_roles = item.get("Role", [])

            LOGGER.info(
                "IN develop-PreTokenGen.lambda_handler(), "
                f"User roles found: {user_roles}"
            )

            # Determine highest priority role based on ROLE_HIERARCHY
            highest_role = "Default"  # Default fallback role
            for role in ROLE_HIERARCHY:
                if role in user_roles:
                    highest_role = role
                    LOGGER.info(
                        "IN develop-PreTokenGen.lambda_handler(), "
                        f"Assigned highest role: {highest_role}"
                    )
                    break

            if highest_role == "Default":
                LOGGER.warning(
                    "IN develop-PreTokenGen.lambda_handler(), "
                    "No matching role found in hierarchy, assigning Default."
                )

        # Add custom role claim to the token
        event['response'] = event.get('response', {})
        event['response']['claimsOverrideDetails'] = {
            "claimsToAddOrOverride": {
                "custom:role": highest_role
            }
        }

        return event

    except Exception as e:
        LOGGER.error(
            "IN develop-PreTokenGen.lambda_handler(), "
            f"Error assigning role in post token generation: {str(e)}"
        )
        raise