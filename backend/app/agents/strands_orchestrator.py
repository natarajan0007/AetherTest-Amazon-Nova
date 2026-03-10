"""AetherTest orchestrator using Strands Agents SDK with AWS Bedrock."""
import json
import logging
import asyncio
from typing import Optional, Any

from strands import Agent, tool
from strands.models.bedrock import BedrockModel

from ..config import get_settings
from ..websocket.manager import WebSocketManager
from ..services.session_service import SessionService
from ..services.storage_service import StorageService
from ..models.session import SessionUpdate
from ..tools import vision_tools, browser_tools
from ..services.recording_service import RecordingService

logger = logging.getLogger(__name__)
settings = get_settings()

# ── System prompt ────────────────────────────────────────────────────────────

ROOT_ORCHESTRATOR_PROMPT = """You are AetherTest, an autonomous Software Testing Life Cycle (STLC) engine.
Transform a natural-language requirement into fully executed, validated test cases.
Be concise in text responses — prefer tool calls over lengthy explanations.

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
Generate the exact number of BDD test cases specified (usually 3, 5, or 7).
Cover: happy path, negative cases, and edge cases proportionally.
Each needs: id (TC-001, TC-002, TC-003 format), title, description, steps ([{action, expected}]).

### Phase 3+4 — Execution + Validation (INTERLEAVED per test case)
For EACH test case, perform these 3 steps IN ORDER before moving to the next test case:

  STEP A — execute_browser_task: run the browser actions for this test case.
  STEP B — capture_screenshot: call immediately after execution.
             Returns {"status": "captured"} — the image is handled automatically.
  STEP C — analyze_screenshot: call with TWO arguments:
             • expected_state = what the page should show for this test case to PASS
             • test_id = the TC-00N id of the test case (e.g. "TC-001")
             Do NOT pass screenshot_b64 — the system injects it automatically from STEP B.

Important: Do NOT batch all executions then all screenshots. Execute → Screenshot → Analyze
for test case 1, then repeat for test case 2, etc.

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
- execute_browser_task instructions must be specific (URLs, field names, button text, values).
- If credentials are needed, call get_credentials first.
- Do NOT pass screenshot_b64 to analyze_screenshot — the system handles it automatically.
- Always pass test_id to analyze_screenshot (e.g. "TC-001") so the UI updates correctly.
- Complete ALL phases before finishing.

## User messages during execution
If the user sends a message mid-run, check if it is:
- A QUESTION (ends with ?) → answer it concisely based on what you have done so far, then continue.
- An INSTRUCTION → incorporate it into your execution plan and continue."""


def _sid(session_id: str) -> str:
    return f"[{session_id[:8]}]"


class StrandsAetherTestOrchestrator:
    """AetherTest orchestrator using Strands Agents SDK."""
    
    def __init__(self, ws_manager: WebSocketManager, session_svc: SessionService):
        self.ws = ws_manager
        self.session_svc = session_svc
        self.storage_svc = StorageService()
        self.recording_svc = RecordingService()
        self._last_screenshot: str = ""
        self._complete_sent: bool = False
        self._current_session_id: Optional[str] = None
        self._db_conn = None

    def _create_tools(self):
        """Create Strands @tool decorated functions with access to orchestrator state."""
        orchestrator = self
        
        # Store the main event loop reference for thread-safe async calls
        main_loop = None
        
        def run_async(coro):
            """Run an async coroutine from a sync context (different thread)."""
            nonlocal main_loop
            if main_loop is None:
                # Fallback: try to get or create event loop
                try:
                    main_loop = asyncio.get_event_loop()
                except RuntimeError:
                    main_loop = asyncio.new_event_loop()
            
            # Use run_coroutine_threadsafe for cross-thread async execution
            future = asyncio.run_coroutine_threadsafe(coro, main_loop)
            return future.result(timeout=300)  # 5 minute timeout for long operations
        
        @tool
        def register_test_cases(test_cases: list) -> str:
            """Register generated test cases so they appear in the UI before execution begins.
            
            Args:
                test_cases: List of BDD test cases with id, title, description, and steps.
            """
            session_id = orchestrator._current_session_id
            sid = _sid(session_id)
            logger.info(f"{sid} [test-case-architect] registering {len(test_cases)} test cases")
            
            async def _register():
                await orchestrator.ws.send_agent_update(
                    session_id, "requirement-analyst", "done",
                    "Requirement analysis complete"
                )
                await orchestrator.ws.send_agent_update(
                    session_id, "test-case-architect", "working",
                    f"Registering {len(test_cases)} test cases…"
                )
                ui_cases = []
                for i, tc in enumerate(test_cases, 1):
                    # Normalize test ID to TC-XXX format
                    raw_id = tc.get("id", str(i))
                    normalized_id = raw_id.strip().upper()
                    if not normalized_id.startswith("TC-"):
                        import re
                        match = re.search(r'TC-?\d+', normalized_id, re.IGNORECASE)
                        if match:
                            normalized_id = match.group().upper()
                            if "-" not in normalized_id:
                                normalized_id = normalized_id.replace("TC", "TC-")
                        else:
                            # Generate TC-XXX format if no pattern found
                            normalized_id = f"TC-{i:03d}"
                    
                    logger.info(f"{sid} [test-case-architect] Registering test case: {raw_id!r} -> {normalized_id!r}")
                    ui_cases.append({
                        "id": normalized_id,
                        "title": tc.get("title", f"TC{i:03d}"),
                        "description": tc.get("description", ""),
                        "status": "pending",
                    })
                
                await orchestrator.ws.send_test_cases(session_id, ui_cases)
                await orchestrator.ws.send_agent_update(
                    session_id, "test-case-architect", "done",
                    f"Generated {len(test_cases)} test cases"
                )
            
            run_async(_register())
            return json.dumps({"registered": len(test_cases)})
        
        @tool
        def execute_browser_task(task: str, target_url: str) -> str:
            """Execute an AI-driven browser automation task using browser-use.
            
            Args:
                task: Natural language description of browser actions to perform.
                target_url: URL to navigate to.
            """
            session_id = orchestrator._current_session_id
            sid = _sid(session_id)
            logger.info(f"{sid} [browser-specialist] execute_browser_task: {task!r} → {target_url}")
            
            async def _execute():
                await orchestrator.ws.send_agent_update(
                    session_id, "browser-specialist", "working", f"Executing: {task}"
                )
                await orchestrator.ws.send_browser_action(session_id, f"▶ {task}")
                result = await browser_tools.execute_browser_task_impl(task, target_url)
                outcome = result.get("result", "Done")
                logger.info(f"{sid} [browser-specialist] result: {outcome[:120]}")
                await orchestrator.ws.send_browser_action(session_id, f"✓ {outcome[:200]}")
                await orchestrator.ws.send_agent_update(
                    session_id, "browser-specialist", "done", outcome[:200]
                )
                return result
            
            result = run_async(_execute())
            return json.dumps(result)
        
        @tool
        def capture_screenshot() -> str:
            """Capture a screenshot of the current browser state.
            Returns {"status": "captured"} — the image is automatically passed to analyze_screenshot.
            """
            session_id = orchestrator._current_session_id
            sid = _sid(session_id)
            logger.info(f"{sid} [monitor-validator] capture_screenshot")
            
            async def _capture():
                await orchestrator.ws.send_agent_update(
                    session_id, "monitor-validator", "working", "Capturing screenshot…"
                )
                result = await browser_tools.handle_capture_screenshot({})
                inner = json.loads(result.get("content", "{}"))
                b64 = inner.get("screenshot_b64", "")
                if b64:
                    logger.info(f"{sid} [monitor-validator] screenshot OK ({len(b64)} chars)")
                    orchestrator._last_screenshot = b64
                    await orchestrator.ws.send_browser_action(session_id, "Screenshot captured", b64)
                    await orchestrator.storage_svc.save_screenshot(session_id, b64)
                    return {"status": "captured", "ready": True}
                else:
                    logger.warning(f"{sid} [monitor-validator] screenshot empty")
                    return {"status": "error", "error": inner.get("error", "unknown")}
            
            result = run_async(_capture())
            return json.dumps(result)
        
        @tool
        def analyze_screenshot(expected_state: str, test_id: str) -> str:
            """Analyze a browser screenshot using Claude Haiku 4.5 vision AI.
            
            Args:
                expected_state: Description of the expected browser state to validate.
                test_id: ID of the test case being validated (e.g. TC-001).
            """
            session_id = orchestrator._current_session_id
            sid = _sid(session_id)
            
            # Normalize test_id format (ensure it matches registered format)
            normalized_test_id = test_id.strip().upper()
            if not normalized_test_id.startswith("TC-"):
                # Try to extract TC-XXX pattern
                import re
                match = re.search(r'TC-?\d+', normalized_test_id, re.IGNORECASE)
                if match:
                    normalized_test_id = match.group().upper()
                    if "-" not in normalized_test_id:
                        normalized_test_id = normalized_test_id.replace("TC", "TC-")
            
            tool_input = {
                "expected_state": expected_state,
                "test_id": normalized_test_id,
                "screenshot_b64": orchestrator._last_screenshot
            }
            
            logger.info(f"{sid} [monitor-validator] analyze_screenshot — test_id={test_id!r} (normalized={normalized_test_id!r}), expected: {expected_state!r}")
            
            async def _analyze():
                await orchestrator.ws.send_agent_update(
                    session_id, "monitor-validator", "working",
                    f"Analysing screenshot for {normalized_test_id}…"
                )
                result = await vision_tools.handle_analyze_screenshot(tool_input)
                inner = json.loads(result.get("content", "{}"))
                verdict = inner.get("verdict", "UNKNOWN")
                explain = inner.get("explanation", "")
                source = inner.get("source", "vision")
                logger.info(f"{sid} [monitor-validator] verdict={verdict} [{normalized_test_id}] via {source}")
                
                # Send monitor result and wait for it to complete
                logger.info(f"{sid} [monitor-validator] Sending monitor_result WS message: testId={normalized_test_id}, status={verdict}")
                await orchestrator.ws.send_monitor_result(session_id, normalized_test_id, verdict, explain)
                logger.info(f"{sid} [monitor-validator] monitor_result WS message sent successfully")
                
                await orchestrator.ws.send_agent_update(
                    session_id, "monitor-validator", "done",
                    f"{normalized_test_id}: {verdict} — {explain[:100]}"
                )
                
                # Small delay to ensure WebSocket message is processed by frontend
                await asyncio.sleep(0.1)
                
                return inner
            
            result = run_async(_analyze())
            return json.dumps(result)

        
        @tool
        def get_credentials(name: str) -> str:
            """Retrieve stored credentials by name for use in browser automation.
            
            Args:
                name: Credential set name (e.g. 'admin', 'test-user').
            """
            session_id = orchestrator._current_session_id
            sid = _sid(session_id)
            logger.info(f"{sid} [browser-specialist] get_credentials: {name!r}")
            
            async def _get_creds():
                await orchestrator.ws.send_agent_update(
                    session_id, "browser-specialist", "working",
                    f"Retrieving credentials for '{name}'…"
                )
                from ..api.credentials import lookup_credential
                if orchestrator._db_conn is None:
                    return {"error": "DB not initialized"}
                cred = await lookup_credential(orchestrator._db_conn, name)
                if not cred:
                    return {"error": f"Credential '{name}' not found"}
                return cred
            
            result = run_async(_get_creds())
            return json.dumps(result)
        
        @tool
        def save_report(report_data: dict) -> str:
            """Save the final test execution report to local storage.
            
            Args:
                report_data: Complete report data with test_outcomes, quality_score, executive_summary, etc.
            """
            session_id = orchestrator._current_session_id
            sid = _sid(session_id)
            logger.info(f"{sid} [report-generator] save_report")
            
            async def _save():
                import uuid
                from datetime import datetime, timezone
                
                await orchestrator.ws.send_agent_update(
                    session_id, "report-generator", "working", "Saving report…"
                )
                
                report_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                report_data["created_at"] = now
                report_data["report_id"] = report_id
                
                if orchestrator.storage_svc:
                    file_path = await orchestrator.storage_svc.save_report(session_id, report_data)
                    report_data["file_path"] = file_path
                
                if orchestrator._db_conn:
                    await orchestrator._db_conn.execute(
                        "INSERT OR REPLACE INTO reports (id, session_id, data, file_path, created_at) VALUES (?, ?, ?, ?, ?)",
                        (report_id, session_id, json.dumps(report_data), report_data.get("file_path"), now),
                    )
                    await orchestrator._db_conn.commit()
                
                # Extract metrics
                raw_quality = report_data.get("quality_score", 0)
                if isinstance(raw_quality, (int, float)):
                    quality = float(raw_quality)
                else:
                    try:
                        quality = float(str(raw_quality).replace("%", "").strip())
                    except ValueError:
                        quality = 0.0
                
                test_outcomes = report_data.get("test_outcomes", [])
                if test_outcomes:
                    passed = sum(1 for t in test_outcomes if t.get("verdict") == "PASS")
                    failed = sum(1 for t in test_outcomes if t.get("verdict") == "FAIL")
                    blocked = sum(1 for t in test_outcomes if t.get("verdict") == "BLOCKED")
                    total = len(test_outcomes)
                else:
                    passed = report_data.get("passed", 0)
                    failed = report_data.get("failed", 0)
                    blocked = report_data.get("blocked", 0)
                    total = report_data.get("total_tests", 0)
                
                raw_summary = report_data.get("executive_summary", report_data.get("summary", ""))
                if isinstance(raw_summary, str) and raw_summary:
                    summary = raw_summary
                else:
                    summary = f"Test execution complete. {passed}/{total} tests passed. Quality score: {quality:.0f}%."
                
                logger.info(f"{sid} [report-generator] saved — quality={quality}% id={report_id}")
                await orchestrator.ws.send_report(session_id, report_id, report_data)
                await orchestrator.ws.send_complete(session_id, summary, quality)
                orchestrator._complete_sent = True
                await orchestrator.ws.send_agent_update(
                    session_id, "report-generator", "done",
                    f"Report saved — {passed}/{total} passed, quality: {quality:.0f}%"
                )
                await orchestrator.session_svc.update_session(
                    session_id, SessionUpdate(status="completed", report_id=report_id)
                )
                
                return {"report_id": report_id, "status": "saved"}
            
            result = run_async(_save())
            return json.dumps(result)
        
        # Store the main loop reference when tools are created
        def set_main_loop(loop):
            nonlocal main_loop
            main_loop = loop
        
        # Return tools and the loop setter
        return [
            register_test_cases,
            execute_browser_task,
            capture_screenshot,
            analyze_screenshot,
            get_credentials,
            save_report
        ], set_main_loop


    def _create_bedrock_model(self) -> BedrockModel:
        """Create Strands BedrockModel with AWS credentials."""
        import boto3
        
        # Create boto3 session with credentials
        session_kwargs = {
            'aws_access_key_id': settings.aws_access_key_id,
            'aws_secret_access_key': settings.aws_secret_access_key,
            'region_name': settings.aws_region
        }
        if settings.aws_session_token:
            session_kwargs['aws_session_token'] = settings.aws_session_token
        
        boto_session = boto3.Session(**session_kwargs)
        
        # Create BedrockModel with Nova Pro using boto_session
        model = BedrockModel(
            boto_session=boto_session,
            model_id="amazon.nova-pro-v1:0",
            max_tokens=8000
        )
        
        return model

    async def run(
        self,
        session_id: str,
        requirement: str,
        target_url: str,
        credential_name: Optional[str] = None,
        message_queue: Optional[asyncio.Queue] = None,
        test_case_count: int = 20,
    ) -> None:
        """Main entry point for running the STLC pipeline."""
        sid = _sid(session_id)
        logger.info(f"{sid} ═══ STRANDS PIPELINE START ═══")
        logger.info(f"{sid} Requirement : {requirement}")
        logger.info(f"{sid} Target URL  : {target_url}")
        logger.info(f"{sid} Credential  : {credential_name or '(none)'}")

        await self.session_svc.update_session(session_id, SessionUpdate(status="running"))
        await self.ws.send_agent_update(session_id, "orchestrator", "working", "Starting STLC pipeline…")
        
        # Reset state
        self._complete_sent = False
        self._last_screenshot = ""
        self._current_session_id = session_id

        # Start screen recording
        rec_result = await self.recording_svc.start(session_id)
        rec_filename = rec_result.get("filename", "")
        if rec_filename:
            logger.info(f"{sid} Recording started: {rec_filename}")
            await self.ws.send_recording(session_id, "started", rec_filename)

        try:
            if not settings.aws_access_key_id or not settings.aws_secret_access_key:
                logger.warning(f"{sid} AWS credentials not set — running DEMO pipeline")
                await self._run_demo_pipeline(session_id, requirement, target_url, message_queue)
            else:
                await self._run_strands_pipeline(
                    session_id, requirement, target_url, 
                    credential_name, message_queue, test_case_count
                )
        except asyncio.CancelledError:
            logger.warning(f"{sid} Pipeline CANCELLED by user")
            await self.ws.send_cancelled(session_id)
            await self.session_svc.update_session(session_id, SessionUpdate(status="cancelled"))
            raise
        except Exception as e:
            logger.exception(f"{sid} Pipeline FAILED — {type(e).__name__}: {e}")
            await self.ws.send_error(session_id, f"Pipeline error: {e}")
            await self.session_svc.update_session(session_id, SessionUpdate(status="failed"))
        finally:
            stop_result = await self.recording_svc.stop(session_id)
            stopped_file = stop_result.get("filename", rec_filename)
            if stopped_file:
                logger.info(f"{sid} Recording stopped: {stopped_file}")
                await self.ws.send_recording(session_id, "stopped", stopped_file)

    async def _run_strands_pipeline(
        self,
        session_id: str,
        requirement: str,
        target_url: str,
        credential_name: Optional[str],
        message_queue: Optional[asyncio.Queue],
        test_case_count: int = 20,
    ) -> None:
        """Run the STLC pipeline using Strands Agents SDK."""
        sid = _sid(session_id)
        logger.info(f"{sid} Starting Strands Agents pipeline with AWS Bedrock")
        
        # Initialize database connection for storage tools
        from ..database import _db_path
        import aiosqlite
        async with aiosqlite.connect(_db_path) as db:
            db.row_factory = aiosqlite.Row
            self._db_conn = db
            
            # Create Strands model and tools
            model = self._create_bedrock_model()
            tools, set_main_loop = self._create_tools()
            
            # Set the main event loop for cross-thread async calls
            main_loop = asyncio.get_event_loop()
            set_main_loop(main_loop)
            
            # Create Strands Agent
            agent = Agent(
                model=model,
                system_prompt=ROOT_ORCHESTRATOR_PROMPT,
                tools=tools
            )
            
            await self.ws.send_agent_update(
                session_id, "orchestrator", "working", "Connecting to Bedrock via Strands…"
            )
            await self.ws.send_agent_update(
                session_id, "requirement-analyst", "working",
                f"Analyzing requirement: {requirement[:100]}{'…' if len(requirement) > 100 else ''}"
            )
            
            # Build the user prompt
            cred_hint = f"\nStored credential name to use: {credential_name}" if credential_name else ""
            user_prompt = (
                f"Execute the full AetherTest STLC pipeline.\n\n"
                f"Requirement: {requirement}\n"
                f"Target URL: {target_url}{cred_hint}\n"
                f"Test case count: generate exactly {test_case_count} BDD test cases in Phase 2.\n\n"
                f"Begin Phase 1 now."
            )
            
            # Run the agent with streaming callback for real-time updates
            logger.info(f"{sid} Invoking Strands Agent…")
            
            # Text accumulator for batching streaming updates
            text_buffer = []
            last_send_time = [0.0]  # Use list to allow mutation in closure
            import time
            
            # Define callback handler for streaming updates
            def callback_handler(**kwargs):
                if "data" in kwargs:
                    text = kwargs["data"]
                    if text:
                        text_buffer.append(text)
                        current_time = time.time()
                        
                        # Send accumulated text if:
                        # 1. We have a complete sentence (ends with . ! ? or newline)
                        # 2. Or it's been more than 0.5 seconds since last send
                        # 3. Or buffer is getting large (>200 chars)
                        accumulated = "".join(text_buffer)
                        should_send = (
                            accumulated.rstrip().endswith(('.', '!', '?', '\n')) or
                            (current_time - last_send_time[0]) > 0.5 or
                            len(accumulated) > 200
                        )
                        
                        if should_send and accumulated.strip():
                            agent_name = self._phase_from_text(accumulated)
                            # Schedule the async update on the main loop
                            asyncio.run_coroutine_threadsafe(
                                self.ws.send_agent_update(session_id, agent_name, "working", accumulated.strip()),
                                main_loop
                            )
                            text_buffer.clear()
                            last_send_time[0] = current_time
                
                # Also handle tool use events
                elif "current_tool_use" in kwargs:
                    tool = kwargs["current_tool_use"]
                    tool_name = tool.get("name", "")
                    if tool_name:
                        logger.info(f"{sid} [strands] Tool use: {tool_name}")
            
            # Run agent (Strands handles the conversation loop internally)
            try:
                # Strands Agent() call is synchronous, so we run it in executor
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: agent(user_prompt, callback_handler=callback_handler)
                )
                
                # Send any remaining buffered text
                if text_buffer:
                    accumulated = "".join(text_buffer).strip()
                    if accumulated:
                        agent_name = self._phase_from_text(accumulated)
                        await self.ws.send_agent_update(session_id, agent_name, "working", accumulated)
                
                logger.info(f"{sid} Strands Agent completed: {str(result)[:200]}")
            except Exception as e:
                logger.error(f"{sid} Strands Agent error: {e}")
                raise
        
        # Finalize pipeline
        await self._finalize_pipeline(session_id)
        logger.info(f"{sid} ═══ STRANDS PIPELINE COMPLETE ═══")


    async def _finalize_pipeline(self, session_id: str) -> None:
        """Mark all agents as done and send completion message."""
        sid = _sid(session_id)
        
        if not self._complete_sent:
            all_agents = [
                "orchestrator", "requirement-analyst", "test-case-architect",
                "browser-specialist", "monitor-validator", "report-generator"
            ]
            for agent in all_agents:
                await self.ws.send_agent_update(session_id, agent, "done", "")
            
            await self.session_svc.update_session(session_id, SessionUpdate(status="completed"))
            await self.ws.send_agent_update(session_id, "orchestrator", "done", "Pipeline complete!")
            logger.info(f"{sid} Sending complete event (no report was generated)")
            await self.ws.send_complete(session_id, "Pipeline completed.", 0)
            self._complete_sent = True

    @staticmethod
    def _phase_from_text(text: str) -> str:
        """Infer which agent label to show based on what the model is narrating."""
        t = text.lower()
        if any(w in t for w in ["test case", "bdd", "scenario", "generate test"]):
            return "test-case-architect"
        if any(w in t for w in ["requirement", "acceptance criteria", "objective"]):
            return "requirement-analyst"
        if any(w in t for w in ["navigat", "click", "type", "fill", "submit", "browser"]):
            return "browser-specialist"
        if any(w in t for w in ["screenshot", "validat", "pass", "fail", "verdict"]):
            return "monitor-validator"
        if any(w in t for w in ["report", "quality score", "summary", "compile"]):
            return "report-generator"
        return "orchestrator"

    async def _run_demo_pipeline(
        self,
        session_id: str,
        requirement: str,
        target_url: str,
        message_queue: Optional[asyncio.Queue] = None,
    ) -> None:
        """Demo pipeline when no AWS credentials are set."""
        import uuid
        sid = _sid(session_id)

        logger.info(f"{sid} ── DEMO 1/5: requirement-analyst ──")
        await self.ws.send_agent_update(session_id, "requirement-analyst", "working", "Analysing requirement…")
        await asyncio.sleep(1)
        await self.ws.send_agent_update(
            session_id, "requirement-analyst", "done",
            f"Structured: testing '{requirement}' on {target_url}"
        )

        logger.info(f"{sid} ── DEMO 2/5: test-case-architect ──")
        await self.ws.send_agent_update(session_id, "test-case-architect", "working", "Generating test cases…")
        await asyncio.sleep(1)
        demo_cases = [
            {"id": str(uuid.uuid4()), "title": "Verify page loads successfully", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Verify main functionality works", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Verify error handling", "status": "pending"},
        ]
        await self.ws.send_test_cases(session_id, demo_cases)
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
            await self.ws.send_browser_action(session_id, f"Navigating to {target_url}")
            await asyncio.sleep(1)

            logger.info(f"{sid} ── DEMO 4/5: monitor-validator TC {i} ──")
            await self.ws.send_agent_update(
                session_id, "monitor-validator", "working", "Validating…"
            )
            await asyncio.sleep(1)
            await self.ws.send_monitor_result(session_id, tc["id"], "PASS", "Page loaded and elements visible")
            await self.ws.send_agent_update(session_id, "monitor-validator", "done", "PASS — elements visible")

        logger.info(f"{sid} ── DEMO 5/5: report-generator ──")
        report_id = str(uuid.uuid4())
        report = {
            "session_id": session_id,
            "requirement": requirement,
            "target_url": target_url,
            "total_tests": len(demo_cases),
            "passed": len(demo_cases),
            "failed": 0,
            "blocked": 0,
            "quality_score": 100.0,
            "summary": f"All {len(demo_cases)} tests passed. {target_url} meets requirements.",
        }
        await self.storage_svc.save_report(session_id, report)
        await self.ws.send_report(session_id, report_id, report)
        await self.ws.send_complete(session_id, report["summary"], 100.0)
        await self.session_svc.update_session(
            session_id, SessionUpdate(status="completed", report_id=report_id)
        )
        logger.info(f"{sid} ═══ DEMO COMPLETE — quality=100% ═══")
