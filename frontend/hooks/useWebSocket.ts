"use client";
import { useEffect, useRef, useCallback } from "react";
import { useTestStore } from "@/store/testStore";
import { useSessionsStore } from "@/store/sessionsStore";
import type { AgentName } from "@/store/testStore";
import type { SessionSnapshot } from "@/store/sessionsStore";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8001";
const MAX_RECONNECT_DELAY = 16_000;
const PING_INTERVAL       = 25_000;

/** Build a full snapshot from current testStore state for history persistence. */
function buildSnapshot(
  status: SessionSnapshot["status"],
  qualityScore: number | null,
): SessionSnapshot | null {
  const s = useTestStore.getState();
  if (!s.sessionId) return null;
  return {
    sessionId:         s.sessionId,
    requirement:       s.requirement,
    targetUrl:         s.targetUrl,
    status,
    completedAt:       new Date().toISOString(),
    qualityScore,
    testCount:         s.testCases.length,
    passedCount:       s.testCases.filter((t) => t.status === "passed").length,
    reportId:          s.report?.reportId ?? undefined,
    recordingFilename: s.recordingFilename,
    messages:          s.messages,
    testCases:         s.testCases,
    agents:            s.agents,
    summary:           s.summary,
    report:            s.report,
  };
}

export function useWebSocket(sessionId: string | null) {
  const wsRef           = useRef<WebSocket | null>(null);
  const reconnectDelay  = useRef(1_000);
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmounted       = useRef(false);

  const {
    setConnected, updateAgent, setTestCases, addTestCases, updateTestCase,
    addBrowserAction, addMonitorResult, setReport, setComplete,
    addMessage, setStatus, setRecording,
  } = useTestStore();

  const handleMessage = useCallback(
    (raw: string) => {
      if (raw === "pong") return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case "agent_update": {
          const agent   = msg.agent as AgentName;
          const status  = msg.status as "working" | "done" | "error";
          const message = (msg.message as string) ?? "";
          updateAgent(agent, status, message);
          // Only add non-empty messages to chat
          if (message.trim()) {
            addMessage("agent", message, agent);
          }
          break;
        }
        case "test_cases": {
          const cases = (msg.testCases as Array<Record<string, unknown>>).map((tc) => ({
            id:          tc.id as string,
            title:       tc.title as string,
            description: tc.description as string | undefined,
            status:      "pending" as const,
          }));
          // Use addTestCases to accumulate instead of replace
          addTestCases(cases);
          break;
        }
        case "browser_action": {
          addBrowserAction(msg.action as string, msg.screenshot as string | undefined);
          break;
        }
        case "monitor_result": {
          const testId = msg.testId as string;
          const status = msg.status as "PASS" | "FAIL" | "BLOCKED";
          const evidence = msg.evidence as string;
          
          console.log(`[WS] monitor_result received: testId=${testId}, status=${status}`);
          console.log(`[WS] Current test cases:`, useTestStore.getState().testCases.map(tc => tc.id));
          
          addMonitorResult({
            testId,
            status,
            evidence,
            timestamp: Date.now(),
          });
          
          const newStatus = status === "PASS" ? "passed" : status === "FAIL" ? "failed" : "blocked";
          console.log(`[WS] Calling updateTestCase(${testId}, { status: ${newStatus} })`);
          updateTestCase(testId, {
            status: newStatus,
            evidence,
          });
          
          // Log the updated state
          setTimeout(() => {
            console.log(`[WS] After update, test cases:`, useTestStore.getState().testCases.map(tc => ({ id: tc.id, status: tc.status })));
          }, 100);
          break;
        }
        case "report": {
          setReport(msg.reportId as string, msg.data as Record<string, unknown>);
          break;
        }
        case "complete": {
          // Check if already completed to avoid duplicate processing
          const currentStatus = useTestStore.getState().status;
          if (currentStatus === "completed") {
            break; // Already processed complete message
          }
          
          // Mark any still-working agents as done
          const storeNow = useTestStore.getState();
          Object.entries(storeNow.agents).forEach(([name, agent]) => {
            if (agent.status === "working") {
              updateAgent(name as AgentName, "done", agent.lastMessage);
            }
          });
          const score = msg.qualityScore as number ?? null;
          setComplete(msg.summary as string, score ?? 0);

          // Save full snapshot — after a short tick so setComplete/setReport have flushed
          setTimeout(() => {
            const snap = buildSnapshot("completed", score);
            if (snap) useSessionsStore.getState().addOrUpdateSession(snap);
          }, 50);
          break;
        }
        case "error": {
          addMessage("agent", `Error: ${msg.message}`, "orchestrator");
          setStatus("failed");
          setTimeout(() => {
            const snap = buildSnapshot("failed", null);
            if (snap) useSessionsStore.getState().addOrUpdateSession(snap);
          }, 50);
          break;
        }
        case "cancelled": {
          addMessage("agent", "Test stopped by user.", "orchestrator");
          setStatus("cancelled");
          setTimeout(() => {
            const snap = buildSnapshot("cancelled", null);
            if (snap) useSessionsStore.getState().addOrUpdateSession(snap);
          }, 50);
          break;
        }
        case "user_chat": { /* already added optimistically — skip duplicate */ break; }
        case "recording": {
          const filename = (msg.filename as string) ?? null;
          const currentRecording = useTestStore.getState().recordingFilename;
          
          if (msg.event === "started") {
            // Only add message if not already recording
            if (!currentRecording) {
              setRecording(filename);
              addMessage("agent", "🎬 Screen recording started.", "orchestrator");
            }
          } else if (msg.event === "stopped" && filename) {
            // Only add message if this is a new recording filename
            if (currentRecording !== filename) {
              setRecording(filename);
              addMessage("agent", `🎬 Recording saved: ${filename}`, "orchestrator");
              // Update snapshot with recording filename once it arrives
              setTimeout(() => {
                const snap = buildSnapshot(
                  useTestStore.getState().status as SessionSnapshot["status"],
                  useTestStore.getState().qualityScore,
                );
                if (snap) useSessionsStore.getState().addOrUpdateSession(snap);
              }, 50);
            }
          }
          break;
        }
        default: break;
      }
    },
    [updateAgent, setTestCases, addTestCases, updateTestCase, addBrowserAction, addMonitorResult,
     setReport, setComplete, addMessage, setStatus, setRecording]
  );

  const connect = useCallback(() => {
    if (!sessionId || unmounted.current) return;

    const url = `${WS_URL}/ws/${sessionId}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      setConnected(true);
      reconnectDelay.current = 1_000;

      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_INTERVAL);
    };

    ws.onmessage = (e) => handleMessage(e.data);
    ws.onerror   = () => { /* onclose fires too */ };

    ws.onclose = () => {
      if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
      setConnected(false);
      wsRef.current = null;

      if (!unmounted.current && sessionId) {
        const delay = reconnectDelay.current;
        reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
        reconnectTimer.current = setTimeout(() => { if (!unmounted.current) connect(); }, delay);
      }
    };
  }, [sessionId, handleMessage, setConnected]);

  useEffect(() => {
    if (!sessionId) return;
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pingTimer.current)      clearInterval(pingTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionId, connect]);

  const sendMessage = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(msg);
  }, []);

  const sendUserMessage = useCallback((content: string) => {
    useTestStore.getState().addMessage("user", content);
    sendMessage(JSON.stringify({ type: "user_message", content }));
  }, [sendMessage]);

  return { sendMessage, sendUserMessage };
}
