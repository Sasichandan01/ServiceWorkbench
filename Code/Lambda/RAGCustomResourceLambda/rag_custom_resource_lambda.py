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


def connect_to_opensearch(os_endpoint):
    """
    Connects to the OpenSearch cluster using AWS SigV4 auth.

    Args:
        os_endpoint (str): The OpenSearch endpoint.

    Returns:
        OpenSearch: OpenSearch client instance.
    """
    try:
        LOGGER.info("IN rag_custom_resource_lambda.connect_to_opensearch: Connecting to OpenSearch endpoint: %s", os_endpoint)
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
            hosts=[{"host": os_endpoint, "port": 443}],
            http_compress=True,
            http_auth=awsauth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            timeout=420
        )
        return os_client
    except Exception as e:
        LOGGER.error("IN rag_custom_resource_lambda.connect_to_opensearch: Failed to connect to OpenSearch: %s", e)
        raise


def list_opensearch_indices(os_client):
    """
    Lists all indices in the OpenSearch cluster.

    Args:
        os_client (OpenSearch): OpenSearch client.

    Returns:
        list: List of index names.
    """
    try:
        response = os_client.cat.indices(format="json", h="index")
        return [index['index'] for index in response]
    except NotFoundError:
        LOGGER.info("IN rag_custom_resource_lambda.list_opensearch_indices: No indices found")
        return []
    except Exception as e:
        LOGGER.error("IN rag_custom_resource_lambda.list_opensearch_indices: Failed to list indices: %s", e)
        raise


def add_master_users(os_client, master_arns):
    """
    Adds IAM roles as master users to OpenSearch security plugin.

    Args:
        os_client (OpenSearch): OpenSearch client.
        master_arns (list): List of IAM role ARNs.

    Returns:
        dict: Role mapping update results.
    """
    if not master_arns:
        LOGGER.info("IN rag_custom_resource_lambda.add_master_users: No master ARNs provided, skipping")
        return

    roles_to_update = ["all_access", "security_manager"]
    results = {}

    for role in roles_to_update:
        path = f"/_plugins/_security/api/rolesmapping/{role}"
        try:
            current_mapping = os_client.transport.perform_request("GET", path)
            existing_roles = set(current_mapping.get("backend_roles", []))
            new_roles = set(master_arns)
            combined_roles = list(existing_roles.union(new_roles))

            update_payload = {
                "backend_roles": combined_roles,
                "hosts": current_mapping.get("hosts", []),
                "users": current_mapping.get("users", [])
            }

            response = os_client.transport.perform_request("PUT", path, body=update_payload)

            results[role] = {
                "status": "success",
                "added_roles": list(new_roles - existing_roles),
                "existing_roles": list(existing_roles)
            }
            LOGGER.info("IN rag_custom_resource_lambda.add_master_users: Updated role %s: %s", role, response)
        except Exception as e:
            results[role] = {"status": "failed", "error": str(e)}
            LOGGER.error("IN rag_custom_resource_lambda.add_master_users: Failed for role %s: %s", role, e)

    return results


def create_opensearch_indices(os_client):
    """
    Creates vector indices in OpenSearch.

    Args:
        os_client (OpenSearch): OpenSearch client.

    Returns:
        dict: Status and results of index creation.
    """
    operations = {}
    try:
        index_suffixes = ['develop', 'wb-abhishek', 'wb-mayank', 'wb-salma', 'wb-bhargav']

        for suffix in index_suffixes:
            index_name = f"{suffix}_vector_index"

            if os_client.indices.exists(index=index_name):
                LOGGER.info("IN rag_custom_resource_lambda.create_opensearch_indices: Index %s exists", index_name)
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
            LOGGER.info("IN rag_custom_resource_lambda.create_opensearch_indices: Created index %s", index_name)
            operations[index_name] = {"status": "created", "response": response}

        return {"status": "success", "operations": operations}

    except Exception as e:
        LOGGER.error("IN rag_custom_resource_lambda.create_opensearch_indices: Failed: %s", e)
        raise


def get_db_credentials(secret_arn):
    """
    Retrieves database credentials from Secrets Manager.

    Args:
        secret_arn (str): Secret ARN.

    Returns:
        dict: Secret payload.
    """
    client = boto3.client('secretsmanager')
    try:
        response = client.get_secret_value(SecretId=secret_arn)
        return json.loads(response['SecretString'])
    except ClientError as e:
        LOGGER.error("IN rag_custom_resource_lambda.get_db_credentials: Error: %s", e)
        raise


def execute_sql(cluster_arn, secret_arn, db_name, sql):
    """
    Executes SQL on Aurora PostgreSQL.

    Args:
        cluster_arn (str): Aurora Cluster ARN.
        secret_arn (str): Secret ARN.
        db_name (str): Database name.
        sql (str): SQL statement.

    Returns:
        dict: Execution result.
    """
    client = boto3.client('rds-data')
    try:
        response = client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=db_name,
            sql=sql
        )
        LOGGER.debug("IN rag_custom_resource_lambda.execute_sql: Executed SQL: %s", sql)
        return response
    except ClientError as e:
        LOGGER.error("IN rag_custom_resource_lambda.execute_sql: Error executing SQL [%s]: %s", sql, e)
        raise


def create_aurora_tables(cluster_arn, secret_arn, db_name):
    """
    Creates tables and indexes in Aurora PostgreSQL.

    Args:
        cluster_arn (str): Aurora cluster ARN.
        secret_arn (str): Secret ARN.
        db_name (str): Database name.

    Returns:
        dict: Operation status and steps.
    """
    operations = []

    try:
        execute_sql(cluster_arn, secret_arn, db_name, "CREATE EXTENSION IF NOT EXISTS vector")
        operations.append("pgvector_extension_created")

        table_names = ['develop', 'wb-abhishek', 'wb-mayank', 'wb-salma', 'wb-bhargav']

        for table in table_names:
            full_table_name = f"{table}_aurora_table".replace('-', '_')

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
        LOGGER.error("IN rag_custom_resource_lambda.create_aurora_tables: Failed. Operations: %s", operations)
        raise


def lambda_handler(event, context):
    """
    Updates the details or status of an existing workspace.

    Args:
        event (dict): Lambda event.
        context (LambdaContext): Execution context.

    Returns:
        None
    """
    LOGGER.info("IN rag_custom_resource_lambda.lambda_handler: Received event: %s", json.dumps(event, indent=2))
    
    try:
        if event["RequestType"] == "Delete":
            send_cfn_response(event, context, "SUCCESS", data={"Message": "No resources deleted (preservation mode)"})
            return

        props = event.get("ResourceProperties", {})
        results = {}

        if all(prop in props for prop in ['ClusterARN', 'SecretARN', 'DatabaseName']):
            try:
                aurora_result = create_aurora_tables(
                    props['ClusterARN'],
                    props['SecretARN'],
                    props['DatabaseName']
                )
                results["aurora"] = aurora_result
                LOGGER.info("IN rag_custom_resource_lambda.lambda_handler: Aurora operations succeeded")
            except Exception as e:
                LOGGER.error("IN rag_custom_resource_lambda.lambda_handler: Aurora operation failed: %s", e)
                results["aurora"] = {"status": "failed", "error": str(e)}

        if props.get("OS_ENDPOINT"):
            try:
                os_client = connect_to_opensearch(props["OS_ENDPOINT"])
                existing_indices = list_opensearch_indices(os_client)
                results["opensearch"] = {"existing_indices": existing_indices}

                index_result = create_opensearch_indices(os_client)
                results["opensearch"]["index_creation"] = index_result

                LOGGER.info("IN rag_custom_resource_lambda.lambda_handler: OpenSearch operations completed")
            except Exception as e:
                LOGGER.error("IN rag_custom_resource_lambda.lambda_handler: OpenSearch error: %s", e)
                results.setdefault("opensearch", {})["error"] = str(e)

        all_success = all(
            not isinstance(result, dict) or result.get("status") != "failed"
            for result in results.values()
        )

        if all_success:
            send_cfn_response(event, context, "SUCCESS", data={
                "Message": "All operations completed successfully",
                "Results": results
            })
        else:
            failed_operations = [
                f"{service}: {result.get('error')}"
                for service, result in results.items()
                if isinstance(result, dict) and "error" in result
            ]
            send_cfn_response(event, context, "SUCCESS", reason=", ".join(failed_operations), data={"Results": results})

    except Exception as e:
        LOGGER.error("IN rag_custom_resource_lambda.lambda_handler: Critical failure: %s", e, exc_info=True)
        send_cfn_response(event, context, "FAILED", reason=f"Unhandled exception: {str(e)}")
