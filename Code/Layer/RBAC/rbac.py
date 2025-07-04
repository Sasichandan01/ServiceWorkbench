import logging
import json
from datetime import datetime

# set up logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

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
            now = datetime.now().isoformat()
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
