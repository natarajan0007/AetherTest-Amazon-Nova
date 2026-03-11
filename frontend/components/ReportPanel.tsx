"use client";
import { useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useTestStore } from "@/store/testStore";
import { 
  Trophy, CheckCircle2, XCircle, AlertTriangle, FileText, ExternalLink,
  Clock, Globe, Lightbulb, ChevronDown, ChevronUp
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useState } from "react";

// Dynamic import for 3D quality orb
const QualityScoreOrb = dynamic(
  () => import("@/components/3d/QualityScoreOrb").then(mod => ({ default: mod.QualityScoreOrb })),
  { ssr: false, loading: () => <div className="w-[180px] h-[180px] rounded-full bg-slate-800 animate-pulse mx-auto" /> }
);

interface TestOutcome {
  test_id: string;
  title?: string;
  verdict: "PASS" | "FAIL" | "BLOCKED" | "NOT_EXECUTED";
  details?: string;
  steps_executed?: string[] | string;
}

export function ReportPanel() {
  const { report, qualityScore, summary, testCases, monitorResults } = useTestStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (report) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [report]);

  if (!report) return null;

  const data = report.data as Record<string, unknown>;
  
  // Extract test outcomes from report or build from testCases/monitorResults
  const testOutcomes: TestOutcome[] = (data.test_outcomes as TestOutcome[]) || 
    testCases.map(tc => {
      const result = monitorResults.find(r => r.testId === tc.id);
      return {
        test_id: tc.id,
        title: tc.title,
        verdict: result?.status || (tc.status === "passed" ? "PASS" : tc.status === "failed" ? "FAIL" : "BLOCKED"),
        details: result?.evidence || tc.evidence,
      };
    });

  const passed  = testOutcomes.filter(t => t.verdict === "PASS").length || Number(data.passed ?? 0);
  const failed  = testOutcomes.filter(t => t.verdict === "FAIL").length || Number(data.failed ?? 0);
  const blocked = testOutcomes.filter(t => t.verdict === "BLOCKED").length || Number(data.blocked ?? 0);
  const notExecuted = testOutcomes.filter(t => t.verdict === "NOT_EXECUTED").length || Number(data.not_executed ?? 0);
  const total   = testOutcomes.length || Number(data.total_tests ?? data.total_test_cases ?? 0);
  const score   = typeof qualityScore === "number" ? qualityScore : 0;
  
  // Check if this is a partial report (pipeline error)
  const isPartialReport = Boolean(data.pipeline_error) || notExecuted > 0;
  
  // Extract additional report data
  const executiveSummary = (data.executive_summary as string) || 
    (typeof summary === "string" && summary ? summary : `${passed}/${total} tests passed. Quality score: ${score.toFixed(0)}%.`);
  const recommendations = (data.recommendations as string[]) || [];
  const environment = data.environment as { url?: string; browser?: string; timestamp?: string } | undefined;

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4 bg-slate-950 overflow-y-auto max-h-[calc(100vh-200px)]"
    >
      {/* 3D Quality Score Orb */}
      <div className="flex flex-col items-center py-4">
        <div className="flex items-center gap-1.5 mb-4">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Quality Score</span>
        </div>
        <Suspense fallback={<div className="w-[180px] h-[180px] rounded-full bg-slate-800 animate-pulse" />}>
          <QualityScoreOrb score={score} size={180} />
        </Suspense>
      </div>

      {/* Stats */}
      <div className={`grid gap-2 ${notExecuted > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {[
          { Icon: CheckCircle2,  count: passed,  label: "Passed",  color: "success" as const },
          { Icon: XCircle,       count: failed,  label: "Failed",  color: "error" as const },
          { Icon: AlertTriangle, count: blocked, label: "Blocked", color: "warning" as const },
          ...(notExecuted > 0 ? [{ Icon: Clock, count: notExecuted, label: "Not Run", color: "muted" as const }] : []),
        ].map(({ Icon, count, label, color }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <GlassCard
              glow={color === "success" ? "success" : color === "error" ? "error" : color === "warning" ? "warning" : undefined}
              padding="sm"
              className="text-center"
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${
                color === "success" ? "text-green-400" :
                color === "error" ? "text-red-400" : 
                color === "warning" ? "text-amber-400" : "text-slate-500"
              }`} />
              <div className={`text-xl font-bold font-mono ${
                color === "success" ? "text-green-400" :
                color === "error" ? "text-red-400" : 
                color === "warning" ? "text-amber-400" : "text-slate-500"
              }`}>{count}</div>
              <div className="text-[10px] text-slate-500">{label}</div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Partial Report Warning */}
      {isPartialReport && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <GlassCard padding="sm" glow="error">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-amber-400">Partial Report - Pipeline Error</p>
                <p className="text-[10px] text-slate-400">
                  {notExecuted} test{notExecuted !== 1 ? 's were' : ' was'} not executed due to a pipeline error.
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Executive Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <GlassCard padding="md">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Executive Summary</span>
          </div>
          <p className="text-[12px] text-slate-300 leading-relaxed">{executiveSummary}</p>
        </GlassCard>
      </motion.div>

      {/* Test Outcomes Details */}
      {testOutcomes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <GlassCard padding="md">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Test Results ({testOutcomes.length})
                </span>
              </div>
              {showDetails ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>
            
            {showDetails && (
              <div className="mt-3 space-y-2">
                {testOutcomes.map((outcome, idx) => (
                  <motion.div
                    key={outcome.test_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`p-2 rounded-lg border ${
                      outcome.verdict === "PASS" 
                        ? "border-green-500/30 bg-green-500/5" 
                        : outcome.verdict === "FAIL"
                        ? "border-red-500/30 bg-red-500/5"
                        : outcome.verdict === "NOT_EXECUTED"
                        ? "border-slate-500/30 bg-slate-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {outcome.verdict === "PASS" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      ) : outcome.verdict === "FAIL" ? (
                        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      ) : outcome.verdict === "NOT_EXECUTED" ? (
                        <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">{outcome.test_id}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                            outcome.verdict === "PASS" 
                              ? "bg-green-500/20 text-green-400" 
                              : outcome.verdict === "FAIL"
                              ? "bg-red-500/20 text-red-400"
                              : outcome.verdict === "NOT_EXECUTED"
                              ? "bg-slate-500/20 text-slate-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}>
                            {outcome.verdict === "NOT_EXECUTED" ? "NOT RUN" : outcome.verdict}
                          </span>
                        </div>
                        {outcome.title && (
                          <p className="text-[11px] text-slate-300 truncate">{outcome.title}</p>
                        )}
                        {outcome.details && (
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{outcome.details}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* Environment Info */}
      {environment && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <GlassCard padding="sm">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Environment</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {environment.url && (
                <div>
                  <span className="text-slate-500">URL:</span>
                  <span className="text-slate-300 ml-1 truncate block">{environment.url}</span>
                </div>
              )}
              {environment.browser && (
                <div>
                  <span className="text-slate-500">Browser:</span>
                  <span className="text-slate-300 ml-1">{environment.browser}</span>
                </div>
              )}
              {environment.timestamp && (
                <div className="col-span-2 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-400">{new Date(environment.timestamp).toLocaleString()}</span>
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <GlassCard padding="md" glow="warning">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Recommendations</span>
            </div>
            <ul className="space-y-1.5">
              {recommendations.map((rec, idx) => (
                <li key={idx} className="text-[11px] text-slate-300 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </motion.div>
      )}

      {/* Link to full report */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Link
          href={`/reports/${report.reportId}`}
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/8 text-cyan-400 hover:bg-cyan-500/15 hover:border-cyan-500/50 text-[12px] font-semibold transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.2)]"
        >
          View Full Report
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </motion.div>
    </motion.div>
  );
}
