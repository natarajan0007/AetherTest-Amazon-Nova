# AetherTest Comprehensive AWS Deployment Plan

## Executive Summary

This document provides a complete infrastructure deployment plan for AetherTest on AWS using:
- **AWS Bedrock AgentCore Runtime** - Managed agent infrastructure with Strands Agents SDK
- **AWS Bedrock AgentCore Memory** - Short-term and long-term memory for test sessions
- **Amazon API Gateway** - Unified API entry point with rate limiting and caching
- **Amazon Cognito** - User authentication and authorization
- **OpenTelemetry + CloudWatch** - Full observability stack
- **ECS Fargate** - Frontend and Browser Sandbox containers

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    INTERNET                                              │
└─────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              AMAZON CLOUDFRONT (CDN)                                     │
│                         aethertest.example.com                                           │
└─────────────────────────────────────────┬───────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                           │
                    ▼                                           ▼
┌───────────────────────────────────┐       ┌───────────────────────────────────────────┐
│      AMAZON COGNITO               │       │         AMAZON API GATEWAY                │
│  ┌─────────────────────────────┐  │       │  ┌─────────────────────────────────────┐  │
│  │     User Pool               │  │       │  │   REST API (api.aethertest.com)     │  │
│  │  • Sign-up/Sign-in          │  │       │  │                                     │  │
│  │  • MFA (optional)           │◄─┼───────┼──┤   /sessions    → Lambda → AgentCore │  │
│  │  • OAuth 2.0 / OIDC         │  │       │  │   /test-cases  → Lambda → AgentCore │  │
│  │  • JWT Token Issuance       │  │       │  │   /reports     → Lambda → S3        │  │
│  └─────────────────────────────┘  │       │  │   /credentials → Lambda → Secrets   │  │
│  ┌─────────────────────────────┐  │       │  │   /ws          → WebSocket API      │  │
│  │     Identity Pool           │  │       │  │                                     │  │
│  │  • AWS Credentials          │  │       │  │   Cognito Authorizer attached       │  │
│  │  • Federated Identity       │  │       │  └─────────────────────────────────────┘  │
│  └─────────────────────────────┘  │       └───────────────────────────────────────────┘
└───────────────────────────────────┘                           │
                                                                │
                    ┌───────────────────────────────────────────┴───────────────────┐
                    │                                                               │
                    ▼                                                               ▼
┌───────────────────────────────────────────────┐   ┌───────────────────────────────────────┐
│        AWS LAMBDA (API Handlers)              │   │     AMAZON BEDROCK AGENTCORE          │
│  ┌─────────────────────────────────────────┐  │   │  ┌─────────────────────────────────┐  │
│  │  session_handler.py                     │  │   │  │      AgentCore Runtime          │  │
│  │  • Create/Get/Delete sessions           │  │   │  │  ┌───────────────────────────┐  │  │
│  │  • Invoke AgentCore Runtime             │──┼───┼──┤  │  AetherTest Strands Agent │  │  │
│  │  • Handle WebSocket connections         │  │   │  │  │  • Orchestrator (Nova Pro)│  │  │
│  └─────────────────────────────────────────┘  │   │  │  │  • Vision (Claude Haiku)  │  │  │
│  ┌─────────────────────────────────────────┐  │   │  │  │  • Browser Automation     │  │  │
│  │  report_handler.py                      │  │   │  │  └───────────────────────────┘  │  │
│  │  • Generate/Retrieve reports            │  │   │  └─────────────────────────────────┘  │
│  │  • Store to S3                          │  │   │  ┌─────────────────────────────────┐  │
│  └─────────────────────────────────────────┘  │   │  │      AgentCore Memory           │  │
└───────────────────────────────────────────────┘   │  │  • Short-term (session context) │  │
                                                    │  │  • Long-term (test history)     │  │
                                                    │  │  • Semantic search              │  │
                                                    │  └─────────────────────────────────┘  │
                                                    │  ┌─────────────────────────────────┐  │
                                                    │  │      AgentCore Observability    │  │
                                                    │  │  • OpenTelemetry traces         │  │
                                                    │  │  • CloudWatch metrics           │  │
                                                    │  │  • X-Ray integration            │  │
                                                    │  └─────────────────────────────────┘  │
                                                    └───────────────────────────────────────┘
                                                                    │
                    ┌───────────────────────────────────────────────┴───────────────────┐
                    │                                                                   │
                    ▼                                                                   ▼
┌───────────────────────────────────────────────┐   ┌───────────────────────────────────────┐
│           ECS FARGATE CLUSTER                 │   │         STORAGE LAYER                 │
│  ┌─────────────────────────────────────────┐  │   │  ┌─────────────────────────────────┐  │
│  │  Frontend Service (Next.js)             │  │   │  │  Amazon S3                      │  │
│  │  • Port 3001                            │  │   │  │  • Reports bucket               │  │
│  │  • CloudFront origin                    │  │   │  │  • Screenshots bucket           │  │
│  └─────────────────────────────────────────┘  │   │  │  • Recordings bucket            │  │
│  ┌─────────────────────────────────────────┐  │   │  └─────────────────────────────────┘  │
│  │  Browser Sandbox Service                │  │   │  ┌─────────────────────────────────┐  │
│  │  • Chromium + noVNC                     │  │   │  │  Amazon DynamoDB                │  │
│  │  • CDP :9222, VNC :6080                 │  │   │  │  • Sessions table               │  │
│  │  • FFmpeg recorder :8888                │  │   │  │  • Test cases table             │  │
│  └─────────────────────────────────────────┘  │   │  │  • Credentials table (encrypted)│  │
└───────────────────────────────────────────────┘   │  └─────────────────────────────────┘  │
                                                    │  ┌─────────────────────────────────┐  │
                                                    │  │  AWS Secrets Manager            │  │
                                                    │  │  • Encryption keys              │  │
                                                    │  │  • API credentials              │  │
                                                    │  └─────────────────────────────────┘  │
                                                    └───────────────────────────────────────┘
```

---

## Component Details

### 1. Amazon Cognito (Authentication)

#### User Pool Configuration

```json
{
  "UserPoolName": "AetherTestUserPool",
  "Policies": {
    "PasswordPolicy": {
      "MinimumLength": 12,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": true
    }
  },
  "MfaConfiguration": "OPTIONAL",
  "AutoVerifiedAttributes": ["email"],
  "UsernameAttributes": ["email"],
  "Schema": [
    {"Name": "email", "Required": true, "Mutable": true},
    {"Name": "name", "Required": true, "Mutable": true},
    {"Name": "department", "Required": false, "Mutable": true}
  ],
  "AccountRecoverySetting": {
    "RecoveryMechanisms": [
      {"Priority": 1, "Name": "verified_email"}
    ]
  }
}
```

#### App Client Configuration
```json
{
  "ClientName": "AetherTestWebApp",
  "GenerateSecret": false,
  "ExplicitAuthFlows": [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ],
  "SupportedIdentityProviders": ["COGNITO"],
  "CallbackURLs": [
    "https://aethertest.example.com/auth/callback",
    "http://localhost:3001/auth/callback"
  ],
  "LogoutURLs": [
    "https://aethertest.example.com/logout",
    "http://localhost:3001/logout"
  ],
  "AllowedOAuthFlows": ["code"],
  "AllowedOAuthScopes": ["openid", "email", "profile"],
  "AllowedOAuthFlowsUserPoolClient": true
}
```

#### Identity Pool (for AWS Credentials)
```json
{
  "IdentityPoolName": "AetherTestIdentityPool",
  "AllowUnauthenticatedIdentities": false,
  "CognitoIdentityProviders": [
    {
      "ProviderName": "cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX",
      "ClientId": "your-app-client-id"
    }
  ]
}
```

---

### 2. Amazon API Gateway

#### REST API Structure
```yaml
openapi: "3.0.1"
info:
  title: "AetherTest API"
  version: "1.0.0"
  
paths:
  /sessions:
    post:
      summary: "Create new test session"
      security:
        - CognitoAuthorizer: []
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${SessionHandlerArn}/invocations"
    get:
      summary: "List all sessions"
      security:
        - CognitoAuthorizer: []
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${SessionHandlerArn}/invocations"
        
  /sessions/{sessionId}:
    get:
      summary: "Get session details"
      security:
        - CognitoAuthorizer: []
    delete:
      summary: "Cancel/delete session"
      security:
        - CognitoAuthorizer: []
        
  /sessions/{sessionId}/invoke:
    post:
      summary: "Invoke AgentCore Runtime"
      security:
        - CognitoAuthorizer: []
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${AgentInvokerArn}/invocations"
        
  /reports/{reportId}:
    get:
      summary: "Get test report"
      security:
        - CognitoAuthorizer: []
        
  /credentials:
    post:
      summary: "Store credentials"
      security:
        - CognitoAuthorizer: []
    get:
      summary: "List credential names"
      security:
        - CognitoAuthorizer: []

securityDefinitions:
  CognitoAuthorizer:
    type: apiKey
    name: Authorization
    in: header
    x-amazon-apigateway-authtype: cognito_user_pools
    x-amazon-apigateway-authorizer:
      type: cognito_user_pools
      providerARNs:
        - "arn:aws:cognito-idp:us-east-1:ACCOUNT_ID:userpool/us-east-1_XXXXXXXXX"
```

#### WebSocket API (for real-time updates)
```yaml
# WebSocket API for real-time agent updates
Routes:
  $connect:
    Integration: Lambda (ws_connect_handler)
    Authorization: Cognito JWT
  $disconnect:
    Integration: Lambda (ws_disconnect_handler)
  $default:
    Integration: Lambda (ws_message_handler)
  sendMessage:
    Integration: Lambda (ws_message_handler)
```

---

### 3. AWS Bedrock AgentCore Runtime

#### Agent Configuration (strands_agentcore_agent.py)

```python
"""
AetherTest Agent for AWS Bedrock AgentCore Runtime
Uses Strands Agents SDK with AgentCore Memory integration
"""
from bedrock_agentcore import BedrockAgentCoreApp
from bedrock_agentcore.memory.session import MemorySessionManager
from bedrock_agentcore.memory.constants import ConversationalMessage, MessageRole
from strands import Agent, tool
from strands.models.bedrock import BedrockModel
import json
import logging

logger = logging.getLogger(__name__)
app = BedrockAgentCoreApp()

# Memory configuration
MEMORY_ID = "aethertest-memory-store"
MEMORY_REGION = "us-west-2"

# Initialize Strands Agent with Bedrock Nova Pro
bedrock_model = BedrockModel(
    model_id="amazon.nova-pro-v1:0",
    max_tokens=8000
)

# Define tools for the agent
@tool
def register_test_cases(test_cases: list) -> str:
    """Register generated test cases for UI display."""
    return json.dumps({"registered": len(test_cases), "cases": test_cases})

@tool
def execute_browser_task(task: str, target_url: str) -> str:
    """Execute browser automation task using AgentCore Browser."""
    # AgentCore Browser integration
    from bedrock_agentcore.services.browser import BrowserClient
    browser = BrowserClient()
    result = browser.execute(task=task, url=target_url)
    return json.dumps(result)

@tool
def capture_screenshot() -> str:
    """Capture screenshot from AgentCore Browser."""
    from bedrock_agentcore.services.browser import BrowserClient
    browser = BrowserClient()
    screenshot = browser.capture_screenshot()
    return json.dumps({"status": "captured", "screenshot_b64": screenshot})

@tool
def analyze_screenshot(expected_state: str, test_id: str, screenshot_b64: str) -> str:
    """Analyze screenshot using Claude Haiku 4.5 vision."""
    import boto3
    client = boto3.client('bedrock-runtime', region_name='us-east-1')
    
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 512,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": screenshot_b64}},
                {"type": "text", "text": f"Expected: {expected_state}\nVERDICT: PASS or FAIL\nEXPLANATION:"}
            ]
        }]
    })
    
    response = client.invoke_model(
        modelId="us.anthropic.claude-haiku-4-5-20251001-v1:0",
        body=body
    )
    result = json.loads(response['body'].read())
    return json.dumps({"test_id": test_id, "verdict": result})

@tool
def save_report(report_data: dict) -> str:
    """Save test report to S3 and DynamoDB."""
    import boto3
    import uuid
    from datetime import datetime
    
    report_id = str(uuid.uuid4())
    report_data['report_id'] = report_id
    report_data['created_at'] = datetime.utcnow().isoformat()
    
    # Save to S3
    s3 = boto3.client('s3')
    s3.put_object(
        Bucket='aethertest-reports',
        Key=f'reports/{report_id}.json',
        Body=json.dumps(report_data),
        ContentType='application/json'
    )
    
    return json.dumps({"report_id": report_id, "status": "saved"})

# Create Strands Agent
strands_agent = Agent(
    model=bedrock_model,
    system_prompt="""You are AetherTest, an autonomous STLC engine.
    Execute the complete testing pipeline: analyze requirements, generate test cases,
    execute browser tests, validate with vision AI, and generate reports.""",
    tools=[register_test_cases, execute_browser_task, capture_screenshot, analyze_screenshot, save_report]
)

@app.entrypoint
async def invoke(payload, context):
    """Main entry point for AgentCore Runtime."""
    session_id = context.session_id
    requirement = payload.get("requirement")
    target_url = payload.get("target_url")
    test_count = payload.get("test_count", 5)
    user_id = payload.get("user_id", "anonymous")
    
    logger.info(f"[{session_id}] Starting AetherTest pipeline")
    logger.info(f"[{session_id}] Requirement: {requirement}")
    logger.info(f"[{session_id}] Target URL: {target_url}")
    
    # Initialize AgentCore Memory for this session
    session_manager = MemorySessionManager(
        memory_id=MEMORY_ID,
        region_name=MEMORY_REGION
    )
    
    memory_session = session_manager.create_memory_session(
        actor_id=user_id,
        session_id=session_id
    )
    
    # Store session start in memory
    memory_session.add_turns(
        messages=[
            ConversationalMessage(
                f"Starting test session for: {requirement}",
                MessageRole.USER
            )
        ]
    )
    
    # Build prompt for Strands Agent
    prompt = f"""Execute the AetherTest STLC pipeline:
    
    Requirement: {requirement}
    Target URL: {target_url}
    Test Case Count: {test_count}
    
    Follow these phases:
    1. Analyze the requirement
    2. Generate {test_count} BDD test cases using register_test_cases
    3. For each test case: execute_browser_task → capture_screenshot → analyze_screenshot
    4. Generate final report using save_report
    """
    
    # Stream responses
    async for event in strands_agent.stream_async(prompt):
        if "data" in event:
            yield {"type": "agent_update", "data": event["data"]}
        elif "tool_use" in event:
            yield {"type": "tool_use", "tool": event["tool_use"]}
    
    # Store session completion in memory
    memory_session.add_turns(
        messages=[
            ConversationalMessage(
                f"Test session completed for: {requirement}",
                MessageRole.ASSISTANT
            )
        ]
    )
    
    logger.info(f"[{session_id}] Pipeline complete")

if __name__ == "__main__":
    app.run()
```

#### Dockerfile for AgentCore Runtime
```dockerfile
# Dockerfile for AetherTest AgentCore Runtime
FROM --platform=linux/arm64 ghcr.io/astral-sh/uv:python3.11-bookworm-slim

WORKDIR /app

# Install build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache -r requirements.txt

# Install AWS OpenTelemetry for observability
RUN pip install --no-cache-dir "aws-opentelemetry-distro>=0.10.1" boto3

# Copy application code
COPY src/ ./src/
COPY pyproject.toml .

# OpenTelemetry Configuration
ENV OTEL_SERVICE_NAME=aethertest-agent
ENV OTEL_TRACES_EXPORTER=otlp
ENV OTEL_METRICS_EXPORTER=otlp
ENV OTEL_PYTHON_DISTRO=aws_distro
ENV OTEL_PYTHON_CONFIGURATOR=aws_configurator
ENV OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
ENV AGENT_OBSERVABILITY_ENABLED=true
ENV OTEL_TRACES_SAMPLER=always_on
ENV OTEL_RESOURCE_ATTRIBUTES=service.namespace=AetherTest,service.version=1.0

EXPOSE 8080

# Run with OpenTelemetry instrumentation
CMD ["opentelemetry-instrument", "python", "src/strands_agentcore_agent.py"]
```

---

### 4. AWS Bedrock AgentCore Memory

#### Memory Store Configuration

```python
"""
AgentCore Memory Setup Script
Creates memory stores for short-term and long-term memory
"""
from bedrock_agentcore_starter_toolkit.operations.memory.manager import MemoryManager
from bedrock_agentcore_starter_toolkit.operations.memory.models.strategies import SemanticStrategy

def create_aethertest_memory():
    """Create AgentCore Memory store for AetherTest."""
    
    memory_manager = MemoryManager(region_name="us-west-2")
    
    print("Creating AetherTest memory store...")
    
    memory = memory_manager.get_or_create_memory(
        name="AetherTestMemory",
        description="Memory store for AetherTest sessions, test results, and user preferences",
        strategies=[
            # Semantic strategy for long-term memory extraction
            SemanticStrategy(
                name="testResultsMemory",
                namespaces=[
                    '/sessions/{sessionId}/',           # Session-specific memory
                    '/users/{userId}/',                 # User preferences
                    '/tests/{testId}/',                 # Test case history
                    '/reports/{reportId}/'              # Report summaries
                ]
            )
        ]
    )
    
    print(f"Memory store created: {memory.get('id')}")
    return memory

if __name__ == "__main__":
    create_aethertest_memory()
```

#### Memory Types and Usage

| Memory Type | Purpose | Retention | Use Case |
|-------------|---------|-----------|----------|
| **Short-term** | Session context | 15 min - 24 hours | Current test execution state |
| **Long-term (Semantic)** | Extracted insights | Permanent | User preferences, test patterns |
| **Long-term (Summary)** | Session summaries | Permanent | Historical test results |

#### Memory Namespaces
```
/sessions/{sessionId}/          - Active session context
/users/{userId}/                - User preferences and history
/tests/{testId}/                - Individual test case results
/reports/{reportId}/            - Report summaries
/strategies/semantic/actors/{userId}/  - Semantic memory per user
```

---

### 5. OpenTelemetry Observability

#### Environment Variables for Observability
```bash
# OpenTelemetry Configuration
OTEL_SERVICE_NAME=aethertest-agent
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_PYTHON_DISTRO=aws_distro
OTEL_PYTHON_CONFIGURATOR=aws_configurator
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# CloudWatch Integration
OTEL_EXPORTER_OTLP_LOGS_HEADERS=x-aws-log-group=agents/aethertest-logs,x-aws-log-stream=default,x-aws-metric-namespace=AetherTest

# Service Identification
OTEL_RESOURCE_ATTRIBUTES=service.name=aethertest-agent,service.namespace=AetherTest,service.version=1.0

# Enable Agent Observability
AGENT_OBSERVABILITY_ENABLED=true
OTEL_TRACES_SAMPLER=always_on
```

#### CloudWatch Dashboard Metrics
- Agent invocation count
- Average response time
- Tool execution latency
- Memory operations count
- Error rate by tool
- Token usage per model

---

## IAM Permissions Required

### 1. AgentCore Runtime Execution Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockModelAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0",
        "arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0"
      ]
    },
    {
      "Sid": "AgentCoreMemoryAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:CreateMemory",
        "bedrock-agentcore:GetMemory",
        "bedrock-agentcore:ListMemories",
        "bedrock-agentcore:DeleteMemory",
        "bedrock-agentcore:CreateMemorySession",
        "bedrock-agentcore:GetMemorySession",
        "bedrock-agentcore:ListMemorySessions",
        "bedrock-agentcore:CreateEvent",
        "bedrock-agentcore:ListEvents",
        "bedrock-agentcore:SearchMemoryRecords",
        "bedrock-agentcore:ListMemoryRecords"
      ],
      "Resource": [
        "arn:aws:bedrock-agentcore:us-west-2:ACCOUNT_ID:memory/*",
        "arn:aws:bedrock-agentcore:us-west-2:ACCOUNT_ID:memory-session/*"
      ]
    },
    {
      "Sid": "AgentCoreRuntimeAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:InvokeAgent",
        "bedrock-agentcore:InvokeAgentWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock-agentcore:us-west-2:ACCOUNT_ID:agent/*"
    },
    {
      "Sid": "S3ReportAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::aethertest-reports",
        "arn:aws:s3:::aethertest-reports/*",
        "arn:aws:s3:::aethertest-screenshots",
        "arn:aws:s3:::aethertest-screenshots/*",
        "arn:aws:s3:::aethertest-recordings",
        "arn:aws:s3:::aethertest-recordings/*"
      ]
    },
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/AetherTestSessions",
        "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/AetherTestTestCases",
        "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/AetherTestCredentials"
      ]
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:aethertest/*"
    },
    {
      "Sid": "CloudWatchLogsAccess",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:*:ACCOUNT_ID:log-group:/aws/aethertest/*"
    },
    {
      "Sid": "XRayAccess",
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchMetricsAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "AetherTest"
        }
      }
    }
  ]
}
```

### 2. Lambda Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaBasicExecution",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:ACCOUNT_ID:log-group:/aws/lambda/aethertest-*"
    },
    {
      "Sid": "InvokeAgentCore",
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:InvokeAgent",
        "bedrock-agentcore:InvokeAgentWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock-agentcore:us-west-2:ACCOUNT_ID:agent/*"
    },
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/AetherTest*"
    },
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::aethertest-*/*"
    },
    {
      "Sid": "SecretsAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:aethertest/*"
    },
    {
      "Sid": "APIGatewayWebSocket",
      "Effect": "Allow",
      "Action": [
        "execute-api:ManageConnections"
      ],
      "Resource": "arn:aws:execute-api:us-east-1:ACCOUNT_ID:*/*/POST/@connections/*"
    }
  ]
}
```

### 3. Cognito Authenticated User Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "APIGatewayInvoke",
      "Effect": "Allow",
      "Action": [
        "execute-api:Invoke"
      ],
      "Resource": "arn:aws:execute-api:us-east-1:ACCOUNT_ID:*/prod/*"
    },
    {
      "Sid": "S3ReportRead",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::aethertest-reports/*",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["reports/${cognito-identity.amazonaws.com:sub}/*"]
        }
      }
    }
  ]
}
```

### 4. ECS Task Role (Frontend & Sandbox)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRPull",
      "Effect": "Allow",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:ACCOUNT_ID:log-group:/ecs/aethertest/*"
    },
    {
      "Sid": "S3RecordingUpload",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::aethertest-recordings/*",
        "arn:aws:s3:::aethertest-screenshots/*"
      ]
    }
  ]
}
```

---

## Code Changes Required

### Backend Changes

#### 1. New File: `backend/app/agentcore_client.py`

```python
"""
AgentCore Runtime Client for invoking the deployed agent
"""
import boto3
import json
from typing import AsyncGenerator

class AgentCoreClient:
    """Client for invoking AetherTest agent on AgentCore Runtime."""
    
    def __init__(self, region: str = "us-west-2"):
        self.client = boto3.client('bedrock-agentcore', region_name=region)
        self.runtime_arn = None  # Set after deployment
    
    def set_runtime_arn(self, arn: str):
        """Set the AgentCore Runtime ARN."""
        self.runtime_arn = arn
    
    async def invoke_agent(
        self,
        requirement: str,
        target_url: str,
        test_count: int = 5,
        user_id: str = "anonymous",
        session_id: str = None
    ) -> AsyncGenerator[dict, None]:
        """Invoke the AetherTest agent with streaming response."""
        
        payload = {
            "requirement": requirement,
            "target_url": target_url,
            "test_count": test_count,
            "user_id": user_id
        }
        
        # Invoke with streaming
        response = self.client.invoke_agent_with_response_stream(
            agentRuntimeArn=self.runtime_arn,
            sessionId=session_id,
            inputText=json.dumps(payload)
        )
        
        # Stream events
        for event in response['completion']:
            if 'chunk' in event:
                yield json.loads(event['chunk']['bytes'].decode())
            elif 'trace' in event:
                yield {"type": "trace", "data": event['trace']}
```

#### 2. Update: `backend/app/api/sessions.py`
```python
# Add AgentCore integration option
import os
from ..agentcore_client import AgentCoreClient

USE_AGENTCORE = os.environ.get("USE_AGENTCORE", "false").lower() == "true"
AGENTCORE_RUNTIME_ARN = os.environ.get("AGENTCORE_RUNTIME_ARN", "")

async def _run_background_task(session_id: str, data: SessionCreate, queue: asyncio.Queue):
    """Background task that runs the orchestrator."""
    
    if USE_AGENTCORE and AGENTCORE_RUNTIME_ARN:
        # Use AgentCore Runtime
        client = AgentCoreClient()
        client.set_runtime_arn(AGENTCORE_RUNTIME_ARN)
        
        async for event in client.invoke_agent(
            requirement=data.requirement,
            target_url=data.target_url,
            test_count=data.test_case_count,
            session_id=session_id
        ):
            await ws_manager.send_to_session(session_id, event)
    else:
        # Use local Strands orchestrator (existing code)
        orchestrator = StrandsAetherTestOrchestrator(ws_manager, session_svc)
        await orchestrator.run(...)
```

#### 3. New File: `backend/app/auth/cognito.py`
```python
"""
Cognito JWT Token Validation
"""
import os
import jwt
import requests
from functools import lru_cache
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-1")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")

security = HTTPBearer()

@lru_cache()
def get_cognito_public_keys():
    """Fetch Cognito public keys for JWT verification."""
    url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    response = requests.get(url)
    return response.json()["keys"]

def verify_cognito_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Verify Cognito JWT token."""
    token = credentials.credentials
    
    try:
        # Decode header to get key ID
        header = jwt.get_unverified_header(token)
        kid = header["kid"]
        
        # Find matching public key
        keys = get_cognito_public_keys()
        key = next((k for k in keys if k["kid"] == kid), None)
        
        if not key:
            raise HTTPException(status_code=401, detail="Invalid token key")
        
        # Verify token
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
            issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
```

### Frontend Changes

#### 1. New File: `frontend/lib/cognito.ts`
```typescript
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
  ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
};

const userPool = new CognitoUserPool(poolData);

export async function signIn(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });
    
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });
    
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (result) => {
        const idToken = result.getIdToken().getJwtToken();
        resolve(idToken);
      },
      onFailure: (err) => {
        reject(err);
      },
    });
  });
}

export async function signUp(email: string, password: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    userPool.signUp(
      email,
      password,
      [{ Name: 'name', Value: name }],
      [],
      (err, result) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export function getCurrentUser(): CognitoUser | null {
  return userPool.getCurrentUser();
}

export async function getIdToken(): Promise<string | null> {
  const user = getCurrentUser();
  if (!user) return null;
  
  return new Promise((resolve) => {
    user.getSession((err: any, session: any) => {
      if (err || !session.isValid()) {
        resolve(null);
      } else {
        resolve(session.getIdToken().getJwtToken());
      }
    });
  });
}

export function signOut(): void {
  const user = getCurrentUser();
  if (user) user.signOut();
}
```

#### 2. Update: `frontend/hooks/useTestSession.ts`
```typescript
// Add authentication header to API calls
import { getIdToken } from '@/lib/cognito';

export function useTestSession() {
  const startSession = async (
    requirement: string,
    targetUrl: string,
    credentialName?: string,
    testCaseCount: number = 5
  ) => {
    const token = await getIdToken();
    
    const response = await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,  // Add Cognito token
      },
      body: JSON.stringify({
        requirement,
        target_url: targetUrl,
        credential_name: credentialName,
        test_case_count: testCaseCount,
      }),
    });
    
    // ... rest of implementation
  };
}
```

#### 3. New File: `frontend/components/AuthProvider.tsx`
```typescript
'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getCurrentUser, getIdToken, signOut } from '@/lib/cognito';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any | null;
  token: string | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  token: null,
  loading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = getCurrentUser();
      if (currentUser) {
        const idToken = await getIdToken();
        setUser(currentUser);
        setToken(idToken);
      }
      setLoading(false);
    };
    
    checkAuth();
  }, []);
  
  const logout = () => {
    signOut();
    setUser(null);
    setToken(null);
  };
  
  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user,
      user,
      token,
      loading,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

---

## Deployment Steps

### Phase 1: AWS Infrastructure Setup (Infra Team)

#### Step 1.1: Create VPC and Networking

```bash
# Create VPC with CloudFormation or Terraform
aws cloudformation create-stack \
  --stack-name aethertest-vpc \
  --template-body file://infra/vpc.yaml \
  --parameters \
    ParameterKey=VpcCidr,ParameterValue=10.0.0.0/16 \
    ParameterKey=Environment,ParameterValue=production
```

#### Step 1.2: Create Cognito User Pool
```bash
# Create User Pool
aws cognito-idp create-user-pool \
  --pool-name AetherTestUserPool \
  --policies '{"PasswordPolicy":{"MinimumLength":12,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true}}' \
  --auto-verified-attributes email \
  --username-attributes email \
  --mfa-configuration OPTIONAL

# Create App Client
aws cognito-idp create-user-pool-client \
  --user-pool-id us-east-1_XXXXXXXXX \
  --client-name AetherTestWebApp \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --callback-urls "https://aethertest.example.com/auth/callback" \
  --logout-urls "https://aethertest.example.com/logout" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client
```

#### Step 1.3: Create DynamoDB Tables
```bash
# Sessions table
aws dynamodb create-table \
  --table-name AetherTestSessions \
  --attribute-definitions \
    AttributeName=sessionId,AttributeType=S \
    AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=sessionId,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"UserIdIndex","KeySchema":[{"AttributeName":"userId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"},"ProvisionedThroughput":{"ReadCapacityUnits":5,"WriteCapacityUnits":5}}]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

# Test Cases table
aws dynamodb create-table \
  --table-name AetherTestTestCases \
  --attribute-definitions \
    AttributeName=testId,AttributeType=S \
    AttributeName=sessionId,AttributeType=S \
  --key-schema AttributeName=testId,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"SessionIdIndex","KeySchema":[{"AttributeName":"sessionId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"},"ProvisionedThroughput":{"ReadCapacityUnits":5,"WriteCapacityUnits":5}}]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

#### Step 1.4: Create S3 Buckets
```bash
# Reports bucket
aws s3 mb s3://aethertest-reports-ACCOUNT_ID --region us-east-1
aws s3api put-bucket-encryption \
  --bucket aethertest-reports-ACCOUNT_ID \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Screenshots bucket
aws s3 mb s3://aethertest-screenshots-ACCOUNT_ID --region us-east-1

# Recordings bucket
aws s3 mb s3://aethertest-recordings-ACCOUNT_ID --region us-east-1
```

#### Step 1.5: Create Secrets Manager Secrets
```bash
# Encryption key
aws secretsmanager create-secret \
  --name aethertest/encryption-key \
  --secret-string '{"key":"YOUR_FERNET_KEY_HERE"}'
```

### Phase 2: AgentCore Setup

#### Step 2.1: Create AgentCore Memory Store
```bash
# Install AgentCore toolkit
pip install bedrock-agentcore bedrock-agentcore-starter-toolkit

# Create memory store
python scripts/create_memory.py
```

#### Step 2.2: Build and Push Agent Container
```bash
# Setup Docker buildx
docker buildx create --use

# Create ECR repository
aws ecr create-repository \
  --repository-name aethertest-agent \
  --region us-west-2

# Login to ECR
aws ecr get-login-password --region us-west-2 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com

# Build and push (ARM64 for AgentCore)
docker buildx build \
  --platform linux/arm64 \
  -t ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com/aethertest-agent:latest \
  --push \
  -f Dockerfile.agentcore .
```

#### Step 2.3: Deploy to AgentCore Runtime
```bash
# Configure agent
agentcore configure \
  --entrypoint src/strands_agentcore_agent.py \
  --non-interactive

# Deploy to AgentCore
agentcore deploy

# Get Runtime ARN
agentcore status
```

### Phase 3: API Gateway Setup

#### Step 3.1: Create REST API
```bash
# Import OpenAPI spec
aws apigateway import-rest-api \
  --body file://infra/openapi.yaml \
  --fail-on-warnings

# Create deployment
aws apigateway create-deployment \
  --rest-api-id API_ID \
  --stage-name prod
```

#### Step 3.2: Create WebSocket API
```bash
# Create WebSocket API
aws apigatewayv2 create-api \
  --name AetherTestWebSocket \
  --protocol-type WEBSOCKET \
  --route-selection-expression '$request.body.action'

# Create routes and integrations
# ... (see infra/websocket-api.yaml)
```

### Phase 4: ECS Deployment (Frontend & Sandbox)

#### Step 4.1: Create ECS Cluster
```bash
aws ecs create-cluster \
  --cluster-name aethertest-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1 \
    capacityProvider=FARGATE_SPOT,weight=1
```

#### Step 4.2: Deploy Frontend Service
```bash
# Build and push frontend image
docker build -t aethertest-frontend ./frontend
docker tag aethertest-frontend:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/aethertest-frontend:latest
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/aethertest-frontend:latest

# Create ECS service
aws ecs create-service \
  --cluster aethertest-cluster \
  --service-name frontend \
  --task-definition aethertest-frontend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}"
```

#### Step 4.3: Deploy Browser Sandbox Service
```bash
# Build and push sandbox image
docker build -t aethertest-sandbox ./sandbox
docker tag aethertest-sandbox:latest ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/aethertest-sandbox:latest
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/aethertest-sandbox:latest

# Create ECS service with shared memory
aws ecs create-service \
  --cluster aethertest-cluster \
  --service-name browser-sandbox \
  --task-definition aethertest-sandbox \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}"
```

### Phase 5: CloudFront & DNS Setup

#### Step 5.1: Create CloudFront Distribution
```bash
aws cloudfront create-distribution \
  --distribution-config file://infra/cloudfront-config.json
```

#### Step 5.2: Configure Route 53
```bash
# Create hosted zone (if not exists)
aws route53 create-hosted-zone \
  --name aethertest.example.com \
  --caller-reference $(date +%s)

# Create A record for CloudFront
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch file://infra/route53-records.json
```

---

## Environment Variables Summary

### Backend (.env)
```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=ACCOUNT_ID

# AgentCore Configuration
USE_AGENTCORE=true
AGENTCORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-west-2:ACCOUNT_ID:agent/aethertest-agent
AGENTCORE_MEMORY_ID=aethertest-memory-store
AGENTCORE_MEMORY_REGION=us-west-2

# Cognito Configuration
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# Storage
S3_REPORTS_BUCKET=aethertest-reports-ACCOUNT_ID
S3_SCREENSHOTS_BUCKET=aethertest-screenshots-ACCOUNT_ID
S3_RECORDINGS_BUCKET=aethertest-recordings-ACCOUNT_ID
DYNAMODB_SESSIONS_TABLE=AetherTestSessions
DYNAMODB_TESTCASES_TABLE=AetherTestTestCases

# Browser Sandbox (ECS Service Discovery)
BROWSER_SANDBOX_CDP=http://browser-sandbox.aethertest.local:9222
NOVNC_URL=http://browser-sandbox.aethertest.local:6080
SANDBOX_RECORDER_URL=http://browser-sandbox.aethertest.local:8888

# Security
CREDENTIAL_ENCRYPTION_KEY_SECRET=aethertest/encryption-key

# Observability
OTEL_SERVICE_NAME=aethertest-backend
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.us-east-1.amazonaws.com
```

### Frontend (.env.local)
```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.aethertest.example.com
NEXT_PUBLIC_WS_URL=wss://ws.aethertest.example.com
NEXT_PUBLIC_NOVNC_URL=https://vnc.aethertest.example.com

# Cognito Configuration
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Cost Estimation

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| **AgentCore Runtime** | ~3000 invocations/month, 5 min avg | ~$50 |
| **AgentCore Memory** | 1GB storage, 10K operations | ~$5 |
| **API Gateway** | 100K requests/month | ~$3.50 |
| **Lambda** | 100K invocations, 512MB | ~$2 |
| **Cognito** | 1000 MAU | Free tier |
| **DynamoDB** | On-demand, 10GB | ~$5 |
| **S3** | 50GB storage | ~$1.15 |
| **ECS Fargate (Frontend)** | 0.5 vCPU, 1GB, 24/7 | ~$15 |
| **ECS Fargate (Sandbox)** | 1 vCPU, 4GB, 24/7 | ~$75 |
| **CloudFront** | 100GB transfer | ~$8.50 |
| **CloudWatch** | Logs + metrics | ~$10 |
| **Bedrock (Nova Pro)** | ~500K tokens/day | ~$15 |
| **Bedrock (Claude Haiku)** | ~1M tokens/day | ~$25 |
| **Total Estimate** | | **~$215/month** |

---

## Security Checklist

- [ ] Enable MFA for Cognito User Pool
- [ ] Configure WAF rules for API Gateway
- [ ] Enable VPC endpoints for AWS services
- [ ] Encrypt all S3 buckets with KMS
- [ ] Enable DynamoDB encryption at rest
- [ ] Configure CloudTrail for audit logging
- [ ] Set up GuardDuty for threat detection
- [ ] Implement least-privilege IAM policies
- [ ] Enable SSL/TLS for all endpoints
- [ ] Configure security groups with minimal access
- [ ] Enable AWS Config for compliance monitoring

---

## Monitoring & Alerting

### CloudWatch Alarms
```yaml
Alarms:
  - Name: AgentCoreHighLatency
    Metric: AgentCore/InvocationLatency
    Threshold: 30000ms
    Period: 5 minutes
    
  - Name: AgentCoreErrors
    Metric: AgentCore/Errors
    Threshold: 5
    Period: 5 minutes
    
  - Name: APIGateway5xxErrors
    Metric: AWS/ApiGateway/5XXError
    Threshold: 10
    Period: 5 minutes
    
  - Name: ECSHighCPU
    Metric: AWS/ECS/CPUUtilization
    Threshold: 80%
    Period: 5 minutes
```

### X-Ray Tracing
- Enable X-Ray for Lambda functions
- Enable X-Ray for API Gateway
- Configure sampling rules for AgentCore

---

## Rollback Plan

1. **AgentCore Rollback**: Use `agentcore rollback` to previous version
2. **ECS Rollback**: Update service to previous task definition
3. **API Gateway Rollback**: Deploy previous stage
4. **Database Rollback**: Restore from DynamoDB point-in-time recovery
5. **DNS Rollback**: Update Route 53 to previous CloudFront distribution

---

## Questions for Infra Team

1. **VPC**: Use existing VPC or create dedicated VPC for AetherTest?
2. **Domain**: What domain will be used? (e.g., aethertest.wipro.com)
3. **SSL Certificates**: Use ACM or existing corporate certificates?
4. **Cognito**: Integrate with existing corporate IdP (SAML/OIDC)?
5. **Bedrock Access**: Is Bedrock enabled in the target AWS account?
6. **AgentCore Preview**: Is the team approved for AgentCore preview access?
7. **Corporate Proxy**: Does the VPC need to route through corporate proxy?
8. **Logging**: Send logs to existing centralized logging system (Splunk/ELK)?
9. **Cost Center**: Which cost center/tags for billing?
10. **Compliance**: Any specific compliance requirements (SOC2, HIPAA)?

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Infrastructure | 1-2 weeks | AWS account access, IAM permissions |
| Phase 2: AgentCore Setup | 1 week | AgentCore preview access |
| Phase 3: API Gateway | 3-5 days | Cognito setup complete |
| Phase 4: ECS Deployment | 1 week | VPC, ECR ready |
| Phase 5: DNS & CDN | 2-3 days | Domain ownership verified |
| Testing & QA | 1 week | All components deployed |
| **Total** | **4-6 weeks** | |

---

## Contact

**Application Team**: [Your Team Contact]
**Infrastructure Team**: [Infra Team Contact]
**AWS Support**: [AWS TAM/Support Contact]
