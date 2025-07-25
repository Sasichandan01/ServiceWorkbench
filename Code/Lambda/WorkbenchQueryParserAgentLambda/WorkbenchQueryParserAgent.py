import json
import boto3
import logging
from datetime import datetime
from boto3.dynamodb.conditions import Key
import os
import uuid
from FGAC.fgac import create_datasource_fgac, check_datasource_access, create_solution_fgac, create_workspace_fgac, check_workspace_access, check_solution_access

# Set up logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

# Environment variables
RESOURCE_ACCESS_TABLE = os.environ['RESOURCE_ACCESS_TABLE']
DATASOURCE_TABLE_NAME = os.environ['DATASOURCE_TABLE_NAME']
WORKSPACE_TABLE_NAME = os.environ['WORKSPACE_TABLE_NAME']
SOLUTION_TABLE_NAME = os.environ['SOLUTION_TABLE_NAME']
SOLUTION_BUCKET_NAME = os.environ['SOLUTION_BUCKET_NAME']
table = dynamodb.Table(DATASOURCE_TABLE_NAME)
fgac_table = dynamodb.Table(RESOURCE_ACCESS_TABLE)

# Access level ranking
LEVEL_RANK = {"read_only": 1, "editor": 2, "owner": 3}

def build_agent_response(event, response_data):
    """Standard response builder without session tracking"""
    LOGGER.info(f"Building response: {response_data}")
    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": event["actionGroup"],
            "function": event.get("function", ""),
            "functionResponse": {
                "responseBody": {
                    "TEXT": {
                        "body": json.dumps(response_data) if isinstance(response_data, dict) else response_data
                    }
                }
            }
        }
    }

def check_access(user_id, resource_type, resource_id, required_access='read_only', workspace_id=None):
    """
    Unified access check function
    
    Args:
        user_id: ID of user requesting access
        resource_type: 'workspace', 'solution', or 'datasource'
        resource_id: ID of the resource being accessed
        required_access: Minimum required access level ('read_only', 'editor', 'owner')
        workspace_id: Required for solution access checks
        
    Returns:
        bool: True if access is granted, False otherwise
    """
    try:
        # Get the user's actual access level
        LOGGER.info(f"Checking access for user {user_id} to {resource_type} {resource_id}")
        if resource_type == 'workspace':
            LOGGER.info(f"Checking access for user {user_id} to {resource_type} {resource_id}")
            actual_access = check_workspace_access(fgac_table, user_id, resource_id)
        elif resource_type == 'solution':
            if not workspace_id:
                LOGGER.error("Workspace ID required for solution access check")
                return False
            actual_access = check_solution_access(fgac_table, user_id, workspace_id, resource_id)
        elif resource_type == 'datasource':
            LOGGER.info(f"Checking access for user {user_id} to {resource_type} {resource_id}")
            actual_access = check_datasource_access(fgac_table, user_id, resource_id)
        else:
            LOGGER.error(f"Invalid resource type: {resource_type}")
            return False
            
        if not actual_access:
            LOGGER.info(f"No access found for user {user_id} to {resource_type} {resource_id}")
            return False
            
        # Compare access levels
        required_rank = LEVEL_RANK.get(required_access, 0)
        actual_rank = LEVEL_RANK.get(actual_access, 0)
        
        return actual_rank >= required_rank
        
    except Exception as e:
        LOGGER.error(f"Error checking access: {str(e)}")
        return False

def get_id_from_name(table_name, name_field, id_field, name_index, resource_name):
    """Get resource ID from name using GSI lookup"""
    try:
        table = dynamodb.Table(table_name)
        response = table.query(
            IndexName=name_index,
            KeyConditionExpression=Key(name_field).eq(resource_name),
            ProjectionExpression=id_field,
            Limit=1
        )
        items = response.get('Items', [])
        return items[0][id_field] if items else None
    except Exception as e:
        LOGGER.error(f"Error resolving name {resource_name}: {str(e)}")
        return None



def validate_resource(event):
    """Validate resources with optimized name resolution and batch validation"""
    LOGGER.info("Validating resources with separated concerns")
    try:
        parameters = {p['name']: p['value'] for p in event.get('parameters', [])}
        resource_details = json.loads(parameters.get('resource_details', '{}'))
        LOGGER.info(f"Resource details: {resource_details}")

        # Extract user_id
        user_id = parameters.get('user_id')
        LOGGER.info(f"User ID: {user_id}")
        
        # Resource type configuration
        RESOURCE_CONFIG = {
            'datasources': {
                'table_env': 'DATASOURCE_TABLE_NAME',
                'id_field': 'DatasourceId',
                'name_field': 'DatasourceName',
                'name_index': 'DatasourceName-index',
                'resource_type': 'datasource'
            },
            'solutions': {
                'table_env': 'SOLUTION_TABLE_NAME',
                'id_field': 'SolutionId',
                'name_field': 'SolutionName',
                'name_index': 'SolutionName-index',
                'resource_type': 'solution'
            },
            'workspaces': {
                'table_env': 'WORKSPACE_TABLE_NAME',
                'id_field': 'WorkspaceId',
                'name_field': 'WorkspaceName',
                'name_index': 'WorkspaceName-index',
                'resource_type': 'workspace'
            }
        }

        results = {
            'validations': [],
            'all_valid': True,
            'messages': []
        }

        # First collect all workspace IDs needed for solution access checks
        workspace_ids = set()
        
        # Handle workspace names first since we need their IDs for solution access checks
        if 'workspaces_name' in resource_details and resource_details['workspaces_name']:
            for name in resource_details['workspaces_name']:
                workspace_id = get_id_from_name(
                    os.environ['WORKSPACE_TABLE_NAME'],
                    'WorkspaceName',
                    'WorkspaceId',
                    'WorkspaceName-index',
                    name
                )
                if workspace_id:
                    workspace_ids.add(workspace_id)
                    LOGGER.info(f"Resolved workspace name '{name}' to ID: {workspace_id}")
                else:
                    results['validations'].append({
                        'type': 'workspace',
                        'name': name,
                        'valid': False,
                        'message': "Workspace name not found"
                    })

        # Add any directly provided workspace IDs
        if 'workspaces_id' in resource_details:
            workspace_ids.update(resource_details['workspaces_id'])

        # For solutions, we need to get their workspace IDs
        solution_ids = set()
        if 'solutions_id' in resource_details:
            solution_ids.update(resource_details['solutions_id'])
            
        if 'solutions_name' in resource_details and resource_details['solutions_name']:
            for name in resource_details['solutions_name']:
                solution_id = get_id_from_name(
                    os.environ['SOLUTION_TABLE_NAME'],
                    'SolutionName',
                    'SolutionId',
                    'SolutionName-index',
                    name
                )
                if solution_id:
                    solution_ids.add(solution_id)
                    LOGGER.info(f"Resolved solution name '{name}' to ID: {solution_id}")
                else:
                    results['validations'].append({
                        'type': 'solution',
                        'name': name,
                        'valid': False,
                        'message': "Solution name not found"
                    })

        # Get workspace IDs for solutions by querying the solution table
        solution_workspace_map = {}
        if solution_ids:
            LOGGER.info(f"Processing {len(solution_ids)} solutions: {solution_ids}")
            solution_table = dynamodb.Table(os.environ['SOLUTION_TABLE_NAME'])
            
            # If we have workspace context, validate solutions within those workspaces
            if workspace_ids:
                LOGGER.info(f"Checking solutions in {len(workspace_ids)} workspaces: {workspace_ids}")
                for solution_id in solution_ids:
                    found_in_workspace = False
                    for workspace_id in workspace_ids:
                        try:
                            response = solution_table.get_item(
                                Key={
                                    'WorkspaceId': workspace_id,
                                    'SolutionId': str(solution_id)
                                },
                                ProjectionExpression='SolutionId, WorkspaceId, SolutionName'
                            )
                            if 'Item' in response:
                                solution_workspace_map[solution_id] = workspace_id
                                found_in_workspace = True
                                LOGGER.info(f"Found solution {solution_id} in workspace {workspace_id}")
                                break  # Found it, no need to check other workspaces
                        except Exception as e:
                            LOGGER.error(f"Error checking solution {solution_id} in workspace {workspace_id}: {str(e)}")
                    
                    if not found_in_workspace:
                        LOGGER.warning(f"Solution {solution_id} not found in any of the provided workspaces")
                        # We'll handle this in the validation section below
            else:
                # If no workspace context is provided, we need to scan to find which workspaces contain these solutions
                # This is less efficient but necessary when workspace context is missing
                LOGGER.warning("No workspace context provided for solution validation - will attempt to find solutions across all accessible workspaces")
                
                # For now, we'll mark these as invalid since we can't validate without workspace context
                for solution_id in solution_ids:
                    results['validations'].append({
                        'type': 'solution',
                        'id': solution_id,
                        'valid': False,
                        'message': "Cannot validate solution - no workspace context provided"
                    })
        else:
            LOGGER.info("No solution IDs to process")

        # Check workspace access first (needed for solution access)
        workspace_access = {}
        for workspace_id in workspace_ids:
            LOGGER.info(f"Checking workspace access for user {user_id} to workspace {workspace_id}")
            if check_access(user_id, 'workspace', workspace_id, 'read_only'):
                workspace_access[workspace_id] = True
                LOGGER.info(f"Access granted for user {user_id} to workspace {workspace_id}")
            else:
                workspace_access[workspace_id] = False
                results['validations'].append({
                    'type': 'workspace',
                    'id': workspace_id,
                    'valid': False,
                    'message': "Access denied"
                })
                LOGGER.info(f"Access denied for user {user_id} to workspace {workspace_id}")

        # Process datasources
        datasource_ids = set()
        if 'datasources_id' in resource_details:
            datasource_ids.update(resource_details['datasources_id'])
            
        if 'datasources_name' in resource_details and resource_details['datasources_name']:
            for name in resource_details['datasources_name']:
                datasource_id = get_id_from_name(
                    os.environ['DATASOURCE_TABLE_NAME'],
                    'DatasourceName',
                    'DatasourceId',
                    'DatasourceName-index',
                    name
                )
                if datasource_id:
                    datasource_ids.add(datasource_id)
                    LOGGER.info(f"Resolved datasource name '{name}' to ID: {datasource_id}")
                else:
                    results['validations'].append({
                        'type': 'datasource',
                        'name': name,
                        'valid': False,
                        'message': "Datasource name not found"
                    })

        # Validate and check access for all resources
        for resource_type, config in RESOURCE_CONFIG.items():
            if config['table_env'] not in os.environ:
                continue
                
            ids = []
            if resource_type == 'datasources':
                ids = list(datasource_ids)
            elif resource_type == 'solutions':
                ids = list(solution_ids)
            elif resource_type == 'workspaces':
                ids = list(workspace_ids)
            
            LOGGER.info(f"Processing {resource_type} with {len(ids)} IDs: {ids}")
                
            if ids:
                # For solutions, we need special handling due to composite keys
                if resource_type == 'solutions':
                    LOGGER.info(f"Processing solutions with workspace mapping: {solution_workspace_map}")
                    for solution_id in ids:
                        workspace_id = solution_workspace_map.get(solution_id)
                        if workspace_id:
                            try:
                                # Validate the solution exists
                                solution_table = dynamodb.Table(os.environ['SOLUTION_TABLE_NAME'])
                                response = solution_table.get_item(
                                    Key={
                                        'WorkspaceId': workspace_id,
                                        'SolutionId': str(solution_id)
                                    },
                                    ProjectionExpression='SolutionId, SolutionName, WorkspaceId'
                                )
                                
                                if 'Item' in response:
                                    # Check if user has access to the parent workspace
                                    if workspace_access.get(workspace_id, False):
                                        # Check solution-specific access
                                        access_granted = check_access(
                                            user_id, 
                                            'solution', 
                                            solution_id, 
                                            'read_only',
                                            workspace_id
                                        )
                                        
                                        if access_granted:
                                            results['validations'].append({
                                                'type': 'solution',
                                                'id': solution_id,
                                                'name': response['Item'].get('SolutionName'),
                                                'valid': True,
                                                'accessible': True
                                            })
                                        else:
                                            results['validations'].append({
                                                'type': 'solution',
                                                'id': solution_id,
                                                'name': response['Item'].get('SolutionName'),
                                                'valid': True,
                                                'accessible': False,
                                                'message': "Access denied"
                                            })
                                    else:
                                        results['validations'].append({
                                            'type': 'solution',
                                            'id': solution_id,
                                            'valid': True,
                                            'accessible': False,
                                            'message': "Parent workspace access not available"
                                        })
                                else:
                                    results['validations'].append({
                                        'type': 'solution',
                                        'id': solution_id,
                                        'valid': False,
                                        'message': "Solution not found"
                                    })
                            except Exception as e:
                                LOGGER.error(f"Error validating solution {solution_id}: {str(e)}")
                                results['validations'].append({
                                    'type': 'solution',
                                    'id': solution_id,
                                    'valid': False,
                                    'message': f"Validation error: {str(e)}"
                                })
                        else:
                            # Solution not found in any of the provided workspaces
                            results['validations'].append({
                                'type': 'solution',
                                'id': solution_id,
                                'valid': False,
                                'message': "Solution not found in provided workspace(s)"
                            })
                else:
                    # Handle workspaces and datasources with standard batch validation
                    valid_items = validate_ids(
                        os.environ[config['table_env']],
                        config['id_field'],
                        config['name_field'],
                        ids
                    )
                    LOGGER.info(f"Valid items for {resource_type}: {valid_items}")
                    
                    for id in ids:
                        if id in valid_items:
                            access_granted = False
                            if config['resource_type'] == 'workspace':
                                access_granted = workspace_access.get(id, False)
                            elif config['resource_type'] == 'datasource':
                                access_granted = check_access(
                                    user_id,
                                    'datasource',
                                    id,
                                    'read_only'
                                )
                                
                            if access_granted:
                                results['validations'].append({
                                    'type': resource_type[:-1],
                                    'id': id,
                                    'name': valid_items[id].get(config['name_field']),
                                    'valid': True,
                                    'accessible': True
                                })
                            else:
                                results['validations'].append({
                                    'type': resource_type[:-1],
                                    'id': id,
                                    'name': valid_items[id].get(config['name_field']),
                                    'valid': True,
                                    'accessible': False,
                                    'message': "Access denied"
                                })
                        else:
                            results['validations'].append({
                                'type': resource_type[:-1],
                                'id': id,
                                'valid': False,
                                'message': f"{resource_type[:-1]} ID not found"
                            })

        # Calculate overall status (both validation and access)
        results['all_valid'] = all(
            item['valid'] and item.get('accessible', True) 
            for item in results['validations']
            if 'valid' in item
        )
        
        return build_agent_response(event, results)

    except Exception as e:
        LOGGER.error(f"Validation error: {str(e)}")
        return build_agent_response(event, {
            'valid': False,
            'message': f"Validation failed: {str(e)}"
        })

def validate_ids(table_name, id_field, name_field, ids, workspace_id=None):
    """Batch validate resource IDs with support for composite keys"""
    try:
        if not ids:
            return {}
            
        table = dynamodb.Table(table_name)
        
        # Special handling for Solution table's composite key
        if table_name == os.environ['SOLUTION_TABLE_NAME']:
            if not workspace_id:
                LOGGER.error("Workspace ID required for solution validation")
                return {}
                
            # For solutions, we need to query individually since they have composite keys
            valid_items = {}
            for solution_id in ids:
                try:
                    response = table.get_item(
                        Key={
                            'WorkspaceId': workspace_id,
                            'SolutionId': str(solution_id)
                        },
                        ProjectionExpression=f"{id_field}, {name_field}"
                    )
                    if 'Item' in response:
                        valid_items[solution_id] = response['Item']
                except Exception as e:
                    LOGGER.error(f"Error validating solution {solution_id}: {str(e)}")
            return valid_items
        else:
            # Standard handling for other tables
            response = table.meta.client.batch_get_item(
                RequestItems={
                    table.name: {
                        'Keys': [{id_field: str(id)} for id in ids],
                        'ConsistentRead': True,
                        'ProjectionExpression': f"{id_field}, {name_field}"
                    }
                }
            )
            return {item[id_field]: item for item in response.get('Responses', {}).get(table.name, [])}
            
    except Exception as e:
        LOGGER.error(f"Error batch validating IDs: {str(e)}")
        return {}

def store_solution_spec(event):
    LOGGER.info("Storing solution specification (append mode)")
    try:
        # Extract and validate input
        result_param = next(
            (p['value'] for p in event['parameters'] 
             if p['name'] == 'result'),
            None
        )

        if not result_param:
            raise ValueError("Missing 'result' parameter in event")

        # Extract workspace_id and solution_id from parameters
        workspace_id = next(
            (p['value'] for p in event['parameters'] if p['name'] == 'workspace_id'),
            None
        )
        solution_id = next(
            (p['value'] for p in event['parameters'] if p['name'] == 'solution_id'),
            None
        )

        if not workspace_id or not solution_id:
            raise ValueError("Missing workspace_id or solution_id in event parameters")

        LOGGER.info(f"Workspace ID: {workspace_id}")
        LOGGER.info(f"Solution ID: {solution_id}")

        storage_request = json.loads(result_param)
        new_entry = json.dumps(storage_request['body'])

        # Use a fixed key for now (e.g., one file for each user/solution)
        s3_key = f"workspaces/{workspace_id}/solutions/{solution_id}/memory.json"

        # Try reading existing content (if it exists)
        try:
            existing_obj = s3.get_object(Bucket=SOLUTION_BUCKET_NAME, Key=s3_key)
            existing_content = existing_obj['Body'].read().decode('utf-8')
        except s3.exceptions.NoSuchKey:
            existing_content = ""

        # Append new entry with newline
        updated_content = existing_content + new_entry + "\n"

        # Save updated file
        s3.put_object(
            Bucket=SOLUTION_BUCKET_NAME,
            Key=s3_key,
            Body=updated_content.encode('utf-8'),
            ContentType='application/json'
        )

        return build_agent_response(event, {
            "status": "success",
            "s3_location": f"s3://{SOLUTION_BUCKET_NAME}/{s3_key}",
            "stored_entry": storage_request['body']
        })

    except json.JSONDecodeError as e:
        LOGGER.error(f"Invalid JSON format: {str(e)}")
        return build_agent_response(event, {
            "status": "error",
            "message": f"Invalid JSON format: {str(e)}"
        })
    except Exception as e:
        LOGGER.error(f"Storage failed: {str(e)}")
        return build_agent_response(event, {
            "status": "error",
            "message": str(e)
        })


def lambda_handler(event, context):
    """Lambda entry point without session tracking"""
    try:
        LOGGER.info(f"Received event: {json.dumps(event)}")

        LOGGER.info(f"Processing event for function: {event.get('function')}")
        
        if event.get("function") == "validate_resource":
            return validate_resource(event)
        elif event.get("function") == "store_solution":
            return store_solution_spec(event)
            
        return build_agent_response(event, {
            "status": "error",
            "message": "Invalid function"
        })
        
    except Exception as e:
        LOGGER.error(f"Handler error: {str(e)}")
        return build_agent_response(event, {
            "status": "error",
            "message": "Processing failed"
        })