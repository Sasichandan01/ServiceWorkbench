import logging
from datetime import datetime

# set up logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)


def add_roles_to_table(table, roles_mapping):
    """
    Function to add roles to the table in a batch writer.
    """
    try:
        LOGGER.info("Adding roles to the table: %s", roles_mapping)
        # add roles to the table in a batch writer
        with table.batch_writer() as batch:
            for role, permissions in roles_mapping.items():
                current_time = datetime.now().isoformat()
                batch.put_item(
                    Item={
                        "Role": role,
                        "Permissions": permissions,
                        "CreationTime": current_time,
                        "CreatedBy": "SYSTEM",
                        "UpdatedTime": current_time,
                        "UpdatedBy": "SYSTEM"
                    }
                )
        LOGGER.info("Roles added to the table: %s", roles_mapping)
    except Exception as e:
        LOGGER.exception("Error adding roles to the table: %s", e)
        raise
