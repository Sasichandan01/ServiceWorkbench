import json
import boto3
import re
import os
import tempfile
import zipfile
import datetime
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')

def build_agent_response(event, text,code_result):
    body={
        "body": text,
        "<codegenerated>":code_result
    }
    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": event["actionGroup"],
            "function": event.get("function", ""),
            "functionResponse": {
                "responseBody": {
                    "TEXT": {
                        "body":json.dumps(body)
                    }
                }
            },
        },
        "sessionAttributes": event.get("sessionAttributes", {}),
        "promptSessionAttributes": event.get("promptSessionAttributes", {})
    }

def parse_solution_output_for_archiving(solution_output_string):
    """
    Enhanced parser to handle multiple instances of each service type with filename attributes.
    Returns a list of dictionaries for all code artifacts found.
    """
    artifacts_to_archive = []
    
    print(f"Parsing solution output of length: {len(solution_output_string)}")
    
    # Enhanced regex patterns to find all instances with filename attributes
    glue_pattern = r'<glue\s+filename=["\']([^"\']+)["\']>(.*?)</glue>'
    lambda_pattern = r'<lambda\s+filename=["\']([^"\']+)["\']>(.*?)</lambda>'
    stepfunction_pattern = r'<stepfunction\s+filename=["\']([^"\']+)["\']>(.*?)</stepfunction>'
    
    # Find all matches with filenames
    glue_matches = re.findall(glue_pattern, solution_output_string, re.DOTALL)
    lambda_matches = re.findall(lambda_pattern, solution_output_string, re.DOTALL)
    stepfunction_matches = re.findall(stepfunction_pattern, solution_output_string, re.DOTALL)
    
    # Also check for legacy patterns without filename attributes (backward compatibility)
    legacy_glue = re.findall(r'<glue>(.*?)</glue>', solution_output_string, re.DOTALL)
    legacy_lambda = re.findall(r'<lambda>(.*?)</lambda>', solution_output_string, re.DOTALL)
    legacy_stepfunction = re.findall(r'<stepfunction>(.*?)</stepfunction>', solution_output_string, re.DOTALL)
    
    # Alternative naming patterns
    glue_matches.extend(re.findall(r'<glue_job\s+filename=["\']([^"\']+)["\']>(.*?)</glue_job>', solution_output_string, re.DOTALL))
    stepfunction_matches.extend(re.findall(r'<step_function\s+filename=["\']([^"\']+)["\']>(.*?)</step_function>', solution_output_string, re.DOTALL))
    
    print(f"Found {len(glue_matches)} Glue jobs with filenames, {len(lambda_matches)} Lambda functions with filenames, {len(stepfunction_matches)} Step Functions with filenames")
    print(f"Found {len(legacy_glue)} legacy Glue jobs, {len(legacy_lambda)} legacy Lambda functions, {len(legacy_stepfunction)} legacy Step Functions")

    def extract_code_content(block_content):
        """Extract code content from various possible tag formats"""
        # Try different possible tag names for code content
        for tag in ['code_content', 'code', 'content']:
            match = re.search(rf'<{tag}>(.*?)</{tag}>', block_content, re.DOTALL)
            if match:
                return match.group(1).strip()
        
        # If no tags found, assume the entire block is code
        return block_content.strip()

    def extract_requirements(block_content):
        """Extract requirements content from various possible tag formats"""
        for tag in ['requirements_txt', 'requirements', 'deps', 'dependencies']:
            match = re.search(rf'<{tag}>(.*?)</{tag}>', block_content, re.DOTALL)
            if match:
                return match.group(1).strip()
        return ""

    def extract_metadata(block_content):
        """Extract metadata like function name, description, etc."""
        metadata = {}
        
        # Common metadata tags
        for tag in ['name', 'function_name', 'description', 'runtime', 'timeout', 'memory']:
            match = re.search(rf'<{tag}>(.*?)</{tag}>', block_content, re.DOTALL)
            if match:
                metadata[tag] = match.group(1).strip()
        
        return metadata

    def validate_and_clean_filename(filename, service_type, index):
        """Validate and clean filename, ensuring proper extension"""
        if not filename:
            if service_type == 'lambda':
                return f'lambda_function_{index}.py'
            elif service_type == 'glue':
                return f'glue_job_{index}.py'
            elif service_type == 'stepfunctions':
                return f'step_function_{index}.json'
        
        # Clean filename - remove invalid characters
        clean_filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        
        # Ensure proper extension based on service type
        if service_type in ['lambda', 'glue'] and not clean_filename.endswith('.py'):
            clean_filename = clean_filename.rsplit('.', 1)[0] + '.py'
        elif service_type == 'stepfunctions' and not clean_filename.endswith('.json'):
            clean_filename = clean_filename.rsplit('.', 1)[0] + '.json'
        
        return clean_filename

    # Process Glue Jobs with filenames
    for i, (filename, glue_block) in enumerate(glue_matches, 1):
        code_content = extract_code_content(glue_block)
        reqs_content = extract_requirements(glue_block)
        metadata = extract_metadata(glue_block)
        
        print(f"Processing Glue Job #{i} with filename '{filename}', code length: {len(code_content)}")
        
        if code_content:
            clean_filename = validate_and_clean_filename(filename, 'glue', i)
            base_name = clean_filename.rsplit('.', 1)[0]
            
            artifacts_to_archive.append({
                "service_type": "glue",
                "service_index": i,
                "code_filename": clean_filename,
                "original_filename": filename,
                "code_content": code_content,
                "reqs_filename": f"{base_name}_requirements.txt" if reqs_content else None,
                "reqs_content": reqs_content,
                "metadata": metadata,
                "has_filename_attribute": True
            })

    # Process Lambda Functions with filenames
    for i, (filename, lambda_block) in enumerate(lambda_matches, 1):
        code_content = extract_code_content(lambda_block)
        reqs_content = extract_requirements(lambda_block)
        metadata = extract_metadata(lambda_block)
        
        print(f"Processing Lambda Function #{i} with filename '{filename}', code length: {len(code_content)}")
        
        if code_content:
            clean_filename = validate_and_clean_filename(filename, 'lambda', i)
            base_name = clean_filename.rsplit('.', 1)[0]
            
            artifacts_to_archive.append({
                "service_type": "lambda",
                "service_index": i,
                "code_filename": clean_filename,
                "original_filename": filename,
                "code_content": code_content,
                "reqs_filename": f"{base_name}_requirements.txt" if reqs_content else None,
                "reqs_content": reqs_content,
                "metadata": metadata,
                "has_filename_attribute": True
            })

    # Process Step Functions with filenames
    for i, (filename, step_block) in enumerate(stepfunction_matches, 1):
        code_content = extract_code_content(step_block)
        reqs_content = extract_requirements(step_block)
        metadata = extract_metadata(step_block)
        
        print(f"Processing Step Function #{i} with filename '{filename}', definition length: {len(code_content)}")
        
        if code_content:
            # Validate ASL JSON before adding
            try:
                json.loads(code_content)
                
                clean_filename = validate_and_clean_filename(filename, 'stepfunctions', i)
                base_name = clean_filename.rsplit('.', 1)[0]
                
                artifacts_to_archive.append({
                    "service_type": "stepfunctions",
                    "service_index": i,
                    "code_filename": clean_filename,
                    "original_filename": filename,
                    "code_content": code_content,
                    "reqs_filename": f"{base_name}_requirements.txt" if reqs_content else None,
                    "reqs_content": reqs_content,
                    "metadata": metadata,
                    "has_filename_attribute": True
                })
            except json.JSONDecodeError as e:
                print(f"Warning: Step Function #{i} with filename '{filename}' contains invalid JSON: {str(e)}")
                print(f"Content preview: {code_content[:200]}...")
                
                clean_filename = validate_and_clean_filename(filename, 'stepfunctions', i)
                # Add _invalid suffix to indicate JSON validation error
                base_name = clean_filename.rsplit('.', 1)[0] + '_invalid'
                clean_filename = f"{base_name}.json"
                
                artifacts_to_archive.append({
                    "service_type": "stepfunctions",
                    "service_index": i,
                    "code_filename": clean_filename,
                    "original_filename": filename,
                    "code_content": code_content,
                    "reqs_filename": f"{base_name}_requirements.txt" if reqs_content else None,
                    "reqs_content": reqs_content,
                    "metadata": {**metadata, "validation_error": str(e)},
                    "validation_warning": f"Invalid JSON: {str(e)}",
                    "has_filename_attribute": True
                })

    # Process legacy formats (backward compatibility)
    legacy_glue_start_index = len(glue_matches) + 1
    for i, glue_block in enumerate(legacy_glue, legacy_glue_start_index):
        code_content = extract_code_content(glue_block)
        reqs_content = extract_requirements(glue_block)
        metadata = extract_metadata(glue_block)
        
        print(f"Processing Legacy Glue Job #{i}, code length: {len(code_content)}")
        
        if code_content:
            job_name = metadata.get('name', metadata.get('function_name', f'glue_job_{i}'))
            safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', job_name)
            
            artifacts_to_archive.append({
                "service_type": "glue",
                "service_index": i,
                "code_filename": f"{safe_name}.py",
                "original_filename": None,
                "code_content": code_content,
                "reqs_filename": f"{safe_name}_requirements.txt" if reqs_content else None,
                "reqs_content": reqs_content,
                "metadata": metadata,
                "has_filename_attribute": False
            })

    legacy_lambda_start_index = len(lambda_matches) + 1
    for i, lambda_block in enumerate(legacy_lambda, legacy_lambda_start_index):
        code_content = extract_code_content(lambda_block)
        reqs_content = extract_requirements(lambda_block)
        metadata = extract_metadata(lambda_block)
        
        print(f"Processing Legacy Lambda Function #{i}, code length: {len(code_content)}")
        
        if code_content:
            func_name = metadata.get('name', metadata.get('function_name', f'lambda_function_{i}'))
            safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', func_name)
            
            artifacts_to_archive.append({
                "service_type": "lambda",
                "service_index": i,
                "code_filename": f"{safe_name}.py",
                "original_filename": None,
                "code_content": code_content,
                "reqs_filename": f"{safe_name}_requirements.txt" if reqs_content else None,
                "reqs_content": reqs_content,
                "metadata": metadata,
                "has_filename_attribute": False
            })

    legacy_sf_start_index = len(stepfunction_matches) + 1
    for i, step_block in enumerate(legacy_stepfunction, legacy_sf_start_index):
        code_content = extract_code_content(step_block)
        reqs_content = extract_requirements(step_block)
        metadata = extract_metadata(step_block)
        
        print(f"Processing Legacy Step Function #{i}, definition length: {len(code_content)}")
        
        if code_content:
            try:
                json.loads(code_content)
                
                sf_name = metadata.get('name', metadata.get('function_name', f'step_function_{i}'))
                safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', sf_name)
                
                artifacts_to_archive.append({
                    "service_type": "stepfunctions",
                    "service_index": i,
                    "code_filename": f"{safe_name}.asl.json",
                    "original_filename": None,
                    "code_content": code_content,
                    "reqs_filename": f"{safe_name}_requirements.txt" if reqs_content else None,
                    "reqs_content": reqs_content,
                    "metadata": metadata,
                    "has_filename_attribute": False
                })
            except json.JSONDecodeError as e:
                print(f"Warning: Legacy Step Function #{i} contains invalid JSON: {str(e)}")
                
                sf_name = metadata.get('name', metadata.get('function_name', f'step_function_{i}_invalid'))
                safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', sf_name)
                
                artifacts_to_archive.append({
                    "service_type": "stepfunctions",
                    "service_index": i,
                    "code_filename": f"{safe_name}.json",
                    "original_filename": None,
                    "code_content": code_content,
                    "reqs_filename": f"{safe_name}_requirements.txt" if reqs_content else None,
                    "reqs_content": reqs_content,
                    "metadata": {**metadata, "validation_error": str(e)},
                    "validation_warning": f"Invalid JSON: {str(e)}",
                    "has_filename_attribute": False
                })

    return artifacts_to_archive

def create_individual_zips(artifacts_to_archive, bucket_name, base_zip_key_prefix, timestamp):
    """
    Create separate zip files for each individual artifact containing ONLY the code file.
    """
    individual_zips_info = []
    
    for artifact in artifacts_to_archive:
        service_type = artifact['service_type']
        service_index = artifact['service_index']
        
        # Create zip filename based on the code filename
        base_name = artifact['code_filename'].rsplit('.', 1)[0]
        zip_filename = f"{artifact['code_filename']}.zip"
        zip_key = f"{base_zip_key_prefix}zips/{zip_filename}"
        
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, zip_filename)
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                # Add ONLY the main code file (no metadata, no requirements)
                zf.writestr(artifact['code_filename'], artifact['code_content'])
            
            # Upload individual zip
            s3_client.upload_file(
                Filename=zip_path,
                Bucket=bucket_name,
                Key=zip_key,
                ExtraArgs={'ContentType': 'application/zip'}
            )
            
            zip_file_size = os.path.getsize(zip_path)
            s3_zip_path_full = f"s3://{bucket_name}/{zip_key}"
            
            zip_info = {
                "service_type": service_type,
                "service_index": service_index,
                "filename": artifact['code_filename'],
                "zip_filename": zip_filename,
                "s3_zip_path": s3_zip_path_full,
                "zip_file_size_bytes": zip_file_size,
                "description": "Contains only the single code file"
            }
            
            individual_zips_info.append(zip_info)
            print(f"Created individual zip: {s3_zip_path_full}")
    
    return individual_zips_info

def upload_individual_files(artifacts_to_archive, bucket_name, base_key_prefix, timestamp):
    """
    Upload each code file individually as separate files in S3 (no requirements.txt).
    """
    individual_files_info = []
    
    # Create separate folders for each service type
    for artifact in artifacts_to_archive:
        service_type = artifact['service_type']
        
        # Create appropriate folder structure

        folder_prefix = f"{base_key_prefix}codes/"
        
        # Upload ONLY the main code file (no requirements.txt)
        code_key = f"{folder_prefix}{artifact['code_filename']}"
        
        # Determine content type based on file extension
        if artifact['code_filename'].endswith('.py'):
            content_type = 'text/x-python'
        elif artifact['code_filename'].endswith('.json'):
            content_type = 'application/json'
        else:
            content_type = 'text/plain'
        
        s3_client.put_object(
            Bucket=bucket_name,
            Key=code_key,
            Body=artifact['code_content'].encode('utf-8'),
            ContentType=content_type
        )
        
        file_info = {
            "service_type": artifact['service_type'],
            "service_index": artifact['service_index'],
            "filename": artifact['code_filename'],
            "s3_path": f"s3://{bucket_name}/{code_key}",
            "file_size_bytes": len(artifact['code_content'].encode('utf-8')),
            "content_type": content_type
        }
        
        individual_files_info.append(file_info)
        print(f"Uploaded individual file: {file_info['s3_path']}")
    
    return individual_files_info

def fetch_or_create_memory(bucket, key, summary):
    """
    Fetches memory.json from S3 if exists, otherwise creates a new one.
    Adds or updates the 'Code' field with the provided summary.
    """
    try:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
        memory = json.loads(resp['Body'].read().decode('utf-8'))
    except ClientError as e:
        # If the object does not exist, initialize a new memory dict
        if e.response['Error']['Code'] == 'NoSuchKey':
            memory = {}
        else:
            raise

    # Update the memory with the summary
    memory['Code'] = summary

    # Write back to S3
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(memory, indent=2).encode('utf-8'),
        ContentType='application/json'
    )

    return memory


def validate_input_parameters(parameters, action_function):
    """Validate all required parameters exist"""
    required_params = {
        'WorkspaceId': None,
        'SolutionId': None,
        'generatedSolutionOutput': None,
        'Summary': None
    }
    
    for param in parameters:
        name = param.get('name')
        value = param.get('value', '')
        
        if name in required_params:
            required_params[name] = value
    
    # Validate based on function
    if action_function == 'storeServiceArtifactsInS3':
        if not required_params['generatedSolutionOutput'] or not required_params['WorkspaceId'] or not required_params['SolutionId']:
            raise ValueError("generatedSolutionOutput/WorkspaceId/SolutionId is required for CodeStorageService")
    elif action_function == 'storeMemoryinS3':
        if not required_params['Summary'] or not required_params['WorkspaceId'] or not required_params['SolutionId']:
            raise ValueError("Summary/WorkspaceId/SolutionId is required for MemoryStorageService")
    else:
        raise ValueError(f"Invalid function name: {action_function}")
    
    return required_params


def lambda_handler(event, context):
    print(event)

    try:
        # Validate input parameters
        parameters = event.get('parameters', [])
        actiongroup = event['actionGroup']
        function_name=event['function']
        validated_params = validate_input_parameters(parameters,function_name)
        
        workspace_id = validated_params['WorkspaceId']
        solution_id = validated_params['SolutionId']
        
        bucket_name = 'bhargav9938'  # Consider making this configurable
        
        if function_name == 'storeServiceArtifactsInS3' and actiongroup == 'CodeStorageService':
            generated_solution_output = validated_params['generatedSolutionOutput']
            
            # Parse and validate the solution output
            parsed_artifacts = parse_solution_output_for_archiving(generated_solution_output)
            if not parsed_artifacts:
                return build_agent_response(event, "No valid code artifacts found to archive.", "false")

            timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            base_prefix = f"workspaces/{workspace_id}/solutions/{solution_id}/"
            
            # Store artifacts in S3
            individual_zips = create_individual_zips(parsed_artifacts, bucket_name, base_prefix, timestamp)
            individual_files = upload_individual_files(parsed_artifacts, bucket_name, base_prefix, timestamp)
            
            # Verify at least one file was uploaded
            if not individual_zips and not individual_files:
                return build_agent_response(event, "Failed to upload any artifacts to S3.", "false")
            
            response = {
                'message': 'Code artifacts successfully archived in S3',
                'individual_zips': individual_zips,
                'individual_files': individual_files,
                's3_bucket': bucket_name,
                's3_prefix': base_prefix
            }
            return build_agent_response(event, json.dumps(response), "true")

        elif function_name== "storeMemoryinS3" and actiongroup == 'CodeStorageService':
            summary = validated_params['Summary']
            memory_key = f"workspaces/{workspace_id}/solutions/{solution_id}/memory.json"
            print(memory_key)
            updated_memory = fetch_or_create_memory(bucket_name, memory_key, summary)
            
            response = {
                'message': 'Memory successfully updated in S3',
                'memory': updated_memory,
                's3_location': f"s3://{bucket_name}/{memory_key}"
            }
            return build_agent_response(event, json.dumps(response), "true")

    except ValueError as ve:
        print(f"Validation error: {str(ve)}")
        return build_agent_response(event, f"Validation error: {str(ve)}", "false")
    except ClientError as ce:
        print(f"S3 Client Error: {str(ce)}")
        return build_agent_response(event, f"S3 operation failed: {str(ce)}", "false")
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return build_agent_response(event, f"Unexpected error: {str(e)}", "false")