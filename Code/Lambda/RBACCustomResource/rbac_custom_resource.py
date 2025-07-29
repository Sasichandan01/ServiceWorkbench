import logging
import json
import boto3
import botocore
from RBAC.rbac import sync_system_roles
from CustomResource.custom_resource import send_cfn_response

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

DYNAMODB_RESOURCE = boto3.resource('dynamodb')


def lambda_handler(event, context):
    """
    Handle CloudFormation Custom Resource for seeding system roles.

    Key steps:
        1. Extract RolesTable property from the event.
        2. Load role-permission mapping from JSON.
        3. Upsert roles into the DynamoDB table.
        4. Send success or failure response back to CloudFormation.

    Params:
        event [dict]: CloudFormation Custom Resource event payload
        context [object]: AWS Lambda context

    Returns:
        None
    """
    LOGGER.info(
        "IN custom_resource_roles.lambda_handler, received event: %s", event
    )
    try:
        props = event.get('ResourceProperties', {})
        roles_table_name = props.get('RolesTable')
        LOGGER.info(
            "IN custom_resource_roles.lambda_handler, RolesTable property: %s", roles_table_name
        )

        table = DYNAMODB_RESOURCE.Table(roles_table_name)

        mapping_path = '/opt/python/RBAC/role_permission_mapping.json'
        LOGGER.info(
            "IN custom_resource_roles.lambda_handler, loading role mapping from %s", mapping_path
        )
        with open(mapping_path, 'r', encoding='utf-8') as f:
            role_mapping = json.load(f)

        LOGGER.info(
            "IN custom_resource_roles.lambda_handler, syncing %d roles", len(role_mapping)
        )
        sync_system_roles(table, role_mapping)

        LOGGER.info(
            "IN custom_resource_roles.lambda_handler, roles synchronized successfully"
        )
        send_cfn_response(event, context, "SUCCESS")

    except botocore.exceptions.ClientError as e:
        LOGGER.exception(
            "IN custom_resource_roles.lambda_handler, AWS ClientError: %s", e
        )
        send_cfn_response(event, context, "FAILED", reason=str(e))
    except KeyError as e:
        LOGGER.exception(
            "IN custom_resource_roles.lambda_handler, Missing key: %s", e
        )
        send_cfn_response(event, context, "FAILED", reason=f"Missing key: {e}")
    except TypeError as e:
        LOGGER.exception(
            "IN custom_resource_roles.lambda_handler, Type error: %s", e
        )
        send_cfn_response(event, context, "FAILED", reason=str(e))
    except Exception as e:
        LOGGER.exception(
            "IN custom_resource_roles.lambda_handler, Unexpected error: %s", e
        )
        send_cfn_response(event, context, "FAILED", reason=str(e))
