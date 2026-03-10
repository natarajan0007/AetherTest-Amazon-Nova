# PowerShell script to start backend with AWS credentials
# This overrides any credentials in PowerShell profile

$ErrorActionPreference = "Stop"

Write-Host "Setting AWS Credentials..." -ForegroundColor Green

# Set your AWS credentials here (or use environment variables)
# Get these from AWS Console or your credentials file
$env:AWS_ACCESS_KEY_ID = $env:AWS_ACCESS_KEY_ID ?? "YOUR_ACCESS_KEY_ID"
$env:AWS_SECRET_ACCESS_KEY = $env:AWS_SECRET_ACCESS_KEY ?? "YOUR_SECRET_ACCESS_KEY"
$env:AWS_SESSION_TOKEN = $env:AWS_SESSION_TOKEN ?? ""  # Optional for temporary credentials
$env:AWS_REGION = $env:AWS_REGION ?? "us-east-1"

if ($env:AWS_ACCESS_KEY_ID -eq "YOUR_ACCESS_KEY_ID") {
    Write-Host "WARNING: AWS credentials not set! Please set environment variables or edit this file." -ForegroundColor Red
    Write-Host "  Set: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION" -ForegroundColor Yellow
    exit 1
}

Write-Host "  Access Key: $($env:AWS_ACCESS_KEY_ID.Substring(0,10))...$($env:AWS_ACCESS_KEY_ID.Substring($env:AWS_ACCESS_KEY_ID.Length-4))" -ForegroundColor Cyan

# Get the absolute path to combined CA bundle (if exists)
$CERT_PATH = "..\combined_ca_bundle.pem"
if (Test-Path $CERT_PATH) {
    $CERT_PATH = Resolve-Path $CERT_PATH
    Write-Host "Setting SSL certificate environment variables..." -ForegroundColor Green
    Write-Host "  Certificate path: $CERT_PATH" -ForegroundColor Cyan

    # Set environment variables for SSL certificate verification
    $env:AWS_CA_BUNDLE = $CERT_PATH
    $env:REQUESTS_CA_BUNDLE = $CERT_PATH
    $env:SSL_CERT_FILE = $CERT_PATH
    $env:CURL_CA_BUNDLE = $CERT_PATH
    $env:HTTPX_CA_BUNDLE = $CERT_PATH
}

Write-Host ""
Write-Host "Starting backend server..." -ForegroundColor Green
Write-Host "Server will be available at: http://localhost:8001" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Run uvicorn without --reload to avoid infinite loop on Windows
uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
