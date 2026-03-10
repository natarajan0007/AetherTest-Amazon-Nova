# AetherTest — Complete System Design Blueprint
### The Autonomous STLC Engine: Implemented Architecture

> **"From Low-Code to Zero-Touch AI Driven Test Automation"**
>
> This document describes the **actual implemented system** as deployed, using Anthropic SDK direct tool-use + NVIDIA Nemotron (with Claude Vision fallback) + local SQLite storage.

---

## Table of Contents

1. [Why "AetherTest"?](#1-why-aethertest)
2. [Executive Summary](#2-executive-summary)
3. [System Architecture](#3-system-architecture)
4. [Technology Choices — Rationale](#4-technology-choices--rationale)
5. [Anthropic SDK Agentic Loop](#5-anthropic-sdk-agentic-loop)
6. [Tool Definitions (6 Tools)](#6-tool-definitions-6-tools)
7. [NVIDIA Nemotron Vision Layer](#7-nvidia-nemotron-vision-layer)
8. [Browser Automation Layer](#8-browser-automation-layer)
9. [Docker Sandbox Architecture](#9-docker-sandbox-architecture)
10. [FastAPI Backend Design](#10-fastapi-backend-design)
11. [WebSocket Protocol](#11-websocket-protocol)
12. [Storage Design](#12-storage-design)
13. [Credential Management](#13-credential-management)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Data Flow — Sequence Diagram](#15-data-flow--sequence-diagram)
16. [Agent Prompts](#16-agent-prompts)
17. [Configuration Reference](#17-configuration-reference)
18. [Key Design Decisions & Trade-offs](#18-key-design-decisions--trade-offs)
19. [File Structure](#19-file-structure)

---

## 1. Why "AetherTest"?

In ancient Greek philosophy, **Aether** (αἰθήρ) was the fifth element — the pure, invisible substance believed to fill the heavens above the clouds. Unlike earth, water, fire, or air, Aether was ever-present yet untouchable: it worked silently, permeating everything, requiring no human hand to move it.

We chose this name because it perfectly mirrors what AetherTest does to software testing:

| Aether (the element)            | AetherTest (the platform)                                             |
| ------------------------------- | --------------------------------------------------------------------- |
| Invisible, yet omnipresent      | AI agents work silently — no scripts to see, no selectors to maintain |
| Fills the space between things  | Bridges the gap between requirements and verified test results        |
| Moves without friction          | Zero-touch — no manual translation, no human bottleneck               |
| The medium of the gods          | The medium through which AI orchestrates the entire STLC              |
| Incorruptible & self-sustaining | Self-healing — adapts to UI changes without breaking                  |

> *"Just as Aether was the medium through which light and celestial motion flowed effortlessly,*
> *AetherTest is the medium through which software quality flows — autonomously, invisibly, and without limit."*

---

## 2. Executive Summary

AetherTest is a **Zero-Touch Autonomous Software Testing Life Cycle (STLC) Engine**. The user types a natural-language requirement, and a multi-agent AI pipeline handles everything:

1. **Analyzes** the requirement and structures it into testable acceptance criteria
2. **Generates** BDD-style test cases and displays them in the UI before execution
3. **Executes** each test case in a live, VNC-visible Chrome browser using `browser-use` AI navigation
4. **Validates** each test result by capturing screenshots and analyzing them with **NVIDIA Nemotron** vision AI (with Claude Vision fallback)
5. **Generates** a comprehensive quality report with pass/fail counts, quality score, and downloadable MP4 recording

### The Paradigm Shift

| Dimension            | Traditional Tools (Selenium/Cypress/TOSCA) | **AetherTest**                              |
| -------------------- | ------------------------------------------ | ------------------------------------------- |
| Test Creation        | Manual scripting (hours/days)              | Plain English description (seconds)         |
| Element Targeting    | DOM selectors (XPath/CSS)                  | Vision-based — identifies by appearance     |
| UI Change Resilience | Breaks, manual fix required                | Self-heals via LLM reasoning                |
| Shift-Left           | Needs stable code first                    | Can test from Figma, before code            |
| Maintenance          | 30% of tester time                         | Near-zero — AI adapts automatically         |
| Observability        | Log files                                  | Live browser stream with AI thought process |

All phases are visible in real-time: the user sees browser actions live in an embedded noVNC iframe, agent status indicators update as each phase activates, and chat messages can be sent to the orchestrator mid-run.

---

## 3. System Architecture

### High-Level Component Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User Browser                                   │
│  ┌─────────────────────┐    ┌───────────────────────────────────────┐  │
│  │   Next.js UI :3001  │    │   noVNC iframe → :6080                │  │
│  │  - ChatPanel        │    │   (Live Chromium in Docker sandbox)   │  │
│  │  - AgentStatusBar   │    └───────────────────────────────────────┘  │
│  │  - TestCaseList     │                                               │
│  │  - ReportPanel      │                                               │
│  │  - LiveBrowserPanel │                                               │
│  └──────────┬──────────┘                                               │
└─────────────┼───────────────────────────────────────────────────────────┘
              │  REST (HTTP) + WebSocket (WS)
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend :8001                              │
│                                                                         │
│  WebSocket /ws/{session_id}  ←──────────────────────────────────────┐  │
│  REST /api/sessions          →  asyncio.create_task(_run_pipeline)  │  │
│  REST /api/credentials                                              │  │
│  REST /api/recording                                                │  │
│                                                                     │  │
│  shared_state.py: {running_tasks{}, session_queues{}}              │  │
│                                    │                                │  │
│                    ┌───────────────▼──────────────┐                │  │
│                    │  AetherTestOrchestrator       │                │  │
│                    │  (orchestrator.py)            │                │  │
│                    │                              │                │  │
│                    │  Anthropic SDK Agentic Loop  │                │  │
│                    │  client.messages.create()    │────────────────┘  │
│                    │  ↕ tool_use / tool_result    │                   │
│                    │                              │                   │
│                    │  Tool Dispatcher             │                   │
│                    │  ├─ browser_tools.py         │                   │
│                    │  ├─ vision_tools.py          │                   │
│                    │  └─ storage_tools.py         │                   │
│                    └───────────────────────────────┘                   │
└──────────┬──────────────────────────┬──────────────────────────────────┘
           │ CDP (port 9222)          │ HTTPS REST
           ▼                          ▼
┌──────────────────────┐    ┌──────────────────────────────────────────┐
│  Docker: browser-    │    │  External APIs                           │
│  sandbox             │    │  ┌────────────────────────────────────┐  │
│  ┌────────────────┐  │    │  │ Anthropic API                      │  │
│  │ Xvfb :99       │  │    │  │ - claude-sonnet-4-6 (orchestrator) │  │
│  │ Chromium :9222 │  │    │  │ - claude-haiku-4-5  (browser-use)  │  │
│  │ x11vnc :5900   │  │    │  └────────────────────────────────────┘  │
│  │ noVNC :6080    │  │    │  ┌────────────────────────────────────┐  │
│  │ Recorder :8888 │  │    │  │ NVIDIA Nemotron API                │  │
│  └────────────────┘  │    │  │ - nvidia/nemotron-nano-12b-v2-vl   │  │
└──────────────────────┘    │  │   (screenshot PASS/FAIL verdict)   │  │
                            │  └────────────────────────────────────┘  │
                            └──────────────────────────────────────────┘
```

---

## 4. Technology Choices — Rationale

### Orchestration: Anthropic SDK

**Chosen:** `anthropic.AsyncAnthropic` with a hand-written agentic tool-use loop.

**Rationale:**
- Full transparency: every turn, every tool call, every text block is logged and streamed to the UI
- No framework abstractions between the orchestrator and the model
- Tool results feed back into the exact message history Claude sees
- Can inject user mid-run messages into the conversation at any turn boundary
- `asyncio.CancelledError` propagates cleanly for stop-test functionality

### Vision: NVIDIA Nemotron with Claude Vision Fallback

**Primary:** `nvidia/nemotron-nano-12b-v2-vl` via `integrate.api.nvidia.com`  
**Fallback:** `claude-haiku-4-5-20251001` vision (multimodal)

**Rationale:**
- Purpose-built multimodal model optimized for vision understanding
- Structured VERDICT: PASS / EXPLANATION: output format
- Dedicated NVIDIA AI platform API (decoupled from Anthropic billing)
- Fast inference with low temperature (0.1) for deterministic QA verdicts
- **Graceful degradation:** If NVIDIA API fails (rate limit, timeout, no key), automatically falls back to Claude's vision capabilities
- **3-retry logic with exponential backoff** for NVIDIA (2s, 4s delays)
- Mock PASS returned if neither API is available (development mode)

### Browser Automation: browser-use

**Chosen:** `browser-use ≥0.1.40` (LLM-driven browser agent)

**Rationale:**
- AI-driven navigation: describes actions in natural language, LLM decides how to execute
- Connects to existing Chromium via CDP (`cdp_url`) — no separate browser process spawned
- `keep_alive=True` — browser remains visible in VNC between tool calls
- Uses fast `claude-haiku-4-5-20251001` for browser action decisions (cost-efficient, multimodal-capable)
- Vision-based element targeting — adapts to UI changes without brittle XPath/CSS selectors

### Storage: Local SQLite + Filesystem

**Chosen:** `aiosqlite` + local filesystem at `/local-storage`

**Rationale:**
- Zero cloud dependency for development and evaluation
- Docker volume `local-storage` shared between backend and sandbox containers
- Easily replaceable with cloud storage via config flag

---

## 5. Anthropic SDK Agentic Loop

**File:** `backend/app/agents/orchestrator.py`

### Entry Point

```python
class AetherTestOrchestrator:
    async def run(self, session_id, requirement, target_url,
                  credential_name=None, message_queue=None):
        if not settings.anthropic_api_key:
            await self._run_demo_pipeline(...)   # simulated, no API calls
        else:
            await self._run_live_pipeline(...)   # real Anthropic SDK loop
```

### Live Pipeline (`_run_live_pipeline`)

```python
client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
messages = [{"role": "user", "content": initial_prompt}]

while turn < settings.max_turns:   # default max_turns = 100
    # 1. Inject any user chat messages from the asyncio.Queue
    pending = await self._drain_queue(message_queue)
    if pending:
        messages.append({"role": "user", "content": "User: " + "; ".join(pending)})

    # 2. Call Anthropic API
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        system=ROOT_ORCHESTRATOR_PROMPT,
        tools=ALL_TOOLS,
        messages=messages,
    )
    messages.append({"role": "assistant", "content": response.content})

    # 3. Process content blocks
    tool_results = []
    for block in response.content:
        if block.type == "text":
            agent = _phase_from_text(block.text)
            await ws.send_agent_update(session_id, agent, "working", block.text)
        elif block.type == "tool_use":
            result = await _dispatch_tool(session_id, block.name, block.input)
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})

    # 4. Loop control
    if response.stop_reason == "end_turn":
        break
    if response.stop_reason == "tool_use":
        messages.append({"role": "user", "content": tool_results})
```

### Demo Pipeline (`_run_demo_pipeline`)

When `ANTHROPIC_API_KEY` is absent, a scripted demo pipeline runs with `asyncio.sleep()` delays. It:
- Drains the user message queue each step (interactive chat still works in demo)
- Creates 3 placeholder test cases
- Sends all the same WebSocket events (agent_update, test_cases, monitor_result, report, complete)
- Returns quality_score=100 with all tests PASS

### Agent Label Detection (`_phase_from_text`)

Claude's text narration is parsed with keyword matching to determine which UI agent label should light up:

```python
def _phase_from_text(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["test case", "bdd", "scenario"]): return "test-case-architect"
    if any(w in t for w in ["requirement", "acceptance criteria"]): return "requirement-analyst"
    if any(w in t for w in ["navigat", "click", "browser"]): return "browser-specialist"
    if any(w in t for w in ["screenshot", "validat", "nemotron"]): return "monitor-validator"
    if any(w in t for w in ["report", "quality score"]): return "report-generator"
    return "orchestrator"
```

---

## 6. Tool Definitions (6 Tools)

All tools are defined in `ALL_TOOLS = [...]` in `orchestrator.py` and dispatched by `_dispatch_tool()`.

### Tool 1: `register_test_cases`

**Purpose:** Publishes BDD test cases to the UI _before_ execution starts, so users see the plan.

**Schema:**
```json
{
  "test_cases": [
    {
      "id": "TC001",
      "title": "Verify valid login",
      "description": "User can log in with correct credentials",
      "steps": [
        {"action": "Navigate to /login", "expected": "Login form visible"},
        {"action": "Enter username tomsmith", "expected": "Field populated"},
        {"action": "Click Login button", "expected": "Redirected to /secure"}
      ]
    }
  ]
}
```

**Handler:** Normalises cases, sends `test_cases` WS event, updates agent status.

---

### Tool 2: `execute_browser_task`

**Purpose:** Drives the VNC-visible Chrome browser using browser-use AI agent.

**Schema:**
```json
{"task": "...", "target_url": "..."}
```

**Handler:**
```python
browser = Browser(cdp_url=settings.browser_sandbox_cdp, keep_alive=True)
llm = ChatAnthropic(model="claude-haiku-4-5-20251001", api_key=settings.anthropic_api_key)
agent = BrowserAgent(task=f"Go to {url} and then: {task}", llm=llm, browser=browser, max_failures=3)
result = await agent.run()
```

---

### Tool 3: `capture_screenshot`

**Purpose:** Captures a PNG of the current browser state via Chrome DevTools Protocol.

**Schema:** `{}` (no parameters)

**Handler:**
```python
# 1. GET http://browser-sandbox:9222/json → find page target → get webSocketDebuggerUrl
# 2. WS connect → send Page.captureScreenshot → receive base64 PNG
# 3. Save to local-storage/screenshots/{session_id}/
# 4. Return {screenshot_b64: "..."}
```

---

### Tool 4: `analyze_screenshot`

**Purpose:** Sends screenshot to NVIDIA Nemotron VL model for PASS/FAIL verdict.

**Schema:**
```json
{"screenshot_b64": "...", "expected_state": "Login form should show success message"}
```

**Handler:**
```python
response = requests.post(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    headers={"Authorization": f"Bearer {NVIDIA_API_KEY}"},
    json={
        "model": "nvidia/nemotron-nano-12b-v2-vl",
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": f"Expected: {expected_state}\n...VERDICT: PASS or FAIL\nEXPLANATION:..."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}}
        ]}],
        "max_tokens": 512, "temperature": 0.1
    }
)
```

**Returns:** `{"verdict": "PASS"|"FAIL", "explanation": "...", "raw": "..."}`

---

### Tool 5: `get_credentials`

**Purpose:** Retrieves Fernet-encrypted credentials from SQLite by name.

**Schema:**
```json
{"name": "admin"}
```

**Returns:** `{"username": "tomsmith", "password": "SuperSecretPassword!"}`

---

### Tool 6: `save_report`

**Purpose:** Persists the final test report to SQLite and local filesystem.

**Schema:**
```json
{
  "report_data": {
    "total_tests": 5,
    "passed": 4,
    "failed": 1,
    "blocked": 0,
    "quality_score": 80.0,
    "summary": "4/5 tests passed.",
    "test_results": [...]
  }
}
```

**Handler:** Writes to `reports` table and `/local-storage/reports/{session_id}/report.json`. Sends `report` and `complete` WS events.

---

## 6. NVIDIA Nemotron Vision Layer

**File:** `backend/app/tools/vision_tools.py`

### Model

| Property    | Value                                                  |
| ----------- | ------------------------------------------------------ |
| Model       | `nvidia/nemotron-nano-12b-v2-vl`                       |
| Provider    | NVIDIA AI Foundation Models                            |
| API         | `https://integrate.api.nvidia.com/v1/chat/completions` |
| Multimodal  | Yes (text + image_url)                                 |
| Temperature | 0.1 (near-deterministic)                               |
| Max Tokens  | 512                                                    |

### Prompt Strategy

The vision model is prompted as a QA engineer:

```
You are a QA engineer reviewing a browser screenshot during automated testing.
Expected state: {expected_state}

Analyze the screenshot carefully and determine:
1. Is the expected state visible/achieved?
2. Are there any errors, alerts, or unexpected UI elements?
3. Does the page content match what was expected?

Respond with exactly:
VERDICT: PASS or FAIL
EXPLANATION: <brief explanation>
```

### Response Parsing

```python
for line in content.splitlines():
    if line.startswith("VERDICT:"):
        verdict = "PASS" if "PASS" in line.upper() else "FAIL"
    elif line.startswith("EXPLANATION:"):
        explanation = line.replace("EXPLANATION:", "").strip()
```

### Fallback

If `NVIDIA_API_KEY` is not configured, returns `{"verdict": "PASS", "explanation": "Mock"}` — development works without the key.

---

## 7. Browser Automation Layer

**File:** `backend/app/tools/browser_tools.py`

### browser-use Integration (≥0.1.40)

browser-use ≥0.1.40 changed the API:
- `BrowserConfig` renamed to `BrowserProfile` (no longer used directly)
- `Browser` now accepts `cdp_url` directly as a constructor argument
- `keep_alive=True` prevents browser close between tool calls

```python
from browser_use import Agent as BrowserAgent, Browser

browser = Browser(
    cdp_url=settings.browser_sandbox_cdp,  # "http://browser-sandbox:9222"
    keep_alive=True,
)
llm = ChatAnthropic(
    model="claude-haiku-4-5-20251001",
    api_key=settings.anthropic_api_key,
)
agent = BrowserAgent(
    task=f"Go to {target_url} and then: {task}",
    llm=llm,
    browser=browser,
    max_failures=3,
)
result = await agent.run()
# Browser NOT closed — VNC session stays alive
```

### Two-Model Architecture

| Model                       | Role                                          | Reason                                       |
| --------------------------- | --------------------------------------------- | -------------------------------------------- |
| `claude-sonnet-4-6`         | Orchestrator — decides _what_ to test         | Best reasoning for STLC planning             |
| `claude-haiku-4-5-20251001` | browser-use — decides _how_ to click/navigate | Fast + cost-efficient for many small actions |

### Screenshot Capture (Direct CDP)

`capture_screenshot` bypasses browser-use and uses raw CDP WebSocket:

```python
# Step 1: Get page target WS URL
targets = await httpx_client.get("http://browser-sandbox:9222/json")
page = next(t for t in targets.json() if t["type"] == "page")

# Step 2: Connect and send CDP command
async with websockets.connect(page["webSocketDebuggerUrl"]) as ws:
    await ws.send(json.dumps({
        "id": 1,
        "method": "Page.captureScreenshot",
        "params": {"format": "png", "quality": 85}
    }))
    resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
    screenshot_b64 = resp["result"]["data"]
```

---

## 8. Docker Sandbox Architecture

**File:** `sandbox/Dockerfile`

### Base Image

`debian:bookworm-slim` — chosen because:
- Chromium is a real `.deb` package on Debian Bookworm (not Ubuntu snap which is incompatible in Docker)
- Stable, minimal base with full `apt` ecosystem

### Services in One Container

```
/app/start.sh starts all services:

1. Xvfb :99 -screen 0 1280x800x24    # virtual framebuffer
2. openbox --display :99              # window manager (allows Chromium to open windows)
3. chromium --remote-debugging-port=9222 \
            --no-sandbox \
            --disable-dev-shm-usage \
            --display=:99             # Chrome with CDP + VNC-visible display
4. x11vnc -display :99 -port 5900    # streams Xvfb to VNC clients
5. websockify --web /opt/novnc 6080 localhost:5900  # noVNC WS proxy
6. python3 recorder.py               # FFmpeg recording API on :8888
```

### Certificate Handling (Zscaler)

For corporate proxy environments, a Zscaler CA certificate is injected:

```dockerfile
# Step A: install ca-certificates AND git TOGETHER (git needed before Step C)
RUN apt-get install -y ca-certificates git

# Step B: inject cert
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN update-ca-certificates

# Step C: configure git to use updated bundle
RUN git config --global http.sslCAInfo /etc/ssl/certs/ca-certificates.crt
```

---

## 9. FastAPI Backend Design

**File:** `backend/app/main.py`

### Application Lifecycle

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()     # create SQLite tables
    yield
    # cleanup on shutdown

app = FastAPI(title="AetherTest API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"])
```

### Session Lifecycle

```
POST /api/sessions
    ├── svc.create_session(data)           → SQLite INSERT
    ├── asyncio.Queue() → session_queues[session_id]
    ├── asyncio.create_task(_run_orchestrator) → running_tasks[session_id]
    └── return SessionRead (201)

DELETE /api/sessions/{id}
    ├── running_tasks[id].cancel()         → CancelledError in orchestrator
    └── (orchestrator catches → sends cancelled WS event → updates DB)

_run_orchestrator (background asyncio.Task)
    ├── opens fresh aiosqlite connection
    ├── AetherTestOrchestrator(ws_manager, svc).run(...)
    └── finally: removes from running_tasks, session_queues
```

### WebSocket Handler

```python
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket, session_id):
    await ws_manager.connect(session_id, websocket)
    async for data in websocket:
        if data == "ping":
            await websocket.send_text("pong")
        else:
            msg = json.loads(data)
            if msg["type"] == "user_message":
                # Feed into orchestrator's asyncio.Queue
                await session_queues[session_id].put(msg["content"])
                # Echo back as user_chat so all clients see it
                await ws_manager.send_to_session(session_id, {"type": "user_chat", "content": msg["content"]})
```

### Static File Serving

```python
app.mount("/local-storage", StaticFiles(directory=settings.local_storage_path), name="local-storage")
```

Screenshots and reports are directly accessible at `http://localhost:8001/local-storage/...`

---

## 10. WebSocket Protocol

### Server → Client Event Types

```typescript
// Agent phase change
{ type: "agent_update", agent: AgentId, status: "working"|"done"|"error", message: string }

// Test plan published
{ type: "test_cases", testCases: Array<{id, title, description, status}> }

// Live browser action narration (+ optional screenshot)
{ type: "browser_action", action: string, screenshot?: string }  // screenshot is base64 PNG

// Monitor validation result
{ type: "monitor_result", testId: string, status: "PASS"|"FAIL"|"BLOCKED", evidence: string }

// Final report available
{ type: "report", reportId: string, data: ReportData }

// Pipeline complete
{ type: "complete", summary: string, qualityScore: number }

// Pipeline errored
{ type: "error", message: string }

// User cancelled via DELETE
{ type: "cancelled" }

// User's own chat message echoed back
{ type: "user_chat", content: string }
```

### Agent IDs

```typescript
type AgentId =
  | "orchestrator"       // root / fallback
  | "requirement-analyst"
  | "test-case-architect"
  | "browser-specialist"
  | "monitor-validator"
  | "report-generator"
```

### Client → Server

```
"ping"   → server echoes "pong"
{"type": "user_message", "content": string}   → queued into orchestrator turn
```

---

## 11. Storage Design

### SQLite Schema

**File:** `backend/app/database.py`

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    requirement TEXT NOT NULL,
    target_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending|running|completed|failed|cancelled
    report_id TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE test_cases (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',  -- pending|running|passed|failed|blocked
    evidence TEXT,
    created_at TEXT
);

CREATE TABLE credentials (
    name TEXT PRIMARY KEY,
    encrypted_data TEXT NOT NULL,  -- Fernet-encrypted JSON {username, password}
    created_at TEXT
);

CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    data TEXT,                     -- JSON blob
    file_path TEXT,
    created_at TEXT
);
```

### Filesystem Layout

```
/local-storage/
├── screenshots/
│   └── {session_id}/
│       ├── screenshot_001.png
│       └── screenshot_002.png
├── reports/
│   └── {session_id}/
│       └── report.json
└── recordings/
    └── {session_id}/
        └── recording.mp4
```

Docker Compose mounts `local-storage` volume into both `backend` (`/local-storage`) and `browser-sandbox` (`/local-storage`).

---

## 12. Credential Management

**File:** `backend/app/api/credentials.py`, `backend/app/tools/storage_tools.py`

### Encryption

Credentials are encrypted at rest using **Fernet symmetric encryption** from the `cryptography` library.

```python
from cryptography.fernet import Fernet

key = settings.credential_encryption_key.encode()
f = Fernet(key)

# Store
encrypted = f.encrypt(json.dumps({"username": u, "password": p}).encode())

# Retrieve
decrypted = json.loads(f.decrypt(encrypted_bytes))
```

**Generate a key:**
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

The key is stored in `.env` as `CREDENTIAL_ENCRYPTION_KEY`. If not set, credential save/retrieve returns a 500 error.

### API

```
POST /api/credentials   {"name": "admin", "username": "...", "password": "..."}
GET  /api/credentials   → list of names (no decrypted values)
DELETE /api/credentials/{name}
```

---

## 13. Frontend Architecture

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Zustand

### Component Tree

```
app/page.tsx                    # Dashboard — new session form
app/test/[sessionId]/page.tsx   # Test execution page (main view)
  ├── ChatPanel                 # Requirement input + agent message feed + chat input
  ├── LiveBrowserPanel          # noVNC iframe + connection state
  ├── AgentStatusBar            # 6-agent vertical pipeline with status indicators
  ├── TestCaseList              # BDD test cases with PASS/FAIL/pending badges
  └── ReportPanel               # Quality score donut + results table
```

### State Management

```typescript
// store/testStore.ts (Zustand)
interface TestStore {
  sessions: Session[]
  currentSession: Session | null
  testCases: TestCase[]
  agentStatuses: Record<AgentId, AgentStatus>
  report: Report | null
  messages: ChatMessage[]
  // actions...
}
```

### WebSocket Hook (`useWebSocket.ts`)

```typescript
// Connects to ws://backend/ws/{sessionId}
// Dispatches events to store:
case "agent_update" → store.updateAgentStatus(agent, status, message)
case "test_cases"   → store.setTestCases(testCases)
case "browser_action" → store.addMessage({type:"browser", ...})
case "monitor_result" → store.updateTestCase(testId, status, evidence)
case "report"       → store.setReport(data)
case "complete"     → store.setComplete(summary, qualityScore)
case "cancelled"    → store.setStatus("cancelled")
case "user_chat"    → store.addMessage({type:"user_chat", content})
```

### AgentStatusBar

The 6-agent vertical pipeline shows:
- **Pending** (grey) — not yet started
- **Working** (blue, pulse animation) — currently active with double-ring glow
- **Done** (green) — completed successfully

Agent emojis + role descriptions are shown for UX clarity.

### noVNC Integration

```typescript
// LiveBrowserPanel.tsx
// noVNC iframe → http://localhost:6080/vnc.html?autoconnect=true
// Sandbox probe: fetch(novncUrl, {mode: "no-cors"}) — no-cors required as noVNC has no CORS headers
// 6-second fallback timeout if probe is inconclusive
```

---

## 14. Data Flow — Sequence Diagram

```
User                Frontend         Backend            Anthropic     NVIDIA     Chrome(CDP)
 │                     │                │                   │            │            │
 │ Type requirement     │                │                   │            │            │
 │──────────────────►  │                │                   │            │            │
 │                     │ POST /sessions │                   │            │            │
 │                     │───────────────►│                   │            │            │
 │                     │ 201 {id}       │ create_task()     │            │            │
 │                     │◄───────────────│ asyncio.Task      │            │            │
 │                     │ WS connect     │                   │            │            │
 │                     │───────────────►│                   │            │            │
 │                     │                │                   │            │            │
 │                     │                │ messages.create() │            │            │
 │                     │                │──────────────────►│            │            │
 │                     │                │ text: "Analysing" │            │            │
 │                     │ agent_update   │◄──────────────────│            │            │
 │ [req-analyst active]│◄───────────────│                   │            │            │
 │                     │                │ tool_use:         │            │            │
 │                     │                │ register_test_cases            │            │
 │                     │                │◄──────────────────│            │            │
 │                     │ test_cases{[]} │                   │            │            │
 │ [3-7 cases listed]  │◄───────────────│                   │            │            │
 │                     │                │ tool_result → next turn        │            │
 │                     │                │──────────────────►│            │            │
 │                     │                │ tool_use:         │            │            │
 │                     │                │ execute_browser_task           │            │
 │                     │                │◄──────────────────│            │            │
 │                     │                │ browser-use       │            │   click    │
 │                     │                │───────────────────┼────────────┼───────────►│
 │ [VNC shows action]  │ browser_action │◄──────────────────┼────────────┼────────────│
 │                     │◄───────────────│                   │            │            │
 │                     │                │ capture_screenshot│            │            │
 │                     │                │───────────────────┼────────────┼───────────►│
 │                     │                │ {screenshot_b64}  │            │            │
 │                     │                │◄──────────────────┼────────────┼────────────│
 │                     │                │ analyze_screenshot│            │            │
 │                     │                │───────────────────┼───────────►│            │
 │                     │                │ {PASS, expl}      │            │            │
 │                     │                │◄──────────────────┼────────────│            │
 │                     │ monitor_result │                   │            │            │
 │ [PASS/FAIL shown]   │◄───────────────│                   │            │            │
 │                     │                │ save_report       │            │            │
 │                     │                │ → SQLite+FS       │            │            │
 │                     │ report{data}   │                   │            │            │
 │                     │◄───────────────│                   │            │            │
 │                     │ complete{score}│                   │            │            │
 │ [report displayed]  │◄───────────────│                   │            │            │
```

---

## 15. Agent Prompts

### Root Orchestrator System Prompt

```
You are AetherTest, an autonomous Software Testing Life Cycle (STLC) engine.
Transform a natural-language requirement into fully executed, validated test cases.

## Your workflow — follow these phases IN ORDER:

### Phase 1 — Requirement Analysis
Analyse the requirement and identify: feature under test, test objectives,
acceptance criteria, edge cases.

### Phase 2 — Test Case Generation
Call register_test_cases with a list of BDD test cases (3-7 cases covering
happy path, negative, edge cases).
Each test case needs: id, title, description, steps (array of {action, expected}).

### Phase 3 — Browser Execution
For EACH test case:
- Call execute_browser_task with the task description and target URL.
- The browser actions will be LIVE in the VNC panel — be specific.

### Phase 4 — Monitor Validation
For EACH test case after execution:
- Call capture_screenshot to get the current browser state.
- Call analyze_screenshot with the screenshot and the expected state.

### Phase 5 — Report
Call save_report with all test outcomes, quality score (passed/total*100),
executive summary.

## Rules
- Always call register_test_cases BEFORE executing any test cases.
- execute_browser_task instructions must be specific (what to click, type, URL).
- If credentials are needed, call get_credentials first.
- Complete ALL phases before finishing.
```

### User Prompt Template

```
Execute the full AetherTest STLC pipeline.

Requirement: {requirement}
Target URL: {target_url}
[Stored credential name to use: {credential_name}]

Begin Phase 1 now.
```

---

## 16. Configuration Reference

**File:** `backend/app/config.py` (pydantic-settings)

```python
class Settings(BaseSettings):
    anthropic_api_key: str = ""        # required for live pipeline
    nvidia_api_key: str = ""           # optional; mock if absent
    local_storage_path: str = "./local-storage"
    credential_encryption_key: str = ""# Fernet key; required for credentials
    browser_sandbox_cdp: str = "http://browser-sandbox:9222"
    novnc_url: str = "http://browser-sandbox:6080"
    sandbox_recorder_url: str = "http://browser-sandbox:8888"
    database_url: str = "sqlite:///./data/aethertest.db"
    frontend_url: str = "http://localhost:3001"
    max_turns: int = 100
    log_level: str = "INFO"

    model_config = {"env_file": (".env", "../.env"), "extra": "ignore"}
    # Reads .env from CWD (backend/) or parent (project root)
```

### Docker Compose Port Mapping

| Host Port | Container Port | Service                  |
| --------- | -------------- | ------------------------ |
| 3001      | 3001           | frontend (Next.js)       |
| 8001      | 8001           | backend (FastAPI)        |
| 6080      | 6080           | noVNC WebSocket          |
| 5900      | 5900           | VNC (raw)                |
| 9222      | 9222           | Chrome DevTools Protocol |
| 8888      | 8888           | FFmpeg recorder API      |

---

## 17. Key Design Decisions & Trade-offs

### 1. Anthropic SDK direct loop vs. framework

| Aspect            | Framework                 | Direct SDK (chosen)            |
| ----------------- | ------------------------- | ------------------------------ |
| Transparency      | Hidden steps              | Full turn-by-turn logging      |
| Mid-run injection | Difficult                 | asyncio.Queue at turn boundary |
| Cancel support    | Varies                    | Clean asyncio.CancelledError   |
| Debuggability     | Needs framework knowledge | Standard Python                |

### 2. Single-model orchestration vs. multi-agent subagents

The system uses a **single claude-sonnet-4-6 instance** with role-themed tool names rather than spawning separate Claude subagents per phase. This is simpler (one conversation history, one context window) and lets Claude reason across phases.

### 3. NVIDIA Nemotron for vision vs. Claude Vision

Using NVIDIA Nemotron for screenshot validation:
- Decouples vision billing from Anthropic usage
- Specialized for structured output (`VERDICT:`/`EXPLANATION:` format)
- Falls back gracefully (mock PASS) when key absent

### 4. browser-use vs. raw Playwright

browser-use adds an LLM decision layer on top of Playwright. This allows natural-language task descriptions (`"Log in with username tomsmith"`) instead of code. The trade-off is that it requires an additional API call per browser action (to Haiku), but this is cost-efficient and more robust than fragile CSS selectors.

### 5. Local storage vs. cloud storage

SQLite + local filesystem was chosen to eliminate all cloud dependencies for local development. The architecture is designed so that swapping to PostgreSQL + S3 requires only config changes (not code changes).

---

## 18. File Structure

```
AetherTest/
├── docker-compose.yml              # 3 services + 2 named volumes
├── .env                            # gitignored — actual secrets
├── .env.example                    # template committed to git
├── .gitignore
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py                 # FastAPI app, WS endpoint, CORS, lifespan
│       ├── config.py               # pydantic-settings, reads .env or ../.env
│       ├── database.py             # aiosqlite init, schema, _db_path
│       ├── shared_state.py         # running_tasks{}, session_queues{}
│       ├── models/
│       │   ├── session.py          # SessionCreate/Read/Update Pydantic models
│       │   ├── test_case.py        # TestCaseRead model
│       │   └── report.py          # ReportRead model
│       ├── websocket/
│       │   └── manager.py          # WebSocketManager: connect/disconnect/send_*
│       ├── agents/
│       │   └── orchestrator.py     # AetherTestOrchestrator: Anthropic SDK loop
│       ├── tools/
│       │   ├── browser_tools.py    # execute_browser_task, capture_screenshot
│       │   ├── vision_tools.py     # analyze_screenshot → NVIDIA Nemotron
│       │   └── storage_tools.py    # get_credentials, save_report
│       ├── services/
│       │   ├── session_service.py  # CRUD: sessions, test_cases
│       │   ├── recording_service.py# FFmpeg: start/stop via recorder API
│       │   └── storage_service.py  # save_screenshot, save_report to filesystem
│       └── api/
│           ├── sessions.py         # /api/sessions CRUD + background task launch
│           ├── credentials.py      # /api/credentials Fernet CRUD
│           └── recording.py        # /api/recording/start|stop
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json               # Next.js 14, Tailwind, Zustand, shadcn/ui
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx               # Dashboard / new session
│   │   └── test/[sessionId]/
│   │       └── page.tsx           # Main execution view
│   ├── components/
│   │   ├── ChatPanel.tsx          # Req input + message feed + chat bar
│   │   ├── LiveBrowserPanel.tsx   # noVNC iframe + sandbox probe logic
│   │   ├── AgentStatusBar.tsx     # 6-step pipeline visualization
│   │   ├── TestCaseList.tsx       # BDD cases + status badges
│   │   ├── ReportPanel.tsx        # Quality score + results table
│   │   └── CredentialModal.tsx    # Name/username/password form
│   ├── hooks/
│   │   ├── useWebSocket.ts        # WS connect, message dispatch, sendMessage
│   │   └── useTestSession.ts      # Session state: testCases, report, isRunning
│   └── store/
│       └── testStore.ts           # Zustand global state
│
└── sandbox/
    ├── Dockerfile                 # Debian bookworm: Xvfb+Chrome+x11vnc+noVNC
    ├── start.sh                   # Launches all sandbox services
    └── recorder.py                # FastAPI + FFmpeg recording control (:8888)
```
