import json
import boto3
import os
import time

bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")
s3_client = boto3.client("s3")
cf = boto3.client('cloudformation')
sc = boto3.client('servicecatalog')
sfn_client = boto3.client('stepfunctions')
DYNAMO_DB = boto3.resource('dynamodb')
SOLUTIONS_TABLE_NAME = os.environ.get("SOLUTIONS_TABLE")
SOLUTIONS_TABLE = DYNAMO_DB.Table(SOLUTIONS_TABLE_NAME)

KNOWLEDGE_BASE_ID = "1IRBPZU9KF"
MODEL_ARN = "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0"
S3_OUTPUT_BUCKET = "develop-service-workbench-workspaces" 

PORTFOLIO_ID = "port-po3aqdmed72ig"
PROVISIONED_PRODUCT_NAME_PREFIX = "AgentProvisionedProduct"

STEP_FUNCTION_ARN = "arn:aws:states:us-east-1:043309350924:stateMachine:wb-test-stepfunction"
DEFAULT_HARDCODED_CFT_URL = "https://wb-agent-output-bucket.s3.us-east-1.amazonaws.com/1/1/cft/1.yaml"

# Global variable to store S3 object key
GLOBAL_S3_OBJECT_KEY = None

# Add global variables at the top
workspace_id = None
solution_id = None

def build_agent_response(event, text):
    """
    Constructs the response body for the Bedrock Agent.
    """
    print("Building agent response")
    response = {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": event.get("actionGroup", ""),
            "function": event.get("function", ""),
            "functionResponse": {
                "responseBody": {
                    "TEXT": {
                        "body": text
                    }
                }
            },
        },
        "sessionAttributes": event.get("sessionAttributes", {}),
        "promptSessionAttributes": event.get("promptSessionAttributes", {})
    }
    print(response)
    return response

def get_cft_s3_key(workspace_id, solution_id):
    """
    Returns the S3 key for the CFT file based on workspace and solution IDs.
    """
    return f"workspaces/{workspace_id}/solutions/{solution_id}/cft/cft.yaml"

def get_cft_s3_url(bucket, workspace_id, solution_id, region="us-east-1"):
    """
    Returns the S3 URL for the CFT file based on workspace and solution IDs.
    """
    return f"https://{bucket}.s3.{region}.amazonaws.com/workspaces/{workspace_id}/solutions/{solution_id}/cft/cft.yaml"

def handle_cft_upload(event):
    """
    Handles CFT upload to S3 and returns the S3 object key.
    """
    global GLOBAL_S3_OBJECT_KEY
    global workspace_id, solution_id
    workspace_id = ""
    solution_id = ""
    
    print("Handling CFT upload to S3.")
    
    cft_value = None
    parameters = event.get("parameters", [])
    
    for param in parameters:
        if param.get("name") == "cft":
            cft_value = param.get("value")
        elif param.get("name") == "workspace_id":
            workspace_id = param.get("value")
        elif param.get("name") == "solution_id":
            solution_id = param.get("value")
    
    if not cft_value:
        return build_agent_response(event, "Missing required 'cft' input parameter.")
    if not workspace_id or not solution_id:
        return build_agent_response(event, "Missing required 'workspace_id' or 'solution_id' input parameter.")
    
    s3_key = get_cft_s3_key(workspace_id, solution_id)
    GLOBAL_S3_OBJECT_KEY = s3_key  # Store in global variable
    print(f"Attempting to upload CFT to s3://{S3_OUTPUT_BUCKET}/{s3_key}")
    
    try:
        s3_client.put_object(
            Bucket=S3_OUTPUT_BUCKET,
            Key=s3_key,
            Body=cft_value.encode('utf-8'),
            ContentType="text/yaml"
        )
        print(f"Successfully uploaded CFT to s3://{S3_OUTPUT_BUCKET}/{s3_key}")
        s3_object_key_response = f"s3://{S3_OUTPUT_BUCKET}/{s3_key}"
        response_message = json.dumps(
            {
                "UploadStatus": "Success",
                "<codegenerated>":"true"
            }
        )

        if workspace_id and solution_id:
            try:
                SOLUTIONS_TABLE.update_item(
                    Key={
                        'WorkspaceId': workspace_id,
                        'SolutionId': solution_id
                    },
                    UpdateExpression='SET #s = :ready',
                    ExpressionAttributeNames={
                        '#s': 'SolutionStatus'
                    },
                    ExpressionAttributeValues={
                        ':ready': 'READY'
                    },
                    ReturnValues='UPDATED_NEW'
                )
                print(f"Successfully updated solution status to READY for workspace {workspace_id}, solution {solution_id}")
            except Exception as e:
                print(f"Error updating solution status to READY: {e}")

        return build_agent_response(event, response_message)
    except Exception as e:
        print(f"Error uploading CFT to S3: {e}")
        return build_agent_response(event, f"Error uploading CFT to S3: {str(e)}")

    

def handle_deploy(event):
    """
    Handles deployment by executing all Service Catalog phases synchronously.
    """
    global GLOBAL_S3_OBJECT_KEY
    global workspace_id, solution_id
    print("Handling deployment - executing Service Catalog provisioning synchronously.")
    
    # Extract parameters
    approval = None
    invoke_point = None
    parameters = event.get("parameters", [])
    for param in parameters:
        if param.get("name") == "approval":
            approval = param.get("value")
        elif param.get("name") == "invoke_point":
            invoke_point = param.get("value")
    
    if approval != "true":
        return build_agent_response(event, "Deployment not approved. Please provide approval=true to proceed with deployment.")
    if not GLOBAL_S3_OBJECT_KEY or not workspace_id or not solution_id:
        return build_agent_response(event, "No CFT has been uploaded yet or missing workspace/solution id. Please upload a CFT first using the cftUpload function.")
    
    print(f"Using S3 object key: {GLOBAL_S3_OBJECT_KEY}")
    print(f"Invoke point: {invoke_point}")
    
    try:
        # Extract any additional parameters for provisioning
        provisioning_parameters = []
        tags = []
        # Phase 1: Provision
        print("Starting provisioning phase...")
        provision_result = execute_provision_phase(provisioning_parameters, tags, workspace_id, solution_id)
        if provision_result.get("phase") == "error":
            return build_agent_response(event, f"Provisioning failed: {provision_result.get('error_message')}")
        record_id = provision_result["RecordId"]
        provisioned_product_name = provision_result["provisioned_product_name"]
        # Phase 2: Poll until completion
        print("Starting polling phase...")
        poll_result = execute_polling_phase(record_id, provisioned_product_name)
        if poll_result.get("phase") == "error":
            return build_agent_response(event, f"Provisioning failed during polling: {poll_result.get('error_message')}")
        # Phase 3: Finalize
        print("Starting finalization phase...")
        finalize_result = execute_finalize_phase(record_id, provisioned_product_name)
        if finalize_result.get("phase") == "error":
            return build_agent_response(event, f"Provisioning failed during finalization: {finalize_result.get('error_message')}")
        
        # Store invoke_point in solutions table if provided
        if invoke_point and workspace_id and solution_id:
            try:
                SOLUTIONS_TABLE.update_item(
                    Key={
                        'WorkspaceId': workspace_id,
                        'SolutionId': solution_id
                    },
                    UpdateExpression='SET #invoke = :invoke_point',
                    ExpressionAttributeNames={
                        '#invoke': 'Invocation'
                    },
                    ExpressionAttributeValues={
                        ':invoke_point': invoke_point
                    },
                    ReturnValues='UPDATED_NEW'
                )
                print(f"Successfully stored invoke_point '{invoke_point}' in solutions table")
            except Exception as e:
                print(f"Error storing invoke_point in solutions table: {e}")

        # Update solution status to READY after successful deployment
        
        
        # Success response
        success_message = json.dumps({
            "Status": "Success",
            "Message": "Deployment completed successfully",
            "CloudFormationStackARN": finalize_result.get("CloudFormationStackARN"),
            "ProvisionedProductName": finalize_result.get("ProvisionedProductName"),
            "Resources": finalize_result.get("Resources", [])
        }, indent=2)
        return build_agent_response(event, success_message)
    except Exception as e:
        print(f"Error during deployment: {e}")
        return build_agent_response(event, f"Error during deployment: {str(e)}")

def execute_provision_phase(provisioning_parameters, tags, workspace_id, solution_id):
    """
    Executes the Service Catalog product provisioning phase.
    """
    print("Provisioning product via Service Catalog")
    global GLOBAL_S3_OBJECT_KEY
    provisioned_product_name = f"{PROVISIONED_PRODUCT_NAME_PREFIX}-{int(time.time())}"
    # Use the dynamic S3 URL for the template
    template_url = get_cft_s3_url(S3_OUTPUT_BUCKET, workspace_id, solution_id)
    print(f"Using CFT template URL for Service Catalog provisioning: {template_url}")
    try:
        product = sc.create_product(
            Name=provisioned_product_name,
            Owner='WB',
            ProductType='CLOUD_FORMATION_TEMPLATE',
            ProvisioningArtifactParameters={
                'Name': 'v1',
                'Description': 'Initial version uploaded by Agent',
                'Info': {
                    'LoadTemplateFromURL': template_url
                },
                'Type': 'CLOUD_FORMATION_TEMPLATE'
            }
        )
        product_id = product['ProductViewDetail']['ProductViewSummary']['ProductId']
        artifact_id = product['ProvisioningArtifactDetail']['Id']
        
        # Associate product with portfolio
        try:
            sc.associate_product_with_portfolio(
                ProductId=product_id,
                PortfolioId=PORTFOLIO_ID
            )
            print(f"Successfully associated product {product_id} with portfolio {PORTFOLIO_ID}")
        except Exception as e:
            print(f"Error associating product with portfolio: {e}")
            raise Exception(f"Failed to associate product with portfolio: {str(e)}")
        
        # Wait for association to propagate
        print("Waiting for product association to propagate...")
        time.sleep(10)
        
        # Verify the association was successful
        try:
            portfolio_detail = sc.describe_portfolio(Id=PORTFOLIO_ID)
            associated_products = []
            
            # Check if there are any associated products
            if 'AssociatedProducts' in portfolio_detail.get('PortfolioDetail', {}):
                associated_products = [p['ProductId'] for p in portfolio_detail['PortfolioDetail']['AssociatedProducts']]
            
            if product_id not in associated_products:
                print(f"Warning: Product {product_id} not found in associated products list")
                # Try to verify by describing the product
                try:
                    product_detail = sc.describe_product(Id=product_id)
                    print(f"Product {product_id} exists and is accessible")
                except Exception as product_error:
                    print(f"Error describing product {product_id}: {product_error}")
                    raise Exception(f"Product {product_id} was not successfully associated with portfolio {PORTFOLIO_ID}")
            
            print(f"Product {product_id} successfully associated with portfolio {PORTFOLIO_ID}")
        except Exception as e:
            print(f"Error verifying product association: {e}")
            print(f"Warning: Could not verify product association, but continuing with provisioning")
        
        print(f"Attempting to provision product with ID: {product_id}, artifact ID: {artifact_id}")
        print(f"Portfolio ID: {PORTFOLIO_ID}")
        print(f"Provisioned product name: {provisioned_product_name}")
        
        try:
            response = sc.provision_product(
                ProductId=product_id,
                ProvisioningArtifactId=artifact_id,
                ProvisionedProductName=provisioned_product_name,
                ProvisioningParameters=provisioning_parameters,
                Tags=tags
            )
            print(f"Successfully initiated provisioning with record ID: {response['RecordDetail']['RecordId']}")
        except Exception as provision_error:
            print(f"Provisioning failed with error: {provision_error}")
            
            # Try to get more details about the product and portfolio
            try:
                product_detail = sc.describe_product(Id=product_id)
                print(f"Product details: {product_detail}")
            except Exception as e:
                print(f"Could not get product details: {e}")
            
            try:
                portfolio_detail = sc.describe_portfolio(Id=PORTFOLIO_ID)
                print(f"Portfolio details: {portfolio_detail}")
            except Exception as e:
                print(f"Could not get portfolio details: {e}")
            
            raise provision_error
        return {
            "phase": "poll",
            "RecordId": response['RecordDetail']['RecordId'],
            "provisioned_product_name": provisioned_product_name,
        }
    except Exception as e:
        print(f"Error in Service Catalog provisioning: {e}")
        return {
            "phase": "error",
            "error_message": f"Provisioning failed during 'provision' phase: {str(e)}"
        }

def execute_polling_phase(record_id, provisioned_product_name, max_polls=60, poll_interval=30):
    """
    Polls the status of the Service Catalog product provisioning until completion.
    """
    print(f"Polling Service Catalog product with RecordId: {record_id}")
    
    for attempt in range(max_polls):
        try:
            response = sc.describe_record(Id=record_id)
            status = response['RecordDetail']['Status']
            print(f"Poll attempt {attempt + 1}: Status = {status}")

            # If the status is FAILED or ERROR, return an error message
            if status in ["FAILED", "ERROR"]:
                return {
                    "phase": "error",
                    "RecordId": record_id,
                    "status": status,
                    "error_message": response['RecordDetail'].get('StatusMessage', 'Provisioning failed.'),
                    "provisioned_product_name": provisioned_product_name,
                }

            # If succeeded, return success
            if status == "SUCCEEDED":
                return {
                    "phase": "finalize",
                    "RecordId": record_id,
                    "status": status,
                    "provisioned_product_name": provisioned_product_name,
                }
            
            # If still in progress, wait and continue polling
            if status in ["CREATED", "IN_PROGRESS", "IN_PROGRESS_IN_ERROR"]:
                time.sleep(poll_interval)
                continue
            
        except Exception as e:
            print(f"Error polling Service Catalog product: {e}")
            return {
                "phase": "error",
                "error_message": f"Provisioning failed during 'poll' phase: {str(e)}"
            }
    
    # If we've exceeded max polls
    return {
        "phase": "error",
        "error_message": f"Provisioning timed out after {max_polls} polling attempts"
    }

def execute_finalize_phase(record_id, provisioned_product_name):
    """
    Executes the finalization phase, extracting CloudFormation stack resources.
    """
    print("Finalizing Service Catalog product")
    global workspace_id, solution_id
    try:
        record = sc.describe_record(Id=record_id)

        stack_arn = None
        for output in record.get('RecordOutputs', []):
            if output['OutputKey'] == 'CloudformationStackARN':
                stack_arn = output['OutputValue']
                break

        if not stack_arn:
            try:
                provisioned_product_detail = sc.describe_provisioned_product(
                    Id=record['RecordDetail']['ProvisionedProductId']
                )
                stack_id_from_detail = provisioned_product_detail['ProvisionedProductDetail'].get('CloudformationStackId')
                if stack_id_from_detail:
                    # Extract stack name and ID from the stack ID
                    stack_parts = stack_id_from_detail.split('/')
                    if len(stack_parts) >= 3:
                        region = boto3.Session().region_name or 'us-east-1'
                        account_id = boto3.client('sts').get_caller_identity()['Account']
                        stack_arn = f"arn:aws:cloudformation:{region}:{account_id}:stack/{stack_parts[1]}/{stack_parts[2]}"
            except Exception as e:
                print(f"Could not get stack ARN from provisioned product detail: {e}")
        
        if not stack_arn:
            return {
                "phase": "error",
                "error_message": "CloudFormationStackARN not found in Service Catalog record outputs or provisioned product details."
            }

        resources = cf.describe_stack_resources(StackName=stack_arn)
        res_list = [
            {
                "LogicalResourceId": r['LogicalResourceId'],
                "PhysicalResourceId": r['PhysicalResourceId'],
                "Type": r['ResourceType']
            }
            for r in resources['StackResources']
        ]

        # Update the solutions table with the resources in the required format
        resource_items = [
            {
                "ResourceName": r['LogicalResourceId'],
                "ResourceId": r['PhysicalResourceId'],
                "Type": r['Type']
            }
            for r in res_list
        ]
        if workspace_id and solution_id:
            try:
                SOLUTIONS_TABLE.update_item(
                    Key={
                        'WorkspaceId': workspace_id,
                        'SolutionId': solution_id
                    },
                    UpdateExpression='SET #resource = :resource_list',
                    ExpressionAttributeNames={
                        '#resource': 'Resource'
                    },
                    ExpressionAttributeValues={
                        ':resource_list': resource_items
                    },
                    ReturnValues='UPDATED_NEW'
                )
            except Exception as e:
                print(f"Error updating Resource column in solutions table: {e}")

        result = {
            "phase": "done",
            "CloudFormationStackARN": stack_arn,
            "Resources": res_list,
            "ProvisionedProductName": provisioned_product_name
        }

        print("Service Catalog Finalization Result:", json.dumps(result))
        return result
        
    except Exception as e:
        print(f"Error during finalization: {e}")
        return {
            "phase": "error",
            "error_message": f"Provisioning failed during 'finalize' phase: {str(e)}"
        }

# Keep the original functions for backward compatibility or other use cases
def handle_provision(event):
    """
    Handles the Service Catalog product provisioning phase.
    """
    print("Provisioning product via Service Catalog")
    global GLOBAL_S3_OBJECT_KEY

    provisioned_product_name = f"{PROVISIONED_PRODUCT_NAME_PREFIX}-{int(time.time())}"

    # Use the global S3 object key to construct the template URL
    if GLOBAL_S3_OBJECT_KEY:
        template_url = f"https://{S3_OUTPUT_BUCKET}.s3.us-east-1.amazonaws.com/{GLOBAL_S3_OBJECT_KEY}"
    else:
        template_url = DEFAULT_HARDCODED_CFT_URL
    print(f"Using CFT template URL for Service Catalog provisioning: {template_url}")

    try:
        product = sc.create_product(
            Name=provisioned_product_name,
            Owner='WB',
            ProductType='CLOUD_FORMATION_TEMPLATE',
            ProvisioningArtifactParameters={
                'Name': 'v1',
                'Description': 'Initial version uploaded by Agent',
                'Info': {
                    'LoadTemplateFromURL': template_url
                },
                'Type': 'CLOUD_FORMATION_TEMPLATE'
            }
        )
        product_id = product['ProductViewDetail']['ProductViewSummary']['ProductId']
        artifact_id = product['ProvisioningArtifactDetail']['Id']

        sc.associate_product_with_portfolio(
            ProductId=product_id,
            PortfolioId=PORTFOLIO_ID
        )

        time.sleep(5)

        response = sc.provision_product(
            ProductId=product_id,
            ProvisioningArtifactId=artifact_id,
            ProvisionedProductName=provisioned_product_name,
            ProvisioningParameters=event.get('provisioning_parameters', []),
            Tags=event.get('tags', [])
        )

        return {
            "phase": "poll",
            "RecordId": response['RecordDetail']['RecordId'],
            "provisioned_product_name": provisioned_product_name,
        }
    except Exception as e:
        print(f"Error in Service Catalog provisioning: {e}")
        return {
            "phase": "error",
            "error_message": f"Provisioning failed during 'provision' phase: {str(e)}"
        }

def handle_poll(event):
    """
    Handles polling the status of the Service Catalog product provisioning.
    """
    print(f"Polling Service Catalog product with RecordId: {event['RecordId']}")
    record_id = event['RecordId']
    try:
        response = sc.describe_record(Id=record_id)
        status = response['RecordDetail']['Status']

        # If the status is FAILED or ERROR, return an error message
        if status in ["FAILED", "ERROR"]:
            return {
                "phase": "error",
                "RecordId": record_id,
                "status": status,
                "error_message": response['RecordDetail'].get('StatusMessage', 'Provisioning failed.'),
                "provisioned_product_name": event.get("provisioned_product_name"),
            }

        return {
            "phase": "finalize" if status == "SUCCEEDED" else "poll",
            "RecordId": record_id,
            "status": status,
            "provisioned_product_name": event.get("provisioned_product_name"),
        }
    except Exception as e:
        print(f"Error polling Service Catalog product: {e}")
        return {
            "phase": "error",
            "error_message": f"Provisioning failed during 'poll' phase: {str(e)}"
        }

def handle_finalize(event, context=None):
    """
    Handles the finalization phase, extracting CloudFormation stack resources.
    """
    print("Finalizing Service Catalog product")
    record_id = event['RecordId']
    product_name = event.get('provisioned_product_name')
    try:
        record = sc.describe_record(Id=record_id)

        stack_arn = None
        for output in record.get('RecordOutputs', []):
            if output['OutputKey'] == 'CloudformationStackARN':
                stack_arn = output['OutputValue']
                break

        if not stack_arn:
            try:
                provisioned_product_detail = sc.describe_provisioned_product(
                    Id=record['RecordDetail']['ProvisionedProductId']
                )
                stack_id_from_detail = provisioned_product_detail['ProvisionedProductDetail'].get('CloudformationStackId')
                if stack_id_from_detail and context:
                    account_id = context.invoked_function_arn.split(":")[4]
                    region = context.invoked_function_arn.split(":")[3]
                    stack_arn = f"arn:aws:cloudformation:{region}:{account_id}:stack/{stack_id_from_detail.split('/')[1]}/{stack_id_from_detail.split('/')[2]}"
            except Exception as e:
                print(f"Could not get stack ARN from provisioned product detail: {e}")
                pass
        if not stack_arn:
            return {
                "phase": "error",
                "error_message": "CloudFormationStackARN not found in Service Catalog record outputs or provisioned product details."
            }

        resources = cf.describe_stack_resources(StackName=stack_arn)
        res_list = [
            {
                "LogicalResourceId": r['LogicalResourceId'],
                "PhysicalResourceId": r['PhysicalResourceId'],
                "Type": r['ResourceType']
            }
            for r in resources['StackResources']
        ]

        result = {
            "phase": "done",
            "CloudFormationStackARN": stack_arn,
            "Resources": res_list,
            "ProvisionedProductName": product_name
        }

        print("Service Catalog Finalization Result:", json.dumps(result))
        return result
    except Exception as e:
        print(f"Error during finalization: {e}")
        return {
            "phase": "error",
            "error_message": f"Provisioning failed during 'finalize' phase: {str(e)}"
        }

def lambda_handler(event, context):
    """
    Main Lambda handler to process events from Bedrock Agent or Step Function.
    """
    try:
        print("Received event:", json.dumps(event))

        # Check if this is an agent call
        is_agent_call = "actionGroup" in event and "function" in event
        
        if is_agent_call:
            function_name = event.get("function")
            
            if function_name == "cftUpload":
                print("Handling cftUpload function")
                return handle_cft_upload(event)
                
            elif function_name == "deploycft":
                print("Handling deploy function")
                return handle_deploy(event)
                
            else:
                return build_agent_response(event, f"Unknown function: {function_name}")
        
        else:
            # Handle Step Function phases (kept for backward compatibility)
            print("Handling Step Function callback for Service Catalog phases.")
            phase = event.get("phase")

            if phase == "provision":
                result = handle_provision(event)
            elif phase == "poll":
                result = handle_poll(event)
            elif phase == "finalize":
                result = handle_finalize(event, context)
            else:
                raise ValueError(f"Unknown phase in Step Function input: {phase}")

            # If the phase is error, return a user-facing error message
            if result.get("phase") == "error":
                return build_agent_response(event, f"Provisioning failed: {result.get('error_message', 'Unknown error')}")
            elif phase == "finalize":

                #upadte the solution table status field to "READY"
                global workspace_id, solution_id
                if workspace_id and solution_id:
                    response = SOLUTIONS_TABLE.update_item(
                        Key={
                            'WorkspaceId': workspace_id,
                            'SolutionId': solution_id
                        },
                        UpdateExpression='SET #s = :ready',
                        ExpressionAttributeNames={
                            '#s': 'SolutionStatus'
                        },
                        ExpressionAttributeValues={
                            ':ready': 'READY'
                        },
                        ReturnValues='UPDATED_NEW'
                    )

                result = handle_finalize(event, context)
                
                return build_agent_response(event, f"{result}")
            else:
                return result

    except Exception as e:
        print(f"Error during Lambda execution: {str(e)}")
        if not is_agent_call:
            raise
        return build_agent_response(event, f"An unexpected error occurred: {str(e)}")