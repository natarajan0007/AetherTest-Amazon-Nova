# PowerShell script to start backend with SSL certificate configuration
# Sets environment variables for SSL certificate verification

$ErrorActionPreference = "Stop"

# Get the absolute path to combined CA bundle (includes both system CAs and Wipro cert)
$CERT_PATH = Resolve-Path "..\combined_ca_bundle.pem"

Write-Host "Setting SSL certificate environment variables..." -ForegroundColor Green
Write-Host "Certificate path: $CERT_PATH" -ForegroundColor Cyan

# Set environment variables for SSL certificate verification
# AWS SDK specifically looks for AWS_CA_BUNDLE
$env:AWS_CA_BUNDLE = $CERT_PATH
$env:REQUESTS_CA_BUNDLE = $CERT_PATH
$env:SSL_CERT_FILE = $CERT_PATH
$env:CURL_CA_BUNDLE = $CERT_PATH
$env:HTTPX_CA_BUNDLE = $CERT_PATH

Write-Host "Environment variables set:" -ForegroundColor Green
Write-Host "  AWS_CA_BUNDLE=$env:AWS_CA_BUNDLE" -ForegroundColor Cyan
Write-Host "  REQUESTS_CA_BUNDLE=$env:REQUESTS_CA_BUNDLE" -ForegroundColor Cyan
Write-Host "  SSL_CERT_FILE=$env:SSL_CERT_FILE" -ForegroundColor Cyan

Write-Host ""
Write-Host "Starting backend server..." -ForegroundColor Green
Write-Host "Server will be available at: http://localhost:8001" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Run uvicorn without --reload to avoid infinite loop on Windows
uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
