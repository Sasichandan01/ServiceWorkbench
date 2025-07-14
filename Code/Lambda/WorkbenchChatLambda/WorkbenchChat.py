import json
import boto3
import os
import requests
import logging


def lambda_handler(event,context):
    print(event)
    