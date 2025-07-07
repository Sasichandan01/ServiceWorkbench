import logging
import json
import os
import boto3
from RBAC.rbac import sync_system_roles, is_user_action_valid

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

ROLES_TABLE = os.getenv('ROLES_TABLE')
if not ROLES_TABLE:
    LOGGER.critical("Environment variable 'ROLES_TABLE' is not set.")
    raise RuntimeError("ROLES_TABLE env var must be set")

DYNAMODB_RESOURCE = boto3.resource('dynamodb')
table = DYNAMODB_RESOURCE.Table(ROLES_TABLE)

def lambda_handler(event, context):
    """
    Lambda function to get the roles from the table.
    """
    try:
        LOGGER.info("Event: %s", event)
        resource = event.get('resource')
        method = event.get('httpMethod')
        if not is_user_action_valid(event.get('user_id'), event.get('role'), resource, method, table):
            return {
                "statusCode": 403,
                "body": json.dumps({"Error": "User not authorized to perform this action"})
            }
        query_params = event.get('queryStringParameters', {})
        action = query_params.get('action')
        if resource == '/roles' and method == 'POST' and action == 'sync-role':
            sync_system_roles(table)
            return {
                "statusCode": 200,
                "body": json.dumps({"Message": "Role added successfully"})
            }
        else:
            return {
                "statusCode": 404,
                "body": json.dumps({"Error": "Invalid action"})
            }
    except Exception as e:
        LOGGER.exception("Error in handler: %s", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"Error": "Internal server error"})
        }
