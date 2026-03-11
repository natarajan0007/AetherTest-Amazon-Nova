"""AetherTest orchestrator — uses AWS Bedrock Converse API for full tool-use control."""
import json
import logging
import asyncio
from typing import Optional, Any
from datetime import datetime

import boto3
from botocore.config import Config

from ..config import get_settings
from ..websocket.manager import WebSocketManager
from ..services.session_service import SessionService
from ..services.storage_service import StorageService
from ..models.session import SessionUpdate
from ..tools import vision_tools, browser_tools, storage_tools, pageagent_bridge
from ..services.recording_service import RecordingService
from ..memory.service import get_memory_service

logger = logging.getLogger(__name__)
settings = get_settings()

# ── System prompt ────────────────────────────────────────────────────────────

ROOT_ORCHESTRATOR_PROMPT = """You are AetherTest, an autonomous Software Testing Life Cycle (STLC) engine.
Transform a natural-language requirement into fully executed, validated test cases.
Be concise in text responses — prefer tool calls over lengthy explanations.

## Memory & Learning
You have an always-on memory layer that stores learnings from past test sessions.
If relevant memories are provided in the user prompt, use them to:
- Avoid repeating past mistakes
- Apply successful patterns from similar tests
- Improve test case generation based on historical insights

## Page Interaction (PageAgent)
The page state shows interactive elements with index numbers:
```
[0]<button>Login</button>
[1]<input placeholder='Email'>
[2]<input type='password' placeholder='Password'>
[3]<a href='/signup'>Sign up</a>
```

To interact with elements:
- First call `get_page_state` to see all interactive elements with their indices
- Use `click_element` with the index: click_element(index=0) clicks the Login button
- Use `input_text` with index and text: input_text(index=1, text="user@example.com")
- Use `select_option` for dropdowns: select_option(index=5, option_text="United States")
- Use `scroll_page` if content is below/above the viewport

IMPORTANT: Always call `get_page_state` after navigation or major actions to see updated elements.

## Your workflow — follow these phases IN ORDER:

### Phase 1 — Requirement Analysis
First, output a brief analysis of the requirement including:
- Feature under test
- Test objectives  
- Acceptance criteria
- Edge cases to consider
This analysis will be shown to the user, so be clear and concise.

### Phase 2 — Test Case Generation
IMPORTANT: Call register_test_cases ONCE with ALL test cases in a single call.
Do NOT call register_test_cases multiple times — put all test cases in one array.
Generate the exact number of BDD test cases specified (3, 5, 20, or other).
Cover: happy path, negative cases, and edge cases proportionally.
Each needs: id (TC-001, TC-002, TC-003 format), title, description, steps ([{action, expected}]).

### Phase 3+4 — Execution + Validation (INTERLEAVED per test case)
For EACH test case, perform these steps IN ORDER before moving to the next test case:

  STEP A — Navigate: Use execute_browser_task to navigate to the target URL if needed.
  STEP B — Get State: Call get_page_state to see all interactive elements.
  STEP C — Interact: Use click_element, input_text, select_option based on test steps.
           After each interaction, call get_page_state again to see updated elements.
  STEP D — Screenshot: Call capture_screenshot after completing the test actions.
  STEP E — Validate: Call analyze_screenshot with:
             • expected_state = what the page should show for this test case to PASS
             • test_id = the TC-00N id of the test case (e.g. "TC-001")
             Do NOT pass screenshot_b64 — the system injects it automatically.

Important: Complete all steps for test case 1, then repeat for test case 2, etc.

### Phase 5 — Report
Call save_report with a detailed report_data object containing:
- test_outcomes: array of {test_id, title, verdict (PASS/FAIL/BLOCKED), details, steps_executed}
- quality_score: (passed/total*100 as a number)
- executive_summary: comprehensive summary string describing what was tested and key findings
- passed: number of passed tests
- failed: number of failed tests  
- blocked: number of blocked tests
- total_tests: total number of tests
- environment: {url, browser, timestamp}
- recommendations: array of improvement suggestions based on failures

## Rules
- Always call register_test_cases ONCE with ALL test cases in a single array.
- Use get_page_state before interacting with elements to get current indices.
- Use click_element, input_text, select_option with indices from get_page_state.
- If credentials are needed, call get_credentials first.
- Do NOT pass screenshot_b64 to analyze_screenshot — the system handles it automatically.
- Always pass test_id to analyze_screenshot (e.g. "TC-001") so the UI updates correctly.
- Complete ALL phases before finishing.

## Automatic Retry on Failure
If a test case FAILS after using PageAgent tools (click_element, input_text, etc.):
1. The analyze_screenshot response will include "can_retry_with_vision": true
2. You SHOULD retry that test case using execute_browser_task with natural language instructions
3. Example: If login failed with PageAgent, retry with:
   execute_browser_task(task="Click the username field, type 'standard_user', click password field, type 'secret_sauce', click Login button", target_url="https://saucedemo.com")
4. After vision retry, capture_screenshot and analyze_screenshot again
5. Report the final result (PASS if vision retry succeeded, FAIL if both methods failed)

## User messages during execution
If the user sends a message mid-run, check if it is:
- A QUESTION (ends with ?) → answer it concisely based on what you have done so far, then continue.
- An INSTRUCTION → incorporate it into your execution plan and continue."""

# ── Tool definitions ─────────────────────────────────────────────────────────

TOOL_REGISTER_TEST_CASES = {
    "name": "register_test_cases",
    "description": "Register generated test cases so they appear in the UI before execution begins.",
    "input_schema": {
        "type": "object",
        "properties": {
            "test_cases": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id":          {"type": "string"},
                        "title":       {"type": "string"},
                        "description": {"type": "string"},
                        "steps": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "action":   {"type": "string"},
                                    "expected": {"type": "string"},
                                },
                            },
                        },
                    },
                    "required": ["id", "title"],
                },
                "description": "List of BDD test cases to execute",
            }
        },
        "required": ["test_cases"],
    },
}

ALL_TOOLS = [
    TOOL_REGISTER_TEST_CASES,
    browser_tools.get_browser_tool_definition(),
    browser_tools.get_screenshot_tool_definition(),
    vision_tools.get_vision_tool_definition(),
    storage_tools.get_credential_tool_definition(),
    storage_tools.get_save_report_tool_definition(),
]

# PageAgent tools for indexed element interactions
PAGEAGENT_TOOLS = [
    pageagent_bridge.get_page_state_tool_definition(),
    pageagent_bridge.get_click_element_tool_definition(),
    pageagent_bridge.get_input_text_tool_definition(),
    pageagent_bridge.get_select_option_tool_definition(),
    pageagent_bridge.get_scroll_page_tool_definition(),
]


def _sid(session_id: str) -> str:
    return f"[{session_id[:8]}]"


class AetherTestOrchestrator:
    def __init__(self, ws_manager: WebSocketManager, session_svc: SessionService):
        self.ws = ws_manager
        self.session_svc = session_svc
        self.storage_svc = StorageService()
        self.recording_svc = RecordingService()
        self.memory_svc = get_memory_service()  # Always-on memory layer
        # Holds the most-recently captured screenshot so analyze_screenshot
        # can auto-inject it when Claude forgets to pass screenshot_b64.
        self._last_screenshot: str = ""
        # Track if complete message was already sent (to avoid duplicates)
        self._complete_sent: bool = False
        # Track test results for memory storage
        self._test_results: list[dict] = []
        self._test_cases: list[dict] = []
        self._current_requirement: str = ""
        self._current_target_url: str = ""

    # ── Memory Integration Methods ────────────────────────────────────────────

    async def _recall_relevant_memories(self, requirement: str, target_url: str) -> str:
        """Query memory for relevant past test sessions to inform current execution."""
        sid = "[memory]"
        try:
            # Search for memories related to this URL or similar requirements
            url_memories = self.memory_svc.search_memories(target_url, limit=5)
            req_memories = self.memory_svc.search_memories(requirement[:100], limit=5)
            
            # Combine and deduplicate
            seen_ids = set()
            relevant = []
            for m in url_memories + req_memories:
                if m.id not in seen_ids:
                    seen_ids.add(m.id)
                    relevant.append(m)
            
            if not relevant:
                logger.info(f"{sid} No relevant memories found")
                return ""
            
            # Format memories for context injection
            memory_context = "\n\n## LEARNINGS FROM PAST TEST SESSIONS:\n"
            for m in relevant[:5]:  # Limit to top 5
                memory_context += f"\n### Memory (importance: {m.importance:.1f}):\n"
                memory_context += f"- Summary: {m.summary}\n"
                if m.entities:
                    memory_context += f"- Entities: {', '.join(m.entities)}\n"
                if m.topics:
                    memory_context += f"- Topics: {', '.join(m.topics)}\n"
            
            memory_context += "\nUse these learnings to improve test generation and execution.\n"
            logger.info(f"{sid} Recalled {len(relevant)} relevant memories")
            return memory_context
            
        except Exception as e:
            logger.warning(f"{sid} Failed to recall memories: {e}")
            return ""

    async def _store_session_memory(
        self,
        session_id: str,
        requirement: str,
        target_url: str,
        test_cases: list[dict],
        test_results: list[dict],
        quality_score: float,
    ) -> None:
        """Store the test session in memory for future learning."""
        sid = _sid(session_id)
        try:
            # Calculate pass/fail stats
            passed = sum(1 for r in test_results if r.get("verdict") == "PASS")
            failed = sum(1 for r in test_results if r.get("verdict") == "FAIL")
            total = len(test_results) if test_results else len(test_cases)
            
            # Extract key learnings from failures
            failure_learnings = []
            for r in test_results:
                if r.get("verdict") == "FAIL":
                    failure_learnings.append(f"- {r.get('test_id', 'Unknown')}: {r.get('explanation', 'No details')[:100]}")
            
            # Build memory content
            raw_text = f"""Test Session for: {target_url}
Requirement: {requirement}
Results: {passed}/{total} passed ({quality_score:.0f}% quality)
Test Cases Generated: {len(test_cases)}
"""
            if failure_learnings:
                raw_text += f"\nFailure Learnings:\n" + "\n".join(failure_learnings[:5])
            
            # Generate summary
            summary = f"Tested '{requirement[:50]}...' on {target_url}. {passed}/{total} passed. "
            if failure_learnings:
                summary += f"Key issues: {failure_learnings[0][:50]}..."
            else:
                summary += "All tests passed successfully."
            
            # Extract entities (URL domain, key terms from requirement)
            from urllib.parse import urlparse
            domain = urlparse(target_url).netloc if target_url else ""
            entities = [domain] if domain else []
            
            # Extract topics from requirement
            topics = ["testing", "automation"]
            if "login" in requirement.lower():
                topics.append("authentication")
            if "search" in requirement.lower():
                topics.append("search")
            if "form" in requirement.lower():
                topics.append("forms")
            if "api" in requirement.lower():
                topics.append("api")
            
            # Calculate importance based on results
            importance = 0.5
            if failed > 0:
                importance = 0.8  # Failures are more important to remember
            if quality_score < 50:
                importance = 0.9  # Low quality sessions are critical learnings
            
            # Store in memory
            result = self.memory_svc.store_memory(
                raw_text=raw_text,
                summary=summary,
                entities=entities,
                topics=topics,
                importance=importance,
                source=f"session:{session_id[:8]}",
            )
            
            logger.info(f"{sid} Stored session in memory (id={result.get('memory_id')}, importance={importance})")
            
        except Exception as e:
            logger.warning(f"{sid} Failed to store session memory: {e}")

    async def _store_failure_memory(
        self,
        session_id: str,
        status: str,
        error_message: str,
    ) -> None:
        """Store failure information in memory so agent learns from errors."""
        sid = _sid(session_id)
        try:
            # Only store if we have meaningful context
            if not self._current_requirement and not self._current_target_url:
                logger.info(f"{sid} No context to store for failed session")
                return
            
            # Build failure memory
            raw_text = f"""FAILED Test Session for: {self._current_target_url}
Requirement: {self._current_requirement}
Status: {status}
Error: {error_message}
Test Cases Generated: {len(self._test_cases)}
Test Results Collected: {len(self._test_results)}
"""
            # Add any partial results
            if self._test_results:
                passed = sum(1 for r in self._test_results if r.get("verdict") == "PASS")
                failed = sum(1 for r in self._test_results if r.get("verdict") == "FAIL")
                raw_text += f"Partial Results: {passed} passed, {failed} failed before failure\n"
            
            summary = f"FAILED: '{self._current_requirement[:30]}...' on {self._current_target_url}. Error: {error_message[:50]}..."
            
            # Extract domain
            from urllib.parse import urlparse
            domain = urlparse(self._current_target_url).netloc if self._current_target_url else ""
            entities = [domain] if domain else []
            
            # High importance for failures - critical learnings
            result = self.memory_svc.store_memory(
                raw_text=raw_text,
                summary=summary,
                entities=entities,
                topics=["failure", "error", status],
                importance=0.95,  # Very high - failures are critical learnings
                source=f"session:{session_id[:8]}:failed",
            )
            
            logger.info(f"{sid} Stored failure in memory (id={result.get('memory_id')})")
            
        except Exception as e:
            logger.warning(f"{sid} Failed to store failure memory: {e}")

    async def _generate_partial_report(
        self,
        session_id: str,
        error_message: str,
    ) -> None:
        """Generate a partial report when pipeline fails mid-execution.
        
        This ensures users can see results for test cases that were executed
        before the failure (e.g., token expiry, network error).
        """
        sid = _sid(session_id)
        
        # Only generate if we have test cases or results
        if not self._test_cases and not self._test_results:
            logger.info(f"{sid} No test data to generate partial report")
            return
        
        try:
            logger.info(f"{sid} Generating partial report for {len(self._test_results)} executed tests out of {len(self._test_cases)} total")
            await self.ws.send_agent_update(session_id, "report-generator", "working", "Generating partial report due to pipeline error…")
            
            # Build test outcomes from tracked results
            test_outcomes = []
            executed_ids = {r.get("test_id") for r in self._test_results}
            
            # Add executed test results
            for result in self._test_results:
                test_outcomes.append({
                    "test_id": result.get("test_id", "Unknown"),
                    "title": self._get_test_title(result.get("test_id")),
                    "verdict": result.get("verdict", "UNKNOWN"),
                    "details": result.get("explanation", ""),
                    "steps_executed": "Completed before error",
                })
            
            # Mark remaining test cases as NOT_EXECUTED
            for tc in self._test_cases:
                tc_id = tc.get("id", "")
                if tc_id not in executed_ids:
                    test_outcomes.append({
                        "test_id": tc_id,
                        "title": tc.get("title", "Unknown"),
                        "verdict": "NOT_EXECUTED",
                        "details": f"Test not executed due to pipeline error: {error_message[:100]}",
                        "steps_executed": "None - pipeline failed before execution",
                    })
            
            # Calculate stats
            passed = sum(1 for t in test_outcomes if t.get("verdict") == "PASS")
            failed = sum(1 for t in test_outcomes if t.get("verdict") == "FAIL")
            blocked = sum(1 for t in test_outcomes if t.get("verdict") == "BLOCKED")
            not_executed = sum(1 for t in test_outcomes if t.get("verdict") == "NOT_EXECUTED")
            total = len(test_outcomes)
            executed = passed + failed + blocked
            
            # Quality score based on executed tests only
            quality_score = (passed / executed * 100) if executed > 0 else 0
            
            # Build report data
            report_data = {
                "test_outcomes": test_outcomes,
                "quality_score": quality_score,
                "executive_summary": (
                    f"⚠️ PARTIAL REPORT - Pipeline failed during execution.\n\n"
                    f"Error: {error_message}\n\n"
                    f"Executed {executed}/{total} test cases before failure.\n"
                    f"Results: {passed} passed, {failed} failed, {blocked} blocked, {not_executed} not executed.\n"
                    f"Quality score (based on executed tests): {quality_score:.0f}%"
                ),
                "passed": passed,
                "failed": failed,
                "blocked": blocked,
                "not_executed": not_executed,
                "total_tests": total,
                "executed_tests": executed,
                "environment": {
                    "url": self._current_target_url,
                    "browser": "Chrome (CDP)",
                    "timestamp": datetime.now().isoformat(),
                    "status": "PARTIAL - Pipeline Error",
                },
                "recommendations": [
                    f"Pipeline failed with error: {error_message[:200]}",
                    "Review executed test results above",
                    "Re-run the test session after resolving the error",
                    "If using session tokens, ensure credentials are refreshed before long test runs",
                ],
                "pipeline_error": {
                    "message": error_message,
                    "tests_executed": executed,
                    "tests_remaining": not_executed,
                },
            }
            
            # Save the partial report
            from ..database import _db_path
            import aiosqlite
            async with aiosqlite.connect(_db_path) as db:
                db.row_factory = aiosqlite.Row
                storage_tools.init_storage_tools(db, self.storage_svc, session_id)
                
                result = await storage_tools.handle_save_report({"report_data": report_data})
                inner = json.loads(result.get("content", "{}"))
                rep_id = inner.get("report_id", "")
                
                if rep_id:
                    logger.info(f"{sid} Partial report saved: {rep_id}")
                    
                    # Send report to frontend
                    await self.ws.send_report(session_id, rep_id, report_data)
                    
                    # Send completion with partial status
                    summary = f"⚠️ Partial results: {passed}/{executed} executed tests passed ({not_executed} not executed due to error)"
                    await self.ws.send_complete(session_id, summary, quality_score)
                    self._complete_sent = True
                    
                    await self.ws.send_agent_update(
                        session_id, "report-generator", "done",
                        f"Partial report saved — {passed}/{executed} passed, {not_executed} not executed"
                    )
                    
                    # Update session with report ID
                    await self.session_svc.update_session(
                        session_id, SessionUpdate(status="failed", report_id=rep_id)
                    )
                else:
                    logger.warning(f"{sid} Failed to save partial report")
                    
        except Exception as e:
            logger.warning(f"{sid} Failed to generate partial report: {e}")

    def _get_test_title(self, test_id: str) -> str:
        """Get test case title by ID from tracked test cases."""
        for tc in self._test_cases:
            if tc.get("id") == test_id:
                return tc.get("title", test_id)
        return test_id

    # ── Public entry point ────────────────────────────────────────────────────

    async def run(
        self,
        session_id: str,
        requirement: str,
        target_url: str,
        credential_name: Optional[str] = None,
        message_queue: Optional[asyncio.Queue] = None,
        test_case_count: int = 20,
    ) -> None:
        sid = _sid(session_id)
        logger.info(f"{sid} ═══ PIPELINE START ═══")
        logger.info(f"{sid} Requirement : {requirement}")
        logger.info(f"{sid} Target URL  : {target_url}")
        logger.info(f"{sid} Credential  : {credential_name or '(none)'}")

        await self.session_svc.update_session(session_id, SessionUpdate(status="running"))
        await self.ws.send_agent_update(session_id, "orchestrator", "working", "Starting STLC pipeline…")
        
        # Reset state for this pipeline run
        self._complete_sent = False
        self._last_screenshot = ""
        self._test_results = []
        self._test_cases = []
        self._current_requirement = requirement
        self._current_target_url = target_url

        # ── Start screen recording ─────────────────────────────────────────────
        rec_result = await self.recording_svc.start(session_id)
        rec_filename = rec_result.get("filename", "")
        if rec_filename:
            logger.info(f"{sid} Recording started: {rec_filename}")
            await self.ws.send_recording(session_id, "started", rec_filename)
        else:
            logger.warning(f"{sid} Recording not started: {rec_result.get('error', 'unknown')}")

        try:
            if not settings.aws_access_key_id or not settings.aws_secret_access_key:
                logger.warning(f"{sid} AWS credentials not set — running DEMO pipeline")
                await self._run_demo_pipeline(session_id, requirement, target_url, message_queue)
            else:
                await self._run_live_pipeline(session_id, requirement, target_url, credential_name, message_queue, test_case_count)
        except asyncio.CancelledError:
            logger.warning(f"{sid} Pipeline CANCELLED by user")
            # Generate partial report for any executed tests before cancellation
            await self._generate_partial_report(session_id, "Pipeline cancelled by user")
            if not self._complete_sent:
                await self.ws.send_cancelled(session_id)
                await self.session_svc.update_session(session_id, SessionUpdate(status="cancelled"))
            # Store partial learnings even on cancellation
            await self._store_failure_memory(session_id, "cancelled", "Pipeline cancelled by user")
            raise
        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            logger.exception(f"{sid} Pipeline FAILED — {error_msg}")
            # Generate partial report for any executed tests before failure
            await self._generate_partial_report(session_id, str(e))
            if not self._complete_sent:
                await self.ws.send_error(session_id, f"Pipeline error: {e}")
                await self.session_svc.update_session(session_id, SessionUpdate(status="failed"))
            # Store failure in memory so agent learns from errors
            await self._store_failure_memory(session_id, "failed", str(e))
        finally:
            # ── Stop recording in all exit paths ──────────────────────────────
            stop_result = await self.recording_svc.stop(session_id)
            stopped_file = stop_result.get("filename", rec_filename)
            if stopped_file:
                logger.info(f"{sid} Recording stopped: {stopped_file}")
                await self.ws.send_recording(session_id, "stopped", stopped_file)

    # ── Live pipeline (Anthropic SDK + browser-use) ───────────────────────────

    async def _run_live_pipeline(
        self,
        session_id: str,
        requirement: str,
        target_url: str,
        credential_name: Optional[str],
        message_queue: Optional[asyncio.Queue],
        test_case_count: int = 20,
    ) -> None:
        sid = _sid(session_id)
        logger.info(f"{sid} Starting LIVE pipeline with AWS Bedrock Converse API")
        
        # Debug: Log loaded credentials (masked)
        logger.info(f"{sid} AWS Access Key: {settings.aws_access_key_id[:10]}...{settings.aws_access_key_id[-4:] if len(settings.aws_access_key_id) > 14 else '****'}")
        logger.info(f"{sid} AWS Region: {settings.aws_region}")
        logger.info(f"{sid} Session Token Present: {bool(settings.aws_session_token)}")

        # Initialise storage tools for this session
        from ..database import _db_path
        import aiosqlite
        async with aiosqlite.connect(_db_path) as db:
            db.row_factory = aiosqlite.Row
            storage_tools.init_storage_tools(db, self.storage_svc, session_id)

            # Create Bedrock client with AWS credentials and SSL certificate
            import os
            
            # Determine CA bundle path (check environment variables or use default)
            ca_bundle = None
            for env_var in ['AWS_CA_BUNDLE', 'REQUESTS_CA_BUNDLE', 'SSL_CERT_FILE', 'CURL_CA_BUNDLE']:
                if os.environ.get(env_var):
                    ca_bundle = os.environ.get(env_var)
                    logger.info(f"{sid} Using CA bundle from {env_var}: {ca_bundle}")
                    break
            
            bedrock_config = Config(
                region_name=settings.aws_region,
                retries={'max_attempts': 3, 'mode': 'adaptive'}
            )
            
            session_kwargs = {
                'aws_access_key_id': settings.aws_access_key_id,
                'aws_secret_access_key': settings.aws_secret_access_key,
                'region_name': settings.aws_region
            }
            if settings.aws_session_token:
                session_kwargs['aws_session_token'] = settings.aws_session_token
            
            boto_session = boto3.Session(**session_kwargs)
            
            # Create client with CA bundle if available
            client_kwargs = {'config': bedrock_config}
            if ca_bundle and os.path.exists(ca_bundle):
                client_kwargs['verify'] = ca_bundle
                logger.info(f"{sid} Bedrock client using CA bundle: {ca_bundle}")
            
            bedrock_client = boto_session.client('bedrock-runtime', **client_kwargs)

            # ── Recall relevant memories from past sessions ────────────────────
            await self.ws.send_agent_update(session_id, "orchestrator", "working", "🧠 Recalling past learnings…")
            memory_context = await self._recall_relevant_memories(requirement, target_url)
            if memory_context:
                logger.info(f"{sid} Memory context injected into prompt")
                await self.ws.send_agent_update(session_id, "orchestrator", "working", "📚 Found relevant past experiences")

            cred_hint = f"\nStored credential name to use: {credential_name}" if credential_name else ""
            user_prompt = (
                f"Execute the full AetherTest STLC pipeline.\n\n"
                f"Requirement: {requirement}\n"
                f"Target URL: {target_url}{cred_hint}\n"
                f"Test case count: generate exactly {test_case_count} BDD test cases in Phase 2.\n"
                f"{memory_context}\n"
                f"Begin Phase 1 now."
            )

            messages: list[dict[str, Any]] = [{"role": "user", "content": [{"text": user_prompt}]}]
            turn = 0

            await self.ws.send_agent_update(session_id, "orchestrator", "working", "Connecting to Bedrock Claude…")
            
            # Activate requirement-analyst for Phase 1
            await self.ws.send_agent_update(
                session_id, "requirement-analyst", "working", 
                f"Analyzing requirement: {requirement[:100]}{'…' if len(requirement) > 100 else ''}"
            )

            while turn < settings.max_turns:
                turn += 1
                logger.info(f"{sid} ── Turn {turn} ──")

                # Inject any queued user messages (questions or instructions)
                pending = await self._drain_queue(message_queue)
                if pending:
                    parts = []
                    for m in pending:
                        if m.strip().endswith("?"):
                            parts.append(f"[User question] {m}")
                        else:
                            parts.append(f"[User instruction] {m}")
                    injection = "\n".join(parts)
                    logger.info(f"{sid} Injecting user message(s): {injection}")
                    messages.append({"role": "user", "content": [{"text": injection}]})
                    # Echo back to activity log so the user sees it was received
                    for m in pending:
                        await self.ws.send_agent_update(
                            session_id, "orchestrator", "working",
                            f"📩 Received: {m}"
                        )

                # Convert tools to Bedrock format
                # Include PageAgent tools if enabled
                tools_to_use = ALL_TOOLS.copy()
                if settings.pageagent_enabled:
                    tools_to_use.extend(PAGEAGENT_TOOLS)
                    logger.info(f"{sid} PageAgent tools enabled — {len(PAGEAGENT_TOOLS)} additional tools")
                
                bedrock_tools = self._convert_tools_to_bedrock_format(tools_to_use)
                
                # Call Bedrock Converse API with Nova Pro (Claude has explicit deny in IAM)
                # Nova Pro max tokens: 10,000
                response = await self._run_with_heartbeat(
                    session_id, "orchestrator", f"⏳ Thinking… (turn {turn})",
                    self._call_bedrock_converse(
                        bedrock_client,
                        model_id="amazon.nova-pro-v1:0",
                        messages=messages,
                        system=[{"text": ROOT_ORCHESTRATOR_PROMPT}],
                        tools=bedrock_tools,
                        max_tokens=8000
                    )
                )
                
                stop_reason = response.get('stopReason', 'unknown')
                output = response.get('output', {})
                message_content = output.get('message', {})
                content_blocks = message_content.get('content', [])
                
                logger.info(f"{sid} Response: stop_reason={stop_reason}, blocks={len(content_blocks)}")

                # Append assistant turn
                messages.append({"role": "assistant", "content": content_blocks})

                # Process content blocks
                tool_results = []
                for block in content_blocks:
                    if 'text' in block:
                        text = block['text'].strip()
                        if text:
                            logger.info(f"{sid} [text] {text[:150]}{'…' if len(text) > 150 else ''}")
                            agent = self._phase_from_text(text)
                            await self.ws.send_agent_update(session_id, agent, "working", text)

                    elif 'toolUse' in block:
                        tool_use = block['toolUse']
                        tool_name = tool_use['name']
                        tool_input = tool_use['input']
                        tool_use_id = tool_use['toolUseId']
                        
                        logger.info(f"{sid} [tool] → {tool_name}")
                        result_content = await self._dispatch_tool(session_id, tool_name, tool_input)
                        
                        tool_results.append({
                            "toolResult": {
                                "toolUseId": tool_use_id,
                                "content": [{"text": result_content}]
                            }
                        })

                if stop_reason == "end_turn":
                    logger.info(f"{sid} Pipeline reached end_turn — done")
                    break

                if stop_reason == "tool_use" and tool_results:
                    messages.append({"role": "user", "content": tool_results})
                else:
                    break

        # ── Pipeline completion: mark all agents as done ──────────────────────
        await self._finalize_pipeline(session_id)
        logger.info(f"{sid} ═══ LIVE PIPELINE COMPLETE ═══")

    async def _finalize_pipeline(self, session_id: str) -> None:
        """Mark all agents as done and send completion message to frontend."""
        sid = _sid(session_id)
        
        # Only send "Pipeline complete!" if we haven't already sent a completion message
        if not self._complete_sent:
            # Mark all agents as done (only needed when no report was saved)
            all_agents = [
                "orchestrator", "requirement-analyst", "test-case-architect",
                "browser-specialist", "monitor-validator", "report-generator"
            ]
            for agent in all_agents:
                await self.ws.send_agent_update(session_id, agent, "done", "")
            
            # Update session status
            await self.session_svc.update_session(session_id, SessionUpdate(status="completed"))
            
            # Send completion message
            await self.ws.send_agent_update(session_id, "orchestrator", "done", "Pipeline complete!")
            
            # Send complete event to frontend
            logger.info(f"{sid} Sending complete event (no report was generated)")
            await self.ws.send_complete(session_id, "Pipeline completed.", 0)
            self._complete_sent = True

    # ── Tool dispatcher ───────────────────────────────────────────────────────

    async def _dispatch_tool(self, session_id: str, tool_name: str, tool_input: dict) -> str:
        sid = _sid(session_id)

        if tool_name == "register_test_cases":
            cases = tool_input.get("test_cases", [])
            logger.info(f"{sid} [test-case-architect] registering {len(cases)} test cases")
            
            # Track test cases for memory storage
            self._test_cases = cases
            
            # Mark requirement-analyst as done (Phase 1 complete)
            await self.ws.send_agent_update(
                session_id, "requirement-analyst", "done",
                "Requirement analysis complete"
            )
            
            await self.ws.send_agent_update(
                session_id, "test-case-architect", "working",
                f"Registering {len(cases)} test cases…"
            )
            # Normalise for the frontend
            ui_cases = [
                {
                    "id":          tc.get("id", str(i)),
                    "title":       tc.get("title", f"TC{i:03d}"),
                    "description": tc.get("description", ""),
                    "status":      "pending",
                }
                for i, tc in enumerate(cases, 1)
            ]
            await self.ws.send_test_cases(session_id, ui_cases)
            await self.ws.send_agent_update(
                session_id, "test-case-architect", "done",
                f"Generated {len(cases)} test cases"
            )
            return json.dumps({"registered": len(cases)})

        elif tool_name == "execute_browser_task":
            task = tool_input.get("task", "")
            url  = tool_input.get("target_url", "")
            logger.info(f"{sid} [browser-specialist] execute_browser_task: {task!r} → {url}")
            await self.ws.send_agent_update(session_id, "browser-specialist", "working", f"Executing: {task}")
            await self.ws.send_browser_action(session_id, f"▶ {task}")
            result = await self._run_with_heartbeat(
                session_id, "browser-specialist", f"🌐 Browser running: {task[:80]}…",
                browser_tools.execute_browser_task_impl(task, url)
            )
            outcome = result.get("result", "Done")
            logger.info(f"{sid} [browser-specialist] result: {outcome[:120]}")
            await self.ws.send_browser_action(session_id, f"✓ {outcome[:200]}")
            await self.ws.send_agent_update(session_id, "browser-specialist", "done", outcome[:200])
            return json.dumps(result)

        elif tool_name == "capture_screenshot":
            logger.info(f"{sid} [monitor-validator] capture_screenshot")
            await self.ws.send_agent_update(session_id, "monitor-validator", "working", "Capturing screenshot…")
            result = await browser_tools.handle_capture_screenshot(tool_input)
            inner  = json.loads(result.get("content", "{}"))
            b64    = inner.get("screenshot_b64", "")
            if b64:
                logger.info(f"{sid} [monitor-validator] screenshot OK ({len(b64)} chars)")
                self._last_screenshot = b64
                await self.ws.send_browser_action(session_id, "Screenshot captured", b64)
                await self.storage_svc.save_screenshot(session_id, b64)
                # Return a tiny ack to Claude — never put the raw base64 in the
                # conversation history or every subsequent API call balloons in size.
                return json.dumps({"status": "captured", "ready": True})
            else:
                logger.warning(f"{sid} [monitor-validator] screenshot empty — {inner.get('error', '?')}")
                return json.dumps({"status": "error", "error": inner.get("error", "unknown")})

        elif tool_name == "analyze_screenshot":
            expected = tool_input.get("expected_state", "Page loaded and functioning correctly")
            # Auto-inject last screenshot if Claude forgot to pass screenshot_b64
            if not tool_input.get("screenshot_b64"):
                if self._last_screenshot:
                    logger.info(f"{sid} [monitor-validator] screenshot_b64 missing — injecting last captured screenshot")
                    tool_input = {**tool_input, "screenshot_b64": self._last_screenshot}
                else:
                    logger.warning(f"{sid} [monitor-validator] no screenshot available — capturing fresh")
                    ss = await browser_tools.handle_capture_screenshot({})
                    ss_inner = json.loads(ss.get("content", "{}"))
                    fresh_b64 = ss_inner.get("screenshot_b64", "")
                    if fresh_b64:
                        self._last_screenshot = fresh_b64
                        tool_input = {**tool_input, "screenshot_b64": fresh_b64}
                        await self.storage_svc.save_screenshot(session_id, fresh_b64)
            logger.info(f"{sid} [monitor-validator] analyze_screenshot — expected: {expected!r}")
            vision_src = "Bedrock Claude Haiku 4.5"  # Vision via Claude Haiku 4.5 on Bedrock
            await self.ws.send_agent_update(
                session_id, "monitor-validator", "working",
                f"Analysing screenshot with {vision_src}…"
            )
            result  = await self._run_with_heartbeat(
                session_id, "monitor-validator", "🔍 Vision AI analyzing screenshot…",
                vision_tools.handle_analyze_screenshot(tool_input)
            )
            inner   = json.loads(result.get("content", "{}"))
            verdict = inner.get("verdict", "UNKNOWN")
            explain = inner.get("explanation", "")
            source  = inner.get("source", "vision")
            test_id = tool_input.get("test_id", "current")
            logger.info(f"{sid} [monitor-validator] verdict={verdict} [{test_id}] via {source}: {explain[:100]}")
            
            # Track test result for memory storage
            self._test_results.append({
                "test_id": test_id,
                "verdict": verdict,
                "explanation": explain,
                "source": source,
                "method": tool_input.get("execution_method", "pageagent"),  # Track which method was used
            })
            
            await self.ws.send_monitor_result(session_id, test_id, verdict, explain)
            await self.ws.send_agent_update(
                session_id, "monitor-validator", "done",
                f"{verdict} [{source}]: {explain[:120]}"
            )
            
            # ── AUTO-RETRY WITH VISION IF PAGEAGENT TEST FAILED ────────────────
            # If test failed and was executed with PageAgent, suggest vision retry
            execution_method = tool_input.get("execution_method", "pageagent")
            if verdict == "FAIL" and execution_method == "pageagent" and settings.pageagent_enabled:
                logger.info(f"{sid} [monitor-validator] Test {test_id} FAILED with PageAgent — vision retry available")
                return json.dumps({
                    "verdict": verdict,
                    "explanation": explain,
                    "source": source,
                    "retry_hint": f"Test {test_id} failed using PageAgent. Consider retrying with execute_browser_task for vision-based execution which may handle this scenario better.",
                    "can_retry_with_vision": True
                })
            
            return result.get("content", "{}")

        elif tool_name == "get_credentials":
            name = tool_input.get("name", "?")
            logger.info(f"{sid} [browser-specialist] get_credentials: {name!r}")
            await self.ws.send_agent_update(
                session_id, "browser-specialist", "working", f"Retrieving credentials for '{name}'…"
            )
            result = await storage_tools.handle_get_credentials(tool_input)
            return result.get("content", "{}")

        elif tool_name == "save_report":
            logger.info(f"{sid} [report-generator] save_report")
            await self.ws.send_agent_update(session_id, "report-generator", "working", "Saving report…")
            result  = await storage_tools.handle_save_report(tool_input)
            inner   = json.loads(result.get("content", "{}"))
            rep_id  = inner.get("report_id", "")
            if rep_id:
                rd      = tool_input.get("report_data", {})

                # quality_score: Claude sometimes sends a string like "80%" or a dict
                raw_quality = rd.get("quality_score", 0)
                if isinstance(raw_quality, (int, float)):
                    quality = float(raw_quality)
                else:
                    # Strip trailing % and try to parse
                    try:
                        quality = float(str(raw_quality).replace("%", "").strip())
                    except ValueError:
                        quality = 0.0

                # Extract test outcomes for counting
                test_outcomes = rd.get("test_outcomes", [])
                if test_outcomes:
                    passed = sum(1 for t in test_outcomes if t.get("verdict") == "PASS")
                    failed = sum(1 for t in test_outcomes if t.get("verdict") == "FAIL")
                    blocked = sum(1 for t in test_outcomes if t.get("verdict") == "BLOCKED")
                    total = len(test_outcomes)
                    # Ensure these are in the report data
                    rd["passed"] = passed
                    rd["failed"] = failed
                    rd["blocked"] = blocked
                    rd["total_tests"] = total
                else:
                    passed = rd.get("passed", 0)
                    failed = rd.get("failed", 0)
                    blocked = rd.get("blocked", 0)
                    total = rd.get("total_tests", rd.get("total_test_cases", 0))

                # summary: prefer executive_summary, fall back to summary
                raw_summary = rd.get("executive_summary", rd.get("summary", ""))
                if isinstance(raw_summary, str) and raw_summary:
                    summary = raw_summary
                elif isinstance(raw_summary, dict):
                    # Flatten the dict into a readable string
                    summary = f"{passed}/{total} tests passed. Quality score: {quality:.0f}%."
                else:
                    summary = f"Test execution complete. {passed}/{total} tests passed. Quality score: {quality:.0f}%."

                logger.info(f"{sid} [report-generator] saved — quality={quality}% id={rep_id} (P:{passed}/F:{failed}/B:{blocked})")
                await self.ws.send_report(session_id, rep_id, rd)
                await self.ws.send_complete(session_id, summary, quality)
                self._complete_sent = True  # Mark complete as sent to avoid duplicate in _finalize_pipeline
                await self.ws.send_agent_update(
                    session_id, "report-generator", "done",
                    f"Report saved — {passed}/{total} passed, quality: {quality:.0f}%"
                )
                await self.session_svc.update_session(
                    session_id, SessionUpdate(status="completed", report_id=rep_id)
                )
                
                # ── Store session in memory for future learning ────────────────
                # Use tracked requirement and URL from pipeline start
                await self._store_session_memory(
                    session_id=session_id,
                    requirement=self._current_requirement,
                    target_url=self._current_target_url,
                    test_cases=self._test_cases,
                    test_results=self._test_results,
                    quality_score=quality,
                )
                await self.ws.send_agent_update(
                    session_id, "orchestrator", "done",
                    "🧠 Session stored in memory for future learning"
                )
            else:
                logger.warning(f"{sid} [report-generator] no report_id returned")
            return result.get("content", "{}")

        # ── PageAgent Tools (with Vision Fallback) ────────────────────────────
        elif tool_name == "get_page_state":
            logger.info(f"{sid} [browser-specialist] get_page_state")
            await self.ws.send_agent_update(session_id, "browser-specialist", "working", "Getting page state with indexed elements…")
            result = await pageagent_bridge.handle_get_page_state(tool_input)
            inner = json.loads(result.get("content", "{}"))
            if inner.get("success"):
                elem_count = inner.get("elementCount", 0)
                logger.info(f"{sid} [browser-specialist] page state: {elem_count} elements indexed")
                await self.ws.send_agent_update(session_id, "browser-specialist", "done", f"Found {elem_count} interactive elements")
                # Return formatted state for LLM
                content = inner.get("content", "")
                header = inner.get("header", "")
                footer = inner.get("footer", "")
                return json.dumps({"page_state": f"{header}\n\n{content}\n\n{footer}"})
            else:
                error = inner.get("error", "Unknown error")
                logger.warning(f"{sid} [browser-specialist] get_page_state failed: {error}")
                # Fallback: suggest using execute_browser_task for vision-based interaction
                return json.dumps({
                    "error": error,
                    "fallback_hint": "PageAgent failed to extract page state. Use execute_browser_task with natural language instructions for vision-based interaction."
                })

        elif tool_name == "click_element":
            index = tool_input.get("index", 0)
            element_desc = tool_input.get("element_description", f"element at index {index}")
            logger.info(f"{sid} [browser-specialist] click_element index={index}")
            await self.ws.send_agent_update(session_id, "browser-specialist", "working", f"Clicking element [{index}]…")
            await self.ws.send_browser_action(session_id, f"▶ Click element [{index}]")
            result = await pageagent_bridge.handle_click_element(tool_input)
            inner = json.loads(result.get("content", "{}"))
            msg = inner.get("message", "Done")
            
            if inner.get("success"):
                await self.ws.send_browser_action(session_id, f"✓ {msg}")
                await self.ws.send_agent_update(session_id, "browser-specialist", "done", msg)
                return result.get("content", "{}")
            else:
                # ── FALLBACK TO VISION ────────────────────────────────────────
                logger.warning(f"{sid} [browser-specialist] PageAgent click failed, falling back to vision…")
                await self.ws.send_browser_action(session_id, f"⚠ PageAgent failed, trying vision fallback…")
                await self.ws.send_agent_update(session_id, "browser-specialist", "working", "🔄 Retrying with vision-based click…")
                
                # Use browser-use with vision to click the element
                fallback_task = f"Click on the element: {element_desc}"
                fallback_result = await self._run_with_heartbeat(
                    session_id, "browser-specialist", f"🔍 Vision fallback: {fallback_task[:50]}…",
                    browser_tools.execute_browser_task_impl(fallback_task, self._current_target_url)
                )
                
                if fallback_result.get("success"):
                    await self.ws.send_browser_action(session_id, f"✓ Vision fallback succeeded")
                    await self.ws.send_agent_update(session_id, "browser-specialist", "done", "Click succeeded via vision fallback")
                    return json.dumps({"success": True, "message": "Click succeeded via vision fallback", "method": "vision"})
                else:
                    await self.ws.send_browser_action(session_id, f"✗ Both PageAgent and vision failed")
                    await self.ws.send_agent_update(session_id, "browser-specialist", "done", f"Failed: {msg}")
                    return json.dumps({"success": False, "message": f"PageAgent: {msg}. Vision fallback also failed.", "method": "both_failed"})

        elif tool_name == "input_text":
            index = tool_input.get("index", 0)
            text = tool_input.get("text", "")
            element_desc = tool_input.get("element_description", f"input field at index {index}")
            logger.info(f"{sid} [browser-specialist] input_text index={index} text={text[:30]}...")
            await self.ws.send_agent_update(session_id, "browser-specialist", "working", f"Typing into element [{index}]…")
            await self.ws.send_browser_action(session_id, f"▶ Input '{text[:20]}...' into [{index}]")
            result = await pageagent_bridge.handle_input_text(tool_input)
            inner = json.loads(result.get("content", "{}"))
            msg = inner.get("message", "Done")
            
            # Check for success AND verify no input verification failure
            if inner.get("success") and not inner.get("needs_vision_fallback"):
                await self.ws.send_browser_action(session_id, f"✓ {msg}")
                await self.ws.send_agent_update(session_id, "browser-specialist", "done", msg)
                return result.get("content", "{}")
            else:
                # ── FALLBACK TO VISION ────────────────────────────────────────
                # Trigger fallback if: action failed OR input verification failed
                reason = "input verification failed" if inner.get("needs_vision_fallback") else "action failed"
                logger.warning(f"{sid} [browser-specialist] PageAgent input {reason}, falling back to vision…")
                await self.ws.send_browser_action(session_id, f"⚠ PageAgent {reason}, trying vision fallback…")
                await self.ws.send_agent_update(session_id, "browser-specialist", "working", "🔄 Retrying with vision-based input…")
                
                fallback_task = f"Click on the {element_desc}, clear any existing text, and type exactly: {text}"
                fallback_result = await self._run_with_heartbeat(
                    session_id, "browser-specialist", f"🔍 Vision fallback: typing text…",
                    browser_tools.execute_browser_task_impl(fallback_task, self._current_target_url)
                )
                
                if fallback_result.get("success"):
                    await self.ws.send_browser_action(session_id, f"✓ Vision fallback succeeded")
                    await self.ws.send_agent_update(session_id, "browser-specialist", "done", "Input succeeded via vision fallback")
                    return json.dumps({"success": True, "message": "Input succeeded via vision fallback", "method": "vision"})
                else:
                    await self.ws.send_browser_action(session_id, f"✗ Both PageAgent and vision failed")
                    await self.ws.send_agent_update(session_id, "browser-specialist", "done", f"Failed: {msg}")
                    return json.dumps({"success": False, "message": f"PageAgent: {msg}. Vision fallback also failed.", "method": "both_failed"})

        elif tool_name == "select_option":
            index = tool_input.get("index", 0)
            option_text = tool_input.get("option_text", "")
            element_desc = tool_input.get("element_description", f"dropdown at index {index}")
            logger.info(f"{sid} [browser-specialist] select_option index={index} option={option_text}")
            await self.ws.send_agent_update(session_id, "browser-specialist", "working", f"Selecting '{option_text}' in [{index}]…")
            await self.ws.send_browser_action(session_id, f"▶ Select '{option_text}' in [{index}]")
            result = await pageagent_bridge.handle_select_option(tool_input)
            inner = json.loads(result.get("content", "{}"))
            msg = inner.get("message", "Done")
            
            if inner.get("success"):
                await self.ws.send_browser_action(session_id, f"✓ {msg}")
                await self.ws.send_agent_update(session_id, "browser-specialist", "done", msg)
                return result.get("content", "{}")
            else:
                # ── FALLBACK TO VISION ────────────────────────────────────────
                logger.warning(f"{sid} [browser-specialist] PageAgent select failed, falling back to vision…")
                await self.ws.send_browser_action(session_id, f"⚠ PageAgent failed, trying vision fallback…")
                await self.ws.send_agent_update(session_id, "browser-specialist", "working", "🔄 Retrying with vision-based select…")
                
                fallback_task = f"Select '{option_text}' from the {element_desc}"
                fallback_result = await self._run_with_heartbeat(
                    session_id, "browser-specialist", f"🔍 Vision fallback: selecting option…",
                    browser_tools.execute_browser_task_impl(fallback_task, self._current_target_url)
                )
                
                if fallback_result.get("success"):
                    await self.ws.send_browser_action(session_id, f"✓ Vision fallback succeeded")
                    await self.ws.send_agent_update(session_id, "browser-specialist", "done", "Select succeeded via vision fallback")
                    return json.dumps({"success": True, "message": "Select succeeded via vision fallback", "method": "vision"})
                else:
                    await self.ws.send_browser_action(session_id, f"✗ Both PageAgent and vision failed")
                    await self.ws.send_agent_update(session_id, "browser-specialist", "done", f"Failed: {msg}")
                    return json.dumps({"success": False, "message": f"PageAgent: {msg}. Vision fallback also failed.", "method": "both_failed"})

        elif tool_name == "scroll_page":
            direction = tool_input.get("direction", "down")
            amount = tool_input.get("amount", 500)
            logger.info(f"{sid} [browser-specialist] scroll_page direction={direction} amount={amount}")
            await self.ws.send_agent_update(session_id, "browser-specialist", "working", f"Scrolling {direction}…")
            await self.ws.send_browser_action(session_id, f"▶ Scroll {direction} {amount}px")
            result = await pageagent_bridge.handle_scroll_page(tool_input)
            inner = json.loads(result.get("content", "{}"))
            msg = inner.get("message", "Done")
            
            if inner.get("success"):
                await self.ws.send_browser_action(session_id, f"✓ {msg}")
                await self.ws.send_agent_update(session_id, "browser-specialist", "done", msg)
                return result.get("content", "{}")
            else:
                # ── FALLBACK TO VISION ────────────────────────────────────────
                logger.warning(f"{sid} [browser-specialist] PageAgent scroll failed, falling back to vision…")
                await self.ws.send_browser_action(session_id, f"⚠ PageAgent failed, trying vision fallback…")
                
                fallback_task = f"Scroll {direction} on the page"
                fallback_result = await self._run_with_heartbeat(
                    session_id, "browser-specialist", f"🔍 Vision fallback: scrolling…",
                    browser_tools.execute_browser_task_impl(fallback_task, self._current_target_url)
                )
                
                if fallback_result.get("success"):
                    await self.ws.send_browser_action(session_id, f"✓ Vision fallback succeeded")
                    return json.dumps({"success": True, "message": "Scroll succeeded via vision fallback", "method": "vision"})
                else:
                    await self.ws.send_browser_action(session_id, f"✗ {msg}")
                    return json.dumps({"success": False, "message": f"PageAgent: {msg}. Vision fallback also failed.", "method": "both_failed"})

        else:
            logger.warning(f"{sid} Unknown tool: {tool_name}")
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

    # ── Phase detection from text ─────────────────────────────────────────────

    @staticmethod
    def _phase_from_text(text: str) -> str:
        """Infer which agent label to show based on what Claude is narrating."""
        t = text.lower()
        if any(w in t for w in ["test case", "bdd", "scenario", "generate test"]):
            return "test-case-architect"
        if any(w in t for w in ["requirement", "acceptance criteria", "objective"]):
            return "requirement-analyst"
        if any(w in t for w in ["navigat", "click", "type", "fill", "submit", "browser"]):
            return "browser-specialist"
        if any(w in t for w in ["screenshot", "validat", "nemotron", "pass", "fail", "verdict"]):
            return "monitor-validator"
        if any(w in t for w in ["report", "quality score", "summary", "compile"]):
            return "report-generator"
        return "orchestrator"

    # ── Heartbeat helper ─────────────────────────────────────────────────────

    async def _heartbeat(self, session_id: str, agent: str, msg: str, interval: int = 8) -> None:
        """Send periodic 'still working' updates while a long operation runs."""
        try:
            while True:
                await asyncio.sleep(interval)
                await self.ws.send_agent_update(session_id, agent, "working", msg)
        except asyncio.CancelledError:
            pass

    async def _run_with_heartbeat(self, session_id: str, agent: str, msg: str, coro):
        """Await a coroutine while keeping the frontend alive with periodic messages."""
        hb = asyncio.create_task(self._heartbeat(session_id, agent, msg))
        try:
            return await coro
        finally:
            hb.cancel()
            await asyncio.gather(hb, return_exceptions=True)

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _drain_queue(self, queue: Optional[asyncio.Queue]) -> list:
        messages = []
        if queue:
            while not queue.empty():
                try:
                    messages.append(queue.get_nowait())
                except asyncio.QueueEmpty:
                    break
        return messages

    # ── Demo pipeline (no API key) ────────────────────────────────────────────

    async def _run_demo_pipeline(
        self,
        session_id: str,
        requirement: str,
        target_url: str,
        message_queue: Optional[asyncio.Queue] = None,
    ) -> None:
        import uuid
        sid = _sid(session_id)

        logger.info(f"{sid} ── DEMO 1/5: requirement-analyst ──")
        await self.ws.send_agent_update(session_id, "requirement-analyst", "working", "Analysing requirement…")
        await asyncio.sleep(1)
        for m in await self._drain_queue(message_queue):
            logger.info(f"{sid} [queue] {m!r}")
            await self.ws.send_agent_update(session_id, "orchestrator", "working", f"Noted: \"{m}\"")
        await self.ws.send_agent_update(
            session_id, "requirement-analyst", "done",
            f"Structured: testing '{requirement}' on {target_url}"
        )

        logger.info(f"{sid} ── DEMO 2/5: test-case-architect ──")
        await self.ws.send_agent_update(session_id, "test-case-architect", "working", "Generating test cases…")
        await asyncio.sleep(1)
        demo_cases = [
            {"id": str(uuid.uuid4()), "title": "Verify page loads successfully",  "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Verify main functionality works", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Verify error handling",           "status": "pending"},
        ]
        await self.ws.send_test_cases(session_id, demo_cases)
        logger.info(f"{sid} test-case-architect → {len(demo_cases)} cases")
        await self.ws.send_agent_update(
            session_id, "test-case-architect", "done",
            f"Generated {len(demo_cases)} test cases"
        )

        for i, tc in enumerate(demo_cases, 1):
            logger.info(f"{sid} ── DEMO 3/5: browser-specialist TC {i}/{len(demo_cases)} ──")
            await self.ws.send_agent_update(
                session_id, "browser-specialist", "working", f"Executing: {tc['title']}"
            )
            await asyncio.sleep(1.5)
            for m in await self._drain_queue(message_queue):
                logger.info(f"{sid} [queue] {m!r}")
                await self.ws.send_agent_update(session_id, "orchestrator", "working", f"Noted: \"{m}\"")
            await self.ws.send_browser_action(session_id, f"Navigating to {target_url}")
            await asyncio.sleep(1)

            logger.info(f"{sid} ── DEMO 4/5: monitor-validator TC {i} ──")
            await self.ws.send_agent_update(
                session_id, "monitor-validator", "working", "Validating with NVIDIA Nemotron…"
            )
            await asyncio.sleep(1)
            logger.info(f"{sid} TC {i} → PASS")
            await self.ws.send_monitor_result(session_id, tc["id"], "PASS", "Page loaded and elements visible")
            await self.ws.send_agent_update(session_id, "monitor-validator", "done", "PASS — elements visible")

        logger.info(f"{sid} ── DEMO 5/5: report-generator ──")
        report_id = str(uuid.uuid4())
        report = {
            "session_id":   session_id,
            "requirement":  requirement,
            "target_url":   target_url,
            "total_tests":  len(demo_cases),
            "passed":       len(demo_cases),
            "failed":       0,
            "blocked":      0,
            "quality_score": 100.0,
            "summary":      f"All {len(demo_cases)} tests passed. {target_url} meets requirements.",
        }
        await self.storage_svc.save_report(session_id, report)
        await self.ws.send_report(session_id, report_id, report)
        await self.ws.send_complete(session_id, report["summary"], 100.0)
        await self.session_svc.update_session(
            session_id, SessionUpdate(status="completed", report_id=report_id)
        )
        logger.info(f"{sid} ═══ DEMO COMPLETE — quality=100% ═══")


    # ── Bedrock Converse API helpers ─────────────────────────────────────────

    async def _call_bedrock_converse(
        self,
        client,
        model_id: str,
        messages: list,
        system: list,
        tools: list,
        max_tokens: int
    ) -> dict:
        """Call Bedrock Converse API asynchronously."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: client.converse(
                modelId=model_id,
                messages=messages,
                system=system,
                toolConfig={"tools": tools} if tools else None,
                inferenceConfig={"maxTokens": max_tokens}
            )
        )

    def _convert_tools_to_bedrock_format(self, tools: list) -> list:
        """Convert Anthropic tool format to Bedrock tool format."""
        bedrock_tools = []
        for tool in tools:
            bedrock_tool = {
                "toolSpec": {
                    "name": tool["name"],
                    "description": tool["description"],
                    "inputSchema": {
                        "json": tool["input_schema"]
                    }
                }
            }
            bedrock_tools.append(bedrock_tool)
        return bedrock_tools

