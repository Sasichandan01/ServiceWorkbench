import yaml
import os
import boto3
import time
import json
import urllib3
from typing import Dict, Optional, Tuple, List
from botocore.exceptions import ClientError
import logging

# Environment variables
ENVIRONMENT = os.environ.get("ENVIRONMENT")
AGENTS_TABLE_NAME = os.environ.get("AGENTS_TABLE_NAME")
AGENT_EXECUTION_ROLE = os.environ.get("AGENT_EXECUTION_ROLE")
AWS_REGION = "us-east-1"
ACCOUNT_ID = "043309350924"

# AWS Clients
LAMBDA_CLIENT = boto3.client('lambda')
BEDROCK_AGENTS_CLIENT = boto3.client('bedrock-agent')
DYNAMODB_CLIENT = boto3.client('dynamodb')

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

def send_response(event, context, response_status, response_data=None, physical_resource_id=None, reason=None):
    """
    Send response to CloudFormation for custom resource.
    
    Key Steps:
        1. Prepare response body with status, reason, and data
        2. Convert response to JSON format
        3. Set appropriate headers for HTTP request
        4. Send PUT request to CloudFormation response URL
        5. Log the response status
    
    Parameters:
        event (dict): CloudFormation event containing response URL and metadata
        context (object): Lambda context object
        response_status (str): Status to send ('SUCCESS' or 'FAILED')
        response_data (dict, optional): Additional data to include in response
        physical_resource_id (str, optional): Physical resource identifier
        reason (str, optional): Reason for success/failure
    
    Returns:
        None: Sends HTTP response to CloudFormation
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.send_response(), sending response to CloudFormation - Status: {response_status}")
    
    if response_data is None:
        response_data = {}
    
    if physical_resource_id is None:
        physical_resource_id = context.log_group_name
    
    if reason is None:
        reason = f"See CloudWatch Log Stream: {context.log_stream_name}"
    
    response_body = {
        'Status': response_status,
        'Reason': reason,
        'PhysicalResourceId': physical_resource_id,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': response_data
    }
    
    json_response_body = json.dumps(response_body)
    
    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }
    
    try:
        http = urllib3.PoolManager()
        response = http.request('PUT', event['ResponseURL'], 
                              headers=headers, body=json_response_body)
        LOGGER.info(f"In AgentCustomResourceLambda.py.send_response(), CloudFormation response sent successfully - Status code: {response.status}")
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.send_response(), failed executing http.request(): {e}")

def substitute_env_vars(obj):
    """
    Recursively substitute environment variables in the config dict.
    
    Key Steps:
        1. Check if object is a dictionary and recursively process each value
        2. Check if object is a list and recursively process each item
        3. Check if object is a string and substitute known environment variables
        4. Return the processed object with substitutions made
    
    Parameters:
        obj: The object to process (dict, list, str, or other types)
    
    Returns:
        The same object type with environment variables substituted where applicable
    """
    if isinstance(obj, dict):
        return {k: substitute_env_vars(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [substitute_env_vars(i) for i in obj]
    elif isinstance(obj, str):
        if obj == "${KNOWLEDGE_BASE_ID}":
            substituted_value = os.environ.get("KNOWLEDGE_BASE_ID", obj)
            LOGGER.debug(f"In AgentCustomResourceLambda.py.substitute_env_vars(), substituted {obj} with {substituted_value}")
            return substituted_value
        return obj
    else:
        return obj

def load_system_agents_config() -> List[Dict]:
    """
    Loads system agents configuration from the agents.yaml file.
    
    Key Steps:
        1. Open and read the agents.yaml file
        2. Parse YAML content into Python objects
        3. Substitute environment variables in the configuration
        4. Validate the structure (list or dict)
        5. Return normalized list of agent configurations
    
    Parameters:
        None
    
    Returns:
        List[Dict]: List of agent configuration dictionaries ready for processing
    """
    LOGGER.info("In AgentCustomResourceLambda.py.load_system_agents_config(), loading system agents configuration from agents.yaml")
    try:
        with open("agents.yaml", 'r', encoding='utf-8') as stream:
            config_data = yaml.safe_load(stream)
            LOGGER.debug(f"In AgentCustomResourceLambda.py.load_system_agents_config(), raw config loaded: {config_data}")
            
            config_data = substitute_env_vars(config_data)
            LOGGER.info(f"In AgentCustomResourceLambda.py.load_system_agents_config(), processed config with environment substitutions: {config_data}")
            
            # Ensure we return a list
            if isinstance(config_data, list):
                LOGGER.info(f"In AgentCustomResourceLambda.py.load_system_agents_config(), loaded {len(config_data)} agent configurations")
                return config_data
            elif isinstance(config_data, dict):
                LOGGER.info("In AgentCustomResourceLambda.py.load_system_agents_config(), loaded single agent configuration")
                return [config_data]  # Single agent config
            else:
                LOGGER.error("In AgentCustomResourceLambda.py.load_system_agents_config(), invalid YAML structure: expected list or dict")
                raise ValueError("Invalid YAML structure: expected list or dict")
                
    except FileNotFoundError:
        LOGGER.error("In AgentCustomResourceLambda.py.load_system_agents_config(), agents.yaml file not found")
        raise
    except yaml.YAMLError as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.load_system_agents_config(), YAML parsing error: {e}")
        raise
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.load_system_agents_config(), error loading config: {e}")
        raise

def get_agent_metadata(agent_name: str) -> Optional[Dict]:
    """
    Retrieves agent metadata from DynamoDB lookup table.
    
    Key Steps:
        1. Query DynamoDB table using agent name as key
        2. Check if item exists in response
        3. Convert DynamoDB item format to regular Python dict
        4. Return metadata or None if not found
    
    Parameters:
        agent_name (str): The name of the agent to retrieve metadata for
    
    Returns:
        Optional[Dict]: Agent metadata dictionary if found, None otherwise
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.get_agent_metadata(), retrieving agent metadata for: {agent_name}")
    try:
        response = DYNAMODB_CLIENT.get_item(
            TableName=AGENTS_TABLE_NAME,
            Key={
                'AgentId': {'S': agent_name}
            }
        )
        
        if 'Item' in response:
            # Convert DynamoDB item to regular dict
            item = {}
            for key, value in response['Item'].items():
                if 'S' in value:
                    item[key] = value['S']
                elif 'N' in value:
                    item[key] = value['N']
            LOGGER.info(f"In AgentCustomResourceLambda.py.get_agent_metadata(), found agent metadata: {item}")
            return item
        LOGGER.info(f"In AgentCustomResourceLambda.py.get_agent_metadata(), no agent metadata found for: {agent_name}")
        return None
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.get_agent_metadata(), error getting agent metadata for {agent_name}: {e}")
        return None

def create_system_agent_metadata(agent_name: str, agent_version: str, agent_alias_id: str, 
                                action_group_id: str, agent_config: Dict, bedrock_agent_id: str):
    """
    Creates system agent metadata in the AGENTS_TABLE.
    
    Key Steps:
        1. Prepare metadata item with all required fields
        2. Convert Python dict to DynamoDB item format
        3. Insert item into AGENTS_TABLE
        4. Log the creation operation
    
    Parameters:
        agent_name (str): Name of the agent
        agent_version (str): Version of the agent
        agent_alias_id (str): ID of the agent alias
        action_group_id (str): ID of the action group (if applicable)
        agent_config (Dict): Original agent configuration
        bedrock_agent_id (str): Bedrock agent ID
    
    Returns:
        None: Creates metadata entry in DynamoDB
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.create_system_agent_metadata(), creating system agent metadata for: {agent_name}")
    try:
        item = {
            'AgentId': {'S': agent_name},
            'AgentName': {'S': agent_name},
            'AgentVersion': {'S': agent_version},
            'AgentAliasId': {'S': agent_alias_id},
            'ActionGroupId': {'S': action_group_id},
            'ReferenceId': {'S': bedrock_agent_id},
            'Description': {'S': agent_config.get('Description', '')}
        }
        
        LOGGER.debug(f"In AgentCustomResourceLambda.py.create_system_agent_metadata(), metadata item to create: {item}")
        
        DYNAMODB_CLIENT.put_item(
            TableName=AGENTS_TABLE_NAME,
            Item=item
        )
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_system_agent_metadata(), successfully created metadata for agent: {agent_name}")
        
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.create_system_agent_metadata(), error creating agent metadata for {agent_name}: {e}")
        raise

def update_system_agent_metadata(agent_name: str, new_agent_version: str):
    """
    Updates system agent metadata in the AGENTS_TABLE.
    Key Steps:
        1. Prepare update expression for agent version
        2. Execute DynamoDB update operation
        3. Log the update operation
    
    Parameters:
        agent_name (str): Name of the agent to update
        new_agent_version (str): New version number for the agent
    
    Returns:
        None: Updates metadata entry in DynamoDB
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.update_system_agent_metadata(), updating agent version for {agent_name} to {new_agent_version}")
    try:
        DYNAMODB_CLIENT.update_item(
            TableName=AGENTS_TABLE_NAME,
            Key={
                'AgentId': {'S': agent_name}
            },
            UpdateExpression='SET AgentVersion = :av',
            ExpressionAttributeValues={
                ':av': {'S': new_agent_version}
            }
        )
        LOGGER.info(f"In AgentCustomResourceLambda.py.update_system_agent_metadata(), successfully updated agent version for {agent_name} to {new_agent_version}")
        
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.update_system_agent_metadata(), error updating agent metadata for {agent_name}: {e}")
        raise

def delete_system_agent_metadata(agent_name: str):
    """
    Deletes system agent metadata from the AGENTS_TABLE.
    
    Key Steps:
        1. Prepare delete operation with agent name as key
        2. Execute DynamoDB delete operation
        3. Log the deletion operation
    
    Parameters:
        agent_name (str): Name of the agent whose metadata should be deleted
    
    Returns:
        None: Removes metadata entry from DynamoDB
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.delete_system_agent_metadata(), deleting system agent metadata for: {agent_name}")
    try:
        DYNAMODB_CLIENT.delete_item(
            TableName=AGENTS_TABLE_NAME,
            Key={
                'AgentId': {'S': agent_name}
            }
        )
        LOGGER.info(f"In AgentCustomResourceLambda.py.delete_system_agent_metadata(), successfully deleted metadata for agent: {agent_name}")
        
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.delete_system_agent_metadata(), error deleting agent metadata for {agent_name}: {e}")
        raise

def wait_for_agent_status(bedrock_agent_id: str, target_status: str, max_retries: int = 10) -> bool:
    """
    Wait for agent to reach target status with exponential backoff.
    
    Key Steps:
        1. Poll agent status using Bedrock API
        2. Check if target status is reached
        3. Handle FAILED status as error
        4. Implement exponential backoff between retries
        5. Return success or raise exception on timeout
    
    Parameters:
        bedrock_agent_id (str): ID of the Bedrock agent to monitor
        target_status (str): Desired status to wait for (e.g., 'PREPARED')
        max_retries (int, optional): Maximum number of retry attempts (default: 10)
    
    Returns:
        bool: True if target status is reached, raises exception otherwise
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.wait_for_agent_status(), waiting for agent {bedrock_agent_id} to reach status: {target_status}")
    retry_count = 0
    while retry_count < max_retries:
        try:
            agent_response = BEDROCK_AGENTS_CLIENT.get_agent(agentId=bedrock_agent_id)
            current_status = agent_response["agent"]["agentStatus"]
            
            LOGGER.info(f"In AgentCustomResourceLambda.py.wait_for_agent_status(), agent {bedrock_agent_id} status: {current_status} (attempt {retry_count + 1}/{max_retries})")
            
            if current_status == target_status:
                LOGGER.info(f"In AgentCustomResourceLambda.py.wait_for_agent_status(), agent {bedrock_agent_id} successfully reached target status: {target_status}")
                return True
            elif current_status == "FAILED":
                LOGGER.error(f"In AgentCustomResourceLambda.py.wait_for_agent_status(), agent {bedrock_agent_id} reached FAILED status")
                raise Exception(f"Agent reached FAILED status")
            
            retry_count += 1
            wait_time = min(2 ** retry_count, 30)  # Exponential backoff with max 30s
            LOGGER.debug(f"In AgentCustomResourceLambda.py.wait_for_agent_status(), waiting {wait_time} seconds before next status check")
            time.sleep(wait_time)
            
        except ClientError as e:
            LOGGER.warning(f"In AgentCustomResourceLambda.py.wait_for_agent_status(), error checking agent status for {bedrock_agent_id}: {e}")
            retry_count += 1
            time.sleep(5)
    
    LOGGER.error(f"In AgentCustomResourceLambda.py.wait_for_agent_status(), agent {bedrock_agent_id} did not reach {target_status} status within {max_retries} retries")
    raise Exception(f"Agent {bedrock_agent_id} did not reach {target_status} status within {max_retries} retries")

def wait_for_alias_status(bedrock_agent_id: str, agent_alias_id: str, target_status: str, max_retries: int = 10) -> str:
    """
    Wait for agent alias to reach target status and return the agent version.
    
    Key Steps:
        1. Poll agent alias status using Bedrock API
        2. Check if target status is reached
        3. Extract agent version from routing configuration
        4. Handle FAILED status as error
        5. Implement exponential backoff between retries
        6. Return agent version or raise exception on timeout
    
    Parameters:
        bedrock_agent_id (str): ID of the Bedrock agent
        agent_alias_id (str): ID of the agent alias to monitor
        target_status (str): Desired status to wait for (e.g., 'PREPARED')
        max_retries (int, optional): Maximum number of retry attempts (default: 10)
    
    Returns:
        str: Agent version associated with the alias
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), waiting for agent alias {agent_alias_id} to reach status: {target_status}")
    retry_count = 0
    while retry_count < max_retries:
        try:
            alias_response = BEDROCK_AGENTS_CLIENT.get_agent_alias(
                agentId=bedrock_agent_id, 
                agentAliasId=agent_alias_id
            )
            current_status = alias_response["agentAlias"]["agentAliasStatus"]
            
            LOGGER.info(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), agent alias {agent_alias_id} status: {current_status} (attempt {retry_count + 1}/{max_retries})")
            
            if current_status == target_status:
                routing_config = alias_response["agentAlias"].get("routingConfiguration", [])
                if routing_config:
                    agent_version = routing_config[0]["agentVersion"]
                    LOGGER.info(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), agent alias {agent_alias_id} successfully reached target status. Agent version: {agent_version}")
                    return agent_version
                LOGGER.info(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), agent alias {agent_alias_id} successfully reached target status. Using default version: 1")
                return "1"  # Default version
            elif current_status == "FAILED":
                LOGGER.error(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), agent alias {agent_alias_id} reached FAILED status")
                raise Exception(f"Agent alias reached FAILED status")
            
            retry_count += 1
            wait_time = min(2 ** retry_count, 30)
            LOGGER.debug(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), waiting {wait_time} seconds before next alias status check")
            time.sleep(wait_time)
            
        except ClientError as e:
            LOGGER.warning(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), error checking alias status for {agent_alias_id}: {e}")
            retry_count += 1
            time.sleep(5)
    
    LOGGER.error(f"In AgentCustomResourceLambda.py.wait_for_alias_status(), agent alias {agent_alias_id} did not reach {target_status} status within {max_retries} retries")
    raise Exception(f"Agent alias {agent_alias_id} did not reach {target_status} status within {max_retries} retries")

def associate_knowledge_bases(bedrock_agent_id: str, knowledge_bases: List[Dict]):
    """
    Associate knowledge bases with the agent.
    
    Key Steps:
        1. Validate knowledge bases list is not empty
        2. Iterate through each knowledge base
        3. Extract knowledge base ID and description
        4. Call Bedrock API to associate knowledge base
        5. Handle conflicts (already associated) gracefully
        6. Log success or failure for each association
    
    Parameters:
        bedrock_agent_id (str): ID of the Bedrock agent
        knowledge_bases (List[Dict]): List of knowledge base configurations
    
    Returns:
        None: Associates knowledge bases with the agent
    """
    if not knowledge_bases:
        LOGGER.info("In AgentCustomResourceLambda.py.associate_knowledge_bases(), no knowledge bases to associate")
        return
    
    LOGGER.info(f"In AgentCustomResourceLambda.py.associate_knowledge_bases(), associating {len(knowledge_bases)} knowledge bases with agent {bedrock_agent_id}")
    
    for kb in knowledge_bases:
        try:
            kb_id = kb.get("KnowledgeBaseId")
            if not kb_id:
                LOGGER.warning(f"In AgentCustomResourceLambda.py.associate_knowledge_bases(), skipping knowledge base without ID: {kb}")
                continue
                
            LOGGER.info(f"In AgentCustomResourceLambda.py.associate_knowledge_bases(), associating knowledge base {kb_id} with agent {bedrock_agent_id}")
            
            BEDROCK_AGENTS_CLIENT.associate_agent_knowledge_base(
                agentId=bedrock_agent_id,
                agentVersion="DRAFT",
                knowledgeBaseId=kb_id,
                description=kb.get("Description", ""),
                knowledgeBaseState="ENABLED"
            )
            LOGGER.info(f"In AgentCustomResourceLambda.py.associate_knowledge_bases(), successfully associated knowledge base {kb_id} with agent {bedrock_agent_id}")
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'ConflictException':
                LOGGER.info(f"In AgentCustomResourceLambda.py.associate_knowledge_bases(), knowledge base {kb_id} already associated with agent {bedrock_agent_id}")
            else:
                LOGGER.error(f"In AgentCustomResourceLambda.py.associate_knowledge_bases(), failed to associate knowledge base {kb_id}: {e}")
        except Exception as e:
            LOGGER.error(f"In AgentCustomResourceLambda.py.associate_knowledge_bases(), unexpected error associating knowledge base {kb_id}: {e}")

def associate_agent_collaborators(bedrock_agent_id: str, agent_collaboration: str, agent_collaborators: List[Dict]):
    """
    Associate agent collaborators for multi-agent collaboration.
    
    Key Steps:
        1. Validate collaboration type is 'SUPERVISOR'
        2. Iterate through each collaborator configuration
        3. Extract collaborator name and agent descriptor
        4. Resolve alias ARN from metadata if needed
        5. Call Bedrock API to associate collaborator
        6. Handle errors gracefully and continue with other collaborators
    
    Parameters:
        bedrock_agent_id (str): ID of the supervisor Bedrock agent
        agent_collaboration (str): Type of collaboration ('SUPERVISOR' or 'DISABLED')
        agent_collaborators (List[Dict]): List of collaborator configurations
    
    Returns:
        None: Associates collaborators with the supervisor agent
    """
    if agent_collaboration != "SUPERVISOR" or not agent_collaborators:
        LOGGER.info(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), skipping collaborator association - agent_collaboration: {agent_collaboration}, collaborators: {len(agent_collaborators) if agent_collaborators else 0}")
        return

    LOGGER.info(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), setting up multi-agent collaboration for supervisor agent {bedrock_agent_id}")
    
    for collaborator in agent_collaborators:
        try:
            collaborator_name = collaborator.get("CollaboratorName")
            if not collaborator_name:
                LOGGER.warning(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), skipping collaborator without name: {collaborator}")
                continue
            
            LOGGER.info(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), processing collaborator: {collaborator_name}")
            
            # Get the alias ARN for the collaborator
            agent_descriptor = collaborator.get("AgentDescriptor", {})
            alias_arn = None
            
            if isinstance(agent_descriptor, list) and agent_descriptor:
                alias_arn = agent_descriptor[0].get("aliasArn")
            elif isinstance(agent_descriptor, dict):
                alias_arn = agent_descriptor.get("aliasArn")
            
            if not alias_arn or alias_arn == "xyz":  # Skip placeholder ARNs
                LOGGER.info(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), resolving alias ARN for collaborator {collaborator_name}")
                # Try to resolve the alias ARN from the lookup table
                resolved_arn = get_agent_alias_arn(f"{ENVIRONMENT}-{collaborator_name}")
                if resolved_arn:
                    alias_arn = resolved_arn
                    LOGGER.info(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), resolved alias ARN for {collaborator_name}: {alias_arn}")
                    # Update the AgentDescriptor with the resolved ARN
                    if isinstance(agent_descriptor, list) and agent_descriptor:
                        agent_descriptor[0]["aliasArn"] = alias_arn
                    elif isinstance(agent_descriptor, dict):
                        agent_descriptor["aliasArn"] = alias_arn
                else:
                    LOGGER.warning(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), skipping collaborator {collaborator_name} - no valid alias ARN even after lookup")
                    continue

            LOGGER.info(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), associating collaborator {collaborator_name} with agent {bedrock_agent_id}")
            response = BEDROCK_AGENTS_CLIENT.associate_agent_collaborator(
                agentDescriptor=agent_descriptor,
                agentId=bedrock_agent_id,
                agentVersion="DRAFT",
                collaborationInstruction=collaborator.get("CollaborationInstruction"),
                collaboratorName=collaborator.get("CollaboratorName"),
                relayConversationHistory=collaborator.get("RelayConversationHistory")
            )

            LOGGER.info(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), successfully associated collaborator {collaborator_name} with ARN {alias_arn}")
            
            
            
        except Exception as e:
            LOGGER.error(f"In AgentCustomResourceLambda.py.associate_agent_collaborators(), error associating collaborator {collaborator_name}: {e}")

def prepare_bedrock_agent(action: str, bedrock_agent_id: str, agent_name: str, 
                         agent_alias_id: str = None, agent_version: str = None) -> Tuple[str, str]:
    """
    Prepares the Bedrock agent and manages aliases.
    
    Key Steps:
        1. Call prepare_agent API for the Bedrock agent
        2. Wait for agent to reach 'PREPARED' status
        3. For create action: Create new agent alias
        4. For update action: Update existing agent alias
        5. Wait for alias to reach 'PREPARED' status
        6. Return alias ID and agent version
    
    Parameters:
        action (str): Action type ('create' or 'update')
        bedrock_agent_id (str): ID of the Bedrock agent
        agent_name (str): Name for the agent alias
        agent_alias_id (str, optional): Existing alias ID for updates
        agent_version (str, optional): Existing agent version for updates
    
    Returns:
        Tuple[str, str]: (agent_alias_id, agent_version)
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.prepare_bedrock_agent(), preparing agent {bedrock_agent_id} with action: {action}")
    
    # Prepare the agent
    LOGGER.info(f"In AgentCustomResourceLambda.py.prepare_bedrock_agent(), calling prepare_agent for {bedrock_agent_id}")
    BEDROCK_AGENTS_CLIENT.prepare_agent(agentId=bedrock_agent_id)
    
    # Wait for agent to be prepared
    wait_for_agent_status(bedrock_agent_id, "PREPARED")
    
    if action == "create":
        LOGGER.info(f"In AgentCustomResourceLambda.py.prepare_bedrock_agent(), creating new agent alias for {agent_name}")
        # Create new alias
        alias_response = BEDROCK_AGENTS_CLIENT.create_agent_alias(
            agentId=bedrock_agent_id,
            agentAliasName=agent_name
        )
        agent_alias_id = alias_response["agentAlias"]["agentAliasId"]
        LOGGER.info(f"In AgentCustomResourceLambda.py.prepare_bedrock_agent(), created agent alias: {agent_alias_id}")
        
        # Wait for alias to be ready and get version
        agent_version = wait_for_alias_status(bedrock_agent_id, agent_alias_id, "PREPARED")
        
    else:  # update
        LOGGER.info(f"In AgentCustomResourceLambda.py.prepare_bedrock_agent(), updating existing agent alias: {agent_alias_id}")
        # Update existing alias
        BEDROCK_AGENTS_CLIENT.update_agent_alias(
            agentId=bedrock_agent_id,
            agentAliasId=agent_alias_id,
            agentAliasName=agent_name
        )
        
        # Wait for alias to be updated and get new version
        agent_version = wait_for_alias_status(bedrock_agent_id, agent_alias_id, "PREPARED")
    
    LOGGER.info(f"In AgentCustomResourceLambda.py.prepare_bedrock_agent(), agent preparation completed - Alias ID: {agent_alias_id}, Version: {agent_version}")
    
    return agent_alias_id, agent_version

def create_update_bedrock_agent(action: str, input_body: Dict, lambda_function_arn: str) -> Tuple[str, str, str, str]:
    """
    Creates or updates a Bedrock agent with all its components.
    
    Key Steps:
        1. Prepare agent parameters and create/update the agent
        2. Create or update action group if Lambda function is specified
        3. Associate knowledge bases with the agent
        4. Setup multi-agent collaboration if configured
        5. Prepare the agent and manage aliases
        6. Return all relevant IDs and version information
    
    Parameters:
        action (str): Action type ('create' or 'update')
        input_body (Dict): Complete agent configuration
        lambda_function_arn (str): ARN of the Lambda function for action groups
    
    Returns:
        Tuple[str, str, str, str]: (bedrock_agent_id, agent_alias_id, action_group_id, agent_version)
    """
    LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), starting {action} operation for agent: {input_body['AgentName']}")
    
    # Prepare base agent parameters
    agent_params = {
        "agentName": input_body["AgentName"],
        "description": input_body.get("Description", ""),
        "agentResourceRoleArn": AGENT_EXECUTION_ROLE,
        "foundationModel": input_body["ModelId"],
        "instruction": input_body.get("Instruction", ""),
        "idleSessionTTLInSeconds": 3600,
        "agentCollaboration": input_body.get("AgentCollaboration", "DISABLED")
    }
    
    LOGGER.debug(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), agent parameters: {agent_params}")
    
    # Step 1: Create or update the agent
    if action == "create":
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), creating new Bedrock agent: {input_body['AgentName']}")
        create_agent_response = BEDROCK_AGENTS_CLIENT.create_agent(**agent_params)
        bedrock_agent_id = create_agent_response["agent"]["agentId"]
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), created agent with ID: {bedrock_agent_id}")
    else:  # update
        bedrock_agent_id = input_body["ReferenceId"]
        agent_params["agentId"] = bedrock_agent_id
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), updating existing Bedrock agent: {bedrock_agent_id}")
        BEDROCK_AGENTS_CLIENT.update_agent(**agent_params)
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), updated agent with ID: {bedrock_agent_id}")
    
    # Wait for agent creation/update to propagate through AWS
    LOGGER.info("In AgentCustomResourceLambda.py.create_update_bedrock_agent(), waiting 5 seconds for agent creation/update to propagate")
    time.sleep(5)
    
    # Step 2: Create/update action group if Lambda is specified
    action_group_id = None
    if lambda_function_arn and input_body.get("Tools"):
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), setting up action group for agent {bedrock_agent_id}")
       
       # Remove ENVIRONMENT prefix from agent name for action group name
        original_agent_name = input_body["AgentName"]
        if ENVIRONMENT and original_agent_name.startswith(f"{ENVIRONMENT}-"):
            original_agent_name = original_agent_name[len(ENVIRONMENT)+1:]
        action_group_name = f"{original_agent_name}-ag"
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), action group name: {action_group_name}")

        function_schema = {"functions": []}
        
        # Build function schema from tools
        for tool in input_body.get("Tools", []):
            function = {
                "name": tool["ToolName"],
                "description": tool["ToolDescription"],
                "parameters": {}
            }
            
            # Add parameters
            for param in tool.get("ToolParameters", []):
                function["parameters"][param["Name"]] = {
                    "type": param["Type"],
                    "description": param.get("Description", ""),
                    "required": param.get("IsRequired", False)
                }
            function_schema["functions"].append(function)
        
        LOGGER.debug(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), function schema: {function_schema}")
        action_group_params = {
            "agentId": bedrock_agent_id,
            "actionGroupName": action_group_name,
            "description": f"Action group for {input_body['AgentName']}",
            "actionGroupExecutor": {
                "lambda": lambda_function_arn
            },
            "actionGroupState": "ENABLED",
            "agentVersion": "DRAFT",
            "functionSchema": function_schema
        }

        LOGGER.debug(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), action group parameters: {action_group_params}")
        
        if action == "create":
            LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), creating action group: {action_group_name}")
            create_action_group_response = BEDROCK_AGENTS_CLIENT.create_agent_action_group(**action_group_params)
            action_group_id = create_action_group_response["agentActionGroup"]["actionGroupId"]
            LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), created action group with ID: {action_group_id}")
        else:  # update
            LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), updating action group: {input_body['ActionGroupId']}")
            action_group_params.pop("description", None)
            action_group_params["actionGroupId"] = input_body["ActionGroupId"]
            BEDROCK_AGENTS_CLIENT.update_agent_action_group(**action_group_params)
            action_group_id = input_body["ActionGroupId"]
            LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), updated action group with ID: {action_group_id}")
        
    
    # Step 3: Associate knowledge bases
    knowledge_bases = input_body.get("KnowledgeBases", [])
    associate_knowledge_bases(bedrock_agent_id, knowledge_bases)
    
    # Step 4: Setup multi-agent collaboration
    agent_collaboration = input_body.get("AgentCollaboration")
    agent_collaborators = input_body.get("AgentCollaborators", [])
    associate_agent_collaborators(bedrock_agent_id, agent_collaboration, agent_collaborators)
    
    # Step 5: Prepare the agent and create/update alias
    if action == "create":
        LOGGER.info("In AgentCustomResourceLambda.py.create_update_bedrock_agent(), preparing agent and creating alias")
        agent_alias_id, agent_version = prepare_bedrock_agent(action, bedrock_agent_id, input_body["AgentName"])
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), agent creation completed - Agent ID: {bedrock_agent_id}, Alias ID: {agent_alias_id}, Action Group ID: {action_group_id}, Version: {agent_version}")
        return bedrock_agent_id, agent_alias_id, action_group_id or "", agent_version
    else:  # update
        LOGGER.info("In AgentCustomResourceLambda.py.create_update_bedrock_agent(), preparing agent and updating alias")
        _, agent_version = prepare_bedrock_agent(action, bedrock_agent_id, input_body["AgentName"], 
                                                input_body["AgentAliasId"], input_body["AgentVersion"])
        LOGGER.info(f"In AgentCustomResourceLambda.py.create_update_bedrock_agent(), agent update completed - Agent ID: {bedrock_agent_id}, Alias ID: {input_body['AgentAliasId']}, Action Group ID: {action_group_id or input_body['ActionGroupId']}, Version: {agent_version}")
        return bedrock_agent_id, input_body["AgentAliasId"], action_group_id or input_body["ActionGroupId"], agent_version

def delete_bedrock_agent(agent_item: Dict):
    """
    Deletes a Bedrock agent and its components.
    
    Key Steps:
        1. Extract agent ID and alias ID from metadata
        2. Delete agent alias using Bedrock API
        3. Wait for alias deletion to complete
        4. Delete the Bedrock agent with skipResourceInUseCheck
        5. Handle ResourceNotFoundException gracefully
        6. Log all deletion steps
    
    Parameters:
        agent_item (Dict): Agent metadata containing ReferenceId and AgentAliasId
    
    Returns:
        None: Deletes the agent and its alias
    """
    try:
        bedrock_agent_id = agent_item["ReferenceId"]
        agent_alias_id = agent_item["AgentAliasId"]
        
        LOGGER.info(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), deleting Bedrock agent {bedrock_agent_id} with alias {agent_alias_id}")
        
        # Delete agent alias first
        try:
            LOGGER.info(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), deleting agent alias: {agent_alias_id}")
            BEDROCK_AGENTS_CLIENT.delete_agent_alias(
                agentId=bedrock_agent_id,
                agentAliasId=agent_alias_id
            )
            LOGGER.info(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), successfully deleted agent alias: {agent_alias_id}")
        except ClientError as e:
            if e.response['Error']['Code'] != 'ResourceNotFoundException':
                LOGGER.warning(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), could not delete agent alias {agent_alias_id}: {e}")
        
        # Wait a bit before deleting the agent
        LOGGER.info("In AgentCustomResourceLambda.py.delete_bedrock_agent(), waiting 2 seconds before deleting the agent")
        time.sleep(2)
        
        # Delete the agent
        LOGGER.info(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), deleting Bedrock agent: {bedrock_agent_id}")
        BEDROCK_AGENTS_CLIENT.delete_agent(
            agentId=bedrock_agent_id,
            skipResourceInUseCheck=True
        )
        LOGGER.info(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), successfully deleted Bedrock agent: {bedrock_agent_id}")
        
    except ClientError as e:
        if e.response['Error']['Code'] != 'ResourceNotFoundException':
            LOGGER.error(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), error deleting Bedrock agent {bedrock_agent_id}: {e}")
            raise
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.delete_bedrock_agent(), unexpected error deleting Bedrock agent {bedrock_agent_id}: {e}")
        raise

def get_agent_alias_arn(agent_name: str) -> Optional[str]:
    """
    Fetches the agent's metadata from DynamoDB and returns the AliasArn if available.
    
    Key Steps:
        1. Retrieve agent metadata from DynamoDB
        2. Check if required fields (ReferenceId, AgentAliasId) exist
        3. Construct full alias ARN using AWS region and account ID
        4. Return the constructed ARN or None if not found
    
    Parameters:
        agent_name (str): Name of the agent to get alias ARN for
    
    Returns:
        Optional[str]: Full alias ARN if agent exists, None otherwise
    """
    LOGGER.debug(f"In AgentCustomResourceLambda.py.get_agent_alias_arn(), getting agent alias ARN for: {agent_name}")
    agent_metadata = get_agent_metadata(agent_name)
    if agent_metadata and 'AgentAliasId' in agent_metadata and 'ReferenceId' in agent_metadata:
        alias_arn = f"arn:aws:bedrock:{AWS_REGION}:{ACCOUNT_ID}:agent-alias/{agent_metadata['ReferenceId']}/{agent_metadata['AgentAliasId']}"
        LOGGER.debug(f"In AgentCustomResourceLambda.py.get_agent_alias_arn(), resolved alias ARN for {agent_name}: {alias_arn}")
        return alias_arn
    LOGGER.debug(f"In AgentCustomResourceLambda.py.get_agent_alias_arn(), no alias ARN found for agent: {agent_name}")
    return None

def resolve_collaborator_arns(agent_config: Dict):
    """
    Resolve collaborator ARNs from agent names.
    
    Key Steps:
        1. Check if AgentCollaborators exist in configuration
        2. Iterate through each collaborator
        3. Extract collaborator name and construct lookup name
        4. Get alias ARN from DynamoDB metadata
        5. Update AgentDescriptor with resolved ARN
        6. Log resolution success or failure
    
    Parameters:
        agent_config (Dict): Agent configuration containing AgentCollaborators
    
    Returns:
        None: Updates the agent_config with resolved ARNs
    """
    if "AgentCollaborators" not in agent_config:
        LOGGER.debug("In AgentCustomResourceLambda.py.resolve_collaborator_arns(), no AgentCollaborators found in agent config")
        return
    
    LOGGER.info(f"In AgentCustomResourceLambda.py.resolve_collaborator_arns(), resolving collaborator ARNs for {len(agent_config['AgentCollaborators'])} collaborators")
    
    for collaborator in agent_config["AgentCollaborators"]:
        if "CollaboratorName" in collaborator:
            collaborator_agent_name = f"{ENVIRONMENT}-{collaborator['CollaboratorName']}"
            LOGGER.debug(f"In AgentCustomResourceLambda.py.resolve_collaborator_arns(), resolving ARN for collaborator: {collaborator_agent_name}")
            alias_arn = get_agent_alias_arn(collaborator_agent_name)
            
            if alias_arn:
                LOGGER.info(f"In AgentCustomResourceLambda.py.resolve_collaborator_arns(), resolved ARN for collaborator {collaborator['CollaboratorName']}: {alias_arn}")
                # Update AgentDescriptor with resolved ARN
                if "AgentDescriptor" in collaborator:
                    if isinstance(collaborator["AgentDescriptor"], list):
                        for desc in collaborator["AgentDescriptor"]:
                            desc["aliasArn"] = alias_arn
                    elif isinstance(collaborator["AgentDescriptor"], dict):
                        collaborator["AgentDescriptor"]["aliasArn"] = alias_arn
            else:
                LOGGER.warning(f"In AgentCustomResourceLambda.py.resolve_collaborator_arns(), could not resolve ARN for collaborator {collaborator_agent_name}")

def lambda_handler(event, context):
    
    LOGGER.info("In AgentCustomResourceLambda.py.lambda_handler(), starting AgentCustomResourceLambda execution")
    try:
        request_type = event.get('RequestType', 'Create')
        LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), request type: {request_type}")
        
        # Handle DELETE requests - clean up all agents
        if request_type == 'Delete':
            LOGGER.info("In AgentCustomResourceLambda.py.lambda_handler(), processing DELETE request")
            try:
                # Load agent configs and delete each one
                system_agents_configs = load_system_agents_config()
                
                for agent_config in system_agents_configs:
                    agent_name = f"{ENVIRONMENT}-{agent_config['AgentName']}"
                    LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), processing deletion for agent: {agent_name}")
                    
                    # Get existing agent metadata
                    agent_item = get_agent_metadata(agent_name)
                    
                    if agent_item:
                        # Delete the Bedrock agent
                        delete_bedrock_agent(agent_item)
                        
                        # Delete metadata from DynamoDB
                        delete_system_agent_metadata(agent_name)
                    else:
                        LOGGER.warning(f"In AgentCustomResourceLambda.py.lambda_handler(), no metadata found for agent {agent_name} during deletion")
                
                LOGGER.info("In AgentCustomResourceLambda.py.lambda_handler(), successfully completed agent deletion")
                send_response(event, context, 'SUCCESS', {'Message': 'Agents deleted successfully'})
                
            except Exception as e:
                LOGGER.error(f"In AgentCustomResourceLambda.py.lambda_handler(), error during delete operation: {e}")
                send_response(event, context, 'FAILED', {}, reason=str(e))
            return
        
        # Load system agents configuration
        system_agents_configs = load_system_agents_config()
        
        created_agents = []
        updated_agents = []
        
        LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), processing {len(system_agents_configs)} agent configurations")
        
        # Process each agent configuration
        for agent_config in system_agents_configs:
            try:
                # Prepare agent name with environment prefix
                original_agent_name = agent_config['AgentName']
                agent_name = f"{ENVIRONMENT}-{original_agent_name}"
                agent_config["AgentName"] = agent_name
                LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), processing agent: {agent_name}")
                
                # Prepare Lambda ARN if specified
                lambda_arn = None
                lambda_name = agent_config.get('Lambda')
                if lambda_name:
                    lambda_name = f"{ENVIRONMENT}-{lambda_name}"
                    lambda_arn = f"arn:aws:lambda:{AWS_REGION}:{ACCOUNT_ID}:function:{lambda_name}"
                    LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), using Lambda ARN: {lambda_arn}")
                
                # Normalize knowledge bases configuration
                if 'KnowledgeBase' in agent_config:
                    kb = agent_config.pop('KnowledgeBase')
                    if isinstance(kb, list):
                        agent_config['KnowledgeBases'] = kb
                    else:
                        agent_config['KnowledgeBases'] = [kb]
                    LOGGER.debug(f"In AgentCustomResourceLambda.py.lambda_handler(), normalized knowledge base configuration: {agent_config['KnowledgeBases']}")
                elif 'KnowledgeBases' in agent_config:
                    if not isinstance(agent_config['KnowledgeBases'], list):
                        agent_config['KnowledgeBases'] = [agent_config['KnowledgeBases']]
                    LOGGER.debug(f"In AgentCustomResourceLambda.py.lambda_handler(), normalized knowledge bases configuration: {agent_config['KnowledgeBases']}")
                
                # Resolve collaborator ARNs for multi-agent collaboration
                resolve_collaborator_arns(agent_config)
                
                # Check if agent already exists
                agent_item = get_agent_metadata(agent_name)
                
                if not agent_item:
                    # Create new agent
                    LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), creating new agent: {agent_name}")
                    
                    bedrock_agent_id, agent_alias_id, action_group_id, agent_version = create_update_bedrock_agent(
                        "create", agent_config, lambda_arn)
                    
                    # Create metadata
                    create_system_agent_metadata(agent_name, agent_version, agent_alias_id, 
                                                action_group_id, agent_config, bedrock_agent_id)
                    
                    created_agents.append(original_agent_name)
                    LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), successfully created agent: {original_agent_name}")
                    
                else:
                    # Update existing agent
                    LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), updating existing agent: {agent_name}")
                    
                    # Prepare agent config with existing metadata
                    agent_config["AgentVersion"] = agent_item["AgentVersion"]
                    agent_config["AgentAliasId"] = agent_item["AgentAliasId"]
                    agent_config["ReferenceId"] = agent_item["ReferenceId"]
                    agent_config["ActionGroupId"] = agent_item.get("ActionGroupId", "")
                    
                    # Update the agent
                    _, _, _, new_agent_version = create_update_bedrock_agent("update", agent_config, lambda_arn)
                    
                    # Update metadata
                    update_system_agent_metadata(agent_name, new_agent_version)
                    
                    updated_agents.append(original_agent_name)
                    LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), successfully updated agent: {original_agent_name}")
                    
            except Exception as e:
                LOGGER.error(f"In AgentCustomResourceLambda.py.lambda_handler(), error processing agent {agent_config.get('AgentName', 'unknown')}: {e}")
                # Continue with other agents instead of failing completely
                continue
        
        # Return success response
        response_data = {
            'Message': 'Bedrock agents processed successfully',
            'CreatedAgents': created_agents,
            'UpdatedAgents': updated_agents
        }
        
        LOGGER.info(f"In AgentCustomResourceLambda.py.lambda_handler(), lambda execution completed successfully - Created: {len(created_agents)}, Updated: {len(updated_agents)}")
        send_response(event, context, 'SUCCESS', response_data)
        
    except Exception as e:
        LOGGER.error(f"In AgentCustomResourceLambda.py.lambda_handler(), critical error in lambda_handler: {e}")
        import traceback
        traceback.print_exc()
        send_response(event, context, 'FAILED', {}, reason=str(e))