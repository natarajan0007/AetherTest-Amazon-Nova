# PowerShell script to start backend with credentials from .env ONLY
# This clears any AWS credentials from environment and forces loading from .env

$ErrorActionPreference = "Stop"

Write-Host "=== AetherTest Backend Startup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clear ALL existing AWS credentials from environment
Write-Host "Clearing any existing AWS credentials from environment..." -ForegroundColor Yellow
Remove-Item Env:\AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
Remove-Item Env:\AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:\AWS_REGION -ErrorAction SilentlyContinue
Write-Host "  ✓ Environment cleared" -ForegroundColor Green

# Step 2: Set SSL certificate path (this is needed)
$CERT_PATH = Resolve-Path "..\combined_ca_bundle.pem"
Write-Host ""
Write-Host "Setting SSL certificate environment variables..." -ForegroundColor Yellow
Write-Host "  Certificate path: $CERT_PATH" -ForegroundColor Cyan
$env:AWS_CA_BUNDLE = $CERT_PATH
$env:REQUESTS_CA_BUNDLE = $CERT_PATH
$env:SSL_CERT_FILE = $CERT_PATH
$env:CURL_CA_BUNDLE = $CERT_PATH
$env:HTTPX_CA_BUNDLE = $CERT_PATH
Write-Host "  ✓ SSL certificates configured" -ForegroundColor Green

# Step 3: Verify .env file exists
Write-Host ""
if (-not (Test-Path "../.env")) {
    Write-Host "ERROR: .env file not found at ../.env" -ForegroundColor Red
    Write-Host "Please ensure .env file exists with AWS credentials" -ForegroundColor Red
    exit 1
}
Write-Host "Found .env file at: $(Resolve-Path '../.env')" -ForegroundColor Green

# Step 4: Load USE_STRANDS from .env
$useStrandsLine = Get-Content "../.env" | Where-Object { $_ -match "^USE_STRANDS=" }
if ($useStrandsLine) {
    $useStrandsValue = (($useStrandsLine -split "=")[1]).Trim()
    $env:USE_STRANDS = $useStrandsValue.ToLower()
    Write-Host "  USE_STRANDS from .env: $($env:USE_STRANDS)" -ForegroundColor Cyan
} else {
    $env:USE_STRANDS = "false"
    Write-Host "  USE_STRANDS not found in .env, defaulting to: false" -ForegroundColor Yellow
}

# Step 5: Show what credentials will be loaded (from .env)
Write-Host ""
Write-Host "Backend will load AWS credentials from .env file" -ForegroundColor Yellow
$envContent = Get-Content "../.env" | Where-Object { $_ -match "^AWS_ACCESS_KEY_ID=" }
if ($envContent) {
    $keyId = ($envContent -split "=")[1]
    Write-Host "  Access Key from .env: $($keyId.Substring(0,10))...$($keyId.Substring($keyId.Length-4))" -ForegroundColor Cyan
} else {
    Write-Host "  WARNING: AWS_ACCESS_KEY_ID not found in .env" -ForegroundColor Red
}

Write-Host ""
Write-Host "Starting backend server..." -ForegroundColor Green
Write-Host "  Server URL: http://localhost:8001" -ForegroundColor Cyan
Write-Host "  Orchestrator: $(if ($env:USE_STRANDS -eq 'true') { 'Strands Agents SDK' } else { 'Bedrock Converse API' })" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Run uvicorn without --reload to avoid infinite loop on Windows
uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
