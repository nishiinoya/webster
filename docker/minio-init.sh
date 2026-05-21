#!/bin/sh
# Webster MinIO initialization script.
# Runs once as the minio-init one-shot service to ensure the required bucket exists.

set -e

MINIO_URL="${MINIO_URL:-http://minio:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
BUCKET="${MINIO_BUCKET:-webster}"

echo "Configuring MinIO client alias..."
mc alias set local "$MINIO_URL" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

echo "Creating bucket '${BUCKET}' if it does not already exist..."
mc mb "local/${BUCKET}" --ignore-existing

echo "MinIO initialization complete."
