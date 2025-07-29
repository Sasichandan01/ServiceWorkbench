import json
import boto3
import logging
from datetime import datetime
from boto3.dynamodb.conditions import Key
import os
import uuid
from FGAC.fgac import create_datasource_fgac, check_datasource_access, create_solution_fgac, create_workspace_fgac, check_workspace_access, check_solution_access

# Set up logging with enhanced format
try:
    LOGGER = logging.getLogger()
    LOGGER.setLevel(logging.INFO)
    LOGGER.info("IN develop-QueryParserLambdaFunction.lambda_handler(), Initializing logger")
except Exception as e:
    print(f"Failed to initialize logger: {str(e)}")
    raise

# Initialize AWS clients with error handling
try:
    LOGGER.info("IN develop-QueryParserLambdaFunction, Initializing AWS clients")
    dynamodb = boto3.resource('dynamodb')
    s3 = boto3.client('s3')
    
    # Environment variables with validation
    REQUIRED_ENV_VARS = [
        'RESOURCE_ACCESS_TABLE',
        'DATASOURCE_TABLE_NAME',
        'WORKSPACE_TABLE_NAME',
        'SOLUTION_TABLE_NAME',
        'SOLUTION_BUCKET_NAME'
    ]
    
    for var in REQUIRED_ENV_VARS:
        if var not in os.environ:
            raise ValueError(f"Missing required environment variable: {var}")
    
    RESOURCE_ACCESS_TABLE = os.environ['RESOURCE_ACCESS_TABLE']
    DATASOURCE_TABLE_NAME = os.environ['DATASOURCE_TABLE_NAME']
    WORKSPACE_TABLE_NAME = os.environ['WORKSPACE_TABLE_NAME']
    SOLUTION_TABLE_NAME = os.environ['SOLUTION_TABLE_NAME']
    SOLUTION_BUCKET_NAME = os.environ['SOLUTION_BUCKET_NAME']
    
    # Initialize DynamoDB tables
    table = dynamodb.Table(DATASOURCE_TABLE_NAME)
    fgac_table = dynamodb.Table(RESOURCE_ACCESS_TABLE)
    
    # Access level ranking configuration
    LEVEL_RANK = {"read_only": 1, "editor": 2, "owner": 3}
    
    LOGGER.info("IN develop-QueryParserLambdaFunction.lambda_handler(), AWS clients and environment variables initialized successfully")
except Exception as e:
    LOGGER.error(f"IN develop-QueryParserLambdaFunction.lambda_handler(), Initialization failed: {str(e)}")
    raise

def build_agent_response(event, response_data):
    """
    Constructs a standardized response format for agent communication.
    
    Args:
        event (dict): The incoming event object containing action details.
        response_data (dict/str): The data to be included in the response.
        
    Returns:
        dict: A properly formatted agent response object.
    """
    LOGGER.info("IN develop-QueryParserLambdaFunction.build_agent_response(), Building response")
    try:
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
    except Exception as e:
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.build_agent_response(), Error building response: {str(e)}")
        raise

def check_access(user_id, resource_type, resource_id, required_access='read_only', workspace_id=None):
    """
    Verifies if a user has the required access level for a specific resource.
    
    Args:
        user_id (str): ID of user requesting access.
        resource_type (str): Type of resource ('workspace', 'solution', or 'datasource').
        resource_id (str): ID of the resource being accessed.
        required_access (str): Minimum required access level ('read_only', 'editor', 'owner').
        workspace_id (str, optional): Required for solution access checks.
        
    Returns:
        bool: True if access is granted, False otherwise.
    """
    LOGGER.info(f"IN develop-QueryParserLambdaFunction.check_access(), Checking access for user {user_id} to {resource_type} {resource_id}")
    
    try:
        # Validate input parameters
        if not all([user_id, resource_type, resource_id]):
            LOGGER.error("IN develop-QueryParserLambdaFunction.check_access(), Missing required parameters")
            return False
            
        if resource_type not in ['workspace', 'solution', 'datasource']:
            LOGGER.error(f"IN develop-QueryParserLambdaFunction.check_access(), Invalid resource type: {resource_type}")
            return False
            
        if required_access not in LEVEL_RANK:
            LOGGER.error(f"IN develop-QueryParserLambdaFunction.check_access(), Invalid required access level: {required_access}")
            return False

        # Get the user's actual access level
        actual_access = None
        if resource_type == 'workspace':
            actual_access = check_workspace_access(fgac_table, user_id, resource_id)
        elif resource_type == 'solution':
            if not workspace_id:
                LOGGER.error("IN develop-QueryParserLambdaFunction.check_access(), Workspace ID required for solution access check")
                return False
            actual_access = check_solution_access(fgac_table, user_id, workspace_id, resource_id)
        elif resource_type == 'datasource':
            actual_access = check_datasource_access(fgac_table, user_id, resource_id)
            
        if not actual_access:
            LOGGER.info(f"IN develop-QueryParserLambdaFunction.check_access(), No access found for user {user_id} to {resource_type} {resource_id}")
            return False
            
        # Compare access levels using the predefined ranking
        required_rank = LEVEL_RANK.get(required_access, 0)
        actual_rank = LEVEL_RANK.get(actual_access, 0)
        
        LOGGER.info(f"IN develop-QueryParserLambdaFunction.check_access(), Access check result - required: {required_rank}, actual: {actual_rank}")
        return actual_rank >= required_rank
        
    except Exception as e:
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.check_access(), Error checking access: {str(e)}")
        return False

def get_id_from_name(table_name, name_field, id_field, name_index, resource_name):
    """
    Resolves a resource name to its ID using DynamoDB Global Secondary Index.
    
    Args:
        table_name (str): Name of the DynamoDB table.
        name_field (str): Field containing the resource name.
        id_field (str): Field containing the resource ID.
        name_index (str): Name of the GSI for name lookup.
        resource_name (str): Name of the resource to resolve.
        
    Returns:
        str: The resource ID if found, None otherwise.
    """
    LOGGER.info(f"IN develop-QueryParserLambdaFunction.get_id_from_name(), Resolving name {resource_name} from {table_name}")
    
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
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.get_id_from_name(), Error resolving name {resource_name}: {str(e)}")
        return None

def validate_resource(event):
    """
    Validates resource access and existence based on the provided event.
    
    Performs comprehensive validation of workspaces, solutions, and datasources,
    checking both their existence and user access permissions.
    
    Args:
        event (dict): The event object containing validation parameters.
        
    Returns:
        dict: A response object with validation results.
    """
    LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Starting resource validation")
    
    try:
        # Extract and parse parameters from the event
        parameters = {p['name']: p['value'] for p in event.get('parameters', [])}
        resource_details = json.loads(parameters.get('resource_details', '{}'))
        LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Resource details: {resource_details}")

        # Extract user_id for access checks
        user_id = parameters.get('user_id')
        if not user_id:
            LOGGER.error("IN develop-QueryParserLambdaFunction.validate_resource(), Missing user_id in parameters")
            return build_agent_response(event, {
                'valid': False,
                'message': "User ID is required for validation"
            })
            
        LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Validating resources for user: {user_id}")

        # Resource type configuration for dynamic processing
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

        # Initialize results container
        results = {
            'validations': [],
            'all_valid': True,
            'messages': []
        }

        # First collect all workspace IDs needed for solution access checks
        workspace_ids = set()
        
        # Process workspace names first (needed for solution validation)
        if 'workspaces_name' in resource_details and resource_details['workspaces_name']:
            LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Processing workspace names")
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
                    LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Resolved workspace name '{name}' to ID: {workspace_id}")
                else:
                    results['validations'].append({
                        'type': 'workspace',
                        'name': name,
                        'valid': False,
                        'message': "Workspace name not found"
                    })

        # Add any directly provided workspace IDs
        if 'workspaces_id' in resource_details:
            LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Processing workspace IDs")
            workspace_ids.update(resource_details['workspaces_id'])

        # Process solution names and IDs
        solution_ids = set()
        if 'solutions_id' in resource_details:
            LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Processing solution IDs")
            solution_ids.update(resource_details['solutions_id'])
            
        if 'solutions_name' in resource_details and resource_details['solutions_name']:
            LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Processing solution names")
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
                    LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Resolved solution name '{name}' to ID: {solution_id}")
                else:
                    results['validations'].append({
                        'type': 'solution',
                        'name': name,
                        'valid': False,
                        'message': "Solution name not found"
                    })

        # Map solutions to their workspaces (required for solution access checks)
        solution_workspace_map = {}
        if solution_ids:
            LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Processing {len(solution_ids)} solutions")
            solution_table = dynamodb.Table(os.environ['SOLUTION_TABLE_NAME'])
            
            # If we have workspace context, validate solutions within those workspaces
            if workspace_ids:
                LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Checking solutions in {len(workspace_ids)} workspaces")
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
                                LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Found solution {solution_id} in workspace {workspace_id}")
                                break
                        except Exception as e:
                            LOGGER.error(f"IN develop-QueryParserLambdaFunction.validate_resource(), Error checking solution {solution_id} in workspace {workspace_id}: {str(e)}")
                    
                    if not found_in_workspace:
                        LOGGER.warning(f"IN develop-QueryParserLambdaFunction.validate_resource(), Solution {solution_id} not found in any provided workspace")
            else:
                LOGGER.warning("IN develop-QueryParserLambdaFunction.validate_resource(), No workspace context for solution validation")
                for solution_id in solution_ids:
                    results['validations'].append({
                        'type': 'solution',
                        'id': solution_id,
                        'valid': False,
                        'message': "Cannot validate solution without workspace context"
                    })

        # Check workspace access (needed for solution access checks)
        workspace_access = {}
        for workspace_id in workspace_ids:
            LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Checking access to workspace {workspace_id}")
            if check_access(user_id, 'workspace', workspace_id, 'read_only'):
                workspace_access[workspace_id] = True
                LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Access granted to workspace {workspace_id}")
            else:
                workspace_access[workspace_id] = False
                results['validations'].append({
                    'type': 'workspace',
                    'id': workspace_id,
                    'valid': False,
                    'message': "Access denied"
                })
                LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Access denied to workspace {workspace_id}")

        # Process datasources
        datasource_ids = set()
        if 'datasources_id' in resource_details:
            LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Processing datasource IDs")
            datasource_ids.update(resource_details['datasources_id'])
            
        if 'datasources_name' in resource_details and resource_details['datasources_name']:
            LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Processing datasource names")
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
                    LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Resolved datasource name '{name}' to ID: {datasource_id}")
                else:
                    results['validations'].append({
                        'type': 'datasource',
                        'name': name,
                        'valid': False,
                        'message': "Datasource name not found"
                    })

        # Validate and check access for all resource types
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
            
            LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Processing {len(ids)} {resource_type}")
                
            if ids:
                # Special handling for solutions (composite keys)
                if resource_type == 'solutions':
                    LOGGER.info("IN develop-QueryParserLambdaFunction.validate_resource(), Processing solutions with workspace mapping")
                    for solution_id in ids:
                        workspace_id = solution_workspace_map.get(solution_id)
                        if workspace_id:
                            try:
                                # Validate solution exists
                                solution_table = dynamodb.Table(os.environ['SOLUTION_TABLE_NAME'])
                                response = solution_table.get_item(
                                    Key={
                                        'WorkspaceId': workspace_id,
                                        'SolutionId': str(solution_id)
                                    },
                                    ProjectionExpression='SolutionId, SolutionName, WorkspaceId'
                                )
                                
                                if 'Item' in response:
                                    # Check workspace access first
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
                                LOGGER.error(f"IN develop-QueryParserLambdaFunction.validate_resource(), Error validating solution {solution_id}: {str(e)}")
                                results['validations'].append({
                                    'type': 'solution',
                                    'id': solution_id,
                                    'valid': False,
                                    'message': f"Validation error: {str(e)}"
                                })
                        else:
                            results['validations'].append({
                                'type': 'solution',
                                'id': solution_id,
                                'valid': False,
                                'message': "Solution not found in provided workspace(s)"
                            })
                else:
                    # Standard handling for workspaces and datasources
                    valid_items = validate_ids(
                        os.environ[config['table_env']],
                        config['id_field'],
                        config['name_field'],
                        ids
                    )
                    LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Valid items for {resource_type}: {valid_items}")
                    
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

        # Calculate overall validation status
        results['all_valid'] = all(
            item['valid'] and item.get('accessible', True) 
            for item in results['validations']
            if 'valid' in item
        )
        
        LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_resource(), Validation complete. Results: {results}")
        return build_agent_response(event, results)

    except Exception as e:
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.validate_resource(), Validation failed: {str(e)}")
        return build_agent_response(event, {
            'valid': False,
            'message': f"Validation failed: {str(e)}"
        })

def validate_ids(table_name, id_field, name_field, ids, workspace_id=None):
    """
    Batch validates resource IDs against DynamoDB.
    
    Args:
        table_name (str): Name of the DynamoDB table.
        id_field (str): Name of the ID field.
        name_field (str): Name of the name field.
        ids (list): List of IDs to validate.
        workspace_id (str, optional): Required for solution validation.
        
    Returns:
        dict: Dictionary of valid items with their names.
    """
    LOGGER.info(f"IN develop-QueryParserLambdaFunction.validate_ids(), Validating {len(ids)} IDs in {table_name}")
    
    try:
        if not ids:
            return {}
            
        table = dynamodb.Table(table_name)
        
        # Special handling for Solution table's composite key
        if table_name == os.environ['SOLUTION_TABLE_NAME']:
            if not workspace_id:
                LOGGER.error("IN develop-QueryParserLambdaFunction.validate_ids(), Workspace ID required for solution validation")
                return {}
                
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
                    LOGGER.error(f"IN develop-QueryParserLambdaFunction.validate_ids(), Error validating solution {solution_id}: {str(e)}")
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
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.validate_ids(), Error validating IDs: {str(e)}")
        return {}

def store_solution_spec(event):
    """
    Stores solution specifications in S3 with append functionality.
    
    Args:
        event (dict): The event object containing storage parameters.
        
    Returns:
        dict: A response object with storage status and location.
    """
    LOGGER.info("IN develop-QueryParserLambdaFunction.store_solution_spec(), Storing solution specification")
    
    try:
        # Extract and validate input parameters
        result_param = next(
            (p['value'] for p in event['parameters'] 
             if p['name'] == 'result'),
            None
        )

        if not result_param:
            raise ValueError("Missing 'result' parameter in event")

        # Extract required IDs from parameters
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

        LOGGER.info(f"IN develop-QueryParserLambdaFunction.store_solution_spec(), Storing for workspace {workspace_id}, solution {solution_id}")

        # Parse the storage request
        storage_request = json.loads(result_param)
        new_entry = json.dumps(storage_request['body'])

        # Construct S3 key path
        s3_key = f"workspaces/{workspace_id}/solutions/{solution_id}/memory.json"

        # Try reading existing content (if it exists)
        try:
            existing_obj = s3.get_object(Bucket=SOLUTION_BUCKET_NAME, Key=s3_key)
            existing_content = existing_obj['Body'].read().decode('utf-8')
        except s3.exceptions.NoSuchKey:
            existing_content = ""

        # Append new entry with newline
        updated_content = existing_content + new_entry + "\n"

        # Save updated file to S3
        s3.put_object(
            Bucket=SOLUTION_BUCKET_NAME,
            Key=s3_key,
            Body=updated_content.encode('utf-8'),
            ContentType='application/json'
        )

        LOGGER.info(f"IN develop-QueryParserLambdaFunction.store_solution_spec(), Successfully stored at {s3_key}")
        return build_agent_response(event, {
            "status": "success",
            "s3_location": f"s3://{SOLUTION_BUCKET_NAME}/{s3_key}",
            "stored_entry": storage_request['body']
        })

    except json.JSONDecodeError as e:
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.store_solution_spec(), Invalid JSON format: {str(e)}")
        return build_agent_response(event, {
            "status": "error",
            "message": f"Invalid JSON format: {str(e)}"
        })
    except Exception as e:
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.store_solution_spec(), Storage failed: {str(e)}")
        return build_agent_response(event, {
            "status": "error",
            "message": str(e)
        })

def lambda_handler(event, context):
    """
    Entry point for the Lambda function. Routes incoming events to the appropriate
    handler function based on the event's function parameter.
    
    Args:
        event (dict): The event object containing function parameters.
        context (LambdaContext): The runtime context of the Lambda function.
        
    Returns:
        dict: A properly formatted response for the agent framework.
    """
    LOGGER.info("IN develop-QueryParserLambdaFunction.lambda_handler(), Processing event")
    
    try:
        LOGGER.info(f"IN develop-QueryParserLambdaFunction.lambda_handler(), Received event: {json.dumps(event)}")
        
        # Route to the appropriate function based on the event
        if event.get("function") == "validate_resource":
            LOGGER.info("IN develop-QueryParserLambdaFunction.lambda_handler(), Routing to validate_resource")
            return validate_resource(event)
        elif event.get("function") == "store_solution":
            LOGGER.info("IN develop-QueryParserLambdaFunction.lambda_handler(), Routing to store_solution_spec")
            return store_solution_spec(event)
            
        LOGGER.error("IN develop-QueryParserLambdaFunction.lambda_handler(), Invalid function specified")
        return build_agent_response(event, {
            "status": "error",
            "message": "Invalid function"
        })
        
    except Exception as e:
        LOGGER.error(f"IN develop-QueryParserLambdaFunction.lambda_handler(), Handler error: {str(e)}")
        return build_agent_response(event, {
            "status": "error",
            "message": "Processing failed"
        })