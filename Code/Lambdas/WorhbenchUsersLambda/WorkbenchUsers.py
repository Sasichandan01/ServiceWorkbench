import json
import boto3
import os
import logging
from boto3.dynamodb.conditions import Key

# Setup logger
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# Environment variable and client setup
USER_TABLE_NAME = os.environ['USER_TABLE_NAME']
PROFILE_IMAGE_BUCKET = os.environ.get("PROFILE_IMAGE_BUCKET")

dynamodb = boto3.resource('dynamodb')
user_table = dynamodb.Table(USER_TABLE_NAME)


def response(status_code, body):
    """
    Helper method to format HTTP responses.

    Args:
        status_code (int): HTTP status code.
        body (dict): Response body.

    Returns:
        dict: Formatted API Gateway response.
    """
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body)
    }


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

        try:
            body = json.loads(event.get('body') or "{}")
        except json.JSONDecodeError:
            return response(400, {"message": "Invalid JSON in request body"})

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
            else:
                return update_user_details(user_id, body)

        return response(404, {"message": "Route not found"})

    except Exception as e:
        LOGGER.error("Error processing request: %s", e, exc_info=True)
        return response(500, {"message": "Internal server error"})


def get_all_users(query_params):
    """
    Retrieve all users with pagination support.

    Args:
        params (dict): Query string parameters including limit and offset.

    Returns:
        dict: HTTP response with users data.
    """
    LOGGER.info("Getting all Users")
    limit = int(query_params.get("limit", 10))
    offset = int(query_params.get("offset", 0))

    scan_kwargs = {'Limit': limit}
    users_data = []
    scanned_count = 0
    total_users = 0
    start_key = None
    done = False

    while not done:
        if start_key:
            scan_kwargs['ExclusiveStartKey'] = start_key

        res = user_table.scan(**scan_kwargs)
        items = res.get("Items", [])
        start_key = res.get("LastEvaluatedKey")

        for item in items:
            if scanned_count >= offset and len(users_data) < limit:
                users_data.append({
                    "UserId": item.get("UserId"),
                    "Username": item.get("Username"),
                    "Email": item.get("Email"),
                    "Roles": item.get("Role", [])
                })

            scanned_count += 1
            if len(users_data) >= limit:
                break

        if not start_key or len(users_data) >= limit:
            done = True

    return response(200, {
        "Users": users_data,
        "TotalUsers": scanned_count,
        "TotalWokspaces": "N/A",
        "Pagination": {
            "Count": len(users_data),
            "TotalCount": scanned_count,
            "NextAvailable": bool(start_key),
            "Page": (offset // limit) + 1
        }
    })


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

    if not item:
        return response(404, {"message": "User not found"})

    return response(200, {
        "UserId": item.get("UserId"),
        "Username": item.get("Username"),
        "Email": item.get("Email"),
        "Roles": item.get("Role", []),
        "ProfileImage": item.get("ProfileImage", "")
    })


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
        return response(400, {"message": "Username is required"})

    user_table.update_item(
        Key={"UserId": user_id},
        UpdateExpression="SET Username = :username",
        ExpressionAttributeValues={":username": username}
    )

    return response(200, {"message": "User details updated"})

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

    if not PROFILE_IMAGE_BUCKET:
        return response(500, {"message": "S3 bucket not configured"})

    file_name = user_id

    # Get and validate file extension
    extension = os.path.splitext(file_name)[-1].lower()
    allowed_types = {
        ".jpeg": "image/jpeg",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp"
    }

    content_type = allowed_types.get(extension)
    if not content_type:
        return response(400, {"message": "Unsupported file type. Allowed: .jpg, .jpeg, .png, .webp"})

    object_key = f"profile-images/{user_id}/{file_name}"
    s3_client = boto3.client("s3")

    try:
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": PROFILE_IMAGE_BUCKET,
                "Key": object_key,
                "ContentType": content_type
            },
            ExpiresIn=3600
        )

        # object_url = f"https://{s3_bucket}.s3.amazonaws.com/{object_key}"

        return response(200, {
            "message": "Pre-signed URL generated",
            "UploadURL": presigned_url
            # "ImageURL": object_url
        })

    except Exception as e:
        LOGGER.error("Failed to generate pre-signed URL: %s", e, exc_info=True)
        return response(500, {"message": "Error generating pre-signed URL"})

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
