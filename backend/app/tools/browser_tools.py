"""Browseruse browser automation — connects to sandbox Chromium via CDP."""
import json
import logging
import asyncio
import os
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── LLM factory ───────────────────────────────────────────────────────────────
# Use browser-use's native ChatAWSBedrock for browser task execution.


def _make_llm():
    """Create browser-use compatible LLM using native AWS Bedrock support."""
    from browser_use.llm.aws import ChatAWSBedrock
    import boto3
    from botocore.config import Config
    
    # Check for CA bundle and configure SSL
    ca_bundle = None
    ca_bundle_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "combined_ca_bundle.pem")
    ca_bundle_path = os.path.abspath(ca_bundle_path)
    
    if os.path.exists(ca_bundle_path):
        ca_bundle = ca_bundle_path
        os.environ['AWS_CA_BUNDLE'] = ca_bundle
        logger.info(f"ChatAWSBedrock using CA bundle: {ca_bundle}")
    else:
        # Try environment variables
        for env_var in ['AWS_CA_BUNDLE', 'REQUESTS_CA_BUNDLE', 'SSL_CERT_FILE', 'CURL_CA_BUNDLE']:
            if os.environ.get(env_var):
                ca_bundle = os.environ.get(env_var)
                if os.path.exists(ca_bundle):
                    logger.info(f"ChatAWSBedrock using CA bundle from {env_var}: {ca_bundle}")
                    break
    
    # Create boto3 session with credentials
    session_kwargs = {
        'aws_access_key_id': settings.aws_access_key_id,
        'aws_secret_access_key': settings.aws_secret_access_key,
        'region_name': settings.aws_region
    }
    if settings.aws_session_token:
        session_kwargs['aws_session_token'] = settings.aws_session_token
    
    boto_session = boto3.Session(**session_kwargs)
    
    # Log credentials being used (masked)
    logger.info(f"ChatAWSBedrock credentials: {settings.aws_access_key_id[:10]}...{settings.aws_access_key_id[-4:]}")
    logger.info(f"ChatAWSBedrock region: {settings.aws_region}")
    
    # Use browser-use's native ChatAWSBedrock with Claude Haiku 4.5
    # Claude Haiku 4.5 supports vision and tool calling
    llm = ChatAWSBedrock(
        model="us.anthropic.claude-haiku-4-5-20251001-v1:0",
        session=boto_session,
        max_tokens=4096,
        temperature=0.1,
    )
    
    return llm


# ── Browser task ──────────────────────────────────────────────────────────────

async def execute_browser_task_impl(task: str, target_url: str) -> dict:
    """
    Execute a browser-use Agent connected to the VNC-visible sandbox Chromium via CDP.
    Everything the agent does will be visible in the noVNC panel.
    """
    try:
        from browser_use import Agent as BrowserAgent, Browser

        cdp_url = settings.browser_sandbox_cdp
        logger.info(f"browser-use connecting to CDP: {cdp_url}")

        # Connect to the existing sandbox Chromium already running in Docker/VNC.
        # keep_alive=True prevents browser-use from closing the tab after the task,
        # so actions remain visible in the VNC panel.
        browser = Browser(cdp_url=cdp_url, keep_alive=True)
        llm = _make_llm()

        agent = BrowserAgent(
            task=f"Go to {target_url} and then: {task}",
            llm=llm,
            browser=browser,
            max_failures=3,
            use_vision=True,  # Claude Haiku 4.5 supports vision
        )

        result = await agent.run()
        return {"success": True, "result": str(result)}

    except Exception as e:
        logger.error(f"browser-use task failed: {type(e).__name__}: {e}", exc_info=True)
        return {"success": False, "result": str(e)}


def get_browser_tool_definition() -> dict:
    return {
        "name": "execute_browser_task",
        "description": (
            "Execute an AI-driven browser automation task using browser-use. "
            "The browser actions will be visible in the live VNC panel. "
            "Connects to the sandbox Chromium via Chrome DevTools Protocol."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Natural language description of browser actions to perform",
                },
                "target_url": {
                    "type": "string",
                    "description": "URL to navigate to",
                },
            },
            "required": ["task", "target_url"],
        },
    }


async def handle_execute_browser_task(tool_input: dict) -> dict:
    result = await execute_browser_task_impl(
        task=tool_input.get("task", ""),
        target_url=tool_input.get("target_url", ""),
    )
    return {"type": "tool_result", "content": json.dumps(result)}


# ── Screenshot ────────────────────────────────────────────────────────────────

def get_screenshot_tool_definition() -> dict:
    return {
        "name": "capture_screenshot",
        "description": (
            "Capture a screenshot of the current browser state. "
            "Returns {\"status\": \"captured\"} — the image is automatically passed to "
            "the next analyze_screenshot call, you do NOT need to handle the raw bytes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    }


async def handle_capture_screenshot(tool_input: dict) -> dict:
    """Capture screenshot via Chrome DevTools Protocol."""
    import httpx
    import websockets

    cdp_base = settings.browser_sandbox_cdp
    logger.info(f"capture_screenshot: CDP base = {cdp_base}")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            targets_resp = await client.get(f"{cdp_base}/json")
            targets_resp.raise_for_status()
            targets = targets_resp.json()

        logger.info(f"capture_screenshot: {len(targets)} CDP target(s) found")

        page_target = next(
            (t for t in targets if t.get("type") == "page"), None
        )
        if not page_target:
            logger.warning("capture_screenshot: no page target in CDP /json")
            return {"type": "tool_result", "content": json.dumps({"error": "No page target"})}

        ws_url = page_target["webSocketDebuggerUrl"]
        logger.info(f"capture_screenshot: connecting to WS {ws_url}")

        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({
                "id": 1,
                "method": "Page.captureScreenshot",
                "params": {"format": "png", "quality": 85},
            }))
            resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            screenshot_b64 = resp.get("result", {}).get("data", "")

        if screenshot_b64:
            logger.info(f"capture_screenshot: OK ({len(screenshot_b64)} chars)")
        else:
            logger.warning(f"capture_screenshot: CDP returned no data — {resp}")

        return {"type": "tool_result", "content": json.dumps({"screenshot_b64": screenshot_b64})}

    except Exception as e:
        logger.error(
            f"Screenshot capture failed: {type(e).__name__}: {e}",
            exc_info=True,
        )
        return {"type": "tool_result", "content": json.dumps({"error": f"{type(e).__name__}: {e}"})}
