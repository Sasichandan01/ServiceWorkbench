import logging
import json
import boto3
import botocore
from RBAC.rbac import sync_system_roles
from CustomResource.custom_resource import send_cfn_response

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

DYNAMODB_RESOURCE = boto3.resource('dynamodb')

def handler(event, context):
    """
    Custom resource to add roles to the Roles Table.
    """
    try:
        # get the resource properties that are passed from cloudformation to lambda function
        props = event.get('ResourceProperties', {})
        roles_table = props.get('RolesTable')
        table = DYNAMODB_RESOURCE.Table(roles_table)
        # load the role permission mapping from the json file
        with open('RBAC/role_permission_mapping.json', 'r', encoding='utf-8') as f:
            role_mapping = json.load(f)
        # add roles to the table in a batch writer
        sync_system_roles(table, role_mapping)
        send_cfn_response(event, context, "SUCCESS")
    except botocore.exceptions.ClientError as e:
        LOGGER.exception("AWS ClientError: %s", e)
        send_cfn_response(event, context, "FAILED", reason=str(e))
    except KeyError as e:
        LOGGER.exception("Missing key: %s", e)
        send_cfn_response(event, context, "FAILED", reason=f"Missing key: {e}")
    except TypeError as e:
        LOGGER.exception("Type error: %s", e)
        send_cfn_response(event, context, "FAILED", reason=str(e))
    except Exception as e:
        LOGGER.exception("Error in handler: %s", e)
        send_cfn_response(event, context, "FAILED", reason=str(e))
