"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTestStore } from "@/store/testStore";
import { useSessionsStore } from "@/store/sessionsStore";
import { AgentStatusBar }   from "@/components/AgentStatusBar";
import { ChatPanel }        from "@/components/ChatPanel";
import { LiveBrowserPanel } from "@/components/LiveBrowserPanel";
import { TestCaseList }     from "@/components/TestCaseList";
import { ReportPanel }      from "@/components/ReportPanel";
import { RecordingPlayer }  from "@/components/RecordingPlayer";
import {
  Activity, ArrowLeft, Wifi, WifiOff,
  Bot, MessageSquare, FlaskConical, Trophy, Film,
  Square, PanelLeftClose, PanelLeftOpen, History, GripVertical,
} from "lucide-react";
import Link from "next/link";

type Tab = "pipeline" | "messages" | "tests" | "report" | "recording";

const TABS: { id: Tab; Icon: React.ElementType; label: string }[] = [
  { id: "pipeline",  Icon: Bot,           label: "Pipeline"  },
  { id: "messages",  Icon: MessageSquare, label: "Activity"  },
  { id: "tests",     Icon: FlaskConical,  label: "Tests"     },
  { id: "report",    Icon: Trophy,        label: "Report"    },
  { id: "recording", Icon: Film,          label: "Recording" },
];

export default function TestPage() {
  const params    = useParams();
  const sessionId = params.sessionId as string;

  const [tab,       setTab]       = useState<Tab>("messages");
  const [collapsed, setCollapsed] = useState(false);
  const [stopping,  setStopping]  = useState(false);
  const [restored,  setRestored]  = useState(false);
  
  // ── Resizable sidebar state ───────────────────────────────────────────────
  const MIN_WIDTH = 280;
  const MAX_WIDTH = 800;
  const DEFAULT_WIDTH = 400;
  
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aethertest-sidebar-width');
      return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH;
    }
    return DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Save sidebar width to localStorage
  useEffect(() => {
    if (!collapsed && sidebarWidth !== DEFAULT_WIDTH) {
      localStorage.setItem('aethertest-sidebar-width', String(sidebarWidth));
    }
  }, [sidebarWidth, collapsed]);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;
      const newWidth = e.clientX;
      setSidebarWidth(Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // ── Restore session from history if navigating to a past session ──────────
  const testStoreState   = useTestStore.getState;
  const restoreSession   = useTestStore((s) => s.restoreSession);
  const sessionsHistory  = useSessionsStore((s) => s.history);

  useEffect(() => {
    if (restored) return;
    const current = testStoreState();
    // If the store already has this session's data, nothing to do
    if (current.sessionId === sessionId) { setRestored(true); return; }
    // Otherwise look for a saved snapshot
    const snap = sessionsHistory.find((h) => h.sessionId === sessionId);
    if (snap) {
      restoreSession({
        sessionId:         snap.sessionId,
        status:            snap.status,
        requirement:       snap.requirement,
        targetUrl:         snap.targetUrl,
        agents:            snap.agents,
        testCases:         snap.testCases,
        report:            snap.report,
        qualityScore:      snap.qualityScore,
        summary:           snap.summary,
        messages:          snap.messages,
        recordingFilename: snap.recordingFilename,
      });
    }
    setRestored(true);
  }, [sessionId, restored, restoreSession, sessionsHistory, testStoreState]);

  const { sendUserMessage } = useWebSocket(sessionId);

  const {
    isConnected, status, report, requirement, targetUrl,
    testCases, messages, recordingFilename,
  } = useTestStore();

  const passed    = testCases.filter((t) => t.status === "passed").length;
  const failed    = testCases.filter((t) => t.status === "failed").length;
  const isRunning = status === "running";
  const isHistory = !isRunning && status !== "idle";

  // Auto-switch: activity → tests when cases arrive
  useEffect(() => {
    if (testCases.length > 0 && tab === "messages") setTab("tests");
  }, [testCases.length]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch: report tab when pipeline completes
  useEffect(() => {
    if (status === "completed" && report) {
      setCollapsed(false);
      setTab("report");
    }
  }, [status, report]);

  // Auto-switch: recording tab when recording filename arrives (after a brief delay so report shows first)
  useEffect(() => {
    if (recordingFilename && status === "completed") {
      const t = setTimeout(() => setTab("recording"), 2000);
      return () => clearTimeout(t);
    }
  }, [recordingFilename, status]);

  const handleStop = useCallback(async () => {
    if (stopping || !isRunning) return;
    setStopping(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";
      await fetch(`${API}/api/sessions/${sessionId}`, { method: "DELETE" });
    } finally {
      setStopping(false);
    }
  }, [sessionId, stopping, isRunning]);

  const handleChatSend = useCallback((msg: string) => {
    sendUserMessage(msg);
  }, [sendUserMessage]);

  // Badge counts
  const badgeCounts: Partial<Record<Tab, number>> = {
    messages: messages.length,
    tests:    testCases.length,
  };

  // Which tabs are visible
  const visibleTabs = TABS.filter((t) => {
    if (t.id === "report") return !!report;
    return true;
  });

  return (
    <div className="flex flex-col h-screen bg-surface overflow-hidden text-slate-200">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-border bg-surface-card/80 backdrop-blur-sm shrink-0 z-20">
        <Link href="/" className="text-slate-600 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-100">AetherTest</span>
        </div>

        <div className="w-px h-4 bg-surface-border mx-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isHistory && (
              <History className="w-3 h-3 text-slate-500 shrink-0" />
            )}
            <p className="text-sm text-slate-200 font-medium truncate leading-tight">{requirement}</p>
          </div>
          <p className="text-[10px] text-slate-600 truncate font-mono">{targetUrl}</p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Pass/fail pills */}
          {testCases.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono">
              {passed > 0 && (
                <span className="bg-green-500/15 text-green-400 border border-green-600/30 px-2 py-0.5 rounded-full">
                  {passed}✓
                </span>
              )}
              {failed > 0 && (
                <span className="bg-red-500/15 text-red-400 border border-red-600/30 px-2 py-0.5 rounded-full">
                  {failed}✗
                </span>
              )}
            </div>
          )}

          {/* Stop button */}
          {isRunning && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-600/40 text-red-400 text-[11px] font-semibold transition-colors disabled:opacity-50"
            >
              <Square className="w-3 h-3 fill-current" />
              {stopping ? "Stopping…" : "Stop"}
            </button>
          )}

          <StatusPill status={status} />

          <div className="flex items-center gap-1.5 text-[11px]">
            {isConnected
              ? <><Wifi    className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400 font-medium">Live</span></>
              : isHistory
              ? <><History className="w-3.5 h-3.5 text-slate-500" /><span className="text-slate-500">History</span></>
              : <><WifiOff className="w-3.5 h-3.5 text-slate-600" /><span className="text-slate-600">Offline</span></>}
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Collapsible sidebar ──────────────────────────────────────── */}
        <div 
          ref={sidebarRef}
          className={`
            flex flex-col border-r border-surface-border bg-surface-card/40 shrink-0
            transition-all ease-in-out overflow-hidden relative
            ${collapsed ? "w-14" : ""}
            ${isResizing ? "transition-none" : "duration-300"}
          `}
          style={{ width: collapsed ? undefined : sidebarWidth }}
        >
          {collapsed ? (
            /* Icon-only mode */
            <div className="flex flex-col items-center py-3 gap-1">
              {visibleTabs.map(({ id, Icon, label }) => {
                const count = badgeCounts[id as keyof typeof badgeCounts];
                return (
                  <button
                    key={id}
                    onClick={() => { setCollapsed(false); setTab(id); }}
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      tab === id ? "bg-brand-600/20 text-brand-400" : "text-slate-600 hover:text-slate-300 hover:bg-white/5"
                    }`}
                    title={label}
                  >
                    <Icon className="w-4 h-4" />
                    {count !== undefined && count > 0 && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand-500" />
                    )}
                  </button>
                );
              })}
              <div className="flex-1" />
              <button
                onClick={() => setCollapsed(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors mb-2"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Full mode */
            <>
              {/* Tab bar */}
              <div className="flex items-center border-b border-surface-border px-2 pt-2 gap-0.5 shrink-0 overflow-x-auto">
                {visibleTabs.map(({ id, Icon, label }) => {
                  const count = badgeCounts[id as keyof typeof badgeCounts];
                  const isRec = id === "recording";
                  return (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`
                        flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-t-lg border-b-2 transition-colors relative shrink-0
                        ${tab === id
                          ? "text-white border-brand-500 bg-brand-500/8"
                          : "text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/3"}
                      `}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                      {count !== undefined && count > 0 && (
                        <span className="bg-brand-600 text-white text-[9px] font-bold px-1.5 py-px rounded-full leading-none">
                          {count}
                        </span>
                      )}
                      {id === "report" && report && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                      )}
                      {isRec && recordingFilename && status === "completed" && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                      )}
                      {isRec && isRunning && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                    </button>
                  );
                })}
                <div className="flex-1" />
                <button
                  onClick={() => setCollapsed(true)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors mb-1 shrink-0"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {tab === "pipeline"  && <AgentStatusBar />}
                {tab === "messages"  && (
                  <ChatPanel onSend={handleChatSend} disabled={!isRunning} />
                )}
                {tab === "tests"     && <TestCaseList />}
                {tab === "report"    && <ReportPanel />}
                {tab === "recording" && (
                  <div className="flex flex-col h-full items-center justify-center gap-3 text-center px-6">
                    <Film className="w-10 h-10 text-slate-700" />
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Recording playing in the main panel →
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
          
          {/* ── Resize handle ──────────────────────────────────────────── */}
          {!collapsed && (
            <div
              onMouseDown={handleMouseDown}
              className={`
                absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10
                flex items-center justify-center
                hover:bg-brand-500/30 transition-colors
                ${isResizing ? "bg-brand-500/50" : "bg-transparent"}
              `}
            >
              <div className={`
                w-0.5 h-8 rounded-full transition-colors
                ${isResizing ? "bg-brand-400" : "bg-slate-700 group-hover:bg-slate-500"}
              `} />
            </div>
          )}
        </div>

        {/* ── Main panel: recording / live browser / history notice ────── */}
        <div className="flex-1 overflow-hidden">
          {tab === "recording" ? (
            <RecordingPlayer filename={recordingFilename} isRunning={isRunning} />
          ) : isHistory && !isRunning ? (
            <HistoryBrowserPlaceholder sessionId={sessionId} />
          ) : (
            <LiveBrowserPanel />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── History placeholder (replaces live browser for past sessions) ────────── */
function HistoryBrowserPlaceholder({ sessionId }: { sessionId: string }) {
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";
  const snap = useSessionsStore((s) => s.history.find((h) => h.sessionId === sessionId));

  return (
    <div className="flex flex-col h-full items-center justify-center gap-6 bg-[#080d1a] text-center px-8">
      <History className="w-14 h-14 text-slate-700" />
      <div className="space-y-1.5 max-w-sm">
        <p className="text-slate-300 font-semibold text-sm">Session history view</p>
        <p className="text-slate-600 text-xs leading-relaxed">
          Live browser is only available during active test runs.
          Review the activity log, test results, and report in the sidebar.
        </p>
      </div>
      {snap?.recordingFilename && (
        <a
          href={`${API}${snap.recordingFilename}`}
          download={snap.recordingFilename.split("/").pop()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-600/30 bg-brand-500/8 text-brand-400 hover:bg-brand-500/15 text-sm font-semibold transition-colors"
        >
          <Film className="w-4 h-4" /> Download Recording
        </a>
      )}
    </div>
  );
}

/* ── Status pill ──────────────────────────────────────────────────────────── */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; dot: string; label: string }> = {
    idle:      { cls: "bg-slate-800/60 text-slate-500 border-surface-border",    dot: "bg-slate-600",             label: "Idle"      },
    running:   { cls: "bg-blue-500/12 text-blue-300 border-blue-600/30",         dot: "bg-blue-400 animate-pulse", label: "Running"  },
    completed: { cls: "bg-green-500/12 text-green-300 border-green-600/30",      dot: "bg-green-400",             label: "Completed" },
    failed:    { cls: "bg-red-500/12 text-red-300 border-red-600/30",            dot: "bg-red-400",               label: "Failed"    },
    cancelled: { cls: "bg-slate-700/40 text-slate-500 border-surface-border",   dot: "bg-slate-600",              label: "Cancelled" },
  };
  const { cls, dot, label } = map[status] ?? map.idle;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
