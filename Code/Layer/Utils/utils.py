import logging
import json
from decimal import Decimal
from typing import Dict, Any, Optional
import uuid
import boto3
from datetime import datetime, timezone

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)
dynamodb = boto3.resource('dynamodb')
def decimal_default(obj):
    """
    Convert Decimal objects to float for JSON serialization.
    """
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def return_response(status_code: int, body: Any) -> Dict[str, Any]:
    """
    Return a response with the given status code and JSON body.
    """
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        "body": json.dumps(body, default=decimal_default),
    }

def paginate_list(
    name: str,
    data: Any,
    valid_keys: list,
    offset: int = 1,
    limit: int = 10,
    sort_by: Optional[str] = None,
    sort_order: str = "asc"
) -> Dict[str, Any]:
    """
    Generic pagination and sorting utility for a list of dictionaries.

    Args:
        name: Name of the returned data field.
        data: List of dictionaries to paginate.
        valid_keys: List of keys allowed for sorting.
        offset: Number of items to skip (non-negative integer).
        limit: Number of items to return (1–50).
        sort_by: Optional key to sort the data by.
        sort_order: 'asc' or 'desc'.

    Returns:
        HTTP-style response dict with paginated & sorted data.
    """
    # Validate inputs
    if not isinstance(data, list):
        return return_response(400, {"error": "Data must be a list of dictionaries."})
    if not all(isinstance(item, dict) for item in data):
        return return_response(
            400, {"error": "All items in data must be dictionaries."}
        )
    if not isinstance(offset, int) or offset < 0:
        return return_response(
            400, {"error": "Invalid offset. Must be a non-negative integer."}
        )
    if not isinstance(limit, int) or limit <= 0:
        return return_response(
            400, {"error": "Invalid limit. Must be a positive integer."}
        )
    if limit > 50:
        return return_response(400, {"error": "Limit cannot exceed 50."})
    if sort_order not in ("asc", "desc"):
        return return_response(400, {"error": "sort_order must be 'asc' or 'desc'."})
    if offset <= 0:
        return return_response(400, {"error": "Offset must be greater than 0."})

    # Sorting
    data_to_page = data
    if sort_by:
        if sort_by not in valid_keys:
            return return_response(
                400, {"error": f"Invalid sort_by field '{sort_by}'."}
            )
        reverse = sort_order == "desc"
        data_to_page = sorted(data, key=lambda x: x.get(sort_by, ""), reverse=reverse)

    # Pagination
    total_items = len(data_to_page)
    paginated = data_to_page[(offset-1)*limit : offset*limit]

    # Build response body
    body = {
        name: paginated,
        "Pagination": {
            "Count": len(paginated),
            "TotalCount": total_items,
            "NextAvailable": limit*offset < total_items,
        }
    }
    return return_response(200, body)

def log_activity(table, resource_type, resource_name, resource_id, user_id, message):
    """
    Log an activity to the DynamoDB activity logs table.
    Args:
        table: DynamoDB Table resource
        resource_type: Type of the resource (e.g., 'Solutions')
        resource_name: Name of the resource
        resource_id: ID of the resource
        user_id: ID of the user performing the action
        message: Description of the activity
    """
    log_id = str(uuid.uuid4())
    activity_log = {
        "LogId": log_id,
        "ResourceType": resource_type,
        "ResourceName": resource_name,
        "ResourceId": resource_id,
        "UserId": user_id,
        "EventTime": str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
        "Message": message
    }
    table.put_item(Item=activity_log)
    return return_response(200, "Log Activity added successfully")
