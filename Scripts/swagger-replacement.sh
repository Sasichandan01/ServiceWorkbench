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

echo "Updating swagger file with prefix: ${PREFIX}"

# Check multiple possible locations for swagger.yaml
SWAGGER_FILE=""
if [ -f "swagger.yaml" ]; then
  SWAGGER_FILE="swagger.yaml"
elif [ -f "Templates/Swagger/swagger.yaml" ]; then
  SWAGGER_FILE="Templates/Swagger/swagger.yaml"
else
  echo "[ERROR] swagger.yaml not found in any expected location"
  ls -la
  exit 1
fi

echo "Found swagger file at: ${SWAGGER_FILE}"
sed -i "s/placeholder/${PREFIX}/g" "${SWAGGER_FILE}"
echo "Swagger file updated successfully"

aws s3 cp "${SWAGGER_FILE}" s3://service-workbench-artifacts/develop/swagger.yaml
echo "Updated swagger file uploaded to S3"