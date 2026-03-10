"use client";
import { useTestStore } from "@/store/testStore";
import type { TestCase } from "@/store/testStore";
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, SkipForward, FlaskConical } from "lucide-react";

const STATUS_CONFIG = {
  pending:  { icon: Clock,         dot: "bg-slate-600",    bar: "bg-slate-700/60",   text: "text-text-secondary", badge: "text-slate-500 bg-slate-700/30",           label: "Pending"  },
  running:  { icon: Loader2,       dot: "bg-accent",       bar: "bg-accent/70",      text: "text-accent",         badge: "text-sky-300 bg-sky-500/15",               label: "Running"  },
  passed:   { icon: CheckCircle2,  dot: "bg-success",      bar: "bg-success",        text: "text-success",        badge: "text-green-300 bg-success/15",             label: "Passed"   },
  failed:   { icon: XCircle,       dot: "bg-error",        bar: "bg-error",          text: "text-error",          badge: "text-red-300 bg-error/15",                 label: "Failed"   },
  blocked:  { icon: AlertTriangle, dot: "bg-warning",      bar: "bg-warning/80",     text: "text-warning",        badge: "text-amber-300 bg-warning/15",             label: "Blocked"  },
  skipped:  { icon: SkipForward,   dot: "bg-slate-500",    bar: "bg-slate-600/60",   text: "text-text-secondary", badge: "text-slate-500 bg-slate-700/30",           label: "Skipped"  },
} as const;

const BORDER_BY_STATUS: Record<string, string> = {
  pending: "border-border",
  running: "border-accent/40",
  passed:  "border-success/40",
  failed:  "border-error/40",
  blocked: "border-warning/40",
  skipped: "border-border",
};

function TestCaseCard({ tc, idx }: { tc: TestCase; idx: number }) {
  const cfg  = STATUS_CONFIG[tc.status];
  const Icon = cfg.icon;

  return (
    <div
      className={`flex gap-0 rounded-xl border overflow-hidden bg-surface-card hover:bg-surface-elevated transition-all duration-200 animate-slide-up ${BORDER_BY_STATUS[tc.status]}`}
      style={{ animationDelay: `${idx * 40}ms` }}
    >
      {/* Status bar */}
      <div className={`w-1 shrink-0 ${cfg.bar}`} />

      <div className="flex-1 px-3 py-2.5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-[10px] font-mono text-text-secondary shrink-0 mt-0.5 pt-px">
              {tc.id.startsWith("TC-") ? tc.id : `#${String(idx + 1).padStart(2, "0")}`}
            </span>
            <p className="text-[12.5px] font-medium text-charcoal leading-snug line-clamp-2">{tc.title}</p>
          </div>
          <span className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cfg.badge}`}>
            <Icon className={`w-3 h-3 ${tc.status === "running" ? "animate-spin" : ""}`} />
            {cfg.label}
          </span>
        </div>

        {tc.description && (
          <p className="text-[11px] text-text-secondary leading-snug mt-1 line-clamp-1">{tc.description}</p>
        )}

        {tc.evidence && (
          <p className={`text-[11px] leading-snug mt-1.5 pt-1.5 border-t border-border italic ${cfg.text} opacity-80`}>
            {tc.evidence}
          </p>
        )}
      </div>
    </div>
  );
}

export function TestCaseList() {
  const testCases = useTestStore((s) => s.testCases);
  const passed  = testCases.filter((t) => t.status === "passed").length;
  const failed  = testCases.filter((t) => t.status === "failed").length;
  const blocked = testCases.filter((t) => t.status === "blocked").length;
  const total   = testCases.length;
  const done    = passed + failed + blocked;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0 bg-surface">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-secondary">Test Cases</p>
          {total > 0 && (
            <div className="flex items-center gap-2 text-[10px] font-mono">
              {passed  > 0 && <span className="text-success">{passed}✓</span>}
              {failed  > 0 && <span className="text-error">{failed}✗</span>}
              {blocked > 0 && <span className="text-warning">{blocked}⊘</span>}
              <span className="text-text-secondary">{total} total</span>
            </div>
          )}
        </div>
        {total > 0 && (
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${failed > 0 ? "bg-success" : "bg-success"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {testCases.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-10 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-card border border-border flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-text-secondary" />
            </div>
            <div>
              <p className="text-text-secondary text-sm font-medium">No test cases yet</p>
              <p className="text-slate-600 text-xs mt-0.5">Generated after requirement analysis</p>
            </div>
          </div>
        )}
        {testCases.map((tc, idx) => <TestCaseCard key={tc.id} tc={tc} idx={idx} />)}
      </div>
    </div>
  );
}
