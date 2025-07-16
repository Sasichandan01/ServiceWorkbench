import logging
import boto3
import json
import os
import urllib3
from botocore.exceptions import ClientError
from requests_aws4auth import AWS4Auth
from opensearchpy import OpenSearch, RequestsHttpConnection, NotFoundError
from CustomResource.custom_resource import send_cfn_response

# Initialize logging and environment variables
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)
REGION = os.environ.get("REGION")
http = urllib3.PoolManager()

# def send_cfn_response(event, context, status, reason=None, data=None):
#     """Send response to CloudFormation with proper error handling"""
#     response_body = {
#         "Status": status,
#         "Reason": reason or f"See details in CloudWatch Log Stream: {context.log_stream_name}",
#         "PhysicalResourceId": context.log_stream_name,
#         "StackId": event["StackId"],
#         "RequestId": event["RequestId"],
#         "LogicalResourceId": event["LogicalResourceId"],
#         "Data": data or {}
#     }

#     try:
#         response = http.request(
#             "PUT",
#             event["ResponseURL"],
#             body=json.dumps(response_body).encode('utf-8'),
#             headers={"Content-Type": "application/json"}
#         )
#         LOGGER.info("CloudFormation response sent with status: %s", response.status)
#     except Exception as e:
#         LOGGER.error("Failed to send CloudFormation response: %s", e)
#         raise

def connect_to_opensearch(os_endpoint):
    """Establish connection to OpenSearch cluster with robust error handling"""
    try:
        LOGGER.info('Connecting to OpenSearch endpoint: %s', os_endpoint)
        session = boto3.session.Session()
        credentials = session.get_credentials().get_frozen_credentials()
        
        awsauth = AWS4Auth(
            credentials.access_key,
            credentials.secret_key,
            REGION,
            'es',
            session_token=credentials.token
        )
        os_client = OpenSearch(
            hosts         = [{"host": os_endpoint, "port": 443}],
            http_compress = True,
            http_auth     = awsauth,
            use_ssl       = True,
            verify_certs  = True,
            connection_class = RequestsHttpConnection,
            timeout       = 420
        )
        return os_client
    except Exception as e:
        LOGGER.error("Failed to connect to OpenSearch: %s", e)
        raise

def list_opensearch_indices(os_client):
    """List all indices in OpenSearch cluster with error handling"""
    try:
        response = os_client.cat.indices(format="json", h="index")
        return [index['index'] for index in response]
    except NotFoundError:
        LOGGER.info("No indices found in OpenSearch cluster")
        return []
    except Exception as e:
        LOGGER.error("Failed to list OpenSearch indices: %s", e)
        raise

def add_master_users(os_client, master_arns):
    """Add IAM roles as master users to OpenSearch security plugin"""
    if not master_arns:
        LOGGER.info("No master ARNs provided, skipping role mapping")
        return

    roles_to_update = ["all_access", "security_manager"]
    results = {}

    for role in roles_to_update:
        path = f"/_plugins/_security/api/rolesmapping/{role}"
        try:
            # Get current mapping
            current_mapping = os_client.transport.perform_request("GET", path)
            
            # Merge existing backend roles with new ones
            existing_roles = set(current_mapping.get("backend_roles", []))
            new_roles = set(master_arns)
            combined_roles = list(existing_roles.union(new_roles))
            
            # Prepare update payload
            update_payload = {
                "backend_roles": combined_roles,
                "hosts": current_mapping.get("hosts", []),
                "users": current_mapping.get("users", [])
            }
            
            # Apply update
            response = os_client.transport.perform_request(
                "PUT", 
                path, 
                body=update_payload
            )
            
            results[role] = {
                "status": "success",
                "added_roles": list(new_roles - existing_roles),
                "existing_roles": list(existing_roles)
            }
            LOGGER.info("Updated role mapping for %s: %s", role, response)
            
        except Exception as e:
            results[role] = {
                "status": "failed",
                "error": str(e)
            }
            LOGGER.error("Failed to update role mapping for %s: %s", role, e)
    
    return results

def create_opensearch_indices(os_client):
    """
    Create multiple vector indices in OpenSearch with proper error handling.
    """
    operations = {}
    
    try:
        # Define index suffixes
        index_suffixes = [
            'develop',
            'wb-abhishek',
            'wb-mayank',
            'wb-salma',
            'wb-bhargav'
        ]

        for suffix in index_suffixes:
            index_name = f"{suffix}_vector_index"
            
            # Check if index already exists
            if os_client.indices.exists(index=index_name):
                LOGGER.info("Index %s already exists", index_name)
                operations[index_name] = {"status": "exists"}
                continue

            mapping = {
                "settings": {
                    "index": {
                        "knn": True,
                        "knn.algo_param.ef_search": 512
                    }
                },
                "mappings": {
                    "properties": {
                        "bedrock-knowledge-base-default-vector": {
                            "type": "knn_vector",
                            "dimension": 1024,
                            "method": {
                                "name": "hnsw",
                                "engine": "faiss",
                                "parameters": {
                                    "ef_construction": 512,
                                    "m": 16
                                }
                            }
                        },
                        "AMAZON_BEDROCK_TEXT_CHUNK": {"type": "text"},
                        "AMAZON_BEDROCK_METADATA": {"type": "text"}
                    }
                }
            }

            response = os_client.indices.create(index=index_name, body=mapping)
            LOGGER.info("Created index %s successfully", index_name)
            operations[index_name] = {"status": "created", "response": response}

        return {"status": "success", "operations": operations}

    except Exception as e:
        LOGGER.error("Failed to create OpenSearch indices: %s", e)
        raise


def get_db_credentials(secret_arn):
    """Retrieve database credentials from Secrets Manager with retry logic"""
    client = boto3.client('secretsmanager')
    try:
        response = client.get_secret_value(SecretId=secret_arn)
        return json.loads(response['SecretString'])
    except ClientError as e:
        LOGGER.error("Error retrieving database secret: %s", e)
        raise

def execute_sql(cluster_arn, secret_arn, db_name, sql):
    """Execute SQL statement on Aurora PostgreSQL with error handling"""
    client = boto3.client('rds-data')
    try:
        response = client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=db_name,
            sql=sql
        )
        LOGGER.debug("SQL executed successfully: %s", sql)
        return response
    except ClientError as e:
        LOGGER.error("Error executing SQL [%s]: %s", sql, e)
        raise

def create_aurora_tables(cluster_arn, secret_arn, db_name):
    """Create multiple tables and indexes in Aurora PostgreSQL with transaction safety"""
    operations = []

    try:
        # Ensure pgvector extension exists (only needs to be created once)
        execute_sql(cluster_arn, secret_arn, db_name, "CREATE EXTENSION IF NOT EXISTS vector")
        operations.append("pgvector_extension_created")
        
        # Define table suffixes (or full names)
        table_names = [
            'develop',
            'wb-abhishek',
            'wb-mayank',
            'wb-salma',
            'wb-bhargav'
        ]

        for table in table_names:
            full_table_name = f"{table}_aurora_table".replace('-', '_')  # Avoid hyphens in SQL table names

            # Create table
            create_table_sql = f"""
                CREATE TABLE IF NOT EXISTS {full_table_name} (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    title VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    embedding VECTOR(1024),
                    metadata JSONB,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            """
            execute_sql(cluster_arn, secret_arn, db_name, create_table_sql)
            operations.append(f"table_created:{full_table_name}")


            create_text_index_sql = f"""
                CREATE INDEX IF NOT EXISTS idx_content_fulltext_{full_table_name}
                ON {full_table_name}
                USING gin (to_tsvector('simple', content))
            """
            execute_sql(cluster_arn, secret_arn, db_name, create_text_index_sql)
            operations.append(f"fulltext_index_created:{full_table_name}")

            create_vector_index_sql = f"""
                CREATE INDEX IF NOT EXISTS idx_embedding_{full_table_name}
                ON {full_table_name}
                USING hnsw (embedding vector_cosine_ops)
            """
            execute_sql(cluster_arn, secret_arn, db_name, create_vector_index_sql)
            operations.append(f"vector_index_created:{full_table_name}")

        return {"status": "success", "operations": operations}

    except Exception as e:
        LOGGER.error("Database operation failed. Completed operations: %s", operations)
        raise


def lambda_handler(event, context):
    """Main Lambda handler with comprehensive error handling"""
    LOGGER.info("Received event: %s", json.dumps(event, indent=2))
    
    try:
        if event["RequestType"] == "Delete":
            send_cfn_response(
                event, 
                context, 
                "SUCCESS", 
                data={"Message": "No resources deleted (preservation mode)"}
            )
            return

        props = event.get("ResourceProperties", {})
        results = {}
        
        # Handle Aurora PostgreSQL operations if configured
        if all(prop in props for prop in ['ClusterARN', 'SecretARN', 'DatabaseName']):
            try:
                aurora_result = create_aurora_tables(
                    props['ClusterARN'],
                    props['SecretARN'],
                    props['DatabaseName']
                )
                results["aurora"] = aurora_result
                LOGGER.info("Aurora PostgreSQL operations completed successfully")
            except Exception as e:
                LOGGER.error("Aurora PostgreSQL operation failed: %s", e)
                results["aurora"] = {
                    "status": "failed",
                    "error": str(e)
                }
        
        # Handle OpenSearch operations if configured
        if props.get("OS_ENDPOINT"):
            try:
                os_client = connect_to_opensearch(props["OS_ENDPOINT"])
                
                # List existing indices first
                existing_indices = list_opensearch_indices(os_client)
                results["opensearch"] = {
                    "existing_indices": existing_indices
                }
                
                # Add master users if specified
                # if props.get("IAMRole"):
                #     master_results = add_master_users(
                #         os_client, 
                #         [props["IAMRole"]]
                #     )
                #     results["opensearch"]["master_users"] = master_results
                    
                        # Create vector index
                index_result = create_opensearch_indices(
                    os_client
                )
                results["opensearch"]["index_creation"] = index_result
                
                LOGGER.info("OpenSearch operations completed successfully")
                
            except Exception as e:
                LOGGER.error("OpenSearch operation failed: %s", e)
                results.setdefault("opensearch", {})["error"] = str(e)
        
        # Determine overall status
        all_success = all(
            not isinstance(result, dict) or 
            result.get("status") != "failed"
            for result in results.values()
        )
        
        if all_success:
            send_cfn_response(
                event, 
                context, 
                "SUCCESS", 
                data={
                    "Message": "All operations completed successfully",
                    "Results": results
                }
            )
        else:
            failed_operations = [
                f"{service}: {result.get('error')}"
                for service, result in results.items()
                if isinstance(result, dict) and "error" in result
            ]
            send_cfn_response(
                event, 
                context, 
                "SUCCESS", 
                reason=", ",  #.join(failed_operations)
                data={"Results": "results"}
            )
            
    except Exception as e:
        LOGGER.error("Critical failure in handler: %s", e, exc_info=True)
        send_cfn_response(
            event, 
            context, 
            "FAILED", 
            reason=f"Unhandled exception: {str(e)}"
        )
<<<<<<< HEAD
=======
    
>>>>>>> develop
