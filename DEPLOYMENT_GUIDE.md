# Deployment Guide: AetherTest with Bedrock Nova Pro

## Prerequisites Checklist

- [ ] AWS Account with Bedrock access
- [ ] Podman or Docker installed
- [ ] Python 3.11+ installed
- [ ] Git installed
- [ ] Text editor for `.env` file

---

## Step 1: AWS Setup (10 minutes)

### 1.1 Enable Bedrock Nova Pro Model

1. **Log in to AWS Console**
   - Go to https://console.aws.amazon.com

2. **Navigate to Bedrock**
   - Search for "Bedrock" in the search bar
   - Click "Amazon Bedrock"

3. **Request Model Access**
   - Click "Model Access" in the left sidebar
   - Search for "Nova Pro"
   - Click "Request access" next to `amazon.nova-pro-v1:0`
   - Wait for approval (usually instant)
   - Verify status shows "Access granted"

### 1.2 Create IAM User with Bedrock Permissions

1. **Navigate to IAM**
   - Search for "IAM" in AWS Console
   - Click "Users" in the left sidebar

2. **Create New User**
   - Click "Create user"
   - Username: `aethertest-bedrock`
   - Click "Next"

3. **Attach Permissions**
   - Click "Attach policies directly"
   - Search for "AmazonBedrockFullAccess"
   - Check the box
   - Click "Next"
   - Click "Create user"

4. **Create Access Key**
   - Click on the newly created user
   - Click "Security credentials" tab
   - Click "Create access key"
   - Select "Application running outside AWS"
   - Click "Next"
   - Click "Create access key"
   - **IMPORTANT**: Copy and save:
     - Access Key ID
     - Secret Access Key

---

## Step 2: Configure AetherTest (5 minutes)

### 2.1 Clone or Update Repository

```bash
# If cloning for the first time
git clone <repository-url>
cd AetherTest

# If updating existing installation
cd AetherTest
git pull origin main
```

### 2.2 Create Environment File

```bash
# Copy the example
cp .env.example .env

# Edit with your credentials
nano .env
# or
vim .env
# or use your preferred editor
```

### 2.3 Fill in Required Credentials

```bash
# Anthropic (still needed for orchestration)
ANTHROPIC_API_KEY=sk-ant-...

# AWS Bedrock (from Step 1.2)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalr...
AWS_REGION=us-east-1

# Generate encryption key
CREDENTIAL_ENCRYPTION_KEY=<run-command-below>

# Optional: customize these if needed
LOCAL_STORAGE_PATH=/local-storage
BROWSER_SANDBOX_CDP=http://browser-sandbox:9222
NOVNC_URL=http://browser-sandbox:6080
DATABASE_URL=sqlite:///./data/aethertest.db
FRONTEND_URL=http://localhost:3001
MAX_TURNS=100
LOG_LEVEL=INFO
```

### 2.4 Generate Encryption Key

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output and paste it into `.env` as `CREDENTIAL_ENCRYPTION_KEY`

### 2.5 Verify .env File

```bash
# Check that all required variables are set
grep -E "ANTHROPIC_API_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|CREDENTIAL_ENCRYPTION_KEY" .env

# Should output 4 lines with values
```

---

## Step 3: Install Dependencies (5 minutes)

### 3.1 Update Backend Dependencies

```bash
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3.2 Install Frontend Dependencies

```bash
cd ../frontend

# Install Node packages
npm install
```

### 3.3 Return to Root

```bash
cd ..
```

---

## Step 4: Build and Run (5 minutes)

### Option A: Using Podman (Recommended for Linux)

```bash
# Install podman-compose if needed
pip install podman-compose

# Build and start all services
podman-compose up --build

# In another terminal, monitor logs
podman-compose logs -f backend
```

### Option B: Using Docker

```bash
# Build and start all services
docker compose up --build

# In another terminal, monitor logs
docker compose logs -f backend
```

### Option C: Local Development (Without Containers)

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - Browser Sandbox (Still needs Docker):**
```bash
podman run -d \
  --name browser-sandbox \
  -p 6080:6080 -p 5900:5900 -p 9222:9222 -p 8888:8888 \
  -e DISPLAY=:99 \
  -e SCREEN_WIDTH=1280 \
  -e SCREEN_HEIGHT=800 \
  --shm-size=2gb \
  -v ./backend/local-storage:/local-storage \
  aethertest-sandbox:latest
```

---

## Step 5: Verify Installation (5 minutes)

### 5.1 Check Services are Running

```bash
# With Podman/Docker
podman ps
# or
docker ps

# Should show 3 containers:
# - frontend
# - backend
# - browser-sandbox
```

### 5.2 Check Backend Logs

```bash
podman logs backend
# or
docker logs backend

# Look for:
# - "Uvicorn running on http://0.0.0.0:8001"
# - No error messages about AWS credentials
```

### 5.3 Test API Endpoint

```bash
curl http://localhost:8001/docs

# Should return Swagger UI HTML
```

### 5.4 Test Frontend

```bash
# Open in browser
open http://localhost:3001
# or
firefox http://localhost:3001
```

---

## Step 6: Run Your First Test (5 minutes)

### 6.1 Access the UI

1. Open http://localhost:3001 in your browser
2. You should see the AetherTest interface

### 6.2 Create a Test

1. **Enter Requirement:**
   ```
   Test the login flow with valid and invalid credentials on https://the-internet.herokuapp.com/login
   ```

2. **Select Test Scope:**
   - Choose "Quick (3 cases)"

3. **Click "Launch"**

4. **Watch the Pipeline:**
   - Activity tab shows agent progress
   - Test Cases tab shows generated tests
   - Live Browser panel shows Chrome executing tests
   - Screenshots tab shows captured images

### 6.3 Monitor Bedrock Usage

1. Go to AWS Console → CloudWatch
2. Look for Bedrock metrics
3. Verify calls are being made to `amazon.nova-pro-v1:0`

---

## Step 7: Production Deployment (Optional)

### 7.1 Use Environment Variables Instead of .env

```bash
# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=wJalr...
export AWS_REGION=us-east-1
export CREDENTIAL_ENCRYPTION_KEY=...

# Run without .env file
podman-compose up --build
```

### 7.2 Use AWS Secrets Manager

```bash
# Store credentials in AWS Secrets Manager
aws secretsmanager create-secret \
  --name aethertest/bedrock \
  --secret-string '{
    "aws_access_key_id": "AKIA...",
    "aws_secret_access_key": "wJalr...",
    "anthropic_api_key": "sk-ant-..."
  }'

# Retrieve in application
aws secretsmanager get-secret-value --secret-id aethertest/bedrock
```

### 7.3 Use Docker Secrets (Swarm Mode)

```bash
# Create secrets
echo "sk-ant-..." | docker secret create anthropic_api_key -
echo "AKIA..." | docker secret create aws_access_key_id -
echo "wJalr..." | docker secret create aws_secret_access_key -

# Reference in docker-compose.yml
secrets:
  anthropic_api_key:
    external: true
```

### 7.4 Enable HTTPS

```bash
# Use nginx reverse proxy with Let's Encrypt
# Or use AWS ALB with ACM certificate
```

---

## Troubleshooting

### Issue: "InvalidParameterException: Could not validate the following values"

**Cause:** Bedrock model not enabled

**Solution:**
```bash
# 1. Go to AWS Bedrock console
# 2. Click "Model Access"
# 3. Search for "Nova Pro"
# 4. Click "Request access"
# 5. Wait for approval
```

### Issue: "NoCredentialsError: Unable to locate credentials"

**Cause:** AWS credentials not set

**Solution:**
```bash
# Check .env file
cat .env | grep AWS_

# Or set environment variables
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=wJalr...

# Or use AWS CLI
aws configure
```

### Issue: "AccessDenied: User is not authorized to perform: bedrock:InvokeModel"

**Cause:** IAM user lacks permissions

**Solution:**
```bash
# 1. Go to IAM console
# 2. Click "Users"
# 3. Select your user
# 4. Click "Add permissions"
# 5. Attach "AmazonBedrockFullAccess"
```

### Issue: "Connection refused" on localhost:3001

**Cause:** Frontend not running

**Solution:**
```bash
# Check if container is running
podman ps | grep frontend

# Check logs
podman logs frontend

# Restart
podman-compose restart frontend
```

### Issue: "Screenshot capture failed"

**Cause:** Browser sandbox not running

**Solution:**
```bash
# Check if running
podman ps | grep browser-sandbox

# Restart
podman-compose restart browser-sandbox

# Check logs
podman logs browser-sandbox
```

### Issue: "Vision analysis returns Mock PASS"

**Cause:** AWS credentials not passed to backend

**Solution:**
```bash
# Check backend environment
podman exec backend env | grep AWS_

# Verify .env file
cat .env | grep AWS_

# Restart backend
podman-compose restart backend
```

---

## Monitoring and Maintenance

### Monitor Logs

```bash
# All services
podman-compose logs -f

# Specific service
podman-compose logs -f backend

# Last 100 lines
podman-compose logs --tail 100 backend
```

### Monitor AWS Costs

```bash
# Go to AWS Console → Billing
# Look for Bedrock charges
# Set up cost alerts
```

### Monitor Performance

```bash
# Check container resource usage
podman stats

# Check disk usage
du -sh ./backend/local-storage
du -sh ./backend/data
```

### Backup Data

```bash
# Backup database
cp ./backend/data/aethertest.db ./backup/aethertest.db.$(date +%Y%m%d)

# Backup recordings
tar -czf ./backup/recordings.$(date +%Y%m%d).tar.gz ./backend/local-storage/recordings
```

---

## Cleanup

### Stop Services

```bash
# Stop all services
podman-compose down

# Or with Docker
docker compose down
```

### Remove Containers and Volumes

```bash
# Remove containers
podman-compose down -v

# Or with Docker
docker compose down -v
```

### Clean Up Disk Space

```bash
# Remove unused images
podman image prune -a

# Remove unused volumes
podman volume prune

# Remove old recordings
find ./backend/local-storage/recordings -mtime +30 -delete
```

---

## Next Steps

1. ✅ Read `BEDROCK_QUICKSTART.md` for quick reference
2. ✅ Read `BEDROCK_MIGRATION.md` for technical details
3. ✅ Read `ARCHITECTURE_CHANGES.md` for architecture overview
4. ✅ Monitor AWS costs in billing dashboard
5. ✅ Set up automated backups
6. ✅ Configure monitoring and alerts

---

## Support Resources

- **AWS Bedrock Docs**: https://docs.aws.amazon.com/bedrock/
- **boto3 Documentation**: https://boto3.amazonaws.com/v1/documentation/api/latest/
- **FastAPI Documentation**: https://fastapi.tiangolo.com/
- **Docker Documentation**: https://docs.docker.com/
- **Podman Documentation**: https://docs.podman.io/

---

## Quick Reference Commands

```bash
# Start services
podman-compose up --build

# Stop services
podman-compose down

# View logs
podman-compose logs -f backend

# Restart specific service
podman-compose restart backend

# Execute command in container
podman exec backend python -c "from app.config import get_settings; print(get_settings().aws_region)"

# Access database
podman exec backend sqlite3 /app/data/aethertest.db

# View environment variables
podman exec backend env | grep AWS_
```

---

**Deployment complete! Your AetherTest instance is now running with Amazon Bedrock Nova Pro.**
