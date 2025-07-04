import boto3
import os
import logging
from boto3.dynamodb.conditions import Key

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB resource and table
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['USER_TABLE_NAME'])


# Define role hierarchy
ROLE_HIERARCHY = [
    "ItAdmin",
    "Solution Architect",
    "Developer",
    "Data Engineer",
    "Data Analyst",
    "Data Scientist",
    "Default"
]

def lambda_handler(event, context):
    """
        Adds the user's highest-priority role from DynamoDB as a custom:role claim in the token.
    """
    try:
        user_id = event['userName']
        logger.info(f"Fetching roles for user: {user_id}")

        response = table.query(
            KeyConditionExpression=Key('UserId').eq(user_id)
        )

        if response.get('Count', 0) == 0:
            logger.warning(f"No roles found for user {user_id}, assigning Default.")
            highest_role = "Default"
        else:
            item = response['Items'][0]
            user_roles = item.get("Role", [])

            logger.info(f"User roles found: {user_roles}")

            # Determine highest priority role
            for role in ROLE_HIERARCHY:
                if role in user_roles:
                    highest_role = role
                    logger.info(f"Assigned highest role: {highest_role}")
                    break
            else:
                highest_role = "Default"
                logger.warning(f"No matching role found, assigning Default.")

        # Add custom role to the token
        event['response'] = event.get('response', {})
        event['response']['claimsOverrideDetails'] = {
            "claimsToAddOrOverride": {
                "custom:role": highest_role
            }
        }

        return event

    except Exception as e:
        logger.error(f"Error assigning role in post token generation: {str(e)}")
        raise e
