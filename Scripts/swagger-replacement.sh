#!/bin/bash

# Swagger replacement script
# Usage: ./swagger-replacement.sh <prefix>

set -e

PREFIX=${1}

if [ -z "$PREFIX" ]; then
  echo "[ERROR] Prefix parameter is required"
  echo "Usage: $0 <prefix>"
  exit 1
fi

if [ -f "swagger.yaml" ]; then
  sed -i "s/placeholder-workspaces-lambda/${PREFIX}-workspaces-lambda/g" swagger.yaml
  echo "Swagger file updated successfully"
  
  aws s3 cp swagger.yaml s3://develop-service-workbench-artifacts/develop/swagger.yaml
  echo "Updated swagger file uploaded to S3"
else
  echo "[WARNING] swagger.yaml not found, skipping update"
  exit 1
fi