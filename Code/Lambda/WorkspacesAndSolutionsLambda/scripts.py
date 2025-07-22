import json
import boto3
import os
import logging
from Utils.utils import return_response

# Configure logging
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# Initialize S3 client and bucket name
s3 = boto3.client('s3')
BUCKET_NAME = os.environ['WORKSPACES_BUCKET']

def handle_get(base_prefix):
    """
    Handles GET request to fetch all code (.py) and CFT (.yaml/.yml) files from S3
    under the given base prefix. It returns pre-signed GET URLs for each file.
    
    Args:
        base_prefix (str): S3 prefix path (e.g., workspace/solution/).

    Returns:
        dict: HTTP response with pre-signed URLs for code and CFT files.
    """
    try:
        code_prefix = f"{base_prefix}/codes/"
        cft_prefix = f"{base_prefix}/cft/"
        LOGGER.info(f"[GET] Listing files - Code Prefix: {code_prefix}, CFT Prefix: {cft_prefix}")

        # List files from S3 for both code and CFT
        code_files = list_files(code_prefix, ['.py'])
        cft_files = list_files(cft_prefix, ['.yaml', '.yml'])

        LOGGER.info(f"[GET] Files found - Code: {len(code_files)}, CFT: {len(cft_files)}")

        # Generate GET pre-signed URLs
        code_urls = generate_urls(code_files)
        cft_urls = generate_urls(cft_files)

        return return_response(200, {
            "PreSignedURLs": {
                "code": code_urls,
                "cft": cft_urls
            }
        })

    except Exception as e:
        LOGGER.error(f"[GET] Error occurred: {str(e)}")
        return return_response(500, "Internal server error")

def handle_post(base_prefix, body):
    """
    Handles POST request to generate a pre-signed PUT URL to allow uploading a file
    (either Python code or CloudFormation template) to a specific S3 folder.

    Args:
        base_prefix (str): S3 prefix path.
        body (dict): Contains FileName and ContentType.

    Returns:
        dict: HTTP response with pre-signed PUT URL and headers.
    """
    try:
        file_name = body.get("FileName")
        content_type = body.get("ContentType")
        LOGGER.info(f"[POST] Upload request - File: {file_name}, Type: {content_type}")

        # Validate required fields
        if not file_name or not content_type:
            LOGGER.warning("[POST] Missing FileName or ContentType in request body")
            return return_response(400, "FileName and ContentType are required")

        # Prevent path traversal in filename
        if '../' in file_name or '~' in file_name:
            LOGGER.warning("[POST] Invalid characters detected in FileName")
            return return_response(400, "Invalid filename")

        # Determine file path and adjust content type
        ext = os.path.splitext(file_name)[1].lower()
        if ext == '.py':
            key = f"{base_prefix}/codes/{file_name}"
            if content_type != 'text/x-python':
                LOGGER.warning("[POST] Forcing ContentType to text/x-python for .py file")
                content_type = 'text/x-python'
        elif ext in ['.yaml', '.yml']:
            key = f"{base_prefix}/cft/{file_name}"
            if content_type != 'text/yaml':
                LOGGER.warning("[POST] Forcing ContentType to text/yaml for YAML file")
                content_type = 'text/yaml'
        else:
            LOGGER.warning("[POST] Unsupported file type attempted to upload")
            return return_response(400, "Unsupported file type")

        # Generate pre-signed PUT URL
        presigned_url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': key
            },
            ExpiresIn=3600
        )

        LOGGER.info(f"[POST] Pre-signed PUT URL generated for: {key}")

        return return_response(200,{"PreSignedURL": presigned_url})

    except Exception as e:
        LOGGER.error(f"[POST] Error occurred: {str(e)}")
        return return_response(500, "Internal server error")

def list_files(prefix, extensions):
    """
    List all files in a given S3 prefix that match specified extensions.

    Args:
        prefix (str): S3 folder path.
        extensions (list): List of file extensions to filter.

    Returns:
        list: S3 object keys matching the criteria.
    """
    files = []
    try:
        paginator = s3.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix):
            for obj in page.get('Contents', []):
                key = obj['Key']
                if any(key.lower().endswith(ext) for ext in extensions):
                    files.append(key)

        LOGGER.info(f"[LIST] Total matched files under {prefix}: {len(files)}")
        return files

    except Exception as e:
        LOGGER.error(f"[LIST] Error listing files in {prefix}: {str(e)}")
        return []

def generate_urls(file_keys):
    """
    Generates pre-signed GET URLs for each S3 object key provided.

    Args:
        file_keys (list): List of S3 object keys.

    Returns:
        list: List of dictionaries containing FileName and its URL.
    """
    return [
        {
            "FileName": os.path.basename(key),
            "Url": create_presigned_url(key)
        }
        for key in file_keys
    ]

def create_presigned_url(key):
    """
    Generate a pre-signed GET URL for a given S3 object key.

    Args:
        key (str): S3 object key.

    Returns:
        str or None: Pre-signed URL or None on failure.
    """
    try:
        url = s3.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': key
            },
            ExpiresIn=3600
        )
        LOGGER.info(f"[GET URL] Generated pre-signed URL for {key}")
        return url
    except Exception as e:
        LOGGER.error(f"[GET URL] Failed to generate URL for {key}: {str(e)}")
        return None
