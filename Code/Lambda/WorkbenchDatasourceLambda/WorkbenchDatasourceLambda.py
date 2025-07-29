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

# Initialize logger first
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

try:
    # Define constants and environment variables
    VALID_DATASOURCE_SORT_KEYS = [
        'CreationTime', 'DatasourceId', 'DatasourceName',
        'CreatedBy', 'LastUpdatedBy', 'LastUpdationTime'
    ]

    # Get environment variables with error handling
    DATASOURCE_TABLE_NAME = os.environ.get('DATASOURCE_TABLE_NAME')
    DATASOURCE_BUCKET = os.environ.get('DATASOURCE_BUCKET')
    ROLES_TABLE = os.environ.get('ROLES_TABLE')
    ACTIVITY_LOGS_TABLE_NAME = os.environ.get('ACTIVITY_LOGS_TABLE')
    RESOURCE_ACCESS_TABLE_NAME = os.environ.get('RESOURCE_ACCESS_TABLE')

    if not all([DATASOURCE_TABLE_NAME, DATASOURCE_BUCKET, ROLES_TABLE, 
               ACTIVITY_LOGS_TABLE_NAME, RESOURCE_ACCESS_TABLE_NAME]):
        raise EnvironmentError("Missing required environment variables")

    # Initialize AWS resources
    dynamodb = boto3.resource('dynamodb')
    s3_client = boto3.client("s3")
    
    # Initialize DynamoDB tables
    ACTIVITY_LOGS_TABLE = dynamodb.Table(ACTIVITY_LOGS_TABLE_NAME)
    datasource_table = dynamodb.Table(DATASOURCE_TABLE_NAME)
    roles_table = dynamodb.Table(ROLES_TABLE)
    resource_access_table = dynamodb.Table(RESOURCE_ACCESS_TABLE_NAME)

except Exception as e:
    LOGGER.error("IN develop-DatasourceLambdaFunction, Failed to initialize environment: %s", e, exc_info=True)
    raise

def lambda_handler(event, context):
    """
    Entry point for the Lambda function. Routes API Gateway events to the correct handler
    based on HTTP method and resource path.

    Args:
        event (dict): The event object from API Gateway.
        context (LambdaContext): The runtime context.

    Returns:
        dict: API Gateway-compatible HTTP response.
    """
    try:
        LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Received event: %s", json.dumps(event))
        
        # Extract common parameters from the event
        http_method = event.get("httpMethod")
        path = event.get("path", "")
        query_params = event.get("queryStringParameters") or {}
        path_params = event.get("pathParameters") or {}
        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        resource = event.get("resource", "")

        # Validate user permissions
        valid, msg = is_user_action_valid(user_id, role, resource, http_method, roles_table)
        if not valid:
            LOGGER.warning("IN develop-DatasourceLambdaFunction.lambda_handler(), Unauthorized access attempt by user %s", user_id)
            return return_response(403, {"Error": msg})

        try:
            body = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            LOGGER.error("IN develop-DatasourceLambdaFunction.lambda_handler(), Invalid JSON in request body")
            return return_response(400, {"Error": "Invalid JSON in request body"})

        # Route requests based on HTTP method and path
        if http_method == "GET" and path == "/datasources":
            LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to get_all_datasources")
            return get_all_datasources(query_params, user_id)

        if http_method == "POST" and path == "/datasources":
            LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to create_datasource")
            return create_datasource(body, user_id)

        if http_method == "GET" and "datasource_id" in path_params:
            LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to get_datasource")
            return get_datasource(path_params["datasource_id"], user_id, query_params)

        if http_method == "PUT" and "datasource_id" in path_params:
            LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to update_datasource")
            return update_datasource(path_params["datasource_id"], body, user_id)

        if http_method == "POST" and "datasource_id" in path_params:
            action = query_params.get("action", "")
            if action == "folder":
                LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to create_folder")
                return create_folder(path_params["datasource_id"], body, user_id)
            elif action == "delete":
                LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to delete_datasource_files")
                file_paths = body.get("FilePaths")
                return delete_datasource_files(path_params["datasource_id"], file_paths, user_id)
            elif action == "download":
                LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to generate_presigned_download_url")
                return generate_presigned_download_url(path_params["datasource_id"], body, user_id)
            LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to generate_presigned_url")
            return generate_presigned_url(path_params["datasource_id"], user_id, body)

        if http_method == "DELETE" and "datasource_id" in path_params:
            LOGGER.info("IN develop-DatasourceLambdaFunction.lambda_handler(), Routing to delete_datasource")
            return delete_datasource(path_params["datasource_id"], user_id)

        LOGGER.warning("IN develop-DatasourceLambdaFunction.lambda_handler(), Route not found: %s %s", http_method, path)
        return return_response(404, {"message": "Route not found"})

    except Exception as e:
        LOGGER.error("IN develop-DatasourceLambdaFunction.lambda_handler(), Unhandled error: %s", e, exc_info=True)
        return return_response(500, {"message": "Internal server error"})


def get_all_datasources(query_params, user_id):
    """
    Retrieve all datasources with pagination support and sorting.

    Args:
        query_params (dict): Query string parameters including:
            - limit (int): Number of items per page
            - offset (int): Page number
            - sortBy (str): Field to sort by
            - sortOrder (str): 'asc' or 'desc'
        user_id (str): The user ID to filter datasources by access.

    Returns:
        dict: HTTP response with datasources data and pagination info.
    """
    LOGGER.info("IN develop-DatasourceLambdaFunction.get_all_datasources(), Getting all Datasources for user %s", user_id)

    try:
        # Parse pagination parameters with defaults
        limit = max(1, int(query_params.get("limit") or 10))
        offset = max(1, int(query_params.get("offset") or 1))
        sort_by = query_params.get("sortBy") or "DatasourceName"
        sort_order = query_params.get("sortOrder") or "asc"

        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.get_all_datasources(), "
            "Pagination params - limit: %d, offset: %d, sort_by: %s, sort_order: %s",
            limit, offset, sort_by, sort_order
        )

        # Get all datasource IDs the user has access to
        resource_access_response = resource_access_table.scan(
            FilterExpression=Attr('Id').begins_with(f"{user_id}#"),
            ProjectionExpression='AccessKey'
        )
        
        LOGGER.debug(
            "IN develop-DatasourceLambdaFunction.get_all_datasources(), "
            "Resource access response count: %d",
            len(resource_access_response.get('Items', []))
        )

        # Extract datasource IDs from access keys (format: DATASOURCE#datasource_id)
        datasource_ids = []
        for item in resource_access_response.get('Items', []):
            access_key = item.get('AccessKey', '')
            if access_key.startswith('DATASOURCE#'):
                datasource_ids.append(access_key.split('#')[1])

        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.get_all_datasources(), "
            "User %s has access to %d datasources",
            user_id, len(datasource_ids)
        )

        # Get details for all accessible datasources
        datasource_items = []
        for datasource_id in datasource_ids:
            response = datasource_table.get_item(
                Key={'DatasourceId': datasource_id},
                ProjectionExpression=(
                    'DatasourceId, DatasourceName, Description, Tags, '
                    'CreatedBy, DatasourceStatus, S3Path, CreationTime, '
                    'LastUpdatedBy, LastUpdationTime'
                )
            )
            if 'Item' in response:
                datasource_items.append(response['Item'])

        # Simplify items for response
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

        # Apply pagination and sorting
        result = paginate_list(
            "Datasources", 
            simplified_items, 
            VALID_DATASOURCE_SORT_KEYS, 
            offset, 
            limit, 
            sort_by, 
            sort_order
        )
        
        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.get_all_datasources(), "
            "Returning %d datasources to user %s",
            len(result.get('Datasources', [])), 
            user_id
        )
        return result

    except Exception as e:
        LOGGER.error(
            "IN develop-DatasourceLambdaFunction.get_all_datasources(), "
            "Error getting datasources: %s", 
            e, 
            exc_info=True
        )
        return return_response(500, {"message": "Failed to retrieve datasources"})


def create_datasource(body, user_id):
    """
    Create a new datasource with the provided details.

    Args:
        body (dict): Request body containing datasource details:
            - DatasourceName (str): Required name for the datasource
            - Tags (list): Optional tags
            - Description (str): Optional description
        user_id (str): ID of the user creating the datasource

    Returns:
        dict: API response with created datasource ID and S3 path
    """
    LOGGER.info("IN develop-DatasourceLambdaFunction.create_datasource(), Creating datasource for user %s", user_id)

    try:
        # Validate required fields
        if not body.get("DatasourceName"):
            LOGGER.error("IN develop-DatasourceLambdaFunction.create_datasource(), Datasource name not provided")
            return return_response(400, {"message": "Datasource Name is not Provided"})
        
        datasource_name = body.get("DatasourceName")
        
        # Check if datasource with this name already exists for the user
        response = datasource_table.query(
            IndexName="CreatedBy-DatasourceName-index",
            KeyConditionExpression=(
                "CreatedBy = :user_id AND DatasourceName = :datasource_name"
            ),
            ExpressionAttributeValues={
                ":user_id": user_id, 
                ":datasource_name": datasource_name
            }
        )
        
        if response["Count"] > 0:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.create_datasource(), "
                "Datasource %s already exists for user %s",
                datasource_name, user_id
            )
            return return_response(400, {"message": "Datasource already exists"})

        # Generate unique IDs and timestamps
        datasource_id = str(uuid.uuid4())
        now = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        s3_path = f"{datasource_id}/" 

        # Create a folder in S3 by uploading a zero-byte object
        try:
            LOGGER.info(
                "IN develop-DatasourceLambdaFunction.create_datasource(), "
                "Creating S3 folder at %s in bucket %s",
                s3_path, DATASOURCE_BUCKET
            )
            s3_client.put_object(Bucket=DATASOURCE_BUCKET, Key=s3_path)
        except Exception as e:
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.create_datasource(), "
                "Failed to create S3 folder: %s", 
                e, 
                exc_info=True
            )
            return return_response(500, {"message": "Failed to create S3 folder"})

        # Prepare datasource item for DynamoDB
        item = {
            "DatasourceId": datasource_id,
            "DatasourceName": datasource_name,
            "Tags": body.get("Tags", []),
            "Description": body.get("Description", ""),
            "CreatedBy": user_id,
            "CreationTime": now,
            "LastUpdatedBy": user_id,
            "LastUpdationTime": now,
            "S3Path": s3_path
        }

        # Save to DynamoDB
        datasource_table.put_item(Item=item)
        
        # Grant owner permissions to the creator
        create_datasource_fgac(resource_access_table, user_id, "owner", datasource_id)
        
        # Grant owner permissions to all ITAdmin users
        try:
            all_users_response = roles_table.scan(
                ProjectionExpression='UserId, #rls',
                ExpressionAttributeNames={"#rls": "Role"}
            )
            
            for user_item in all_users_response.get('Items', []):
                admin_user_id = user_item.get('UserId')
                user_roles = user_item.get('Role', [])
                
                if not isinstance(user_roles, list):
                    user_roles = [user_roles] if user_roles else []
                
                if 'ITAdmin' in user_roles and admin_user_id and admin_user_id != user_id:
                    create_datasource_fgac(
                        resource_access_table, 
                        admin_user_id, 
                        "owner", 
                        datasource_id
                    )
                    LOGGER.info(
                        "IN develop-DatasourceLambdaFunction.create_datasource(), "
                        "Granted owner permissions to ITAdmin user %s for datasource %s",
                        admin_user_id, datasource_id
                    )
        except Exception as e:
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.create_datasource(), "
                "Error granting ITAdmin permissions: %s", 
                e
            )

        # Log the activity
        log_activity(
            ACTIVITY_LOGS_TABLE,
            resource_type="Datasource",
            resource_name=datasource_name,
            resource_id=datasource_id,
            user_id=user_id,
            action="Datasource Created"
        )

        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.create_datasource(), "
            "Successfully created datasource %s for user %s",
            datasource_id, user_id
        )
        return return_response(201, {
            "Message": "Datasource created successfully",
            "DatasourceId": datasource_id,
            "S3Path": s3_path
        })

    except Exception as e:
        LOGGER.error(
            "IN develop-DatasourceLambdaFunction.create_datasource(), "
            "Error creating datasource: %s", 
            e, 
            exc_info=True
        )
        return return_response(500, {"message": "Failed to create datasource"})


def get_datasource(datasource_id, user_id, query_params=None):
    """
    Retrieve details for a specific datasource including its file structure.

    Args:
        datasource_id (str): The ID of the datasource to retrieve
        user_id (str): ID of the requesting user for access control
        query_params (dict, optional): Additional query parameters

    Returns:
        dict: HTTP response containing datasource metadata and file structure
    """
    LOGGER.info(
        "IN develop-DatasourceLambdaFunction.get_datasource(), "
        "Getting datasource %s for user %s",
        datasource_id, user_id
    )

    try:
        # Check user's access to the datasource
        access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
        if not access_type:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.get_datasource(), "
                "User %s not authorized to access datasource %s",
                user_id, datasource_id
            )
            return return_response(403, {"Error": "Not authorized to perform this action"})

        # Get datasource metadata from DynamoDB
        result = datasource_table.get_item(
            Key={"DatasourceId": datasource_id},
            ProjectionExpression=(
                'DatasourceId, DatasourceName, Description, Tags, '
                'CreatedBy, DatasourceStatus, S3Path, CreationTime, '
                'LastUpdatedBy, LastUpdationTime'
            )
        )
        item = result.get("Item")
        if not item:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.get_datasource(), "
                "Datasource %s not found",
                datasource_id
            )
            return return_response(404, {"message": "Datasource not found"})

        # Build S3 prefix and initialize file structure variables
        s3_prefix = f"datasources/{datasource_id}/"
        grouped_files = defaultdict(lambda: {"Files": []})
        total_size = 0

        try:
            # List all objects in the datasource's S3 prefix
            s3_objects = s3_client.list_objects_v2(
                Bucket=DATASOURCE_BUCKET, 
                Prefix=s3_prefix
            )
            contents = s3_objects.get("Contents", [])
            
            LOGGER.debug(
                "IN develop-DatasourceLambdaFunction.get_datasource(), "
                "Found %d objects in S3 for datasource %s",
                len(contents), datasource_id
            )

            # Process each S3 object to build the file structure
            for obj in contents:
                key = obj["Key"]
                if key.endswith("/"):
                    continue  # Skip directory markers

                relative_path = key[len(s3_prefix):]
                parts = relative_path.split("/")

                # Determine folder structure
                if len(parts) > 1:
                    folder = parts[0]
                    file_name = parts[-1]
                else:
                    folder = "Root"
                    file_name = relative_path
                
                # Handle .keep files (empty folder markers)
                if file_name == ".keep":
                    if "HasKeep" not in grouped_files[folder]:
                        grouped_files[folder]["HasKeep"] = True
                        grouped_files[folder]["KeepKey"] = key
                    continue

                # Add file details
                size = obj["Size"]
                total_size += size

                if "S3Key" not in grouped_files[folder]:
                    grouped_files[folder]["S3Key"] = (
                        key.rsplit('/', 1)[0] if folder != "Root" 
                        else f"{datasource_id}"
                    )

                grouped_files[folder]["Files"].append({
                    "FileName": file_name,
                    "S3Key": key,
                    "LastModified": obj["LastModified"].isoformat(),
                    "Size": size
                })

            # Post-process folders that only contain .keep files
            for folder, data in grouped_files.items():
                if not data["Files"]:  # No real files, only .keep
                    if data.get("HasKeep") and data.get("KeepKey"):
                        data["S3Key"] = data["KeepKey"].rsplit("/", 1)[0]
                    data.pop("HasKeep", None)
                    data.pop("KeepKey", None)

        except Exception as e:
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.get_datasource(), "
                "Failed to list S3 objects: %s", 
                e, 
                exc_info=True
            )

        # Combine datasource metadata with file structure
        response_data = {
            "Datasource": item,
            "Folders": grouped_files,
            "TotalSize": total_size
        }
        
        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.get_datasource(), "
            "Successfully retrieved datasource %s for user %s",
            datasource_id, user_id
        )
        return return_response(200, response_data)

    except Exception as e:
        LOGGER.error(
            "IN develop-DatasourceLambdaFunction.get_datasource(), "
            "Error getting datasource: %s", 
            e, 
            exc_info=True
        )
        return return_response(500, {"message": "Failed to get datasource"})


def update_datasource(datasource_id, body, user_id):
    """
    Update metadata for an existing datasource.

    Args:
        datasource_id (str): ID of the datasource to update
        body (dict): Request body containing fields to update:
            - DatasourceName (str)
            - Tags (list)
            - Description (str)
        user_id (str): ID of the user making the update

    Returns:
        dict: API response indicating success or failure
    """
    LOGGER.info(
        "IN develop-DatasourceLambdaFunction.update_datasource(), "
        "Updating datasource %s by user %s",
        datasource_id, user_id
    )

    try:
        # Check if datasource exists
        result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        item = result.get("Item")
        if not item:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.update_datasource(), "
                "Datasource %s not found",
                datasource_id
            )
            return return_response(404, {"Error": "Datasource not found"})

        # Check user's access permissions
        access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
        if not access_type:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.update_datasource(), "
                "User %s not authorized to update datasource %s",
                user_id, datasource_id
            )
            return return_response(403, {"Error": "Not authorized to perform this action"})
        
        if access_type not in ['editor', 'owner']:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.update_datasource(), "
                "User %s has insufficient permissions (%s) to update datasource %s",
                user_id, access_type, datasource_id
            )
            return return_response(403, {"Error": "Not authorized to perform this action"})

        # Validate update fields
        if not body:
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.update_datasource(), "
                "No update fields provided for datasource %s",
                datasource_id
            )
            return return_response(400, {"Error": "Changes not mentioned."})

        # Prepare update expression
        update_expression = "SET "
        expression_attrs = {}
        fields = ["DatasourceName", "Tags", "Description"]

        for field in fields:
            if field in body:
                update_expression += f"{field} = :{field.lower()}, "
                expression_attrs[f":{field.lower()}"] = body[field]

        # Add timestamp and user who made the update
        update_expression += "LastUpdationTime = :lastUpdationTime, LastUpdatedBy = :lastUpdatedBy"
        expression_attrs[":lastUpdationTime"] = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        expression_attrs[":lastUpdatedBy"] = user_id

        # Execute the update
        datasource_table.update_item(
            Key={"DatasourceId": datasource_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attrs
        )

        # Get updated name for activity logging
        name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        datasource_name = name_item.get("Item").get("DatasourceName")

        # Log the activity
        log_activity(
            ACTIVITY_LOGS_TABLE,
            resource_type="Datasource",
            resource_name=datasource_name,
            resource_id=datasource_id,
            user_id=user_id,
            action="Datasource Updated"
        )

        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.update_datasource(), "
            "Successfully updated datasource %s by user %s",
            datasource_id, user_id
        )
        return return_response(200, {"Message": "Datasource updated successfully"})

    except Exception as e:
        LOGGER.error(
            "IN develop-DatasourceLambdaFunction.update_datasource(), "
            "Error updating datasource %s: %s", 
            datasource_id, e, 
            exc_info=True
        )
        return return_response(500, {"message": "Failed to update datasource"})


def delete_datasource(datasource_id, user_id):
    """
    Delete a datasource and all its associated resources.

    Args:
        datasource_id (str): ID of the datasource to delete
        user_id (str): ID of the user requesting deletion

    Returns:
        dict: API response indicating success or failure
    """
    LOGGER.info(
        "IN develop-DatasourceLambdaFunction.delete_datasource(), "
        "Deleting datasource %s by user %s",
        datasource_id, user_id
    )

    try:
        # Check if datasource exists
        result = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        item = result.get("Item")
        if not item:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                "Datasource %s not found",
                datasource_id
            )
            return return_response(404, {"Error": "Datasource not found"})

        # Check user's access permissions (only owners can delete)
        access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
        if not access_type:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                "User %s not authorized to delete datasource %s",
                user_id, datasource_id
            )
            return return_response(403, {"Error": "Not authorized to perform this action"})
        
        if access_type != 'owner':
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                "User %s has insufficient permissions (%s) to delete datasource %s",
                user_id, access_type, datasource_id
            )
            return return_response(403, {"Error": "Not authorized to perform this action"})

        # Get datasource name for activity logging
        datasource_name = item.get("DatasourceName")

        # Delete all related permissions from resource_access_table
        access_key = f"DATASOURCE#{datasource_id}"
        try:
            permission_items = resource_access_table.query(
                IndexName='AccessKey-Index',
                KeyConditionExpression=Key('AccessKey').eq(access_key)
            ).get('Items', [])
            
            LOGGER.info(
                "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                "Deleting %d permission entries for datasource %s",
                len(permission_items), datasource_id
            )
            
            for perm_item in permission_items:
                resource_access_table.delete_item(
                    Key={
                        'Id': perm_item['Id'], 
                        'AccessKey': perm_item['AccessKey']
                    }
                )
        except Exception as e:
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                "Error deleting datasource permissions: %s", 
                e
            )

        # Delete item from DynamoDB
        datasource_table.delete_item(Key={"DatasourceId": datasource_id})
        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.delete_datasource(), "
            "Deleted DynamoDB entry for datasource %s",
            datasource_id
        )

        # Delete all S3 objects under the datasource prefix
        s3_prefix = f"datasources/{datasource_id}/"
        try:
            LOGGER.info(
                "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                "Deleting S3 objects with prefix %s",
                s3_prefix
            )
            
            s3_objects = s3_client.list_objects_v2(
                Bucket=DATASOURCE_BUCKET, 
                Prefix=s3_prefix
            )

            while s3_objects.get("KeyCount", 0) > 0:
                objects_to_delete = [
                    {"Key": obj["Key"]} 
                    for obj in s3_objects.get("Contents", [])
                ]

                if objects_to_delete:
                    delete_response = s3_client.delete_objects(
                        Bucket=DATASOURCE_BUCKET,
                        Delete={"Objects": objects_to_delete}
                    )
                    LOGGER.debug(
                        "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                        "Deleted %d objects from S3",
                        len(delete_response.get("Deleted", []))
                    )

                # Continue if there are more objects to delete
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
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.delete_datasource(), "
                "Failed to delete S3 objects: %s", 
                e, 
                exc_info=True
            )
            return return_response(500, {"message": "Failed to delete S3 files"})

        # Log the activity
        log_activity(
            ACTIVITY_LOGS_TABLE,
            resource_type="Datasource",
            resource_name=datasource_name,
            resource_id=datasource_id,
            user_id=user_id,
            action="Datasource Deleted"
        )

        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.delete_datasource(), "
            "Successfully deleted datasource %s and all associated resources",
            datasource_id
        )
        return return_response(200, {
            "Message": "Datasource and all associated files deleted successfully"
        })

    except Exception as e:
        LOGGER.error(
            "IN develop-DatasourceLambdaFunction.delete_datasource(), "
            "Error deleting datasource %s: %s", 
            datasource_id, e, 
            exc_info=True
        )
        return return_response(500, {"message": "Failed to delete datasource"})


def generate_presigned_url(datasource_id, user_id, body=None):
    """
    Generate pre-signed URLs for uploading files to the datasource.

    Args:
        datasource_id (str): ID of the target datasource
        user_id (str): ID of the requesting user
        body (dict): Request body containing:
            - Files (list): List of file objects with:
                - FileName (str): Name of the file
                - ContentType (str): MIME type of the file

    Returns:
        dict: API response containing pre-signed URLs for each file
    """
    LOGGER.info(
        "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
        "Generating upload URLs for datasource %s by user %s",
        datasource_id, user_id
    )

    try:
        # Validate environment configuration
        if not DATASOURCE_BUCKET:
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
                "S3 bucket not configured"
            )
            return return_response(500, {"Error": "S3 bucket not configured"})

        # Check user's access permissions
        access_type = check_datasource_access(resource_access_table, user_id, datasource_id)
        if not access_type:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
                "User %s not authorized to upload to datasource %s",
                user_id, datasource_id
            )
            return return_response(403, {"Error": "Not authorized to perform this action"})
        
        if access_type not in ['editor', 'owner']:
            LOGGER.warning(
                "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
                "User %s has insufficient permissions (%s) to upload to datasource %s",
                user_id, access_type, datasource_id
            )
            return return_response(403, {"Error": "Not authorized to perform this action"})

        # Validate request body
        if not body or not isinstance(body.get("Files"), list):
            LOGGER.error(
                "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
                "Invalid request body for datasource %s",
                datasource_id
            )
            return return_response(400, {
                "Error": "Missing or invalid 'Files' list in request body"
            })
        
        # Generate URLs for each file
        result = {}
        for file_obj in body["Files"]:
            file_name = file_obj.get("FileName")
            content_type = file_obj.get("ContentType", "application/octet-stream")
            
            if not file_name:
                LOGGER.warning(
                    "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
                    "Skipping invalid file object: %s",
                    file_obj
                )
                continue

            object_key = f"datasources/{datasource_id}/{file_name}"

            try:
                presigned_url = s3_client.generate_presigned_url(
                    "put_object",
                    Params={
                        "Bucket": DATASOURCE_BUCKET,
                        "Key": object_key,
                        'ContentType': content_type
                    },
                    ExpiresIn=3600  # 1 hour expiration
                )
                result[file_name] = presigned_url
                
                LOGGER.debug(
                    "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
                    "Generated URL for %s: %s", 
                    file_name, presigned_url
                )
            except Exception as e:
                LOGGER.error(
                    "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
                    "Failed to generate URL for %s: %s", 
                    file_name, e
                )
                result[file_name] = f"Error generating URL: {str(e)}"

        # Log the activity
        name_item = datasource_table.get_item(Key={"DatasourceId": datasource_id})
        datasource_name = name_item.get("Item").get("DatasourceName")

        log_activity(
            ACTIVITY_LOGS_TABLE,
            resource_type="Datasource",
            resource_name=datasource_name,
            resource_id=datasource_id,
            user_id=user_id,
            action="Uploaded files in Datasource"
        )

        LOGGER.info(
            "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
            "Generated %d pre-signed URLs for datasource %s",
            len(result), datasource_id
        )
        return return_response(200, {"PreSignedURL": result})

    except Exception as e:
        LOGGER.error(
            "IN develop-DatasourceLambdaFunction.generate_presigned_url(), "
            "Error generating pre-signed URLs: %s", 
            e, 
            exc_info=True
        )
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

        log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "Create Folder in Datasource")
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

        log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "Deleted files from Datasource")

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

        log_activity(ACTIVITY_LOGS_TABLE, "Datasource", Datasourcename, datasource_id, user_id, "Downloaded file from Datasource")
        return return_response(200, {"PreSignedURL": presigned_url})
    except Exception as e:
        LOGGER.error("Failed to generate presigned download URL: %s", e, exc_info=True)
        return return_response(500, {"message": "Failed to generate presigned download URL"})
