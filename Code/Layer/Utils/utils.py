import json
import logging
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from typing import Dict, Any, Optional

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)


def decimal_default(obj: Any) -> Any:
    """
    Default JSON serializer for Decimal objects.

    Key steps:
        1. Check if object is a Decimal.
        2. Convert Decimal to float.
        3. Raise TypeError for unsupported types.

    Params:
        obj [Any]: object to serialize

    Returns:
        Any: float if obj is Decimal

    Raises:
        TypeError: if obj is not Decimal
    """
    LOGGER.info("IN %s.decimal_default, serializing object of type %s", __name__, type(obj).__name__)
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def return_response(status_code: int, body: Any) -> Dict[str, Any]:
    """
    Build an HTTP-style JSON response.

    Key steps:
        1. JSON-encode the body using decimal_default.
        2. Attach CORS headers.
        3. Return status code and body.

    Params:
        status_code [int]: HTTP status code
        body [Any]: response payload

    Returns:
        Dict[str, Any]: full HTTP response dict
    """
    LOGGER.info("IN %s.return_response, status=%d, body keys=%s", __name__, status_code, getattr(body, 'keys', lambda: body)())
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
    Paginate and optionally sort a list of dicts in a standard response.

    Key steps:
        1. Validate input types and parameters.
        2. Sort data if sort_by provided and valid.
        3. Slice list according to offset and limit.
        4. Build pagination metadata.

    Params:
        name [str]: field name for returned data list
        data [Any]: list of dicts to paginate
        valid_keys [list]: allowed keys for sorting
        offset [int]: 1-based page number
        limit [int]: items per page (max 50)
        sort_by [Optional[str]]: key to sort by
        sort_order [str]: 'asc' or 'desc'

    Returns:
        Dict[str, Any]: HTTP-style response with paginated data
    """
    LOGGER.info(
        "IN %s.paginate_list, name=%s, offset=%d, limit=%d, sort_by=%s, sort_order=%s",
        __name__, name, offset, limit, sort_by, sort_order
    )
    # Validate data list
    if not isinstance(data, list) or not all(isinstance(item, dict) for item in data):
        return return_response(400, {"error": "Data must be a list of dictionaries."})
    if offset < 1:
        return return_response(400, {"error": "Offset must be greater than 0."})
    if limit < 1 or limit > 50:
        return return_response(400, {"error": "Limit must be between 1 and 50."})
    if sort_order not in ("asc", "desc"):
        return return_response(400, {"error": "sort_order must be 'asc' or 'desc'."})

    # Sorting
    data_to_page = data
    if sort_by:
        if sort_by not in valid_keys:
            return return_response(400, {"error": f"Invalid sort_by field '{sort_by}'."})
        reverse = sort_order == "desc"
        data_to_page = sorted(
            data,
            key=lambda x: (x.get(sort_by) or ""),
            reverse=reverse
        )
        LOGGER.info("IN %s.paginate_list, sorted data by %s", __name__, sort_by)

    # Pagination slice
    start = (offset - 1) * limit
    end = start + limit
    paginated = data_to_page[start:end]
    total_items = len(data_to_page)
    LOGGER.info(
        "IN %s.paginate_list, paginated items %d to %d of %d",
        __name__, start, end, total_items
    )

    body = {
        name: paginated,
        "Pagination": {
            "Count": len(paginated),
            "TotalCount": total_items,
            "NextAvailable": end < total_items,
        }
    }
    return return_response(200, body)


def log_activity(
    table: Any,
    resource_type: str,
    resource_name: str,
    resource_id: str,
    user_id: str,
    action: str
) -> None:
    """
    Write an activity record to a DynamoDB table.

    Key steps:
        1. Generate a unique LogId.
        2. Build the activity item with timestamp.
        3. Put the item into DynamoDB.

    Params:
        table [Any]: DynamoDB Table resource for activity logs
        resource_type [str]: type/category of the resource
        resource_name [str]: name of the resource
        resource_id [str]: unique identifier of the resource
        user_id [str]: identifier of the user performing the action
        action [str]: description of the action

    Returns:
        None
    """
    log_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    item = {
        "LogId": log_id,
        "ResourceType": resource_type,
        "ResourceName": resource_name,
        "ResourceId": resource_id,
        "UserId": user_id,
        "EventTime": timestamp,
        "Action": action
    }
    LOGGER.info(
        "IN %s.log_activity, logging activity %s for %s:%s by %s",
        __name__, action, resource_type, resource_id, user_id
    )
    table.put_item(Item=item)
