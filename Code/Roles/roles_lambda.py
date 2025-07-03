import logging
import json
import os
import boto3
from RBAC.rbac import add_roles_to_table

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

ROLES_TABLE = os.getenv('ROLES_TABLE')

DYNAMODB_RESOURCE = boto3.resource('dynamodb')
table = DYNAMODB_RESOURCE.Table(ROLES_TABLE)

def handler(event, context):
    """
    Lambda function to get the roles from the table.
    """
    try:
        LOGGER.info("Event: %s", event)
        resource = event.get('resource')
        method = event.get('httpMethod')
        query_params = event.get('queryStringParameters', {})
        action = query_params.get('action')
        if resource == '/roles' and method == 'POST' and action == 'sync-role':
            body = event.get('body',{})
            try:
                body = json.loads(body)
            except json.JSONDecodeError as e:
                LOGGER.error("Error parsing request body: %s", e)
                return {
                    "statusCode": 400,
                    "body": json.dumps({"Error": "Invalid request body"})
                }
            if not body.get('Role') or not body.get('Permissions'):
                return {
                    "statusCode": 400,
                    "body": json.dumps({"Error": "Role and Permissions are required"})
                }
            add_roles_to_table(table, body)
            return {
                "statusCode": 200,
                "body": json.dumps({"Message": "Role added successfully"})
            }
        else:
            return {
                "statusCode": 404,
                "body": json.dumps({"Error": "Not found"})
            }
    except Exception as e:
        LOGGER.exception("Error in handler: %s", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"Error": "Internal server error"})
        }
