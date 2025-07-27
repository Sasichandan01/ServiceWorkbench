import json
import boto3
import os
import logging
import uuid
from datetime import datetime, timezone
from Utils.utils import paginate_list, return_response, log_activity
from RBAC.rbac import is_user_action_valid
from collections import defaultdict
from FGAC.fgac import create_datasource_fgac, check_datasource_access
from boto3.dynamodb.conditions import Key, Attr

VALID_DATASOURCE_SORT_KEYS = [
    'CreationTime', 'DatasourceId', 'DatasourceName',
    'CreatedBy', 'LastUpdatedBy', 'LastUpdationTime'
]

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

DATASOURCE_TABLE_NAME = os.environ['DATASOURCE_TABLE_NAME']
DATASOURCE_BUCKET = os.environ['DATASOURCE_BUCKET']
ROLES_TABLE = os.environ['ROLES_TABLE']

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client("s3")
ACTIVITY_LOGS_TABLE = dynamodb.Table(os.environ['ACTIVITY_LOGS_TABLE'])
datasource_table = dynamodb.Table(DATASOURCE_TABLE_NAME)
table = dynamodb.Table(ROLES_TABLE)
resource_access_table = dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])

def lambda_handler(event, context):
    try:
        LOGGER.info("Received event: %s", json.dumps(event))
        http_method = event.get("httpMethod")
        path = event.get("path", "")
        query_params = event.get("queryStringParameters") or {}
        path_params = event.get("pathParameters") or {}
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        resource = event.get("resource", "")

        valid, msg = is_user_action_valid(user_id, role, resource, http_method, table)
        if not valid:
            return return_response(403, {"Error": msg})

        try:
            body = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return return_response(400, {"Error": "Invalid JSON in request body"})

        # Route: GET /datasources
        if http_method == "GET" and path == "/datasources":
            return get_all_datasources(query_params,user_id)

        # Route: POST /datasources
        if http_method == "POST" and path == "/datasources":
            return create_datasource(body, user_id)

        # Route: GET /datasources/{datasource_id}
        if http_method == "GET" and "datasource_id" in path_params:
            return get_datasource(path_params["datasource_id"],user_id)

        # Route: PUT /datasources/{datasource_id}
        if http_method == "PUT" and "datasource_id" in path_params:
            return update_datasource(path_params["datasource_id"], body, user_id)

        # Route: POST /datasources/{datasource_id}
        if http_method == "POST" and "datasource_id" in path_params:
            action = query_params.get("action", "")
            if action == "folder":
                return create_folder(path_params["datasource_id"], body, user_id)
            elif action == "delete":
                file_paths = body.get("FilePaths")
                return delete_datasource_files(path_params["datasource_id"], file_paths, user_id)
            elif action == "download":
                return generate_presigned_download_url(path_params["datasource_id"], body, user_id)
            return generate_presigned_url(path_params["datasource_id"], user_id, body)

        # Route: DELETE /datasources/{datasource_id}
        if http_method == "DELETE" and "datasource_id" in path_params:
            return delete_datasource(path_params["datasource_id"], user_id)

        return return_response(404, {"message": "Route not found"})

    except Exception as e:
        LOGGER.error("Unhandled error: %s", e, exc_info=True)
        return return_response(500, {"message": "Internal server error"})


def get_all_datasources(query_params, user_id):
    """
    Retrieve all datasources with pagination support and sorting.

    Args:
        query_params (dict): Query string parameters including limit, offset, sortBy, and sortOrder.
        user_id (str): The user ID to filter datasources by access.

    Returns:
        dict: HTTP response with datasources data.
    """
    LOGGER.info("Getting all Datasources")

    try:
        limit = max(1, int(query_params.get("limit") or 10))
    except (ValueError, TypeError):
        limit = 5

    try:
        offset = max(1, int(query_params.get("offset") or 1))
    except (ValueError, TypeError):
        offset = 1

    sort_by = query_params.get("sortBy") or "DatasourceName"
    sort_order = query_params.get("sortOrder") or "asc"

    # Get all datasources the user has access to from resource_access_table
    resource_access_response = resource_access_table.scan(
        FilterExpression=Attr('Id').begins_with(f"{user_id}#"),
        ProjectionExpression='AccessKey'
    )
    
    # resource_access_response = resource_access_table.query(
    #     KeyConditionExpression=Key('Id').begins_with(f"{user_id}#"),
    #     ProjectionExpression='AccessKey'
    # )
    # Extract datasource IDs from access keys (format: DATASOURCE#datasource_id)

    print(resource_access_response)

    datasource_ids = []
    for item in resource_access_response.get('Items', []):
        access_key = item.get('AccessKey', '')
        if access_key.startswith('DATASOURCE#'):
            datasource_id = access_key.split('#')[1]
            datasource_ids.append(datasource_id)
    
    # Get datasource details for all accessible datasources
    datasource_items = []
    for datasource_id in datasource_ids:
        response = datasource_table.get_item(
            Key={'DatasourceId': datasource_id},
            ProjectionExpression='DatasourceId, DatasourceName, Description, Tags, CreatedBy, DatasourceStatus, S3Path, CreationTime, LastUpdatedBy, LastUpdationTime'
        )
        item = response.get('Item')
        if item:
            datasource_items.append(item)
            
    # Simplify items before pagination
    simplified_items = [
        {
            "DatasourceId": item.get("DatasourceId"),
            "DatasourceName": item.get("DatasourceName"),
            "CreatedBy": item.get("CreatedBy"),
            "S3Path": item.get("S3Path"),
            "CreationTime": item.get("CreationTime"),
            "LastUpdatedBy": item.get("LastUpdatedBy"),
            "LastUpdationTime": item.get("LastUpdationTime"),
            "Description": item.get("Description", ""),
            "Tags": item.get("Tags", [])
        }
        for item in datasource_items
    ]

    LOGGER.info("Limit and Offset values: %s, %s", limit, offset)
    result1 = paginate_list("Datasources", simplified_items, VALID_DATASOURCE_SORT_KEYS, offset, limit, sort_by, sort_order)
    LOGGER.info("Paginated result: %s", result1)
    return result1

def create_datasource(body,user_id):
    LOGGER.info("Creating Datasource: %s", body)
    # Validate required fields
    if not body.get("DatasourceName"):
        return return_response(400, {"message": "Datasource Name is not Provided"})
    
    DatasourceName = body.get("DatasourceName")
    # Check index(CreatedBy-DatasourceName-index) if datasource already exists
    response = datasource_table.query(
        IndexName="CreatedBy-DatasourceName-index",
        KeyConditionExpression="CreatedBy = :user_id AND DatasourceName = :DatasourceName",
        ExpressionAttributeValues={":user_id": user_id, ":DatasourceName": DatasourceName}
    )
    if response["Count"] > 0:
        LOGGER.info("Datasource already exists: %s", DatasourceName)
        return return_response(400, {"message": "Datasource already exists"})

    datasource_id = str(uuid.uuid4())
    now = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    s3_path = f"{datasource_id}/" 

    # Create a "folder" in S3 by uploading a zero-byte object
    try:
        LOGGER.info("Creating S3 folder: %s", s3_path)
        s3_client.put_object(Bucket=DATASOURCE_BUCKET, Key=s3_path)
    except Exception as e:
        LOGGER.error("Failed to create S3 folder: %s", e, exc_info=True)
        return return_response(500, {"message": "Failed to create S3 folder"})

    item = {
        "DatasourceId": datasource_id,
        "DatasourceName": body.get("DatasourceName"),
        "Tags": body.get("Tags", []),
        "Description": body.get("Description", ""),
        "CreatedBy": user_id,
        "CreationTime": now,
        "LastUpdatedBy": user_id,
        "LastUpdationTime": now,
        "S3Path": s3_path
    }

    datasource_table.put_item(Item=item)
    
    # Grant owner permissions to the creator
    create_datasource_fgac(resource_access_table, user_id, "owner", datasource_id)
    
    # Grant owner permissions to all ITAdmin users
    try:
        # Query all users and check if their role list contains ITAdmin
        all_users_response = table.scan(
            ProjectionExpression='UserId, #rls',
            ExpressionAttributeNames={
                "#rls": "Role"
            }
        )
        
        for user_item in all_users_response.get('Items', []):
            admin_user_id = user_item.get('UserId')
            user_roles = user_item.get('Role', [])
            
            # Handle role as a list and check if it contains ITAdmin
            if not isinstance(user_roles, list):
                user_roles = [user_roles] if user_roles else []
            
            if 'ITAdmin' in user_roles and admin_user_id and admin_user_id != user_id:  # Don't duplicate for creator
                create_datasource_fgac(resource_access_table, admin_user_id, "owner", datasource_id)
                LOGGER.info(f"Granted owner permissions to ITAdmin user: {admin_user_id} for datasource: {datasource_id}")
    except Exception as e:
        LOGGER.error(f"Error granting ITAdmin permissions for datasource {datasource_id}: {e}")
        # Continue with datasource creation even if ITAdmin permission granting fails

    # Log the activity
    log_activity(
        ACTIVITY_LOGS_TABLE,
        resource_type="Datasource",
        resource_name=body.get("DatasourceName"),
        resource_id=datasource_id,
        user_id=user_id,
        action="CREATE_DATASOURCE"
    )

    return return_response(201, {
        "Message": "Datasource created successfully",
        "DatasourceId": datasource_id,
        "S3Path": s3_path
    })

def get_datasource(datasource_id, user_id,query_params=None):

    #Check user's access to the datasource
    LOGGER.info("Checking user's access to the datasource: %s", datasource_id)
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    LOGGER.info("User's access type: %s", access_type)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    LOGGER.info("User's access type: %s", access_type)

    LOGGER.info("Getting Datasource: %s", datasource_id)
    result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    item = result.get("Item")
    if not item:
        return return_response(404, {"message": "Datasource not found"})

    s3_prefix = f"datasources/{datasource_id}/"
    grouped_files = defaultdict(lambda: {"Files": []})
    total_size = 0

    try:
        s3_objects = s3_client.list_objects_v2(Bucket=DATASOURCE_BUCKET, Prefix=s3_prefix)
        contents = s3_objects.get("Contents", [])
        LOGGER.info("S3 Objects: %s", contents)
        
        for obj in contents:
            key = obj["Key"]
            if key.endswith("/"):
                continue

            relative_path = key[len(s3_prefix):]
            parts = relative_path.split("/")

            if len(parts) > 1:
                folder = parts[0]
                file_name = parts[-1]
            else:
                folder = "Root"
                file_name = relative_path
            
            # Special case: .keep handling
            if file_name == ".keep":
                # We'll decide later if this folder has other files or not
                if "HasKeep" not in grouped_files[folder]:
                    grouped_files[folder]["HasKeep"] = True
                    grouped_files[folder]["KeepKey"] = key
                continue

            size = obj["Size"]
            total_size += size

            if "S3Key" not in grouped_files[folder]:
                grouped_files[folder]["S3Key"] = key.rsplit('/', 1)[0] if folder != "Root" else f"{datasource_id}"


            grouped_files[folder]["Files"].append({
                "FileName": file_name,
                "S3Key": key,
                "LastModified": obj["LastModified"].isoformat(),
                "Size": obj["Size"]
            })

        # Post-processing: handle folders with only .keep
        for folder, data in grouped_files.items():
            if not data["Files"]:  # no real files
                if data.get("HasKeep") and data.get("KeepKey"):
                    data["S3Key"] = data["KeepKey"].rsplit("/", 1)[0]

                # Remove keys used only internally
                data.pop("HasKeep", None)
                data.pop("KeepKey", None)

    except Exception as e:
        LOGGER.error("Failed to list S3 objects: %s", e, exc_info=True)

    # Combine datasource metadata + grouped files
    result = {
        "Datasource": item,
        "Folders": grouped_files,
        "TotalSize": total_size
    }
    LOGGER.info("Result: %s", result)
    return return_response(200, result)

def update_datasource(datasource_id, body, user_id):
    # Check if datasource exists
    result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    item = result.get("Item")

    if not item:
        return return_response(404, {"Error": "Datasource not found"})

    # Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type not in ['editor', 'owner']:
        return return_response(403, {"Error": "Not authorized to perform this action"})

    #Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type not in ['editor', 'owner']:
        return return_response(403, {"Error": "Not authorized to perform this action"})

    # Proceed with update
    if not body:
        return return_response(400, {"Error": "Changes not mentioned."})

    update_expression = "SET "
    expression_attrs = {}
    fields = ["DatasourceName", "Tags", "Description"]

    for field in fields:
        if field in body:
            update_expression += f"{field} = :{field.lower()}, "
            expression_attrs[f":{field.lower()}"] = body[field]

    update_expression += "LastUpdationTime = :lastUpdationTime, LastUpdatedBy = :lastUpdatedBy"
    expression_attrs[":lastUpdationTime"] = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    expression_attrs[":lastUpdatedBy"] = user_id

    datasource_table.update_item(
        Key={"DatasourceId": datasource_id},
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_attrs
    )

    name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    DatasourceName = name_item.get("Item").get("DatasourceName")

    log_activity(ACTIVITY_LOGS_TABLE, "Datasource", DatasourceName, datasource_id, user_id, "UPDATE DATASOURCE")

    return return_response(200, {"Message": "Datasource updated successfully"})

def delete_datasource(datasource_id, user_id):
    # Check if datasource exists
    result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    item = result.get("Item")

    if not item:
        return return_response(404, {"Error": "Datasource not found"})

    # Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    # Only allow owner permissions to delete datasource
    if access_type != 'owner':
        return return_response(403, {"Error": "Not authorized to perform this action"})

    name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
    Datasourcename = name_item.get("Item").get("DatasourceName")

    # Delete all related permissions from resource_access_table
    access_key = f"DATASOURCE#{datasource_id}"
    try:
        permission_items = resource_access_table.query(
            IndexName='AccessKey-Index',
            KeyConditionExpression=Key('AccessKey').eq(access_key)
        ).get('Items', [])
        for item in permission_items:
            resource_access_table.delete_item(Key={'Id': item['Id'], 'AccessKey': item['AccessKey']})
    except Exception as e:
        LOGGER.error(f"Error deleting datasource permissions: {e}")

    # Delete item from DynamoDB
    datasource_table.delete_item(Key={"DatasourceId": datasource_id})
    LOGGER.info("Deleted DynamoDB entry for datasource: %s", datasource_id)

    # Delete all S3 objects under the datasource prefix
    s3_prefix = f"datasources/{datasource_id}/"
    try:
        LOGGER.info("Deleting all S3 objects with prefix: %s", s3_prefix)
        s3_objects = s3_client.list_objects_v2(Bucket=DATASOURCE_BUCKET, Prefix=s3_prefix)

        while s3_objects.get("KeyCount", 0) > 0:
            objects_to_delete = [{"Key": obj["Key"]} for obj in s3_objects.get("Contents", [])]

            if objects_to_delete:
                delete_response = s3_client.delete_objects(
                    Bucket=DATASOURCE_BUCKET,
                    Delete={"Objects": objects_to_delete}
                )
                LOGGER.info("Deleted objects: %s", delete_response.get("Deleted", []))

            # Continue if paginated results
            if s3_objects.get("IsTruncated"):
                continuation_token = s3_objects.get("NextContinuationToken")
                s3_objects = s3_client.list_objects_v2(
                    Bucket=DATASOURCE_BUCKET,
                    Prefix=s3_prefix,
                    ContinuationToken=continuation_token
                )
            else:
                break

    except Exception as e:
        LOGGER.error("Failed to delete S3 objects: %s", e, exc_info=True)
        return return_response(500, {"message": "Failed to delete S3 files"})

    
    log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "DELETE DATASOURCE")

    return return_response(200, {"Message": "Datasource and all associated files deleted successfully"})

def generate_presigned_url(datasource_id, user_id, body=None):
    LOGGER.info("Generating presigned URL for datasource: %s", datasource_id)
    if not DATASOURCE_BUCKET:
        LOGGER.info("S3 bucket not configured")
        return return_response(500, {"Error": "S3 bucket not configured"})

    # Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type not in ['editor', 'owner']:
        return return_response(403, {"Error": "Not authorized to perform this action"})

    # Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type not in ['editor', 'owner']:
        return return_response(403, {"Error": "Not authorized to perform this action"})

    if not body or not isinstance(body.get("Files"), list):
        LOGGER.info("Invalid request body: %s", body)
        return return_response(400, {"Error": "Missing or invalid 'Files' list in request body"})
    
    try:
        result = {}
        for file_obj in body["Files"]:
            file_name = file_obj.get("FileName")
            content_type = file_obj.get("ContentType", "application/octet-stream")
            LOGGER.info("Content Type: %s", content_type)
            if not file_name:
                LOGGER.info("Invalid file object: %s", file_obj)
                continue

            object_key = f"datasources/{datasource_id}/{file_name}"

            presigned_url = s3_client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": DATASOURCE_BUCKET,
                    "Key": object_key,
                    'ContentType': content_type
                },
                ExpiresIn=3600
            )

            result[file_name] = presigned_url
            LOGGER.info("Generated presigned URL for %s: %s", file_name, presigned_url)
            LOGGER.info("Result: %s", result)

        name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        Datasourcename = name_item.get("Item").get("DatasourceName")

        log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "UPLOAD FILE IN DATASOURCE")

        return return_response(200, {"PreSignedURL": result})

    except Exception as e:
        LOGGER.error("Failed to generate multiple pre-signed URLs: %s", e, exc_info=True)
        return return_response(500, {"message": "Failed to generate presigned URLs"})

def create_folder(datasource_id, body, user_id):
    LOGGER.info("Creating folder for datasource: %s", datasource_id)
    # Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type not in ['editor', 'owner']:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if not body.get("Folder"):
        return return_response(400, {"message": "Folder Name is not Provided"})

    folder_name = body.get("Folder")
    s3_prefix = f"datasources/{datasource_id}/{folder_name}/"

    try:
        LOGGER.info("Creating S3 folder: %s", s3_prefix)
        s3_client.put_object(
            Bucket=DATASOURCE_BUCKET,
            Key=f"{s3_prefix}.keep",
            Body=b"",
            ContentType="application/octet-stream"
        )

        name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        Datasourcename = name_item.get("Item").get("DatasourceName")

        log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "CREATE FOLDER IN DATASOURCE")
        return return_response(201, {"Message": "Folder created successfully"})
    except Exception as e:
        LOGGER.error("Failed to create S3 folder: %s", e, exc_info=True)
        return return_response(500, {"message": "Failed to create S3 folder"})

def delete_datasource_files(datasource_id, full_keys, user_id):
    """
    Delete multiple files under a datasource folder in S3.
    file_paths: list of relative paths (e.g., ['docs/a.md', 'index.md'])
    """

    # Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if access_type not in ['owner']:
        return return_response(403, {"Error": "Not authorized to perform this action"})

    if not full_keys or not isinstance(full_keys, list):
        return return_response(400, {"Message": "full_keys must be a non-empty list"})

    expanded_keys = []

    for key in full_keys:
        # If it's a folder path, list all its contents
        folder_prefix = key if key.endswith("/") else key + "/"

        response = s3_client.list_objects_v2(Bucket=DATASOURCE_BUCKET, Prefix=folder_prefix)
        contents = response.get("Contents", [])

        if contents:
            expanded_keys.extend([{"Key": obj["Key"]} for obj in contents])
        else:
            # Either it's a file or an empty folder (with .keep), try deleting directly
            expanded_keys.append({"Key": key})

    try:
        response = s3_client.delete_objects(
            Bucket=DATASOURCE_BUCKET,
            Delete={"Objects": expanded_keys}
        )

        deleted = [obj["Key"] for obj in response.get("Deleted", [])]
        errors = response.get("Errors", [])

        result = {
            "Deleted": deleted,
            "Errors": errors
        }

        name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        Datasourcename = name_item.get("Item").get("DatasourceName")

        log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "DELETE DATASOURCE FILE")

        return return_response(200, result)

    except Exception as e:
        LOGGER.error("Failed to delete files: %s", e, exc_info=True)
        return return_response(500, {"Message": "Error deleting files from S3"})

def generate_presigned_download_url(datasource_id, body, user_id):
    """
    Generate a pre-signed URL to download a single file from S3.

    Expects: { "S3Key": "datasources/{datasource_id}/path/to/file.ext" }
    """
    LOGGER.info("Generating presigned download URL for datasource: %s", datasource_id)
    # Check user's access to the datasource
    access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
    if not access_type:
        return return_response(403, {"Error": "Not authorized to perform this action"})
    
    if not DATASOURCE_BUCKET:
        return return_response(500, {"message": "S3 bucket not configured"})

    s3_key = body.get("S3Path")
    if not s3_key:
        return return_response(400, {"message": "Missing S3Key in request body"})

    # Optional: Validate the key belongs to the correct datasource
    if not s3_key.startswith(f"datasources/{datasource_id}/"):
        return return_response(400, {"message": "S3Key does not belong to the specified datasource"})

    try:
        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": DATASOURCE_BUCKET, "Key": s3_key},
            ExpiresIn=3600
        )
        LOGGER.info("Generated presigned download URL for %s: %s", s3_key, presigned_url)

        name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        Datasourcename = name_item.get("Item").get("DatasourceName")

        log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "DOWNLOAD FILE IN DATASOURCE")
        return return_response(200, {"PreSignedURL": presigned_url})
    except Exception as e:
        LOGGER.error("Failed to generate presigned download URL: %s", e, exc_info=True)
        return return_response(500, {"message": "Failed to generate presigned download URL"})
