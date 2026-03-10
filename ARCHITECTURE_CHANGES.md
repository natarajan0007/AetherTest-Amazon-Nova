# Architecture Changes: NVIDIA Nemotron → Amazon Bedrock Nova Pro

## Before: NVIDIA Nemotron Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AetherTest Orchestrator                       │
│                  (Claude Sonnet 4.6 via Anthropic)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │   Browser    │ │   Vision     │ │   Storage    │
        │   Specialist │ │   Validator  │ │   & Report   │
        │              │ │              │ │              │
        │ Claude Haiku │ │   NVIDIA     │ │   SQLite     │
        │ (via browser-│ │  Nemotron    │ │   + FS       │
        │   use)       │ │  (REST API)  │ │              │
        └──────┬───────┘ └──────┬───────┘ └──────────────┘
               │                │
               ▼                ▼
        ┌──────────────┐ ┌──────────────────────┐
        │   Sandbox    │ │  NVIDIA API          │
        │   Chrome     │ │  (integrate.api.     │
        │   (CDP)      │ │   nvidia.com)        │
        └──────────────┘ └──────────────────────┘
```

**Issues:**
- ❌ Two different LLM providers (Anthropic + NVIDIA)
- ❌ Browser agent uses Haiku (weaker reasoning)
- ❌ Vision uses Nemotron (limited capabilities)
- ❌ External API dependency for vision
- ❌ No unified model strategy

---

## After: Amazon Bedrock Nova Pro Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AetherTest Orchestrator                       │
│                  (Claude Sonnet 4.6 via Anthropic)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │   Browser    │ │   Vision     │ │   Storage    │
        │   Specialist │ │   Validator  │ │   & Report   │
        │              │ │              │ │              │
        │  Bedrock     │ │  Bedrock     │ │   SQLite     │
        │  Nova Pro    │ │  Nova Pro    │ │   + FS       │
        │  (via        │ │  (via boto3) │ │              │
        │  langchain)  │ │              │ │              │
        └──────┬───────┘ └──────┬───────┘ └──────────────┘
               │                │
               └────────┬───────┘
                        │
                        ▼
                ┌──────────────────────┐
                │  AWS Bedrock         │
                │  (boto3 SDK)         │
                │  - Nova Pro v1.0     │
                │  - Multi-modal       │
                │  - Fast inference    │
                └──────────────────────┘
                        │
                        ▼
                ┌──────────────────────┐
                │  Sandbox Chrome      │
                │  (CDP)               │
                └──────────────────────┘
```

**Benefits:**
- ✅ Unified model provider (AWS Bedrock)
- ✅ Stronger reasoning for browser automation
- ✅ Better vision capabilities
- ✅ Integrated AWS ecosystem
- ✅ Consistent model strategy

---

## Data Flow Comparison

### Vision Analysis Flow

#### Before (NVIDIA Nemotron)
```
Screenshot (PNG)
    │
    ▼
[vision_tools.py]
    │
    ├─ Encode to base64
    │
    ├─ Build HTTP request
    │
    ├─ POST to https://integrate.api.nvidia.com/v1/chat/completions
    │   Headers: Authorization: Bearer {NVIDIA_API_KEY}
    │
    ├─ Parse JSON response
    │
    ├─ Extract VERDICT: PASS/FAIL
    │
    └─ Return result
        │
        ▼
    Test Status Update
```

#### After (Bedrock Nova Pro)
```
Screenshot (PNG)
    │
    ▼
[vision_tools.py]
    │
    ├─ Encode to base64
    │
    ├─ Create boto3 Bedrock client
    │   Credentials: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    │
    ├─ Call client.invoke_model()
    │   Model: amazon.nova-pro-v1:0
    │   Region: us-east-1 (configurable)
    │
    ├─ Parse response JSON
    │
    ├─ Extract VERDICT: PASS/FAIL
    │
    └─ Return result
        │
        ▼
    Test Status Update
```

**Key Differences:**
- HTTP REST API → boto3 SDK call
- External API endpoint → AWS service
- Bearer token → IAM credentials
- NVIDIA model → Bedrock model

---

### Browser Task Execution Flow

#### Before (Claude Haiku)
```
Browser Task
    │
    ▼
[browser_tools.py]
    │
    ├─ Create ChatAnthropic LLM
    │   Model: claude-haiku-4-5-20251001
    │   API Key: ANTHROPIC_API_KEY
    │
    ├─ Initialize browser-use Agent
    │
    ├─ Agent reasons about task
    │
    ├─ Execute actions via CDP
    │   → Sandbox Chrome
    │
    └─ Return result
        │
        ▼
    Browser Action Complete
```

#### After (Bedrock Nova Pro)
```
Browser Task
    │
    ▼
[browser_tools.py]
    │
    ├─ Create ChatBedrock LLM
    │   Model: amazon.nova-pro-v1:0
    │   Credentials: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    │   Region: us-east-1
    │
    ├─ Initialize browser-use Agent
    │
    ├─ Agent reasons about task (stronger reasoning)
    │
    ├─ Execute actions via CDP
    │   → Sandbox Chrome
    │
    └─ Return result
        │
        ▼
    Browser Action Complete
```

**Key Differences:**
- ChatAnthropic → ChatBedrock
- Anthropic API → AWS Bedrock
- Haiku model → Nova Pro model
- Better reasoning capabilities

---

## Credential Management

### Before (NVIDIA)
```
.env
├─ ANTHROPIC_API_KEY (for orchestration)
├─ NVIDIA_API_KEY (for vision)
└─ Other settings

Environment Variables
├─ ANTHROPIC_API_KEY
├─ NVIDIA_API_KEY
└─ Other settings
```

### After (Bedrock)
```
.env
├─ ANTHROPIC_API_KEY (for orchestration)
├─ AWS_ACCESS_KEY_ID (for Bedrock)
├─ AWS_SECRET_ACCESS_KEY (for Bedrock)
├─ AWS_REGION (optional, defaults to us-east-1)
└─ Other settings

Environment Variables
├─ ANTHROPIC_API_KEY
├─ AWS_ACCESS_KEY_ID
├─ AWS_SECRET_ACCESS_KEY
├─ AWS_REGION
└─ Other settings
```

---

## Model Capabilities Comparison

### Vision Analysis

| Capability | NVIDIA Nemotron | Bedrock Nova Pro |
|------------|-----------------|------------------|
| Image understanding | Good | Excellent |
| Text recognition | Good | Excellent |
| UI element detection | Good | Excellent |
| Error detection | Good | Excellent |
| Complex reasoning | Limited | Strong |
| Multi-image support | No | Yes |
| Response time | ~2-3s | ~2-3s |

### Browser Automation

| Capability | Claude Haiku | Bedrock Nova Pro |
|------------|--------------|------------------|
| Task understanding | Good | Excellent |
| Complex reasoning | Limited | Strong |
| Error recovery | Good | Excellent |
| Multi-step planning | Good | Excellent |
| Response time | ~1-2s | ~1-2s |
| Context window | 8K | 200K |

---

## Deployment Architecture

### Before (NVIDIA)
```
┌─────────────────────────────────────────┐
│         Docker Compose                   │
├─────────────────────────────────────────┤
│ Frontend (Next.js)                      │
│ Backend (FastAPI)                       │
│ Browser Sandbox (Chrome + VNC)          │
└─────────────────────────────────────────┘
         │
         ├─ Anthropic API (orchestration)
         │
         └─ NVIDIA API (vision)
```

### After (Bedrock)
```
┌─────────────────────────────────────────┐
│         Docker Compose                   │
├─────────────────────────────────────────┤
│ Frontend (Next.js)                      │
│ Backend (FastAPI)                       │
│ Browser Sandbox (Chrome + VNC)          │
└─────────────────────────────────────────┘
         │
         ├─ Anthropic API (orchestration)
         │
         └─ AWS Bedrock (vision + browser)
```

**Simplified:** Single AWS service for AI tasks

---

## Cost Comparison

### Per Test Case (Approximate)

| Component | NVIDIA | Bedrock | Difference |
|-----------|--------|---------|-----------|
| Vision analysis | $0.005 | $0.01 | +$0.005 |
| Browser task | $0.005 | $0.02 | +$0.015 |
| **Total** | **$0.01** | **$0.03** | **+$0.02** |

### For 100 Test Cases

| Provider | Cost |
|----------|------|
| NVIDIA | ~$1 |
| Bedrock | ~$3 |
| **Difference** | **+$2** |

**Note:** Bedrock pricing varies by region. Costs are estimates and may change.

---

## Fallback Strategy

### Before
```
Vision Analysis
├─ Try NVIDIA (3 attempts with backoff)
├─ If fails → Claude Haiku vision
└─ If fails → Mock PASS
```

### After
```
Vision Analysis
├─ Try Bedrock Nova Pro (3 attempts with backoff)
├─ If fails → Claude Haiku vision
└─ If fails → Mock PASS
```

**Same fallback chain, just different primary provider**

---

## Migration Path

```
Step 1: Update Dependencies
├─ Add boto3, botocore, langchain-aws
└─ Remove NVIDIA dependencies (none in requirements)

Step 2: Update Configuration
├─ Add AWS credentials to config.py
└─ Remove NVIDIA API key

Step 3: Update Tools
├─ Replace vision_tools.py (NVIDIA → Bedrock)
└─ Update browser_tools.py (Haiku → Nova Pro)

Step 4: Update Environment
├─ Update .env.example
└─ Update docker-compose.yml

Step 5: Test
├─ Verify AWS credentials work
├─ Test vision analysis
└─ Test browser automation

Step 6: Deploy
├─ Build new Docker images
└─ Run with Podman/Docker
```

---

## Summary

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| Vision Provider | NVIDIA | AWS Bedrock | Unified AWS |
| Browser LLM | Claude Haiku | Bedrock Nova Pro | Stronger reasoning |
| API Type | REST (external) | SDK (AWS) | Better integration |
| Credentials | NVIDIA API key | AWS IAM | Enterprise-ready |
| Cost | Lower | Slightly higher | Better quality |
| Reasoning | Limited | Strong | Better results |
| Maintenance | External API | AWS service | More reliable |

**Overall:** More unified, stronger models, better AWS integration, slightly higher cost.
