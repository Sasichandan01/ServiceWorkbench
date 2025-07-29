import json
import boto3
import logging
import os
from datetime import datetime, timedelta
from Utils.utils import paginate_list, return_response

# Initialize logger with consistent format
try:
    LOGGER = logging.getLogger()
    LOGGER.setLevel(logging.INFO)
except Exception as e:
    print(f"Failed to initialize logger: {str(e)}")
    raise

# Initialize AWS clients and environment variables with error handling
try:
    cost_explorer = boto3.client("ce")
    dynamodb = boto3.client("dynamodb")
    
    # Environment variables for table names
    USER_TABLE = os.environ['USERS_TABLE']
    WORKSPACE_TABLE = os.environ['WORKSPACE_TABLE']
    SOLUTION_TABLE = os.environ['SOLUTION_TABLE']
    
    # Maps query keys to correct CE tag keys
    TAG_KEY_MAP = {
        'userid': 'SWB-User',
        'workspaceid': 'SWB-Workspace',
        'solutionid': 'SWB-Soluiton', 
        'user': 'SWB-User',
        'workspace': 'SWB-Workspace',
        'solution': 'SWB-Soluiton'
    }
except Exception as e:
    LOGGER.error(
        "IN develop-CostLambdaFunction, Failed to initialize AWS clients or environment variables: %s", 
        str(e)
    )
    raise


def fetch_name_from_dynamodb(filter_key, filter_value, workspace_id=None):
    """
    Fetches human-readable names from DynamoDB tables based on resource IDs.
    
    Args:
        filter_key (str): The type of resource (userid/workspaceid/solutionid).
        filter_value (str): The ID of the resource to look up.
        workspace_id (str, optional): Required for solution lookups.
        
    Returns:
        str: The human-readable name or original ID if lookup fails.
    """
    try:
        LOGGER.info(
            "IN develop-CostLambdaFunction.fetch_name_from_dynamodb(), "
            "Looking up %s=%s with workspace_id=%s", 
            filter_key, filter_value, workspace_id
        )
        
        if filter_key == 'userid':
            response = dynamodb.get_item(
                TableName=USER_TABLE,
                Key={'UserId': {'S': filter_value}}
            )
            item = response.get('Item')
            return item.get('Username', {}).get('S') if item else filter_value

        elif filter_key == 'workspaceid':
            response = dynamodb.get_item(
                TableName=WORKSPACE_TABLE,
                Key={'WorkspaceId': {'S': filter_value}}
            )
            item = response.get('Item')
            return item.get('WorkspaceName', {}).get('S') if item else filter_value

        elif filter_key == 'solutionid' and workspace_id:
            response = dynamodb.get_item(
                TableName=SOLUTION_TABLE,
                Key={
                    'WorkspaceId': {'S': workspace_id},
                    'SolutionId': {'S': filter_value}
                }
            )
            item = response.get('Item')
            return item.get('SolutionName', {}).get('S') if item else filter_value

    except Exception as e:
        LOGGER.warning(
            "IN develop-CostLambdaFunction.fetch_name_from_dynamodb(), "
            "DynamoDB lookup failed for %s=%s: %s", 
            filter_key, filter_value, str(e)
        )
        return filter_value


def lambda_handler(event, context):
    """
    Entry point for the Lambda function. Retrieves AWS cost data filtered by 
    workspace, user, or solution and returns formatted cost reports.
    
    Args:
        event (dict): The event object from API Gateway containing query parameters.
        context (LambdaContext): The runtime context.
        
    Returns:
        dict: API Gateway-compatible HTTP response with cost data.
    """
    try:
        LOGGER.info(
            "IN develop-CostLambdaFunction.lambda_handler(), "
            "Received event: %s", 
            json.dumps(event)
        )
        
        # Parse query parameters with default fallback
        query_params = event.get('queryStringParameters', {}) or {}
        group_by_key = query_params.get('groupby')  # Can be workspace/user/solution
        filter_key = None
        filter_value = None
        workspace_id_for_solution = None

        # Special handling for solution breakdown when workspaceid is provided
        if group_by_key and group_by_key.lower() == "workspace" and "workspaceid" in query_params:
            LOGGER.info(
                "IN develop-CostLambdaFunction.lambda_handler(), "
                "Overriding groupby=workspace to groupby=solution due to workspaceid presence."
            )
            group_by_key = "solution"
            filter_key = "workspaceid"
            filter_value = query_params["workspaceid"]
            workspace_id_for_solution = filter_value

        # Fallback to other filter parameters if not set above
        if not filter_key:
            for key in ['workspaceid', 'userid', 'solutionid']:
                if key in query_params:
                    filter_key = key
                    filter_value = query_params[key]
                    if key != 'workspaceid':
                        workspace_id_for_solution = query_params.get('workspaceid')
                    break

        LOGGER.info(
            "IN develop-CostLambdaFunction.lambda_handler(), "
            "GroupBy: %s | Filter: %s = %s", 
            group_by_key, filter_key, filter_value
        )

        # Prepare Cost Explorer API parameters
        group_by = []
        if group_by_key:
            tag_key = TAG_KEY_MAP.get(group_by_key.lower())
            if tag_key:
                group_by.append({'Type': 'TAG', 'Key': tag_key})

        # Build filter block if filter parameters exist
        filter_block = None
        if filter_key and filter_value:
            tag_key = TAG_KEY_MAP.get(filter_key.lower())
            if tag_key:
                filter_block = {
                    'Tags': {
                        'Key': tag_key,
                        'Values': [filter_value],
                        'MatchOptions': ['EQUALS']
                    }
                }

        # Set time range: start of current month to tomorrow (exclusive)
        today = datetime.utcnow().date()
        start_date = today.replace(day=1)
        end_date = today + timedelta(days=1)

        # Build Cost Explorer API request
        request_params = {
            'TimePeriod': {
                'Start': start_date.strftime('%Y-%m-%d'),
                'End': end_date.strftime('%Y-%m-%d')
            },
            'Granularity': 'MONTHLY',
            'Metrics': ['UnblendedCost']
        }

        if group_by:
            request_params['GroupBy'] = group_by
        if filter_block:
            request_params['Filter'] = filter_block

        LOGGER.info(
            "IN develop-CostLambdaFunction.lambda_handler(), "
            "Cost Explorer request params: %s", 
            json.dumps(request_params, default=str)
        )
        
        # Get cost data from AWS Cost Explorer
        response = cost_explorer.get_cost_and_usage(**request_params)
        results = []

        # Process grouped results (when grouping by tag)
        for result in response['ResultsByTime']:
            if result.get('Groups'):
                for group in result['Groups']:
                    tag_value = group['Keys'][0].split('$')[-1]
                    if not tag_value.strip() or tag_value.lower() == 'unknown':
                        continue

                    amount = abs(float(group['Metrics']['UnblendedCost']['Amount']))
                    id_key = group_by_key.lower() + 'id'
                    name = fetch_name_from_dynamodb(id_key, tag_value, workspace_id_for_solution)

                    if name == tag_value:  # Skip if we couldn't resolve the name
                        continue

                    # Format result with proper capitalization (e.g., "WorkspaceId")
                    group_by_key_cap = group_by_key[0].upper() + group_by_key[1:].lower()
                    results.append({
                        f"{group_by_key_cap}Name": name,
                        f"{group_by_key_cap}Id": tag_value,
                        "Cost": round(amount, 2)
                    })

            # Process non-grouped results (when filtering by single resource)
            elif result.get('Total') and filter_key:
                amount = abs(float(result['Total']['UnblendedCost']['Amount']))
                name = fetch_name_from_dynamodb(filter_key, filter_value, workspace_id_for_solution)

                if name == filter_value:  # Skip if we couldn't resolve the name
                    continue

                # Format result with proper capitalization (e.g., "WorkspaceId")
                filter_key_cap = filter_key[0].upper() + filter_key[:-2].lower()
                results.append({
                    f"{filter_key_cap}Name": name,
                    f"{filter_key_cap}Id": filter_value,
                    "Cost": round(amount, 2)
                })

        # Prepare final response - array for grouped results, single object for filtered
        response_body = results if group_by else results[0] if results else {}
        
        LOGGER.info(
            "IN develop-CostLambdaFunction.lambda_handler(), "
            "Returning response with %d items", 
            len(results) if isinstance(results, list) else 1 if results else 0
        )
        
        return return_response(200, response_body)

    except Exception as e:
        LOGGER.error(
            "IN develop-CostLambdaFunction.lambda_handler(), "
            "Error processing request: %s", 
            str(e)
        )
        return return_response(500, {"error": "Internal server error"})