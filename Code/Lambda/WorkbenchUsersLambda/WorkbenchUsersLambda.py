import json
import boto3
import os
import logging
from boto3.dynamodb.conditions import Key
from Utils.utils import paginate_list,  return_response
from RBAC.rbac import is_user_action_valid
from datetime import datetime, timezone

VALID_USERS_SORT_KEYS= ['CreationTime', 'UserId', 'Username', 'Email', 'Role', 'LastUpdationTime', 'LastUpdatedBy', 'LastLoginTime']

# Setup logger
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# Environment variable and client setup
USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
MISC_BUCKET = os.environ.get("MISC_BUCKET")
ROLES_TABLE = os.environ.get("ROLES_TABLE")
GLUE_JOB_NAME = os.environ.get('GLUE_JOB_NAME')
glue=boto3.client('glue')
dynamodb = boto3.resource('dynamodb')
user_table = dynamodb.Table(USER_TABLE_NAME)
table = dynamodb.Table(ROLES_TABLE)

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
        LOGGER.info("Received event: %s", json.dumps(event))
        # Check for S3 trigger (presence of 'Records' with 's3' key)
        if "Records" in event and event["Records"][0].get("eventSource") == "aws:s3":
            return update_profile_image_on_s3_upload(event, context)

        http_method = event.get('httpMethod')
        path = event.get('path', '')
        query_params = event.get('queryStringParameters') or {}
        path_params = event.get('pathParameters') or {}
        resource = event.get('resource', '')

        auth = event.get("requestContext", {}).get("authorizer", {})
        user_id = auth.get("user_id")
        role = auth.get("role")
        valid, msg = is_user_action_valid(user_id, role, resource, http_method, table)
        if not valid:
            return return_response(403, {"Error": msg})

        try:
            body = json.loads(event.get('body') or "{}")
        except json.JSONDecodeError:
            return return_response(400, {"message": "Invalid JSON in request body"})

        # Route: GET /users
        if http_method == 'GET' and path == '/users':
            return get_all_users(query_params)

        # Route: GET /users/{user_id}
        if http_method == 'GET' and 'user_id' in path_params:
            return get_user_profile(path_params['user_id'])

        # Route: PUT /users/{user_id}
        if http_method == 'PUT' and 'user_id' in path_params:
            action = query_params.get('action')
            user_id = path_params['user_id']

            if action == 'profile_image':
                return get_profile_image_upload_url(user_id, body)
            elif action == 'role':
                return update_user_roles(user_id, body)
            else:
                return update_user_details(user_id, body)
        
        if http_method == 'POST' and path=='/rag-sync':
            return rag_sync(event)

        return return_response(404, {"message": "Route not found"})

    except Exception as e:
        LOGGER.error("Error processing request: %s", e, exc_info=True)
        return return_response(500, {"message": "Internal server error"})

def get_all_users(query_params):
    """
    Retrieve all users with pagination support and sorting.

    Args:
        query_params (dict): Query string parameters including limit, offset, and sort.

    Returns:
        dict: HTTP response with users data.
    """
    LOGGER.info("Getting all Users")
    limit = int(query_params.get("limit", 5))
    sort_by = query_params.get("sort_by", "Username")
    sort_order = query_params.get("sort_order", "asc")
    offset = int(query_params.get("offset", 1))

    scan_response = user_table.scan()
    items = scan_response.get("Items", [])

    # Simplified response structure
    Name = "Users"
    simplified_items = [
        {
            "UserId": item.get("UserId"),
            "Username": item.get("Username"),
            "Email": item.get("Email"),
            "Roles": item.get("Role", []),
            "ProfileImageURL": item.get("ProfileImage"),
            "LastLoginTime": item.get("LastLoginTime", "")
        } for item in items
    ]
    paginated_result = paginate_list(Name, simplified_items, VALID_USERS_SORT_KEYS, offset, limit, sort_by, sort_order)
    LOGGER.info("Paginated result: %s", paginated_result)

    # Correctly parse the 'body' and extract values from there
    body_dict = json.loads(paginated_result.get("body", "{}"))
    pagination = body_dict.get("Pagination", {})

    formatted_response = {
        "Users": body_dict.get("Users", []),
        "TotalUsers": int(pagination.get("TotalCount", 0)),
        "TotalWokspaces": 0,
        "Pagination": {
            "Count": pagination.get("Count", 0),
            "TotalCount": pagination.get("TotalCount", 0),
            "NextAvailable": pagination.get("NextAvailable", False)
        }
    }

    LOGGER.info("result: %s", formatted_response)
    return return_response(200, formatted_response)


def get_user_profile(user_id):
    """
    Retrieve user profile by user ID.

    Args:
        user_id (str): Unique identifier for the user.

    Returns:
        dict: HTTP response with user profile.
    """
    LOGGER.info("Getting User Profile for %s", user_id)
    res = user_table.get_item(Key={"UserId": user_id})
    item = res.get("Item")
    LOGGER.info("Item: %s", item)

    if not item:
        return return_response(404, {"message": "User not found"})

    return return_response(200, item)


def update_user_details(user_id, body):
    """
    Update the user details such as username.

    Args:
        user_id (str): Unique identifier for the user.
        body (dict): Request body containing the new username.

    Returns:
        dict: HTTP response confirming update.
    """
    LOGGER.info("Updating User Details for %s", user_id)
    username = body.get("Username")
    if not username:
        return return_response(400, {"message": "Username is required"})

    last_updated_time = str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

    user_table.update_item(
        Key={"UserId": user_id},
        UpdateExpression="SET Username = :username, LastUpdatedTime = :time",
        ExpressionAttributeValues={
            ":username": username,
            ":time": last_updated_time
        }
    )

    return return_response(200, {"message": "User details updated"})

def get_profile_image_upload_url(user_id, body):
    """
    Generates a pre-signed S3 URL for the user to upload a profile image.
    The actual image URL is not saved to DynamoDB until the upload is confirmed.

    Args:
        user_id (str): The unique identifier for the user.
        body (dict): JSON body containing the 'FileName'.

    Returns:
        dict: Response with status code, UploadURL and ImageURL.
    """
    LOGGER.info("Generating pre-signed upload URL for user: %s", user_id)

    if not MISC_BUCKET:
        return return_response(500, {"message": "S3 bucket not configured"})

    file_name = user_id

    # Get and validate file extension
    extension = os.path.splitext(file_name)[-1].lower()
    allowed_types = {
        ".jpeg": "image/jpeg",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp"
    }

    # If no extension is provided, use .jpg
    if not extension:
        extension = ".jpg"
        file_name += extension
        
    content_type = allowed_types.get(extension)
    if not content_type:
        return return_response(400, {"message": "Unsupported file type. Allowed: .jpg, .jpeg, .png, .webp"})

    object_key = f"profile-images/{user_id}/{file_name}"
    s3_client = boto3.client("s3")

    try:
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": MISC_BUCKET,
                "Key": object_key,
                "ContentType": content_type
            },
            ExpiresIn=3600
        )

        # object_url = f"https://{s3_bucket}.s3.amazonaws.com/{object_key}"

        return return_response(200, {
            "message": "Pre-signed URL generated",
            "PreSignedURL": presigned_url
            # "ImageURL": object_url
        })

    except Exception as e:
        LOGGER.error("Failed to generate pre-signed URL: %s", e, exc_info=True)
        return return_response(500, {"message": "Error generating pre-signed URL"})

def update_profile_image_on_s3_upload(event, context):
    """
    Lambda handler triggered by S3 upload events.
    Extracts user_id from the S3 object key and updates DynamoDB with the profile image URL.

    Args:
        event (dict): The S3 event payload.
        context (LambdaContext): The runtime context.

    Returns:
        dict: Status message of the operation.
    """
    LOGGER.info("Received S3 event: %s", json.dumps(event))

    try:
        for record in event.get("Records", []):
            s3_info = record.get("s3", {})
            bucket_name = s3_info.get("bucket", {}).get("name")
            object_key = s3_info.get("object", {}).get("key")

            if not bucket_name or not object_key:
                LOGGER.warning("Missing bucket or key in record: %s", record)
                continue

            # Extract user_id from the object key pattern: profile-images/{user_id}/{filename}
            parts = object_key.split("/")
            if len(parts) < 3:
                LOGGER.warning("Unexpected object key format: %s", object_key)
                continue

            user_id = parts[1]
           # Construct the public or virtual-hosted URL (if needed, you could use a GET presigned URL)
            image_url = f"https://{bucket_name}.s3.amazonaws.com/{object_key}"

            # Update DynamoDB record
            user_table.update_item(
                Key={"UserId": user_id},
                UpdateExpression="SET ProfileImage = :url",
                ExpressionAttributeValues={":url": image_url}
            )

            LOGGER.info("Updated profile image URL for user %s", user_id)

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Profile image URLs updated"})
        }

    except Exception as e:
        LOGGER.error("Error processing S3 event: %s", e, exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"message": "Failed to update profile image URL"})
        }

def update_user_roles(user_id, body):
    """
    Appends a role to the user's existing list of roles.

    Args:
        user_id (str): Unique identifier for the user.
        body (dict): JSON body containing the 'Role'.

    Returns:
        dict: HTTP response confirming update.
    """
    LOGGER.info("Updating roles for user: %s", user_id)

    new_role = body.get("Role")
    if not new_role:
        return return_response(400, {"message": "Role is required"})

    try:
        # Fetch the current roles
        result = user_table.get_item(Key={"UserId": user_id})
        user = result.get("Item")
        if not user:
            return return_response(404, {"message": "User not found"})

        current_roles = user.get("Role", [])
        if not isinstance(current_roles, list):
            current_roles = [current_roles]

        if new_role in current_roles:
            return return_response(200, {"message": f"Role '{new_role}' already assigned"})

        updated_roles = current_roles + [new_role]

        user_table.update_item(
            Key={"UserId": user_id},
            UpdateExpression="SET #r = :roles",
            ExpressionAttributeNames={"#r": "Role"},
            ExpressionAttributeValues={":roles": updated_roles}
        )

        return return_response(200, {"message": f"Role '{new_role}' added successfully"})

    except Exception as e:
        LOGGER.error("Failed to update user roles: %s", e, exc_info=True)
        return return_response(500, {"message": "Error updating user roles"})

def rag_sync(event):
    '''This function is used to sync the web scrap and dynamodb data to knowledge base'''
    LOGGER.info("Event: %s", event)
    query_string_parameters = event.get("queryStringParameters", {})
    action = query_string_parameters.get("action")
    arguments = {}
    if action is not None and action == 'web':
        arguments['--ACTION'] = 'web'
    elif action is not None and action == 'app':
        arguments['--ACTION'] = 'app'
    else:
        return return_response(400, {"message": "Invalid or missing action parameter"})

    try:
        response = glue.start_job_run(
            JobName=GLUE_JOB_NAME,
            Arguments=arguments
        )
        return return_response(200,{
                "message": "Glue job started successfully",
                "job_run_id": response['JobRunId']
            })
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': 'Error starting Glue job',
                'error': str(e)
            })
        }
    