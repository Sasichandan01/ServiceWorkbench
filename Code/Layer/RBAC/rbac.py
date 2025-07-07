import logging
import json
from datetime import datetime, timezone

# set up logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

level_rank = {'view': 1, 'manage': 2, 'fullaccess': 3}

def is_user_action_valid(user_id, role, resource, method, table):
    """
    Function to check if the user action is valid.
    1. Fetch Role permissions from the table
    2. Fetch api permission mapping from the table
    3. Check if the user has the permission to perform the action based on the hieracy of the permission view < manage < fullaccess
    4. Return True if the user has the permission, False otherwise
    """

    # 1. Fetch Role permissions from the table
    try:
        item = table.get_item(Key={"Role": role})['Item']
        if user_id not in item.get('Users', []):
            return {
                "statusCode": 403,
                "body": json.dumps({"error": "User not found in the role"})
            }
        role_perms = item.get('Permissions', [])
    except KeyError:
        return {
            "statusCode": 403,
            "body": json.dumps({"error": "Role not found"})
        }

    # 2. Fetch api permission mapping from the table
    api_permission_mapping = {}
    with open('/opt/python/RBAC/api_permission_mapping.json', 'r', encoding='utf-8') as f:
        api_permission_mapping = json.load(f)

    api_permission = api_permission_mapping.get(resource, {}).get(method.upper(), [])

    if not api_permission:
        return {
            "statusCode": 403,
            "body": json.dumps({
                "error": f"Permission not found for resource: {resource} and method: {method}"
                })
        }

    for perm in api_permission:
        try:
            key, req_level = perm.split('.', 1)
            req_rank = level_rank.get(req_level, 0)
        except ValueError:
            continue

        for rp in role_perms:
            rp = rp.strip().lower()
            try:
                perm_key, perm_level = rp.split('.', 1)
            except ValueError:
                continue

            if perm_key == key and level_rank.get(perm_level, 0) >= req_rank:
                return True
    return False

def sync_system_roles(table,roles_mapping=None):
    """
    Function to add roles to the table in a batch writer.
    """
    try:
        if not roles_mapping:
            with open('/opt/python/RBAC/role_permission_mapping.json', 'r', encoding='utf-8') as f:
                roles_mapping = json.load(f)
        LOGGER.info("Adding roles to the table: %s", roles_mapping)

        # update the roles if they already exist or add them if they don't exist
        for role, permissions in roles_mapping.items():
            now = datetime.now(timezone.utc)
            try:
                LOGGER.info("Updating role %s with permissions %s", role, permissions)
                table.update_item(
                    Key={"Role": role},
                    UpdateExpression="""
                        SET #perms              = :perms,
                            CreationTime        = if_not_exists(CreationTime, :now),
                            LastUpdationTime    = :now,
                            CreatedBy           = if_not_exists(CreatedBy, :system),
                            LastUpdatedBy       = :system
                    """,
                    ExpressionAttributeNames={
                        "#perms": "Permissions"
                    },
                    ExpressionAttributeValues={
                        ":perms": permissions,
                        ":now": now,
                        ":system": "SYSTEM",
                    }
                )
                LOGGER.info("Role %s updated.", role)
            except Exception:
                LOGGER.exception("Error updating role %s", role)
                raise
    except Exception as e:
        LOGGER.exception("Error adding roles to the table: %s", e)
        raise
