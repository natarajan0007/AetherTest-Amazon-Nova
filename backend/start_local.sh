#!/bin/bash
# Bash script to start backend with SSL certificate configuration
# Sets environment variables for SSL certificate verification

set -e

# Get the absolute path to wipro.pem (one level up from backend)
CERT_PATH="$(cd .. && pwd)/wipro.pem"

echo "Setting SSL certificate environment variables..."
echo "Certificate path: $CERT_PATH"

# Set environment variables for SSL certificate verification
# AWS SDK specifically looks for AWS_CA_BUNDLE
export AWS_CA_BUNDLE="$CERT_PATH"
export REQUESTS_CA_BUNDLE="$CERT_PATH"
export SSL_CERT_FILE="$CERT_PATH"
export CURL_CA_BUNDLE="$CERT_PATH"
export HTTPX_CA_BUNDLE="$CERT_PATH"

echo "Environment variables set:"
echo "  AWS_CA_BUNDLE=$AWS_CA_BUNDLE"
echo "  REQUESTS_CA_BUNDLE=$REQUESTS_CA_BUNDLE"
echo "  SSL_CERT_FILE=$SSL_CERT_FILE"
echo ""

echo "Starting backend server..."
echo "Server will be available at: http://localhost:8001"
echo "Press Ctrl+C to stop the server"
echo ""

# Run uvicorn without --reload to avoid infinite loop on Windows
uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
