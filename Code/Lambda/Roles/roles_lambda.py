import logging
import json
import os
from datetime import datetime, timezone
import boto3
import botocore
from RBAC.rbac import sync_system_roles, is_user_action_valid
from Utils.utils import paginate_list, return_response, log_activity

# Use a module‑specific logger
LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

ROLES_TABLE = os.getenv("ROLES_TABLE")
ACTIVITY_LOGS_TABLE = os.getenv("ACTIVITY_LOGS_TABLE")

# Validate environment variables
if ROLES_TABLE is None:
    LOGGER.critical("IN roles_lambda: Environment variable 'ROLES_TABLE' must be set.")
    raise RuntimeError("ROLES_TABLE env var must be set")
if ACTIVITY_LOGS_TABLE is None:
    LOGGER.critical("IN roles_lambda: Environment variable 'ACTIVITY_LOGS_TABLE' must be set.")
    raise RuntimeError("ACTIVITY_LOGS_TABLE env var must be set")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(ROLES_TABLE)
activity_log_table = dynamodb.Table(ACTIVITY_LOGS_TABLE)


def lambda_handler(event, context):
    """
    Entry point for the Roles API Lambda.

    Key steps:
        1. Extract request data and authorizer context.
        2. Handle 'sync-role' action if requested.
        3. Enforce RBAC policy.
        4. Route to CRUD operations on /roles and /roles/{role_name}.

    Params:
        event [dict]: AWS Lambda event payload
        context [object]: AWS Lambda context object

    Returns:
        dict: Formatted HTTP response
    """
    LOGGER.info("IN roles_lambda.lambda_handler: Event received: %s", event)

    try:
        resource = event.get("resource")
        method = event.get("httpMethod")
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")

        # ----- Sync system roles -----
        if resource == "/roles" and method == "POST" and (event.get("queryStringParameters") or {}).get("action") == "sync-role":
            try:
                sync_system_roles(table)
                LOGGER.info("IN roles_lambda.lambda_handler: successfully synchronized system roles")
                return return_response(200, {"Message": "System roles synchronized"})
            except Exception as e:
                LOGGER.exception("IN roles_lambda.lambda_handler: sync_system_roles failed: %s", e)
                return return_response(500, {"Error": f"Sync failed: {e}"})

        # ----- RBAC Enforcement -----
        valid, msg = is_user_action_valid(user_id, role, resource, method, table)
        if not valid:
            LOGGER.info("IN roles_lambda.lambda_handler: RBAC denied for user %s on %s %s: %s", user_id, method, resource, msg)
            return return_response(403, {"Error": msg})

        # ----- /roles Collection -----
        if resource == "/roles":
            if method == "GET":
                LOGGER.info("IN roles_lambda.lambda_handler: Handling GET /roles")
                try:
                    items = []
                    response = table.scan()
                    items.extend(response.get("Items", []))
                    while "LastEvaluatedKey" in response:
                        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
                        items.extend(response.get("Items", []))
                    LOGGER.info("IN roles_lambda.lambda_handler: scanned %d role items", len(items))
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: DynamoDB scan failed: %s", e)
                    return return_response(500, {"Error": "Failed to scan Roles table"})

                params = event.get("queryStringParameters") or {}
                offset = int(params.get("offset", 1))
                limit = int(params.get("limit", 10))
                sort_by = params.get("sortBy", "Role")
                sort_order = params.get("sortOrder", "asc")

                return paginate_list("Roles", items, ["Role"], offset, limit, sort_by, sort_order)

            elif method == "POST":
                LOGGER.info("IN roles_lambda.lambda_handler: Handling POST /roles")
                body = event.get("body") or "{}"
                try:
                    data = json.loads(body)
                    LOGGER.info("IN roles_lambda.lambda_handler: Parsed request body JSON")
                except json.JSONDecodeError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: JSON decode error: %s", e)
                    return return_response(400, {"Error": "Invalid JSON in request body"})

                role_name = data.get("Role")
                permissions = data.get("Permissions")
                description = data.get("Description")

                if not role_name or not permissions or not description:
                    return return_response(400, {"Error": "Role, Permissions and Description required"})

                # Check for existing role
                try:
                    existing = table.get_item(Key={"Role": role_name}).get("Item")
                    if existing:
                        LOGGER.info("IN roles_lambda.lambda_handler: Role '%s' already exists", role_name)
                        return return_response(400, {"Error": "Role already exists"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: Error checking role existence: %s", e)
                    return return_response(500, {"Error": "Failed to check role existence"})

                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                try:
                    table.put_item(Item={"Role": role_name, "Permissions": permissions, "Description": description, "CreatedBy": user_id, "CreationTime": now, "LastUpdatedBy": user_id, "LastUpdationTime": now})
                    log_activity(activity_log_table, "Roles", role_name, role_name, user_id, "Role created")
                    LOGGER.info("IN roles_lambda.lambda_handler: Role '%s' created by %s", role_name, user_id)
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: Error creating role: %s", e)
                    return return_response(500, {"Error": "Failed to create role"})

                return return_response(201, {"Message": "Role created"})

        # ----- /roles/{role_name} Resource -----
        elif resource == "/roles/{role_name}":
            role_name = event.get("pathParameters", {}).get("role_name")

            if method == "GET":
                LOGGER.info("IN roles_lambda.lambda_handler: Handling GET /roles/%s", role_name)
                try:
                    resp = table.get_item(Key={"Role": role_name})
                    if "Item" in resp:
                        return return_response(200, {"Role": resp["Item"]})
                    LOGGER.info("IN roles_lambda.lambda_handler: Role '%s' not found", role_name)
                    return return_response(404, {"Error": "Role not found"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: Error retrieving role: %s", e)
                    return return_response(500, {"Error": "Failed to get role"})

            if method == "PUT":
                LOGGER.info("IN roles_lambda.lambda_handler: Handling PUT /roles/%s", role_name)
                body = event.get("body") or "{}"
                try:
                    data = json.loads(body)
                    LOGGER.info("IN roles_lambda.lambda_handler: Parsed update JSON for '%s'", role_name)
                except json.JSONDecodeError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: JSON decode error: %s", e)
                    return return_response(400, {"Error": "Invalid JSON in request body"})

                permissions = data.get("Permissions")
                description = data.get("Description")
                if not permissions or not description:
                    return return_response(400, {"Error": "Permissions and description are required"})

                try:
                    table.update_item(Key={"Role": role_name}, UpdateExpression="SET #P = :p, #D = :d, LastUpdatedBy = :u, LastUpdationTime = :t", ExpressionAttributeNames={"#P": "Permissions", "#D": "Description"}, ExpressionAttributeValues={":p": permissions, ":d": description, ":u": user_id, ":t": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")})
                    log_activity(activity_log_table, "Roles", role_name, role_name, user_id, "Role updated")
                    LOGGER.info("IN roles_lambda.lambda_handler: Role '%s' updated by %s", role_name, user_id)
                    return return_response(200, {"Message": "Role updated"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: Error updating role: %s", e)
                    return return_response(500, {"Error": "Failed to update role"})

            if method == "DELETE":
                LOGGER.info("IN roles_lambda.lambda_handler: Handling DELETE /roles/%s", role_name)
                try:
                    resp = table.get_item(Key={"Role": role_name})
                    item = resp.get("Item")
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: Error fetching for delete: %s", e)
                    return return_response(500, {"Error": "Failed to fetch role"})
                if not item:
                    return return_response(404, {"Error": "Role not found"})
                if item.get("CreatedBy") == "SYSTEM":
                    return return_response(403, {"Error": "Cannot delete system role"})

                try:
                    table.delete_item(Key={"Role": role_name})
                    log_activity(activity_log_table, "Roles", role_name, role_name, user_id, "Role deleted")
                    LOGGER.info("IN roles_lambda.lambda_handler: Role '%s' deleted by %s", role_name, user_id)
                    return return_response(200, {"Message": "Role deleted"})
                except botocore.exceptions.ClientError as e:
                    LOGGER.exception("IN roles_lambda.lambda_handler: Error deleting role: %s", e)
                    return return_response(500, {"Error": "Failed to delete role"})

        LOGGER.info("IN roles_lambda.lambda_handler: No matching route for %s %s", method, resource)
        return return_response(404, {"Error": "Invalid resource or method"})

    except Exception as e:
        LOGGER.exception("IN roles_lambda.lambda_handler: Unhandled exception: %s", e)
        return return_response(500, {"Error": "Internal server error"})
