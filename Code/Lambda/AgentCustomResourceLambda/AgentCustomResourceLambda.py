import yaml
import os
import boto3
import time
import json
import urllib3
from typing import Dict, Optional, Tuple, List
from botocore.exceptions import ClientError

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

def send_response(event, context, response_status, response_data=None, physical_resource_id=None, reason=None):
    """
    Send response to CloudFormation for custom resource
    """
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
        print(f"Status code: {response.status}")
    except Exception as e:
        print(f"send_response failed executing http.request(): {e}")

def substitute_env_vars(obj):
    """
    Recursively substitute environment variables in the config dict.
    """
    if isinstance(obj, dict):
        return {k: substitute_env_vars(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [substitute_env_vars(i) for i in obj]
    elif isinstance(obj, str):
        if obj == "${KNOWLEDGE_BASE_ID}":
            return os.environ.get("KNOWLEDGE_BASE_ID", obj)
        return obj
    else:
        return obj

def load_system_agents_config() -> List[Dict]:
    """
    Loads system agents configuration from the agents.yaml file
    """
    try:
        with open("agents.yaml", 'r', encoding='utf-8') as stream:
            config_data = yaml.safe_load(stream)
            config_data = substitute_env_vars(config_data)
            print(f"Loaded config: {config_data}")
            
            # Ensure we return a list
            if isinstance(config_data, list):
                return config_data
            elif isinstance(config_data, dict):
                return [config_data]  # Single agent config
            else:
                raise ValueError("Invalid YAML structure: expected list or dict")
                
    except FileNotFoundError:
        print("agents.yaml file not found")
        raise
    except yaml.YAMLError as e:
        print(f"YAML parsing error: {e}")
        raise
    except Exception as e:
        print(f"Error loading config: {e}")
        raise

def get_agent_metadata(agent_name: str) -> Optional[Dict]:
    """
    Retrieves agent metadata from DynamoDB lookup table
    """
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
            return item
        return None
    except Exception as e:
        print(f"Error getting agent metadata: {e}")
        return None

def create_system_agent_metadata(agent_name: str, agent_version: str, agent_alias_id: str, 
                                action_group_id: str, agent_config: Dict, bedrock_agent_id: str):
    """
    Creates system agent metadata in the AGENTS_TABLE
    """
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
        
        DYNAMODB_CLIENT.put_item(
            TableName=AGENTS_TABLE_NAME,
            Item=item
        )
        print(f"Created metadata for agent: {agent_name}")
        
    except Exception as e:
        print(f"Error creating agent metadata: {e}")
        raise

def update_system_agent_metadata(agent_name: str, new_agent_version: str):
    """
    Updates system agent metadata in the AGENTS_TABLE
    """
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
        print(f"Updated agent version for {agent_name} to {new_agent_version}")
        
    except Exception as e:
        print(f"Error updating agent metadata: {e}")
        raise

def delete_system_agent_metadata(agent_name: str):
    """
    Deletes system agent metadata from the AGENTS_TABLE
    """
    try:
        DYNAMODB_CLIENT.delete_item(
            TableName=AGENTS_TABLE_NAME,
            Key={
                'AgentId': {'S': agent_name}
            }
        )
        print(f"Deleted metadata for agent: {agent_name}")
        
    except Exception as e:
        print(f"Error deleting agent metadata: {e}")
        raise

def wait_for_agent_status(bedrock_agent_id: str, target_status: str, max_retries: int = 10) -> bool:
    """
    Wait for agent to reach target status with exponential backoff
    """
    retry_count = 0
    while retry_count < max_retries:
        try:
            agent_response = BEDROCK_AGENTS_CLIENT.get_agent(agentId=bedrock_agent_id)
            current_status = agent_response["agent"]["agentStatus"]
            
            print(f"Agent {bedrock_agent_id} status: {current_status}")
            
            if current_status == target_status:
                return True
            elif current_status == "FAILED":
                raise Exception(f"Agent reached FAILED status")
            
            retry_count += 1
            wait_time = min(2 ** retry_count, 30)  # Exponential backoff with max 30s
            time.sleep(wait_time)
            
        except ClientError as e:
            print(f"Error checking agent status: {e}")
            retry_count += 1
            time.sleep(5)
    
    raise Exception(f"Agent {bedrock_agent_id} did not reach {target_status} status within {max_retries} retries")

def wait_for_alias_status(bedrock_agent_id: str, agent_alias_id: str, target_status: str, max_retries: int = 10) -> str:
    """
    Wait for agent alias to reach target status and return the agent version
    """
    retry_count = 0
    while retry_count < max_retries:
        try:
            alias_response = BEDROCK_AGENTS_CLIENT.get_agent_alias(
                agentId=bedrock_agent_id, 
                agentAliasId=agent_alias_id
            )
            current_status = alias_response["agentAlias"]["agentAliasStatus"]
            
            print(f"Agent alias {agent_alias_id} status: {current_status}")
            
            if current_status == target_status:
                routing_config = alias_response["agentAlias"].get("routingConfiguration", [])
                if routing_config:
                    return routing_config[0]["agentVersion"]
                return "1"  # Default version
            elif current_status == "FAILED":
                raise Exception(f"Agent alias reached FAILED status")
            
            retry_count += 1
            wait_time = min(2 ** retry_count, 30)
            time.sleep(wait_time)
            
        except ClientError as e:
            print(f"Error checking alias status: {e}")
            retry_count += 1
            time.sleep(5)
    
    raise Exception(f"Agent alias {agent_alias_id} did not reach {target_status} status within {max_retries} retries")

def associate_knowledge_bases(bedrock_agent_id: str, knowledge_bases: List[Dict]):
    """
    Associate knowledge bases with the agent
    """
    if not knowledge_bases:
        return
    
    for kb in knowledge_bases:
        try:
            kb_id = kb.get("KnowledgeBaseId")
            if not kb_id:
                print(f"Skipping knowledge base without ID: {kb}")
                continue
                
            print(f"Associating knowledge base {kb_id} with agent {bedrock_agent_id}")
            
            BEDROCK_AGENTS_CLIENT.associate_agent_knowledge_base(
                agentId=bedrock_agent_id,
                agentVersion="DRAFT",
                knowledgeBaseId=kb_id,
                description=kb.get("Description", ""),
                knowledgeBaseState="ENABLED"
            )
            print(f"Successfully associated knowledge base {kb_id}")
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'ConflictException':
                print(f"Knowledge base {kb_id} already associated with agent {bedrock_agent_id}")
            else:
                print(f"Failed to associate knowledge base {kb_id}: {e}")
        except Exception as e:
            print(f"Unexpected error associating knowledge base {kb_id}: {e}")

def associate_agent_collaborators(bedrock_agent_id: str, agent_collaboration: str, agent_collaborators: List[Dict]):
    """
    Associate agent collaborators for multi-agent collaboration
    """
    if agent_collaboration != "SUPERVISOR" or not agent_collaborators:
        return

    print(agent_collaborators)
    
    print(f"Setting up multi-agent collaboration for supervisor agent {bedrock_agent_id}")
    
    for collaborator in agent_collaborators:
        try:
            collaborator_name = collaborator.get("CollaboratorName")
            if not collaborator_name:
                print(f"Skipping collaborator without name: {collaborator}")
                continue
            
            # Get the alias ARN for the collaborator
            agent_descriptor = collaborator.get("AgentDescriptor", {})
            alias_arn = None
            
            if isinstance(agent_descriptor, list) and agent_descriptor:
                alias_arn = agent_descriptor[0].get("aliasArn")
            elif isinstance(agent_descriptor, dict):
                alias_arn = agent_descriptor.get("aliasArn")
            
            if not alias_arn or alias_arn == "xyz":  # Skip placeholder ARNs
                # Try to resolve the alias ARN from the lookup table
                resolved_arn = get_agent_alias_arn(f"{ENVIRONMENT}-{collaborator_name}")
                if resolved_arn:
                    alias_arn = resolved_arn
                    # Update the AgentDescriptor with the resolved ARN
                    if isinstance(agent_descriptor, list) and agent_descriptor:
                        agent_descriptor[0]["aliasArn"] = alias_arn
                    elif isinstance(agent_descriptor, dict):
                        agent_descriptor["aliasArn"] = alias_arn
                else:
                    print(f"Skipping collaborator {collaborator_name} - no valid alias ARN even after lookup")
                    continue

            print(agent_descriptor)
            response = BEDROCK_AGENTS_CLIENT.associate_agent_collaborator(
                agentDescriptor=agent_descriptor,
                agentId=bedrock_agent_id,
                agentVersion="DRAFT",
                collaborationInstruction=collaborator.get("CollaborationInstruction"),
                collaboratorName=collaborator.get("CollaboratorName"),
                relayConversationHistory=collaborator.get("RelayConversationHistory")
            )

            print(f"Associating collaborator {collaborator_name} with ARN {alias_arn}")
            
            
            
        except Exception as e:
            print(f"Error associating collaborator {collaborator_name}: {e}")

def prepare_bedrock_agent(action: str, bedrock_agent_id: str, agent_name: str, 
                         agent_alias_id: str = None, agent_version: str = None) -> Tuple[str, str]:
    """
    Prepares the Bedrock agent and manages aliases
    """
    print(f"Preparing agent {bedrock_agent_id}")
    
    # Prepare the agent
    BEDROCK_AGENTS_CLIENT.prepare_agent(agentId=bedrock_agent_id)
    
    # Wait for agent to be prepared
    wait_for_agent_status(bedrock_agent_id, "PREPARED")
    
    if action == "create":
        # Create new alias
        alias_response = BEDROCK_AGENTS_CLIENT.create_agent_alias(
            agentId=bedrock_agent_id,
            agentAliasName=agent_name
        )
        agent_alias_id = alias_response["agentAlias"]["agentAliasId"]
        
        # Wait for alias to be ready and get version
        agent_version = wait_for_alias_status(bedrock_agent_id, agent_alias_id, "PREPARED")
        
    else:  # update
        # Update existing alias
        BEDROCK_AGENTS_CLIENT.update_agent_alias(
            agentId=bedrock_agent_id,
            agentAliasId=agent_alias_id,
            agentAliasName=agent_name
        )
        
        # Wait for alias to be updated and get new version
        agent_version = wait_for_alias_status(bedrock_agent_id, agent_alias_id, "PREPARED")
    
    # if action != "create":
    #     try:
    #         BEDROCK_AGENTS_CLIENT.delete_agent_version(
    #             agentId=bedrock_agent_id,
    #             agentVersion=agent_version
    #         )
    #     except Exception as e:
    #         print(f"Warning: Could not delete old agent version: {e}")
    
    return agent_alias_id, agent_version

def create_update_bedrock_agent(action: str, input_body: Dict, lambda_function_arn: str) -> Tuple[str, str, str, str]:
    """
    Creates or updates a Bedrock agent with all its components
    """
    print("input body : ",input_body)
    print(f"Creating/updating agent: {input_body['AgentName']}")
    
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
    
    # Step 1: Create or update the agent
    if action == "create":
        create_agent_response = BEDROCK_AGENTS_CLIENT.create_agent(**agent_params)
        bedrock_agent_id = create_agent_response["agent"]["agentId"]
        print(f"Created agent with ID: {bedrock_agent_id}")
    else:  # update
        bedrock_agent_id = input_body["ReferenceId"]
        agent_params["agentId"] = bedrock_agent_id
        BEDROCK_AGENTS_CLIENT.update_agent(**agent_params)
        print(f"Updated agent with ID: {bedrock_agent_id}")
    
    # Wait for agent creation/update
    time.sleep(5)
    
    # Step 2: Create/update action group if Lambda is specified
    action_group_id = None
    if lambda_function_arn and input_body.get("Tools"):
       
       # Remove ENVIRONMENT prefix from agent name for action group name
        original_agent_name = input_body["AgentName"]
        if ENVIRONMENT and original_agent_name.startswith(f"{ENVIRONMENT}-"):
            original_agent_name = original_agent_name[len(ENVIRONMENT)+1:]
        action_group_name = f"{original_agent_name}-ag"

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
        
        print("FunctionSchema")
        print(function_schema)
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

        print("acton group params")
        print(action_group_params)
        
        if action == "create":
            create_action_group_response = BEDROCK_AGENTS_CLIENT.create_agent_action_group(**action_group_params)
            action_group_id = create_action_group_response["agentActionGroup"]["actionGroupId"]
        else:  # update
            action_group_params.pop("description", None)
            action_group_params["actionGroupId"] = input_body["ActionGroupId"]
            BEDROCK_AGENTS_CLIENT.update_agent_action_group(**action_group_params)
            action_group_id = input_body["ActionGroupId"]
        
        print(f"Action group {'created' if action == 'create' else 'updated'}: {action_group_id}")
    
    # Step 3: Associate knowledge bases
    knowledge_bases = input_body.get("KnowledgeBases", [])
    associate_knowledge_bases(bedrock_agent_id, knowledge_bases)
    
    # Step 4: Setup multi-agent collaboration
    agent_collaboration = input_body.get("AgentCollaboration")
    agent_collaborators = input_body.get("AgentCollaborators", [])
    associate_agent_collaborators(bedrock_agent_id, agent_collaboration, agent_collaborators)
    
    # Step 5: Prepare the agent and create/update alias
    if action == "create":
        agent_alias_id, agent_version = prepare_bedrock_agent(action, bedrock_agent_id, input_body["AgentName"])
        return bedrock_agent_id, agent_alias_id, action_group_id or "", agent_version
    else:  # update
        _, agent_version = prepare_bedrock_agent(action, bedrock_agent_id, input_body["AgentName"], 
                                                input_body["AgentAliasId"], input_body["AgentVersion"])
        return bedrock_agent_id, input_body["AgentAliasId"], action_group_id or input_body["ActionGroupId"], agent_version

def delete_bedrock_agent(agent_item: Dict):
    """
    Deletes a Bedrock agent and its components
    """
    try:
        bedrock_agent_id = agent_item["ReferenceId"]
        agent_alias_id = agent_item["AgentAliasId"]
        
        print(f"Deleting agent {bedrock_agent_id}")
        
        # Delete agent alias first
        try:
            BEDROCK_AGENTS_CLIENT.delete_agent_alias(
                agentId=bedrock_agent_id,
                agentAliasId=agent_alias_id
            )
            print(f"Deleted agent alias: {agent_alias_id}")
        except ClientError as e:
            if e.response['Error']['Code'] != 'ResourceNotFoundException':
                print(f"Warning: Could not delete agent alias: {e}")
        
        # Wait a bit before deleting the agent
        time.sleep(2)
        
        # Delete the agent
        BEDROCK_AGENTS_CLIENT.delete_agent(
            agentId=bedrock_agent_id,
            skipResourceInUseCheck=True
        )
        print(f"Deleted Bedrock agent: {bedrock_agent_id}")
        
    except ClientError as e:
        if e.response['Error']['Code'] != 'ResourceNotFoundException':
            print(f"Error deleting Bedrock agent: {e}")
            raise
    except Exception as e:
        print(f"Error deleting Bedrock agent: {e}")
        raise

def get_agent_alias_arn(agent_name: str) -> Optional[str]:
    """
    Fetches the agent's metadata from DynamoDB and returns the AliasArn if available
    """
    agent_metadata = get_agent_metadata(agent_name)
    if agent_metadata and 'AgentAliasId' in agent_metadata and 'ReferenceId' in agent_metadata:
        return f"arn:aws:bedrock:{AWS_REGION}:{ACCOUNT_ID}:agent-alias/{agent_metadata['ReferenceId']}/{agent_metadata['AgentAliasId']}"
    return None

def resolve_collaborator_arns(agent_config: Dict):
    """
    Resolve collaborator ARNs from agent names
    """
    if "AgentCollaborators" not in agent_config:
        return
    
    for collaborator in agent_config["AgentCollaborators"]:
        if "CollaboratorName" in collaborator:
            collaborator_agent_name = f"{ENVIRONMENT}-{collaborator['CollaboratorName']}"
            alias_arn = get_agent_alias_arn(collaborator_agent_name)
            
            if alias_arn:
                # Update AgentDescriptor with resolved ARN
                if "AgentDescriptor" in collaborator:
                    if isinstance(collaborator["AgentDescriptor"], list):
                        for desc in collaborator["AgentDescriptor"]:
                            desc["aliasArn"] = alias_arn
                    elif isinstance(collaborator["AgentDescriptor"], dict):
                        collaborator["AgentDescriptor"]["aliasArn"] = alias_arn
            else:
                print(f"Warning: Could not resolve ARN for collaborator {collaborator_agent_name}")

def lambda_handler(event, context):
    """
    Main Lambda handler for the Custom Resource
    """
    try:
        request_type = event.get('RequestType', 'Create')
        print(f"Request Type: {request_type}")
        print(f"Event: {json.dumps(event, default=str)}")
        
        if request_type == 'Delete':
            try:
                # Handle deletion - clean up agents
                system_agents_configs = load_system_agents_config()
                
                for agent_config in system_agents_configs:
                    agent_name = f"{ENVIRONMENT}-{agent_config['AgentName']}"
                    
                    # Get existing agent metadata
                    agent_item = get_agent_metadata(agent_name)
                    
                    if agent_item:
                        # Delete the Bedrock agent
                        delete_bedrock_agent(agent_item)
                        
                        # Delete metadata from DynamoDB
                        delete_system_agent_metadata(agent_name)
                
                send_response(event, context, 'SUCCESS', {'Message': 'Agents deleted successfully'})
                
            except Exception as e:
                print(f"Error during delete: {e}")
                send_response(event, context, 'FAILED', {}, reason=str(e))
            return
        
        # Load system agents configuration
        system_agents_configs = load_system_agents_config()
        
        created_agents = []
        updated_agents = []
        
        # Process each agent configuration
        for agent_config in system_agents_configs:
            try:
                # Prepare agent name with environment prefix
                original_agent_name = agent_config['AgentName']
                agent_name = f"{ENVIRONMENT}-{original_agent_name}"
                agent_config["AgentName"] = agent_name
                
                # Prepare Lambda ARN if specified
                lambda_arn = None
                lambda_name = agent_config.get('Lambda')
                if lambda_name:
                    lambda_name = f"{ENVIRONMENT}-{lambda_name}"
                    lambda_arn = f"arn:aws:lambda:{AWS_REGION}:{ACCOUNT_ID}:function:{lambda_name}"
                
                # Normalize knowledge bases configuration
                if 'KnowledgeBase' in agent_config:
                    kb = agent_config.pop('KnowledgeBase')
                    if isinstance(kb, list):
                        agent_config['KnowledgeBases'] = kb
                    else:
                        agent_config['KnowledgeBases'] = [kb]
                elif 'KnowledgeBases' in agent_config:
                    if not isinstance(agent_config['KnowledgeBases'], list):
                        agent_config['KnowledgeBases'] = [agent_config['KnowledgeBases']]
                
                # Resolve collaborator ARNs for multi-agent collaboration
                resolve_collaborator_arns(agent_config)
                
                # Check if agent already exists
                agent_item = get_agent_metadata(agent_name)
                
                if not agent_item:
                    # Create new agent
                    print(f"Creating new agent: {agent_name}")
                    
                    bedrock_agent_id, agent_alias_id, action_group_id, agent_version = create_update_bedrock_agent(
                        "create", agent_config, lambda_arn)
                    
                    # Create metadata
                    create_system_agent_metadata(agent_name, agent_version, agent_alias_id, 
                                                action_group_id, agent_config, bedrock_agent_id)
                    
                    created_agents.append(original_agent_name)
                    
                else:
                    # Update existing agent
                    print(f"Updating existing agent: {agent_name}")
                    
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
                    
            except Exception as e:
                print(f"Error processing agent {agent_config.get('AgentName', 'unknown')}: {e}")
                # Continue with other agents instead of failing completely
                continue
        
        # Return success response
        response_data = {
            'Message': 'Bedrock agents processed successfully',
            'CreatedAgents': created_agents,
            'UpdatedAgents': updated_agents
        }
        
        send_response(event, context, 'SUCCESS', response_data)
        
    except Exception as e:
        print(f"Critical error in lambda_handler: {e}")
        import traceback
        traceback.print_exc()
        send_response(event, context, 'FAILED', {}, reason=str(e))