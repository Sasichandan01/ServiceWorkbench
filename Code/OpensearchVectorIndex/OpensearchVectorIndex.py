import logging
import boto3
import os
import json
import urllib.request
from opensearchpy import OpenSearch, RequestsHttpConnection

OS_ENDPOINT = "search-poc-workbench-cluster-2-4ktumt5ouc2qoh5asvamx27ahe.us-east-1.es.amazonaws.com"
REGION = "us-east-1"
CHUNK_SIZE = 1000

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

def send_response(event, context, response_status, response_data, physical_resource_id=None, reason=None):
    response_url = event['ResponseURL']

    response_body = {
        "Status": response_status,
        "Reason": reason or f"See the details in CloudWatch Log Stream: {context.log_stream_name}",
        "PhysicalResourceId": physical_resource_id or context.log_stream_name,
        "StackId": event['StackId'],
        "RequestId": event['RequestId'],
        "LogicalResourceId": event['LogicalResourceId'],
        "Data": response_data
    }

    json_response_body = json.dumps(response_body)
    LOGGER.info("Response body:\n%s", json_response_body)

    try:
        req = urllib.request.Request(
            response_url,
            data=json_response_body.encode('utf-8'),
            headers={'Content-Type': ''}
        )
        req.get_method = lambda: 'PUT'
        with urllib.request.urlopen(req) as response:
            LOGGER.info("CloudFormation returned status code: %s", response.getcode())
    except Exception as e:
        LOGGER.error("send_response failed: %s", e)


def connect_os(os_endpoint, region):
    LOGGER.info('Connecting to OpenSearch endpoint: %s', os_endpoint)

    auth = ('admin', 'Admin@123')  # For demo/testing only. Use IAM in production.

    try:
        os_client = OpenSearch(
            hosts=[{"host": os_endpoint, "port": 443}],
            http_compress=True,
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            timeout=420
        )
        LOGGER.info("Connected to OpenSearch successfully")
        return os_client
    except Exception as error_message:
        LOGGER.error("Connection error: %s", error_message)
        raise

OS_CLIENT = connect_os(OS_ENDPOINT, REGION)
OPENSEARCH_CLIENT = boto3.client('opensearch', region_name=REGION)

def list_index():
    return OS_CLIENT.cat.indices(format="json")

def delete_index(index):
    try:
        delete_response = OS_CLIENT.indices.delete(index=index, request_timeout=300, ignore=[400, 404])
        LOGGER.info("Delete index response: %s", delete_response)
    except Exception as error_message:
        if "index_not_found_exception" in str(error_message):
            LOGGER.info("Index not found: %s", index)
        else:
            LOGGER.error("Error deleting index %s: %s", index, error_message)
            raise

def create_index_with_vector_mapping(index):
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
                "AMAZON_BEDROCK_TEXT_CHUNK": { "type": "text" },
                "AMAZON_BEDROCK_METADATA": { "type": "text" }
            }
        }
    }

    try:
        create_response = OS_CLIENT.indices.create(index=index, body=mapping)
        LOGGER.info("Index created: %s", create_response)
        return create_response
    except Exception as error_message:
        LOGGER.error("Error creating index: %s", error_message)
        raise

def lambda_handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))

    try:
        index_name = "aws-docs-vector-index"

        indices = [i["index"] for i in list_index()]
        LOGGER.info("Current indices: %s", indices)

        if index_name in indices:
            delete_index(index_name)

        create_response = create_index_with_vector_mapping(index_name)

        updated_indices = [i["index"] for i in list_index()]
        LOGGER.info("Updated indices: %s", updated_indices)

        send_response(
            event,
            context,
            "SUCCESS",
            {
                "Message": f"Index {index_name} created.",
                "Indices": updated_indices
            }
        )
    except Exception as e:
        LOGGER.error("Lambda execution failed: %s", e)
        send_response(
            event,
            context,
            "FAILED",
            {
                "Message": "Exception occurred"
            },
            reason=str(e)
        )

