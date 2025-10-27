#!/usr/bin/env bash
set -euo pipefail

ENDPOINT=${1:-http://localhost:8000}
TABLE_NAME=${DYNAMODB_TABLE:-Anankor}

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --table-class STANDARD \
  --endpoint-url "$ENDPOINT" \
  --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
  --ttl AttributeName=ttl,Enabled=true \
  --output table || true
