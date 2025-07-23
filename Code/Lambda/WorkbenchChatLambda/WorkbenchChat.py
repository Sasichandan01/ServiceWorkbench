import json
import re
import logging
import boto3
import hashlib
from datetime import datetime
from decimal import Decimal
from botocore.config import Config
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
CONFIG = Config(retries={'mode':'adaptive','max_attempts':5}, connect_timeout=60,read_timeout=300)
bedrock_agent_runtime_client = boto3.client('bedrock-agent-runtime', config=CONFIG)
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)
seen_hashes = set()

def generate_requirements():
    return ["boto3==1.28.63", "pyjwt==2.8.0", "requests==2.31.0"]

def read_s3_file(bucket: str, key: str, as_text: bool = True) -> str | None:
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response['Body'].read()
        return body.decode('utf-8') if as_text else body
    except ClientError as e:
        code = e.response['Error']['Code']
        LOGGER.warning(f"S3 error {code} for s3://{bucket}/{key}")
        return None

def send_message_to_websocket(client, conn_id, message):
    try:
        client.post_to_connection(
            ConnectionId=conn_id,
            Data=json.dumps(message).encode('utf-8')
        )
        LOGGER.info(f"Sent to {conn_id}: {message}")
    except Exception as e:
        LOGGER.error(f"WebSocket send failed for {conn_id}: {e}")

def find_thinking_blocks(obj):
    blocks = []
    if isinstance(obj, dict):
        for v in obj.values():
            blocks.extend(find_thinking_blocks(v))
    elif isinstance(obj, list):
        for item in obj:
            blocks.extend(find_thinking_blocks(item))
    elif isinstance(obj, str):
        for m in re.findall(r"<thinking>(.*?)</thinking>", obj, re.DOTALL):
            blocks.append(m.strip())
    return blocks

def find_code_variables(obj):
    variables = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'codeGenerated':
                variables.append((k, v))
            else:
                variables.extend(find_code_variables(v))
    elif isinstance(obj, list):
        for item in obj:
            variables.extend(find_code_variables(item))
    return variables



def handle_send_message(event, apigw_client, connection_id, user_id):

    body = json.loads(event.get('body', '{}'))
    user_prompt = body.get('prompt')

    if 'WorkspaceId' not in body or 'SolutionId' not in body:
        msg = "Missing WorkspaceId or SolutionId"
        LOGGER.error(msg)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})

        return {"statusCode": 400, "body": json.dumps({"message": msg})}

    if not user_prompt:
        msg = "Missing 'prompt' in body"
        LOGGER.warning(msg)
        send_message_to_websocket(apigw_client, connection_id, {"status": "error", "message": msg})
        return {"statusCode": 400, "body": json.dumps({"message": msg})}


    s3_key = f"{body['WorkspaceId']}/{body['SolutionId']}/memory.txt"
    memory_content = read_s3_file( 'wb-bhargav-misc-bucket', s3_key)
    current_lambda_requirements = generate_requirements()
    combined_prompt = f"Here are the lambda dependencies: {current_lambda_requirements}. Here is the user prompt: {user_prompt}"

    if memory_content:
        combined_prompt += f" Here is the memory context: {memory_content}"
    send_message_to_websocket(apigw_client, connection_id, {"status": "processing", "message": "Processing your request with the AI agent..."})
    LOGGER.info(f"Prompt: {combined_prompt}")

    response_stream = bedrock_agent_runtime_client.invoke_agent(
        agentId="TCMEZDRP4O",
        agentAliasId="BNWPCZI2IV",
        sessionId=connection_id[:-1],
        inputText=combined_prompt,
        bedrockModelConfigurations={'performanceConfig': {'latency': 'standard'}},
        enableTrace=True,
        endSession=False,
        sessionState={'sessionAttributes': {'user_id': user_id}},
        streamingConfigurations={'streamFinalResponse': False}
    )
    
    seen_code_vars = set()
    

    for ev in response_stream['completion']:
        if 'chunk' in ev:
            text = ev['chunk']['bytes'].decode('utf-8')
            send_message_to_websocket(apigw_client, connection_id, {
                'status': 'in_progress', 'type': 'text_chunk', 'content': text
            })
        if 'trace' in ev:
            print(ev)

            for thinking in find_thinking_blocks(ev):
                raw = json.dumps(ev, default=str, sort_keys=True).encode('utf-8')
                key = hashlib.sha256(raw).hexdigest()
                if key in seen_hashes:
                    continue
                seen_hashes.add(key)
                if thinking=="":
                    thinking="Generating....."
                send_message_to_websocket(apigw_client, connection_id, {
                    'status': 'in_progress', 'type': 'thinking', 'content': thinking
                })
            for name, value in find_code_variables(ev):
                if (name, value) not in seen_code_vars:
                    seen_code_vars.add((name, value))
                    LOGGER.info(f"Found variable {name}={value}")
                    send_message_to_websocket(apigw_client, connection_id, {
                        'status': 'in_progress', 'type': 'variable', 'name': name, 'value': value
                    })

    return {'statusCode': 200, 'body': json.dumps({'message': 'Stream processed'})}

def lambda_handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event, default=str))
    rc = event['requestContext']
    cid = rc['connectionId']

    client = boto3.client('apigatewaymanagementapi', endpoint_url=f"https://{rc['domainName']}/{rc['stage']}")

    if rc['routeKey'] == '$connect':
        send_message_to_websocket(client, cid, {'status': 'connected', 'message': 'Welcome!'})
        return {'statusCode': 200}

    if rc['routeKey'] == '$disconnect':
        LOGGER.info(f"Disconnected: {cid}")
        return {'statusCode': 200}

    if rc['routeKey'] == 'sendMessage':
        return handle_send_message(event, client, cid, rc['authorizer']['user_id'])
    send_message_to_websocket(client, cid, {'status': 'error', 'message': 'Unhandled route'})

    return {'statusCode': 400}
