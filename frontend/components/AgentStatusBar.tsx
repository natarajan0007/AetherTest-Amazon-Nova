"use client";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useTestStore } from "@/store/testStore";
import { motion } from "framer-motion";

// Dynamic import for 3D visualization
const AgentPipelineVisualization = dynamic(
  () => import("@/components/3d/AgentPipelineVisualization").then(mod => ({ default: mod.AgentPipelineVisualization })),
  { ssr: false, loading: () => <div className="h-[180px] bg-slate-900/50 rounded-xl animate-pulse" /> }
);

const AGENTS = [
  { key: "orchestrator",          label: "Orchestrator",   role: "Manages the full pipeline",             emoji: "🧠" },
  { key: "requirement-analyst",   label: "Req. Analyst",   role: "Structures requirements into criteria", emoji: "📋" },
  { key: "test-case-architect",   label: "Test Architect", role: "Generates BDD test cases",              emoji: "🏗️" },
  { key: "browser-specialist",    label: "Browser Agent",  role: "Executes tests via browser automation", emoji: "🌐" },
  { key: "monitor-validator",     label: "Monitor",        role: "Validates results with vision AI",      emoji: "👁️" },
  { key: "report-generator",      label: "Reporter",       role: "Compiles the final test report",        emoji: "📊" },
] as const;

type AgentKey = typeof AGENTS[number]["key"];

export function AgentStatusBar() {
  const agents    = useTestStore((s) => s.agents);
  const doneCount = AGENTS.filter((a) => agents[a.key as AgentKey]?.status === "done").length;
  const activeIdx = AGENTS.findIndex((a) => agents[a.key as AgentKey]?.status === "working");
  const pct       = Math.round((doneCount / AGENTS.length) * 100);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950">
      {/* 3D Pipeline Visualization */}
      <div className="px-3 pt-3">
        <Suspense fallback={<div className="h-[180px] bg-slate-900/50 rounded-xl animate-pulse" />}>
          <AgentPipelineVisualization height={180} />
        </Suspense>
      </div>

      {/* Header + progress */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">STLC Pipeline</p>
          <span className="text-[11px] font-mono text-slate-300">
            {doneCount}<span className="text-slate-600">/{AGENTS.length}</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        {activeIdx >= 0 && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-[11px] text-green-400 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
            {AGENTS[activeIdx].emoji} {AGENTS[activeIdx].label} is running
          </motion.p>
        )}
        {doneCount === AGENTS.length && doneCount > 0 && (
          <motion.p
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2 text-[11px] text-green-400 font-semibold"
          >
            ✓ All phases complete
          </motion.p>
        )}
      </div>

      {/* Steps */}
      <div className="flex-1 px-4 py-3 space-y-0">
        {AGENTS.map(({ key, label, role, emoji }, idx) => {
          const agent     = agents[key as AgentKey];
          const status    = agent?.status ?? "idle";
          const isLast    = idx === AGENTS.length - 1;
          const isWorking = status === "working";
          const isDone    = status === "done";
          const isError   = status === "error";

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative flex gap-3"
            >
              {/* Connector line */}
              {!isLast && (
                <div className="absolute left-[17px] top-10 bottom-0 w-px">
                  <div className={`h-full w-full transition-colors duration-700 ${isDone ? "bg-green-500/30" : "bg-slate-800"}`} />
                </div>
              )}

              {/* Status circle */}
              <div className="shrink-0 z-10 mt-3">
                {isWorking ? (
                  <div className="relative w-9 h-9">
                    <span className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                    <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-base shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                      {emoji}
                    </div>
                  </div>
                ) : isDone ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-9 h-9 rounded-full bg-green-500/15 border border-green-500/40 flex items-center justify-center text-green-400"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </motion.div>
                ) : isError ? (
                  <div className="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-400" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-500">{idx + 1}</span>
                  </div>
                )}
              </div>

              {/* Card */}
              <div className={`
                flex-1 mb-3 rounded-xl border px-3 py-2.5 transition-all duration-300
                ${isWorking ? "bg-green-500/8 border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                  : isDone  ? "bg-slate-800/50 border-slate-700/50"
                  : isError ? "bg-red-500/8 border-red-500/30"
                  :           "bg-slate-900/40 border-slate-800/50"}
              `}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold leading-tight ${
                    isWorking ? "text-green-400" : isDone ? "text-slate-200" : isError ? "text-red-400" : "text-slate-500"
                  }`}>{label}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    isWorking ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : isDone  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                    : isError ? "bg-red-500/15 text-red-400 border-red-500/25"
                    :           "text-slate-600 border-slate-700"
                  }`}>
                    {isWorking ? "Active" : isDone ? "Done" : isError ? "Error" : "Waiting"}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 leading-snug ${isWorking ? "text-green-400/60" : "text-slate-500"}`}>
                  {role}
                </p>
                {agent?.lastMessage && status !== "idle" && (
                  <p className={`text-[11px] mt-1.5 pt-1.5 border-t leading-snug line-clamp-2 ${
                    isWorking ? "text-green-400/70 border-green-500/15"
                    : isDone  ? "text-slate-400 border-slate-700"
                    :           "text-red-400/75 border-red-500/15"
                  }`}>
                    {agent.lastMessage}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
