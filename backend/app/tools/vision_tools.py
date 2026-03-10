"""AWS Bedrock Claude Haiku 4.5 vision analysis tool for screenshot validation.

Uses Claude Haiku 4.5 via Bedrock invoke_model API for vision analysis.
Claude Haiku 4.5 supports vision (unlike Claude 3.5 Haiku).
"""
import asyncio
import json
import logging
import time
import base64
import boto3
from botocore.exceptions import ClientError
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Claude Haiku 4.5 for vision (cross-region inference model ID)
# Claude Haiku 4.5 supports vision, unlike Claude 3.5 Haiku
BEDROCK_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

PROMPT_TEXT = (
    "You are a QA engineer reviewing a browser screenshot during automated testing.\n"
    "Expected state: {expected_state}\n\n"
    "Analyze the screenshot carefully and determine:\n"
    "1. Is the expected state visible/achieved?\n"
    "2. Are there any errors, alerts, or unexpected UI elements?\n"
    "3. Does the page content match what was expected?\n\n"
    "Respond with exactly:\n"
    "VERDICT: PASS or FAIL\n"
    "EXPLANATION: <brief explanation>"
)


def _parse_verdict(content: str) -> tuple[str, str]:
    """Extract VERDICT and EXPLANATION from model response text."""
    verdict = "FAIL"
    explanation = content
    for line in content.splitlines():
        if line.startswith("VERDICT:"):
            verdict = "PASS" if "PASS" in line.upper() else "FAIL"
        elif line.startswith("EXPLANATION:"):
            explanation = line.replace("EXPLANATION:", "").strip()
    return verdict, explanation


def _get_bedrock_client():
    """Create a Bedrock runtime client with AWS credentials and SSL certificate."""
    import os
    
    kwargs = {
        "region_name": settings.aws_region,
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
    }
    if settings.aws_session_token:
        kwargs["aws_session_token"] = settings.aws_session_token
    
    # Check for CA bundle - first try the project root location
    ca_bundle = None
    ca_bundle_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "combined_ca_bundle.pem")
    ca_bundle_path = os.path.abspath(ca_bundle_path)
    
    if os.path.exists(ca_bundle_path):
        ca_bundle = ca_bundle_path
        kwargs["verify"] = ca_bundle
        os.environ['AWS_CA_BUNDLE'] = ca_bundle
        logger.info(f"Bedrock client using CA bundle: {ca_bundle}")
    else:
        # Try environment variables
        for env_var in ['AWS_CA_BUNDLE', 'REQUESTS_CA_BUNDLE', 'SSL_CERT_FILE', 'CURL_CA_BUNDLE']:
            if os.environ.get(env_var):
                ca_bundle = os.environ.get(env_var)
                if os.path.exists(ca_bundle):
                    kwargs["verify"] = ca_bundle
                    logger.info(f"Bedrock client using CA bundle from {env_var}: {ca_bundle}")
                    break
    
    # Log credentials being used (masked)
    logger.info(f"Bedrock client credentials: {settings.aws_access_key_id[:10]}...{settings.aws_access_key_id[-4:]}")
    
    return boto3.client("bedrock-runtime", **kwargs)


def _try_bedrock(screenshot_b64: str, prompt: str) -> dict | None:
    """
    Attempt a single call to Claude Haiku 4.5 via Bedrock invoke_model API.
    Returns a result dict on success, None on any failure.
    """
    try:
        client = _get_bedrock_client()
        
        # Use invoke_model with Anthropic's message format for Claude
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 512,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": screenshot_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        },
                    ],
                }
            ],
        })
        
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        # Parse the response
        response_body = json.loads(response['body'].read())
        content = response_body['content'][0]['text']
        verdict, explanation = _parse_verdict(content)
        return {
            "verdict": verdict,
            "explanation": explanation,
            "source": "bedrock-claude-haiku-4.5",
            "raw": content,
        }
    except ClientError as e:
        logger.warning(f"Bedrock Claude Haiku 4.5 attempt failed: {e}")
        return None
    except Exception as e:
        logger.warning(f"Bedrock Claude Haiku 4.5 attempt failed: {e}")
        return None


def analyze_screenshot_sync(screenshot_b64: str, expected_state: str) -> dict:
    """
    Analyze a screenshot using Claude Haiku 4.5 via Bedrock.
    Retries up to 3 times with exponential backoff.
    """
    prompt = PROMPT_TEXT.format(expected_state=expected_state)

    if settings.aws_access_key_id and settings.aws_secret_access_key:
        for attempt in range(1, 4):
            result = _try_bedrock(screenshot_b64, prompt)
            if result:
                logger.info(f"Bedrock Claude Haiku 4.5 succeeded on attempt {attempt}: {result['verdict']}")
                return result
            if attempt < 3:
                wait = 2 ** attempt  # 2s, 4s
                logger.warning(f"Bedrock attempt {attempt} failed — retrying in {wait}s…")
                time.sleep(wait)

        logger.error("All Bedrock Claude Haiku 4.5 attempts failed")
    else:
        logger.warning("AWS credentials not set — cannot analyze screenshot")

    # No fallback - return error
    return {"verdict": "FAIL", "explanation": "Vision analysis unavailable - check AWS credentials", "source": "error"}


def get_vision_tool_definition() -> dict:
    """Return MCP-compatible tool definition for analyze_screenshot."""
    return {
        "name": "analyze_screenshot",
        "description": (
            "Analyze a browser screenshot using Claude Haiku 4.5 vision AI via AWS Bedrock to determine "
            "if the expected UI state is present. Returns PASS or FAIL with explanation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "screenshot_b64": {
                    "type": "string",
                    "description": "DO NOT PASS — the system automatically injects the screenshot captured in the preceding capture_screenshot call.",
                },
                "expected_state": {
                    "type": "string",
                    "description": "Description of the expected browser state to validate (what the page should show for this test to PASS)",
                },
                "test_id": {
                    "type": "string",
                    "description": "ID of the test case being validated (e.g. TC-001). Used to update the test case status in the UI.",
                },
            },
            "required": ["expected_state", "test_id"],
        },
    }


async def handle_analyze_screenshot(tool_input: dict) -> dict:
    """Async wrapper called by the orchestrator tool handler."""
    result = await asyncio.get_running_loop().run_in_executor(
        None,
        analyze_screenshot_sync,
        tool_input.get("screenshot_b64", ""),
        tool_input.get("expected_state", "Page loaded and functioning correctly"),
    )
    return {
        "type": "tool_result",
        "content": json.dumps(result),
    }
