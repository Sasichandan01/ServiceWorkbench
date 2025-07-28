import json
import boto3
import logging
import os
from datetime import datetime, timedelta
from Utils.utils import paginate_list, return_response

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

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


def fetch_name_from_dynamodb(filter_key, filter_value, workspace_id=None):
    try:
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
            LOGGER.info("Fetching solution name for workspace: %s", workspace_id)
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
        LOGGER.warning("DynamoDB lookup failed for %s=%s: %s", filter_key, filter_value, str(e))
        return filter_value


def lambda_handler(event, context):
    LOGGER.info("Received event: %s", json.dumps(event))
    query_params = event.get('queryStringParameters', {}) or {}

    group_by_key = query_params.get('groupby')  # Can be workspace/user/solution
    filter_key = None
    filter_value = None
    workspace_id_for_solution = None

    # Special override: groupby=workspace and workspaceid present → treat as solution breakdown
    if group_by_key and group_by_key.lower() == "workspace" and "workspaceid" in query_params:
        LOGGER.info("Overriding groupby=workspace to groupby=solution due to workspaceid presence.")
        group_by_key = "solution"
        filter_key = "workspaceid"
        filter_value = query_params["workspaceid"]
        workspace_id_for_solution = filter_value

    # Detect fallback filter if not set above
    if not filter_key:
        for key in ['workspaceid', 'userid', 'solutionid']:
            if key in query_params:
                filter_key = key
                filter_value = query_params[key]
                if key != 'workspaceid':
                    workspace_id_for_solution = query_params.get('workspaceid')
                break

    LOGGER.info("GroupBy: %s | Filter: %s = %s", group_by_key, filter_key, filter_value)

    # Prepare groupBy block
    group_by = []
    if group_by_key:
        tag_key = TAG_KEY_MAP.get(group_by_key.lower())
        if tag_key:
            group_by.append({'Type': 'TAG', 'Key': tag_key})

    # Prepare filter block
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

    # Time range: start of month to now+1 (exclusive)
    today = datetime.utcnow().date()
    start_date = today.replace(day=1)
    end_date = today + timedelta(days=1)

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

    LOGGER.info("Request params: %s", json.dumps(request_params, default=str))
    response = cost_explorer.get_cost_and_usage(**request_params)

    results = []

    for result in response['ResultsByTime']:
        if result.get('Groups'):
            for group in result['Groups']:
                tag_value = group['Keys'][0].split('$')[-1]
                if not tag_value.strip() or tag_value.lower() == 'unknown':
                    continue

                amount = abs(float(group['Metrics']['UnblendedCost']['Amount']))
                id_key = group_by_key.lower() + 'id'
                name = fetch_name_from_dynamodb(id_key, tag_value, workspace_id_for_solution)

                if name == tag_value:
                    continue

                group_by_key_cap = group_by_key[0].upper() + group_by_key[1:].lower()
                results.append({
                    f"{group_by_key_cap}Name": name,
                    f"{group_by_key_cap}Id": tag_value,
                    "Cost": round(amount, 2)
                })

        elif result.get('Total') and filter_key:
            amount = abs(float(result['Total']['UnblendedCost']['Amount']))
            name = fetch_name_from_dynamodb(filter_key, filter_value, workspace_id_for_solution)

            if name == filter_value:
                continue

            lent = len(filter_key)-2
            filter_key_cap = filter_key[0].upper() + filter_key[1:lent].lower()
            results.append({
                f"{filter_key_cap}Name": name,
                f"{filter_key_cap}Id": filter_value,
                "Cost": round(amount, 2)
            })

    response_body = results if group_by else results[0] if results else {}
    LOGGER.info("Response body: %s", json.dumps(response_body, default=str))

    return return_response(200, response_body)
