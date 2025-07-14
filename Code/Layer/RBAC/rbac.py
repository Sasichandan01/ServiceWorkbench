import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional

# set up logging
LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

# Permission levels ranking
LEVEL_RANK = {"view": 1, "manage": 2, "fullaccess": 3}

# Caches for JSON mappings
API_MAPPING: Optional[Dict[str, Any]] = None

def load_api_mapping(
    path: str = "/opt/python/RBAC/api_permission_mapping.json",
) -> Dict[str, Any]:
    """
    Load and cache the API permission mapping from JSON.
    """
    global API_MAPPING
    if API_MAPPING is None:
        try:
            with open(path, "r", encoding="utf-8") as f:
                API_MAPPING = json.load(f)
                LOGGER.info("Loaded API permission mapping from %s", path)
        except (OSError, json.JSONDecodeError):
            LOGGER.exception("Failed to load API permission mapping from %s", path)
            API_MAPPING = {}
    return API_MAPPING


def is_user_action_valid(
    user_id: str, role: str, resource: str, method: str, table: Any
) -> Tuple[bool, str]:
    """
    Check whether the given user (by ID) and role has sufficient access
    to perform `method` on `resource`. Returns True if allowed, False otherwise.
    """
    # 1. Fetch role item
    try:
        response = table.get_item(Key={"Role": role})
    except AttributeError:
        LOGGER.exception("DynamoDB get_item failed for role %s", role)
        return False, "DynamoDB get_item failed for role"

    if "Item" not in response:
        LOGGER.warning("Role %r not found in table", role)
        return False, "Role not found in table"

    item = response["Item"]
    users = item.get("Users", [])
    if user_id not in users:
        LOGGER.info("User %r not in role %r", user_id, role)
        return False, "User not in role"

    role_perms = item.get("Permissions", [])

    # 2. Load API permission mapping
    api_mapping = load_api_mapping()
    api_perms = api_mapping.get(resource, {}).get(method, [])
    if not api_perms:
        LOGGER.info(
            "No API permissions found for resource=%r method=%r", resource, method
        )
        return False, "No API permissions found for resource"

    # 3. Check permissions
    missing_perms = []
    insufficient_perms = []
    LOGGER.info("API permissions: %r", api_perms)
    LOGGER.info("Role permissions: %r", role_perms)
    for perm in api_perms:
        try:
            perm = perm.strip().lower() 
            key, req_level = perm.split(".", 1)
            req_rank = LEVEL_RANK.get(req_level, 0)
            LOGGER.info("Key: %r, Req level: %r, Req rank: %r", key, req_level, req_rank)
        except ValueError:
            LOGGER.warning("Malformed API-perm entry: %r", perm)
            continue

        match_found = False
        for rp in role_perms:
            rp = rp.strip().lower()
            try:
                perm_key, perm_level = rp.split(".", 1)
                LOGGER.info("Perm key: %r, Perm level: %r", perm_key, perm_level)
            except ValueError:
                LOGGER.warning("Malformed role-perm entry: %r", rp)
                continue

            if perm_key == key:
                match_found = True
                if LEVEL_RANK.get(perm_level, 0) < req_rank:
                    LOGGER.info("Insufficient permission: %r", f"{key} (need {req_level})")
                    insufficient_perms.append(f"{key} (need {req_level})")
                break
        if not match_found:
            missing_perms.append(key)

    errors = []
    if missing_perms:
        errors.append(f"Missing permissions: {', '.join(missing_perms)}")
    if insufficient_perms:
        errors.append(f"Insufficient level for: {', '.join(insufficient_perms)}")

    if errors:
        return False, " ".join(errors)

    return True, "All permissions satisfied"


def sync_system_roles(
    table: Any,
    roles_mapping: Optional[Dict[str, Any]] = None,
    path: str = "/opt/python/RBAC/role_permission_mapping.json",
) -> None:
    """
    Upsert roles into the table during development.
    Loads `roles_mapping` from JSON if not provided.
    """
    # Load mapping if needed
    if roles_mapping is None:
        try:
            with open(path, "r", encoding="utf-8") as f:
                roles_mapping = json.load(f)
                LOGGER.info("Loaded roles mapping from %s", path)
        except (OSError, json.JSONDecodeError):
            LOGGER.exception("Failed to load roles mapping from %s", path)
            return

    LOGGER.info("Syncing %d roles to table", len(roles_mapping))

    for role_name, permissions in roles_mapping.items():
        now = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        try:
            LOGGER.info("Upserting role %r with permissions %r", role_name, permissions)
            table.update_item(
                Key={"Role": role_name},
                UpdateExpression="""
                    SET #perms            = :perms,
                        CreationTime      = if_not_exists(CreationTime, :now),
                        LastUpdationTime  = :now,
                        CreatedBy         = if_not_exists(CreatedBy, :system),
                        LastUpdatedBy     = :system
                """,
                ExpressionAttributeNames={"#perms": "Permissions"},
                ExpressionAttributeValues={
                    ":perms": permissions,
                    ":now": now,
                    ":system": "SYSTEM",
                },
            )
            LOGGER.info("Role %r upserted successfully.", role_name)
        except AttributeError:
            LOGGER.exception("Error upserting role %r", role_name)
            raise
