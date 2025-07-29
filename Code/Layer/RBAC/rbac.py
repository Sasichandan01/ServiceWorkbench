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


def load_api_mapping(path: str = "/opt/python/RBAC/api_permission_mapping.json") -> Dict[str, Any]:
    """
    Load and cache the API permission mapping from a JSON file.

    Key steps:
        1. Check if mapping is already cached.
        2. If not, read JSON from the given path.
        3. Cache and return the mapping, or an empty dict on failure.

    Params:
        path [str]: filesystem path to the JSON mapping file

    Returns:
        Dict[str, Any]: the loaded API permission mapping
    """
    global API_MAPPING
    if API_MAPPING is None:
        try:
            with open(path, "r", encoding="utf-8") as f:
                API_MAPPING = json.load(f)
                LOGGER.info("IN rbac.load_api_mapping: loaded API permission mapping from %s", path)
        except (OSError, json.JSONDecodeError):
            LOGGER.exception("IN rbac.load_api_mapping: failed to load API permission mapping from %s", path)
            API_MAPPING = {}
    return API_MAPPING


def is_user_action_valid(user_id: str, role: str, resource: str, method: str, table: Any) -> Tuple[bool, str]:
    """
    Check whether the user's role grants permission for an API action.

    Key steps:
        1. Retrieve the role item from DynamoDB.
        2. Verify the user belongs to that role.
        3. Load API-to-permission mapping and determine required perms.
        4. Compare against the role's permissions for missing/insufficient.

    Params:
        user_id [str]: unique identifier of the user
        role [str]: name of the role to check
        resource [str]: API resource path being accessed
        method [str]: HTTP method (GET, POST, etc.)
        table [Any]: DynamoDB Table resource for roles

    Returns:
        Tuple[bool, str]: (True, "All permissions satisfied") if allowed, 
                          else (False, error message)
    """
    try:
        response = table.get_item(Key={"Role": role})
    except AttributeError:
        LOGGER.exception("IN rbac.is_user_action_valid: DynamoDB get_item failed for role %s", role)
        return False, "DynamoDB get_item failed for role"

    if "Item" not in response:
        LOGGER.warning("IN rbac.is_user_action_valid: role %r not found", role)
        return False, "Role not found in table"

    item = response["Item"]
    users = item.get("Users", [])
    if user_id not in users:
        LOGGER.info("IN rbac.is_user_action_valid: user %r not in role %r", user_id, role)
        return False, "User not in role"

    role_perms = item.get("Permissions", [])
    api_mapping = load_api_mapping()
    api_perms = api_mapping.get(resource, {}).get(method, [])
    if not api_perms:
        LOGGER.info("IN rbac.is_user_action_valid: no API permissions found for %s %s", resource, method)
        return False, "No API permissions found for resource"

    missing_perms = []
    insufficient_perms = []
    for perm in api_perms:
        try:
            key, req_level = perm.strip().lower().split(".", 1)
            req_rank = LEVEL_RANK.get(req_level, 0)
            LOGGER.info("IN rbac.is_user_action_valid: checking required perm %r (rank %d)", perm, req_rank)
        except ValueError:
            LOGGER.warning("IN rbac.is_user_action_valid: malformed API-perm entry: %r", perm)
            continue

        match_found = False
        for rp in role_perms:
            try:
                perm_key, perm_level = rp.strip().lower().split(".", 1)
                LOGGER.info("IN rbac.is_user_action_valid: role has perm %r.%r", perm_key, perm_level)
            except ValueError:
                LOGGER.warning("IN rbac.is_user_action_valid: malformed role-perm entry: %r", rp)
                continue

            if perm_key == key:
                match_found = True
                if LEVEL_RANK.get(perm_level, 0) < req_rank:
                    insufficient_perms.append(f"{key} (need {req_level})")
                    LOGGER.info("IN rbac.is_user_action_valid: insufficient level for %s", key)
                break
        if not match_found:
            missing_perms.append(key)
            LOGGER.info("IN rbac.is_user_action_valid: missing permission for key %s", key)

    errors = []
    if missing_perms:
        errors.append(f"Missing permissions: {', '.join(missing_perms)}")
    if insufficient_perms:
        errors.append(f"Insufficient level for: {', '.join(insufficient_perms)}")

    if errors:
        return False, " ".join(errors)

    return True, "All permissions satisfied"


def sync_system_roles(table: Any, roles_mapping: Optional[Dict[str, Any]] = None, path: str = "/opt/python/RBAC/role_permission_mapping.json") -> None:
    """
    Upsert system roles and their permissions from JSON mapping.

    Key steps:
        1. Load the roles mapping from file if not provided.
        2. For each role, upsert into DynamoDB with SYSTEM metadata.
        3. Log success or propagate failures.

    Params:
        table [Any]: DynamoDB Table resource for roles
        roles_mapping [Optional[Dict[str, Any]]]: pre-loaded mapping of roles
        path [str]: filesystem path to the JSON roles mapping file

    Returns:
        None
    """
    if roles_mapping is None:
        try:
            with open(path, "r", encoding="utf-8") as f:
                roles_mapping = json.load(f)
                LOGGER.info("IN rbac.sync_system_roles: loaded roles mapping from %s", path)
        except (OSError, json.JSONDecodeError):
            LOGGER.exception("IN rbac.sync_system_roles: failed to load roles mapping from %s", path)
            return

    LOGGER.info("IN rbac.sync_system_roles: syncing %d roles", len(roles_mapping))

    for role_name, permissions in roles_mapping.items():
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        try:
            LOGGER.info("IN rbac.sync_system_roles: upserting role %r with perms %r", role_name, permissions)
            table.update_item(
                Key={"Role": role_name},
                UpdateExpression="""
                    SET #perms           = :perms,
                        CreationTime     = if_not_exists(CreationTime, :now),
                        LastUpdationTime = :now,
                        CreatedBy        = if_not_exists(CreatedBy, :system),
                        LastUpdatedBy    = :system
                """,
                ExpressionAttributeNames={"#perms": "Permissions"},
                ExpressionAttributeValues={
                    ":perms": permissions,
                    ":now": now,
                    ":system": "SYSTEM",
                },
            )
            LOGGER.info("IN rbac.sync_system_roles: role %r upserted successfully", role_name)
        except AttributeError:
            LOGGER.exception("IN rbac.sync_system_roles: error upserting role %r", role_name)
            raise
