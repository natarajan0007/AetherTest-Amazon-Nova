"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Activity, FileSpreadsheet, FileJson,
  CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown,
  ChevronUp, Trophy, Target, Layers, Zap, Film, BarChart2,
} from "lucide-react";
import { RecordingPlayer } from "@/components/RecordingPlayer";
import { useSessionsStore } from "@/store/sessionsStore";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

/* ── Tab type ────────────────────────────────────────────────────────────── */
type ReportTab = "report" | "recording";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface TestResult {
  id?: string;
  test_id?: string;
  name?: string;
  title?: string;
  description?: string;
  status?: "passed" | "failed" | "blocked" | "pending" | "PASS" | "FAIL" | "BLOCKED";
  steps?: string | string[];
  evidence?: string;
  expected?: string;
  actual?: string;
  duration_ms?: number;
  error?: string;
}

interface ReportData {
  session_id?: string;
  requirement?: string;
  target_url?: string;
  created_at?: string;
  quality_score?: number | string;
  total_tests?: number;
  total_test_cases?: number;
  passed?: number;
  failed?: number;
  blocked?: number;
  summary?: string | object;
  test_results?: TestResult[];
  test_cases?: TestResult[];
  recommendations?: string[];
  [key: string]: unknown;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function parseScore(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const n = parseFloat(String(raw ?? "0").replace("%", ""));
  return isNaN(n) ? 0 : n;
}

function normaliseStatus(s: string | undefined): "passed" | "failed" | "blocked" | "pending" {
  if (!s) return "pending";
  const v = s.toLowerCase();
  if (v === "pass" || v === "passed") return "passed";
  if (v === "fail" || v === "failed") return "failed";
  if (v === "blocked") return "blocked";
  return "pending";
}

function formatDate(raw: string | undefined): string {
  if (!raw) return "—";
  try { return new Date(raw).toLocaleString(); } catch { return raw; }
}

function formatMs(ms: number | undefined): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── Download helpers ────────────────────────────────────────────────────── */
function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadCSV(report: ReportData, filename: string) {
  const score = parseScore(report.quality_score);
  const rows: string[][] = [];

  rows.push(["AetherTest Report"]);
  rows.push(["Report ID", filename.replace(".csv", "")]);
  rows.push(["Requirement", report.requirement ?? "—"]);
  rows.push(["Target URL", report.target_url ?? "—"]);
  rows.push(["Created", formatDate(report.created_at)]);
  rows.push(["Quality Score", `${score.toFixed(0)}%`]);
  rows.push(["Total Tests", String(report.total_tests ?? report.total_test_cases ?? 0)]);
  rows.push(["Passed", String(report.passed ?? 0)]);
  rows.push(["Failed", String(report.failed ?? 0)]);
  rows.push(["Blocked", String(report.blocked ?? 0)]);
  rows.push([]);

  if (report.summary) {
    rows.push(["Executive Summary"]);
    rows.push([typeof report.summary === "string" ? report.summary : JSON.stringify(report.summary)]);
    rows.push([]);
  }

  const tests: TestResult[] = (report.test_results ?? report.test_cases ?? []) as TestResult[];
  if (tests.length > 0) {
    rows.push(["Test Cases"]);
    rows.push(["ID", "Name", "Status", "Evidence", "Error", "Duration"]);
    for (const t of tests) {
      rows.push([
        t.test_id ?? t.id ?? "",
        t.title ?? t.name ?? "",
        normaliseStatus(t.status as string).toUpperCase(),
        t.evidence ?? "",
        t.error ?? "",
        formatMs(t.duration_ms),
      ]);
    }
    rows.push([]);
  }

  if (report.recommendations?.length) {
    rows.push(["Recommendations"]);
    for (const r of report.recommendations) rows.push([r]);
  }

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ── ScoreRing ───────────────────────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
  const r = 56;
  const circ = 2 * Math.PI * r;
  const clamp = Math.max(0, Math.min(100, score));
  const offset = circ * (1 - clamp / 100);
  const color =
    clamp >= 80 ? "#22c55e" :
    clamp >= 50 ? "#f59e0b" : "#ef4444";
  const textColor =
    clamp >= 80 ? "text-green-400" :
    clamp >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width={136} height={136} viewBox="0 0 136 136">
        <circle cx={68} cy={68} r={r} fill="none" stroke="#1a2236" strokeWidth={10} />
        <circle
          cx={68} cy={68} r={r}
          fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 68 68)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-3xl font-bold font-mono ${textColor}`}>{clamp.toFixed(0)}</span>
        <span className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mt-0.5">Quality</span>
      </div>
    </div>
  );
}

/* ── StatusBadge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: ReturnType<typeof normaliseStatus> }) {
  const config = {
    passed:  { Icon: CheckCircle2, cls: "bg-green-500/15 text-green-400 border-green-600/30",    label: "PASS"    },
    failed:  { Icon: XCircle,      cls: "bg-red-500/15 text-red-400 border-red-600/30",          label: "FAIL"    },
    blocked: { Icon: AlertCircle,  cls: "bg-yellow-500/15 text-yellow-400 border-yellow-600/30", label: "BLOCKED" },
    pending: { Icon: Clock,        cls: "bg-slate-700/40 text-slate-500 border-surface-border",  label: "PENDING" },
  };
  const { Icon, cls, label } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}

/* ── TestRow ─────────────────────────────────────────────────────────────── */
function TestRow({ test, idx }: { test: TestResult; idx: number }) {
  const [open, setOpen] = useState(false);
  const status = normaliseStatus(test.status as string);
  const hasDetails = !!(test.evidence || test.error || test.steps || test.expected || test.actual);
  const borderByStatus: Record<string, string> = {
    passed: "border-green-600/20 hover:border-green-600/40",
    failed: "border-red-600/20 hover:border-red-600/40",
    blocked: "border-yellow-600/20 hover:border-yellow-600/40",
    pending: "border-surface-border hover:border-slate-600",
  };

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${borderByStatus[status]} animate-slide-up`}
      style={{ animationDelay: `${idx * 50}ms` }}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface-card/60 hover:bg-surface-card transition-colors text-left"
        onClick={() => hasDetails && setOpen((o) => !o)}
      >
        <span className="text-[11px] font-mono text-slate-600 w-12 shrink-0">
          {test.test_id ?? test.id ?? `#${String(idx + 1).padStart(2, "0")}`}
        </span>
        <span className="flex-1 text-sm text-slate-200 font-medium truncate">
          {test.title ?? test.name ?? `Test Case ${idx + 1}`}
        </span>
        {test.duration_ms && (
          <span className="text-[10px] font-mono text-slate-600 mr-2">{formatMs(test.duration_ms)}</span>
        )}
        <StatusBadge status={status} />
        {hasDetails && (
          open
            ? <ChevronUp   className="w-4 h-4 text-slate-600 shrink-0 ml-1" />
            : <ChevronDown className="w-4 h-4 text-slate-600 shrink-0 ml-1" />
        )}
      </button>

      {open && hasDetails && (
        <div className="px-4 py-3 bg-surface/60 border-t border-surface-border space-y-2.5 text-[12px]">
          {test.description && <p className="text-slate-400 leading-relaxed">{test.description}</p>}
          {test.steps && (
            <div>
              <p className="text-slate-500 font-semibold mb-1">Steps</p>
              {Array.isArray(test.steps)
                ? <ol className="list-decimal list-inside text-slate-400 space-y-0.5">
                    {test.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                : <p className="text-slate-400 whitespace-pre-wrap">{test.steps}</p>}
            </div>
          )}
          {test.expected && (
            <div>
              <p className="text-slate-500 font-semibold mb-0.5">Expected</p>
              <p className="text-slate-400">{test.expected}</p>
            </div>
          )}
          {test.actual && (
            <div>
              <p className="text-slate-500 font-semibold mb-0.5">Actual</p>
              <p className="text-slate-400">{test.actual}</p>
            </div>
          )}
          {test.evidence && (
            <div>
              <p className="text-slate-500 font-semibold mb-0.5">Evidence</p>
              <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{test.evidence}</p>
            </div>
          )}
          {test.error && (
            <div className="bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
              <p className="text-slate-500 font-semibold mb-0.5">Error</p>
              <p className="text-red-300 font-mono text-[11px] whitespace-pre-wrap">{test.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function ReportPage() {
  const params   = useParams();
  const reportId = params.reportId as string;

  const [activeTab,  setActiveTab]  = useState<ReportTab>("report");
  const [report,     setReport]     = useState<ReportData | null>(null);
  const [sessionId,  setSessionId]  = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const ringRef = useRef<HTMLDivElement>(null);

  // Look up recording from sessions history store (keyed by reportId)
  const recordingFilename = useSessionsStore(
    (s) => s.history.find((h) => h.reportId === reportId)?.recordingFilename ?? null
  );

  useEffect(() => {
    fetch(`${API}/api/sessions`)
      .then((r) => r.json())
      .then((sessions: Array<{ report_id: string; id: string }>) => {
        const session = sessions.find((s) => s.report_id === reportId);
        if (session) {
          setSessionId(session.id);
          return fetch(`${API}/local-storage/reports/report_${session.id}.json`);
        }
        return null;
      })
      .then((r) => r?.json() ?? null)
      .then((data) => { setReport(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reportId]);

  useEffect(() => {
    if (report && ringRef.current && activeTab === "report") {
      ringRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading report…</p>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-surface gap-4">
        <AlertCircle className="w-10 h-10 text-slate-600" />
        <p className="text-slate-400">Report not found.</p>
        <Link href="/" className="text-brand-400 hover:underline text-sm">← Back to Home</Link>
      </div>
    );
  }

  /* ── Derived values ── */
  const score   = parseScore(report.quality_score);
  const total   = Number(report.total_tests ?? report.total_test_cases ?? 0);
  const passed  = Number(report.passed  ?? 0);
  const failed  = Number(report.failed  ?? 0);
  const blocked = Number(report.blocked ?? 0);

  const summaryText =
    typeof report.summary === "string"
      ? report.summary
      : `${passed}/${total} tests passed. Quality score: ${score.toFixed(0)}%.`;

  const tests: TestResult[] = (report.test_results ?? report.test_cases ?? []) as TestResult[];

  const scoreGrade =
    score >= 80 ? { label: "Excellent", Icon: Trophy, cls: "text-green-400"  } :
    score >= 60 ? { label: "Good",      Icon: Target, cls: "text-yellow-400" } :
    score >= 40 ? { label: "Fair",      Icon: Layers, cls: "text-orange-400" } :
                  { label: "Poor",      Icon: Zap,    cls: "text-red-400"    };
  const GradeIcon = scoreGrade.Icon;

  /* ── Tabs config ── */
  const TABS: { id: ReportTab; Icon: React.ElementType; label: string; badge?: string }[] = [
    { id: "report",    Icon: BarChart2, label: "Report"    },
    { id: "recording", Icon: Film,      label: "Recording", badge: recordingFilename ? "●" : undefined },
  ];

  return (
    <div className="min-h-screen bg-surface text-slate-200 flex flex-col">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-card/80 backdrop-blur-sm">

        {/* Row 1: breadcrumb + downloads */}
        <div className="flex items-center gap-3 px-6 py-3">
          <Link
            href={sessionId ? `/test/${sessionId}` : "/"}
            className="text-slate-600 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-bold tracking-tight text-slate-100">AetherTest</h1>
          <span className="text-slate-700">/</span>
          <span className="text-sm text-slate-400 truncate max-w-xs">
            {report.requirement ?? "Test Report"}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => downloadCSV(report, `report-${reportId}.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-slate-400 hover:text-white hover:border-green-600/50 hover:bg-green-500/8 text-[11px] font-semibold transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel / CSV
            </button>
            <button
              onClick={() => downloadJSON(report, `report-${reportId}.json`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-slate-400 hover:text-white hover:border-brand-500/50 hover:bg-brand-500/8 text-[11px] font-semibold transition-colors"
            >
              <FileJson className="w-3.5 h-3.5" /> JSON
            </button>
          </div>
        </div>

        {/* Row 2: tab bar */}
        <div className="flex items-center gap-0.5 px-6 border-t border-surface-border/50">
          {TABS.map(({ id, Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`
                relative flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold
                border-b-2 transition-colors
                ${activeTab === id
                  ? "text-white border-brand-500 bg-brand-500/5"
                  : "text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/3"}
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge && (
                <span className="text-red-400 text-[9px] leading-none">{badge}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── Tab content ── */}
      {activeTab === "recording" ? (

        /* ── Recording tab: full-height video player ── */
        <div className="flex-1 flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
          <RecordingPlayer filename={recordingFilename} isRunning={false} />
        </div>

      ) : (

        /* ── Report tab: scrolling content ── */
        <div className="max-w-5xl mx-auto w-full px-6 py-10 space-y-8">

          {/* Hero: Score + Stats */}
          <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-card animate-fade-in">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div ref={ringRef} className="flex flex-col items-center gap-2 shrink-0">
                <ScoreRing score={score} />
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${scoreGrade.cls}`}>
                  <GradeIcon className="w-3.5 h-3.5" />
                  {scoreGrade.label}
                </div>
              </div>
              <div className="hidden md:block w-px h-28 bg-surface-border" />
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                {[
                  { label: "Total",   value: total,   cls: "text-slate-200",  bg: "bg-surface/60"   },
                  { label: "Passed",  value: passed,  cls: "text-green-400",  bg: "bg-green-500/8"  },
                  { label: "Failed",  value: failed,  cls: "text-red-400",    bg: "bg-red-500/8"    },
                  { label: "Blocked", value: blocked, cls: "text-yellow-400", bg: "bg-yellow-500/8" },
                ].map(({ label, value, cls, bg }) => (
                  <div key={label} className={`${bg} border border-surface-border rounded-xl p-4 flex flex-col gap-1`}>
                    <span className={`text-3xl font-bold font-mono ${cls}`}>{value}</span>
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {total > 0 && (
              <div className="mt-5 pt-5 border-t border-surface-border">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                  <span>Pass Rate</span>
                  <span className="font-mono text-slate-400">{((passed / total) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-600 to-green-500 rounded-full transition-all duration-1000"
                    style={{ width: `${(passed / total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recording quick-access banner (if available) */}
          {recordingFilename && (
            <button
              onClick={() => setActiveTab("recording")}
              className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-red-600/25 bg-red-500/8 hover:bg-red-500/12 hover:border-red-500/40 transition-colors animate-slide-up"
            >
              <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                <Film className="w-4 h-4 text-red-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-slate-200">Session recording available</p>
                <p className="text-[11px] text-slate-500 font-mono truncate">
                  {recordingFilename.split("/").pop()}
                </p>
              </div>
              <span className="text-[11px] text-red-400 font-semibold">Watch →</span>
            </button>
          )}

          {/* Session Metadata */}
          <div className="bg-surface-card border border-surface-border rounded-2xl p-5 animate-slide-up">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Session Info</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                { label: "Requirement", value: report.requirement },
                { label: "Target URL",  value: report.target_url  },
                { label: "Created",     value: formatDate(report.created_at as string) },
                { label: "Report ID",   value: reportId           },
                { label: "Session ID",  value: sessionId ?? undefined },
              ].map(({ label, value }) => value ? (
                <div key={label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-0.5">{label}</dt>
                  <dd className="text-slate-300 break-all font-mono text-[12px]">{String(value)}</dd>
                </div>
              ) : null)}
            </dl>
          </div>

          {/* Executive Summary */}
          {summaryText && (
            <div className="bg-surface-card border border-surface-border rounded-2xl p-5 animate-slide-up">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Executive Summary</h2>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{summaryText}</p>
            </div>
          )}

          {/* Test Cases */}
          {tests.length > 0 && (
            <div className="animate-slide-up">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
                Test Results
                <span className="ml-2 text-brand-400 font-mono normal-case tracking-normal">({tests.length})</span>
              </h2>
              <div className="space-y-2">
                {tests.map((test, idx) => (
                  <TestRow key={test.test_id ?? test.id ?? idx} test={test} idx={idx} />
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations && Array.isArray(report.recommendations) && report.recommendations.length > 0 && (
            <div className="bg-surface-card border border-surface-border rounded-2xl p-5 animate-slide-up">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Recommendations</h2>
              <ul className="space-y-2">
                {(report.recommendations as string[]).map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Download CTA */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-10">
            <button
              onClick={() => downloadCSV(report, `report-${reportId}.csv`)}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-green-600/30 bg-green-500/8 text-green-400 hover:bg-green-500/15 hover:border-green-500/50 font-semibold text-sm transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" /> Download Excel / CSV
            </button>
            <button
              onClick={() => downloadJSON(report, `report-${reportId}.json`)}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-brand-600/30 bg-brand-500/8 text-brand-400 hover:bg-brand-500/15 hover:border-brand-500/50 font-semibold text-sm transition-colors"
            >
              <FileJson className="w-4 h-4" /> Download JSON
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
