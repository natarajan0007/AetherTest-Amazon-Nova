"""Local storage and credential MCP tools."""
import json
import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Will be injected at orchestrator setup time
_db_conn = None
_storage_svc = None
_session_id = None


def init_storage_tools(db_conn, storage_svc, session_id: str):
    global _db_conn, _storage_svc, _session_id
    _db_conn = db_conn
    _storage_svc = storage_svc
    _session_id = session_id


def get_credential_tool_definition() -> dict:
    return {
        "name": "get_credentials",
        "description": "Retrieve stored credentials by name for use in browser automation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Credential set name (e.g. 'admin', 'test-user')",
                }
            },
            "required": ["name"],
        },
    }


async def handle_get_credentials(tool_input: dict) -> dict:
    from ..api.credentials import lookup_credential
    name = tool_input["name"]
    if _db_conn is None:
        return {"type": "tool_result", "content": json.dumps({"error": "DB not initialized"})}
    cred = await lookup_credential(_db_conn, name)
    if not cred:
        return {"type": "tool_result", "content": json.dumps({
            "error": f"Credential '{name}' not found in storage.",
            "instruction": "DO NOT retry this call. If credentials were provided in the user requirement text, use those values directly instead of calling get_credentials again."
        })}
    return {"type": "tool_result", "content": json.dumps(cred)}


def get_save_report_tool_definition() -> dict:
    return {
        "name": "save_report",
        "description": "Save the final test execution report to local storage with detailed test outcomes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "report_data": {
                    "type": "object",
                    "description": "The complete report data object",
                    "properties": {
                        "test_outcomes": {
                            "type": "array",
                            "description": "Array of test results with details",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "test_id": {"type": "string", "description": "Test case ID (e.g. TC-001)"},
                                    "title": {"type": "string", "description": "Test case title"},
                                    "verdict": {"type": "string", "enum": ["PASS", "FAIL", "BLOCKED"]},
                                    "details": {"type": "string", "description": "Detailed explanation of the result"},
                                    "steps_executed": {"type": "array", "items": {"type": "string"}}
                                },
                                "required": ["test_id", "verdict"]
                            }
                        },
                        "quality_score": {"type": "number", "description": "Quality score as percentage (0-100)"},
                        "executive_summary": {"type": "string", "description": "Comprehensive summary of test execution"},
                        "passed": {"type": "integer", "description": "Number of passed tests"},
                        "failed": {"type": "integer", "description": "Number of failed tests"},
                        "blocked": {"type": "integer", "description": "Number of blocked tests"},
                        "total_tests": {"type": "integer", "description": "Total number of tests"},
                        "environment": {
                            "type": "object",
                            "properties": {
                                "url": {"type": "string"},
                                "browser": {"type": "string"},
                                "timestamp": {"type": "string"}
                            }
                        },
                        "recommendations": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Improvement suggestions based on test results"
                        }
                    },
                    "required": ["test_outcomes", "quality_score", "executive_summary"]
                }
            },
            "required": ["report_data"],
        },
    }


async def handle_save_report(tool_input: dict) -> dict:
    report_data = tool_input["report_data"]
    report_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    report_data["created_at"] = now
    report_data["report_id"] = report_id

    if _storage_svc:
        sid = _session_id or report_data.get("session_id", "unknown")
        file_path = await _storage_svc.save_report(sid, report_data)
        report_data["file_path"] = file_path

    if _db_conn:
        sid = _session_id or report_data.get("session_id", "unknown")
        await _db_conn.execute(
            "INSERT OR REPLACE INTO reports (id, session_id, data, file_path, created_at) VALUES (?, ?, ?, ?, ?)",
            (report_id, sid, json.dumps(report_data), report_data.get("file_path"), now),
        )
        await _db_conn.commit()

    return {
        "type": "tool_result",
        "content": json.dumps({"report_id": report_id, "status": "saved"}),
    }
