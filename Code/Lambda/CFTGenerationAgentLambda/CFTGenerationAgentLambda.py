import json
import boto3
import os
import time

bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")
s3_client = boto3.client("s3")
cf = boto3.client('cloudformation')
sc = boto3.client('servicecatalog')
sfn_client = boto3.client('stepfunctions')

KNOWLEDGE_BASE_ID = "1IRBPZU9KF"
MODEL_ARN = "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0"
S3_OUTPUT_BUCKET = "wb-agent-output-bucket"

PORTFOLIO_ID = "port-po3aqdmed72ig"
PROVISIONED_PRODUCT_NAME_PREFIX = "AgentProvisionedProduct"

STEP_FUNCTION_ARN = "arn:aws:states:us-east-1:043309350924:stateMachine:wb-test-stepfunction"
DEFAULT_HARDCODED_CFT_URL = "https://wb-agent-output-bucket.s3.us-east-1.amazonaws.com/1/1/cft/1.yaml"

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

def handle_provision(event):
    """
    Handles the Service Catalog product provisioning phase.
    """
    print("Provisioning product via Service Catalog")

    provisioned_product_name = f"{PROVISIONED_PRODUCT_NAME_PREFIX}-{int(time.time())}"

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

        is_initial_agent_call = "actionGroup" in event and "function" in event and event.get("function") == "cftUpload"

        if is_initial_agent_call:
            print("Handling initial agent call: CFT upload and Step Function invocation.")
            cft_value = None
            provisioning_parameters_from_agent = []
            tags_from_agent = []
            cft_parameters = []

            parameters = event.get("parameters", [])
            for param in parameters:
                if param.get("name") == "cft":
                    cft_value = param.get("value")
                if param.get("name") == "Metadata":
                    cft_parameters = param.get("value",[])

            print("cft parameters are as follows: ")
            print(cft_parameters)

            if not cft_value:
                return build_agent_response(event, "Missing required 'cft' input parameter.")

            workspace_id = "1"
            solution_id = "1"
            version_num = "1"

            s3_key = f"{workspace_id}/{solution_id}/cft/{version_num}.yaml"
            s3_cft_url = f"https://{S3_OUTPUT_BUCKET}.s3.amazonaws.com/{s3_key}"

            print(f"Attempting to upload CFT to s3://{S3_OUTPUT_BUCKET}/{s3_key}")

            try:
                s3_client.put_object(
                    Bucket=S3_OUTPUT_BUCKET,
                    Key=s3_key,
                    Body=cft_value.encode('utf-8'),
                    ContentType="text/yaml"
                )
                print(f"Successfully uploaded CFT to s3://{S3_OUTPUT_BUCKET}/{s3_key}")
            except Exception as e:
                print(f"Error uploading CFT to S3: {e}")
                return build_agent_response(event, f"Error uploading CFT to S3: {str(e)}")

            print(f"Starting Step Function: {STEP_FUNCTION_ARN}")
            try:
                sfn_input = {
                    "provisioning_parameters": cft_parameters,
                    "tags": tags_from_agent,
                }

                sfn_response = sfn_client.start_execution(
                    stateMachineArn=STEP_FUNCTION_ARN,
                    input=json.dumps(sfn_input)
                )
                print("Step Function execution started. Execution ARN:", sfn_response['executionArn'])

                print(f"Returning preliminary response to agent: CFT uploaded to S3. Service Catalog provisioning initiated via Step Function (Execution ARN: {sfn_response['executionArn']}). Please monitor the Step Function for completion and resource details.")

            except Exception as e:
                print(f"Error starting Step Function: {e}")
                return build_agent_response(event, f"Error initiating Service Catalog provisioning: {str(e)}")

        else:
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
                result = handle_finalize(event, context)
                return build_agent_response(event, f"{result}")
            else:
                return result

    except Exception as e:
        print(f"Error during Lambda execution: {str(e)}")
        if not is_initial_agent_call:
            raise
        return build_agent_response(event, f"An unexpected error occurred: {str(e)}")