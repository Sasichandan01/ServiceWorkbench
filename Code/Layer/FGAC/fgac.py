import logging
import json
from datetime import datetime, timezone
import boto3

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

LEVEL_RANK = {"read_only": 1, "editor": 2, "owner": 3}

dynamodb = boto3.resource('dynamodb') 
# RESOURCE_ACCESS_TABLE= dynamodb.Table(os.environ['RESOURCE_ACCESS_TABLE'])
time=str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))

def create_workspace_fgac(table,user_id,access_type,workspace_id):
    user_access_type=f"{user_id}#{access_type}"
    access_key=f"WORKSPACE#{workspace_id}"

    table.put_item(Item={"Id": user_access_type, "AccessKey": access_key,"CreationTime":time})

def create_solution_fgac(table,user_id,access_type,workspace_id,solution_id):
    user_access_type=f"{user_id}#{access_type}"
    access_key=f"SOLUTION#{workspace_id}#{solution_id}"

    table.put_item(Item={"Id": user_access_type, "AccessKey": access_key,"CreationTime":time})

def create_datasource_fgac(table,user_id,access_type,datasource_id):
    user_access_type=f"{user_id}#{access_type}"
    access_key=f"DATASOURCE#{datasource_id}"

    table.put_item(Item={"Id": user_access_type, "AccessKey": access_key,"CreationTime":time})
