import json
import boto3
import os
import logging
import uuid
from datetime import datetime
from Utils.utils import paginate_list
from RBAC.rbac import is_user_action_valid, return_response
from collections import defaultdict


VALID_DATASOURCE_SORT_KEYS = [
    'CreationTime', 'DatasourceId', 'DatasourceName',
    'CreatedBy', 'DatasourceStatus', 'LastUpdatedBy', 'LastUpdationTime'
]

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

DATASOURCE_TABLE_NAME = os.environ['DATASOURCE_TABLE_NAME']
DATASOURCE_BUCKET = os.environ['DATASOURCE_BUCKET']
ROLES_TABLE = os.environ['ROLES_TABLE']

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client("s3")
datasource_table = dynamodb.Table(DATASOURCE_TABLE_NAME)
table = dynamodb.Table(ROLES_TABLE)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body)
    }

def lambda_handler(event, context):
    try:
        LOGGER.info("Received event: %s", json.dumps(event))
        
        http_method = event.get("httpMethod")
        path = event.get("path", "")
        query_params = event.get("queryStringParameters") or {}
        path_params = event.get("pathParameters") or {}
        resource = event.get("resource", "")

        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        valid, msg = is_user_action_valid(user_id, role, resource, http_method, table)
        if not valid:
            return return_response(403, {"Error": msg})

        try:
            body = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return response(400, {"message": "Invalid JSON in request body"})

        # Route: GET /datasources
        if http_method == "GET" and path == "/datasources":
            return get_all_datasources(query_params)

        # Route: POST /datasources
        if http_method == "POST" and path == "/datasources":
            return create_datasource(body)

        # Route: GET /datasources/{datasource_id}
        if http_method == "GET" and "datasource_id" in path_params:
            return get_datasource(path_params["datasource_id"])

        # Route: PUT /datasources/{datasource_id}
        if http_method == "PUT" and "datasource_id" in path_params:
            action = query_params.get("action")
            LOGGER.info("Action: %s", action)
            if action == "generate_presigned_url":
                return generate_presigned_url(path_params["datasource_id"],body)
            return update_datasource(path_params["datasource_id"], body)

        # Route: DELETE /datasources/{datasource_id}
        if http_method == "DELETE" and "datasource_id" in path_params:
            return delete_datasource(path_params["datasource_id"])

        return response(404, {"message": "Route not found"})

    except Exception as e:
        LOGGER.error("Unhandled error: %s", e, exc_info=True)
        return response(500, {"message": "Internal server error"})


def get_all_datasources(query_params):
    """
    Retrieve all datasources with pagination support and sorting.

    Args:
        query_params (dict): Query string parameters including limit, offset, sortBy, and sortOrder.

    Returns:
        dict: HTTP response with datasources data.
    """
    LOGGER.info("Getting all Datasources")

    try:
        limit = max(1, int(query_params.get("limit") or 5))
    except (ValueError, TypeError):
        limit = 5

    try:
        offset = max(1, int(query_params.get("offset") or 1))
    except (ValueError, TypeError):
        offset = 1

    sort_by = query_params.get("sortBy") or "DatasourceName"
    sort_order = query_params.get("sortOrder") or "asc"

    scan_response = datasource_table.scan()
    items = scan_response.get("Items", [])

    # Simplify items before pagination
    simplified_items = [
        {
            "DatasourceId": item.get("DatasourceId"),
            "DatasourceName": item.get("DatasourceName"),
            "CreatedBy": item.get("CreatedBy"),
            "DatasourceStatus": item.get("DatasourceStatus"),
            "S3Path": item.get("S3Path"),
            "CreationTime": item.get("CreationTime"),
            "LastUpdatedBy": item.get("LastUpdatedBy"),
            "LastUpdationTime": item.get("LastUpdationTime")
        }
        for item in items
    ]

    LOGGER.info("Limit and Offset values: %s, %s", limit, offset)
    result1 = paginate_list("Datasources", simplified_items, VALID_DATASOURCE_SORT_KEYS, offset, limit, sort_by, sort_order)
    LOGGER.info("Paginated result: %s", result1)
    return result1

def create_datasource(body):
    # Validate required fields
    if not body.get("DatasourceName"):
        return response(400, {"message": "Datasource Name is not Provided"})

    datasource_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    s3_path = f"{datasource_id}/"

    # Create a "folder" in S3 by uploading a zero-byte object
    try:
        LOGGER.info("Creating S3 folder: %s", s3_path)
        s3_client.put_object(Bucket=DATASOURCE_BUCKET, Key=s3_path)
    except Exception as e:
        LOGGER.error("Failed to create S3 folder: %s", e, exc_info=True)
        return response(500, {"message": "Failed to create S3 folder"})

    item = {
        "DatasourceId": datasource_id,
        "DatasourceName": body.get("DatasourceName"),
        "Tags": body.get("Tags", []),
        "Description": body.get("Description", ""),
        "DatasourceStatus": "ACTIVE",
        "CreatedBy": "SYSTEM",  # Replace with actual user identity if available
        "CreationTime": now,
        "LastUpdatedBy": "SYSTEM",
        "LastUpdationTime": now,
        "S3Path": s3_path
    }

    datasource_table.put_item(Item=item)

    return response(201, {
        "Message": "Datasource created successfully",
        "DatasourceId": datasource_id,
        "S3Path": s3_path
    })

def get_datasource(datasource_id, query_params=None):
    result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    item = result.get("Item")
    if not item:
        return response(404, {"message": "Datasource not found"})

    s3_prefix = f"{datasource_id}/"
    grouped_files = defaultdict(lambda: {"Files": []})

    try:
        s3_objects = s3_client.list_objects_v2(Bucket=DATASOURCE_BUCKET, Prefix=s3_prefix)
        contents = s3_objects.get("Contents", [])
        
        for obj in contents:
            key = obj["Key"]
            if key.endswith("/"):
                continue  # skip folder marker

            relative_path = key[len(s3_prefix):]
            parts = relative_path.split("/")

            folder = parts[0] if len(parts) > 1 else "Root"
            file_name = parts[-1]

            grouped_files[folder]["Files"].append({
                "FileName": file_name,
                "S3Key": key,
                "LastModified": obj["LastModified"].isoformat(),
                "Size": obj["Size"]
            })

    except Exception as e:
        LOGGER.error("Failed to list S3 objects: %s", e, exc_info=True)

    # Combine datasource metadata + grouped files
    result = {
        "Datasource": item,
        "Folders": grouped_files
    }

    return response(200, result)

def update_datasource(datasource_id, body):
    # Check if datasource exists
    result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    item = result.get("Item")

    if not item:
        return response(404, {"message": "Datasource not found"})

    # Proceed with update
    if not body:
        return response(400, {"message": "Changes not mentioned."})

    update_expression = "SET "
    expression_attrs = {}
    fields = ["DatasourceName", "Tags", "Description"]

    for field in fields:
        if field in body:
            update_expression += f"{field} = :{field.lower()}, "
            expression_attrs[f":{field.lower()}"] = body[field]

    update_expression += "LastUpdationTime = :lastUpdationTime, LastUpdatedBy = :lastUpdatedBy"
    expression_attrs[":lastUpdationTime"] = datetime.utcnow().isoformat()
    expression_attrs[":lastUpdatedBy"] = "SYSTEM"

    datasource_table.update_item(
        Key={"DatasourceId": datasource_id},
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_attrs
    )

    return response(200, {"Message": "Datasource updated successfully"})

def delete_datasource(datasource_id):
    # Check if datasource exists
    result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    item = result.get("Item")

    if not item:
        return response(404, {"message": "Datasource not found"})

    # Proceed with deletion
    datasource_table.delete_item(Key={"DatasourceId": datasource_id})
    
    s3_prefix = f"{datasource_id}/"
    s3_client.delete_object(Bucket=DATASOURCE_BUCKET, Key=s3_prefix)
    LOGGER.info("Deleted S3 folder: %s", s3_prefix)
    return response(200, {"Message": "Datasource deleted successfully"})

def generate_presigned_url(datasource_id, body=None):
    if not DATASOURCE_BUCKET:
        LOGGER.info("S3 bucket not configured")
        return response(500, {"message": "S3 bucket not configured"})

    if not body or not isinstance(body.get("Files"), list):
        LOGGER.info("Invalid request body: %s", body)
        return response(400, {"message": "Missing or invalid 'Files' list in request body"})

    try:
        result = {}
        for file_obj in body["Files"]:
            file_name = file_obj.get("FileName")
            content_type = file_obj.get("ContentType", "application/octet-stream")
            LOGGER.info("Content Type: %s", content_type)
            if not file_name:
                LOGGER.info("Invalid file object: %s", file_obj)
                continue

            object_key = f"{datasource_id}/{file_name}"

            presigned_url = s3_client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": DATASOURCE_BUCKET,
                    "Key": object_key
                },
                ExpiresIn=3600
            )

            result[file_name] = presigned_url
            LOGGER.info("Generated presigned URL for %s: %s", file_name, presigned_url)

        return response(200, {"UploadURLs": result})

    except Exception as e:
        LOGGER.error("Failed to generate multiple pre-signed URLs: %s", e, exc_info=True)
        return response(500, {"message": "Failed to generate presigned URLs"})
