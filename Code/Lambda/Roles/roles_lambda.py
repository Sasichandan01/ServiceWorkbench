import logging
import json
import os
from datetime import datetime, timezone
import boto3
import botocore
from RBAC.rbac import sync_system_roles, is_user_action_valid
from Utils.utils import paginate_list, return_response

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

ROLES_TABLE = os.getenv("ROLES_TABLE")
if ROLES_TABLE is None:
    LOGGER.critical("Environment variable 'ROLES_TABLE' must be set.")
    raise RuntimeError("ROLES_TABLE env var must be set")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(ROLES_TABLE)


def lambda_handler(event, context):
    """
    Lambda function to handle the roles API.
    """
    LOGGER.info("Event received: %s", event)
    try:
        resource = event.get("resource")
        method = event.get("httpMethod")
        # Extract authorizer data
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("userId")
        role = auth.get("role")

        # Sync system roles
        if (
            resource == "/roles"
            and method == "POST"
            and (event.get("queryStringParameters") or {}).get("action") == "sync-role"
        ):
            try:
                sync_system_roles(table)
                return return_response(200, {"Message": "System roles synchronized"})
            except Exception as e:
                LOGGER.exception("sync_system_roles failed")
                return return_response(500, {"Error": f"Sync failed: {e}"})

        # RBAC check
        valid, msg = is_user_action_valid(user_id, role, resource, method, table)
        if not valid:
            return return_response(403, {"Error": msg})

        if resource == "/roles":
            if method == "GET":
                params = event.get("queryStringParameters") or {}
                offset = int(params.get("offset", 1))
                limit = int(params.get("limit", 10))
                sort_by = params.get("sortBy", "Role")
                sort_order = params.get("sortOrder", "asc")
                try:
                    items = []
                    response = table.scan()
                    items.extend(response.get('Items', []))
                    while 'LastEvaluatedKey' in response:
                        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
                        items.extend(response.get('Items', []))
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("DynamoDB ClientError scanning Roles table: %s", e)
                    return return_response(500, {"Error": "Failed to scan Roles table"})
                return paginate_list(
                    "Roles",
                    items,
                    ["Role"],
                    offset,
                    limit,
                    sort_by,
                    sort_order,
                )
            elif method == "POST":
                body = event.get("body") or "{}"
                try:
                    data = json.loads(body)
                except json.JSONDecodeError as e:
                    LOGGER.exception("JSON decode error: %s", e)
                    return return_response(400, {"Error": "Invalid JSON in request body"})
                role_name = data.get("Role")
                permissions = data.get("Permissions")
                if not role_name or not permissions:
                    return return_response(
                        400, {"Error": "Role and Permissions required"}
                    )
                # Check existence
                try:
                    if table.get_item(Key={"Role": role_name}).get("Item"):
                        return return_response(400, {"Error": "Role already exists"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("DynamoDB ClientError checking role existence: %s", e)
                    return return_response(500, {"Error": "Failed to check role existence"})

                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                try:
                    table.put_item(
                        Item={
                            "Role": role_name,
                            "Permissions": permissions,
                            "CreatedBy": user_id,
                            "CreationTime": now,
                            "LastUpdatedBy": user_id,
                            "LastUpdationTime": now,
                        }
                    )
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("DynamoDB ClientError creating role: %s", e)
                    return return_response(500, {"Error": "Failed to create role"})
                return return_response(201, {"Message": "Role created"})

        elif resource == "/roles/{role_name}":
            role_name = event.get("pathParameters", {}).get("role_name")
            if method == "GET":
                try:
                    resp = table.get_item(Key={"Role": role_name})
                    if "Item" in resp:
                        return return_response(200, {"Role": resp["Item"]})
                    return return_response(404, {"Error": "Role not found"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("DynamoDB ClientError getting role: %s", e)
                    return return_response(500, {"Error": "Failed to get role"})

            if method == "PUT":
                body = event.get("body") or "{}"
                try:
                    data = json.loads(body)
                except json.JSONDecodeError as e:
                    LOGGER.exception("JSON decode error: %s", e)
                    return return_response(400, {"Error": "Invalid JSON in request body"})
                permissions = data.get("Permissions")
                if not permissions:
                    return return_response(400, {"Error": "Permissions required"})
                try:
                    table.update_item(
                        Key={"Role": role_name},
                        UpdateExpression="SET #P = :p, LastUpdatedBy = :u, LastUpdationTime = :t",
                        ExpressionAttributeNames={
                            "#P": "Permissions"
                        },
                        ExpressionAttributeValues={
                            ":p": permissions,
                            ":u": user_id,
                            ":t": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                        },
                    )
                    return return_response(200, {"Message": "Role updated"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("DynamoDB ClientError updating role: %s", e)
                    return return_response(500, {"Error": "Failed to update role"})

            if method == "DELETE":
                resp = table.get_item(Key={"Role": role_name})
                item = resp.get("Item")
                if not item:
                    return return_response(404, {"Error": "Role not found"})
                if item.get("CreatedBy") == "SYSTEM":
                    return return_response(403, {"Error": "Cannot delete system role"})
                try:
                    table.delete_item(Key={"Role": role_name})
                    return return_response(200, {"Message": "Role deleted"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("DynamoDB ClientError deleting role: %s", e)
                    return return_response(500, {"Error": "Failed to delete role"})

        return return_response(404, {"Error": "Invalid resource or method"})

    except Exception as e:
        LOGGER.exception("Unhandled exception in lambda_handler: %s", e)
        return return_response(500, {"Error": "Internal server error"})
