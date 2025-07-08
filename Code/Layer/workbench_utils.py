import boto3
import logging
from decimal import Decimal
import json
from boto3.dynamodb.conditions import Key, Attr
# import jwt

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

DYNAMODB = boto3.resource('dynamodb')
SES_CLIENT = boto3.client('ses')

VALID_USERS_SORT_KEYS = ['Email', 'UserId', 'CreationTime', 'LastUpdatedTime', 'Role', 'Username', 'LastUpdatedBy']


def paginate_list(name, data, valid_keys, offset=0, limit=50, sort_by=None, sort_order='asc'):
    """
    Generic pagination and sorting utility for list of dictionaries.
    Args:
        data (list): List of dictionaries to paginate.
        offset (int): Number of items to skip.
        limit (int): Number of items to return.
        sort_by (str): Optional key to sort the data.
    Returns:
        dict: HTTP response with paginated and sorted data.
    """
    try:
        if not isinstance(data, list):
            return {"statusCode": 400, "body": json.dumps({"error": "Data must be a list of dictionaries."})}
        if not all(isinstance(item, dict) for item in data):
            return {"statusCode": 400, "body": json.dumps({"error": "All items in data must be dictionaries."})}
        if not isinstance(offset, int) or offset < 0:
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid offset. Must be a non-negative integer."})}
        if not isinstance(limit, int) or limit <= 0:
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid limit. Must be a positive integer."})}
        if limit > 50:
            limit = 50

        # Sorting
        if sort_by:
            if sort_by not in valid_keys:
                return {"statusCode": 400, "body": json.dumps({"error": f"Invalid sort_by field '{sort_by}'."})}
            reverse = sort_order == 'desc'
            data.sort(key=lambda x: str(x.get(sort_by, "")).lower(), reverse=reverse)

        # Paginate
        paginated = data[offset:offset + limit]

        # Calculate total pages
        total_items = len(data)
        total_pages = (total_items + limit - 1) // limit  

        def decimal_default(obj):
            if isinstance(obj, Decimal):
                return float(obj)
            raise TypeError

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                name: paginated,
                "offset": offset,
                "limit": limit,
                "sort_by": sort_by,
                "sort_order": sort_order,
                "total_pages": total_pages
            }, default=decimal_default)
        }

    except Exception as e:
        LOGGER.error(f"Pagination error: {str(e)}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Error in pagination"})
        }
