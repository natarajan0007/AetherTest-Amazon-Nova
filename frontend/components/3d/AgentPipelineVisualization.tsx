"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTestStore } from "@/store/testStore";

const AGENT_CONFIG = [
  { key: "orchestrator", label: "Orchestrator", emoji: "🧠" },
  { key: "requirement-analyst", label: "Analyst", emoji: "📋" },
  { key: "test-case-architect", label: "Architect", emoji: "🏗️" },
  { key: "browser-specialist", label: "Browser", emoji: "🌐" },
  { key: "monitor-validator", label: "Monitor", emoji: "👁️" },
  { key: "report-generator", label: "Reporter", emoji: "📊" },
];

type AgentStatus = "idle" | "working" | "done" | "error";

interface AgentNodeProps {
  label: string;
  emoji: string;
  status: AgentStatus;
  index: number;
  isLast: boolean;
}

function AgentNode({ label, emoji, status, index, isLast }: AgentNodeProps) {
  const statusColors = {
    idle: { bg: "bg-slate-800", border: "border-slate-700", text: "text-slate-500", glow: "" },
    working: { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-400", glow: "shadow-[0_0_20px_rgba(34,197,94,0.5)]" },
    done: { bg: "bg-cyan-500/20", border: "border-cyan-500/50", text: "text-cyan-400", glow: "" },
    error: { bg: "bg-red-500/20", border: "border-red-500", text: "text-red-400", glow: "" },
  };

  const colors = statusColors[status];

  return (
    <div className="flex items-center">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: index * 0.1, type: "spring" }}
        className="relative flex flex-col items-center"
      >
        {/* Node */}
        <motion.div
          animate={status === "working" ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 1, repeat: Infinity }}
          className={`
            relative w-14 h-14 rounded-full flex items-center justify-center
            border-2 ${colors.bg} ${colors.border} ${colors.glow}
            transition-all duration-300
          `}
        >
          {/* Pulse ring for working status */}
          {status === "working" && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-green-500"
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
          
          <span className="text-2xl">{emoji}</span>
          
          {/* Done checkmark */}
          {status === "done" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
            >
              <span className="text-white text-xs">✓</span>
            </motion.div>
          )}
        </motion.div>

        {/* Label */}
        <span className={`mt-2 text-[10px] font-semibold ${colors.text}`}>
          {label}
        </span>
      </motion.div>

      {/* Connection line */}
      {!isLast && (
        <div className="relative w-8 h-0.5 mx-1">
          <div className={`absolute inset-0 ${status === "done" || status === "working" ? "bg-gradient-to-r from-cyan-500 to-violet-500" : "bg-slate-700"} rounded-full`} />
          
          {/* Animated particle */}
          {(status === "done" || status === "working") && (
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400"
              animate={{ x: [0, 32, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function AgentPipelineVisualization({ height = 200 }: { height?: number }) {
  const agents = useTestStore((s) => s.agents);

  const getStatus = (key: string): AgentStatus => {
    const agent = agents[key as keyof typeof agents];
    return (agent?.status as AgentStatus) ?? "idle";
  };

  return (
    <div
      style={{ height }}
      className="w-full bg-gradient-to-b from-slate-900/80 to-slate-900/40 rounded-xl border border-slate-800/50 p-4 flex items-center justify-center overflow-hidden"
    >
      <div className="flex items-center justify-center flex-wrap gap-y-4">
        {AGENT_CONFIG.map((agent, i) => (
          <AgentNode
            key={agent.key}
            label={agent.label}
            emoji={agent.emoji}
            status={getStatus(agent.key)}
            index={i}
            isLast={i === AGENT_CONFIG.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// Compact version for sidebar
export function AgentPipelineCompact() {
  const agents = useTestStore((s) => s.agents);

  const getStatus = (key: string): AgentStatus => {
    const agent = agents[key as keyof typeof agents];
    return (agent?.status as AgentStatus) ?? "idle";
  };

  return (
    <div className="flex items-center justify-between px-2 py-3 bg-slate-900/50 rounded-xl">
      {AGENT_CONFIG.map((agent, i) => {
        const status = getStatus(agent.key);
        return (
          <div key={agent.key} className="flex items-center">
            <div
              className={`
                relative w-8 h-8 rounded-full flex items-center justify-center text-sm
                ${status === "working" ? "bg-green-500/20 ring-2 ring-green-500 animate-pulse" :
                  status === "done" ? "bg-cyan-500/20 ring-1 ring-cyan-500/50" :
                  status === "error" ? "bg-red-500/20 ring-1 ring-red-500/50" :
                  "bg-slate-800/50"}
              `}
            >
              {agent.emoji}
              {status === "done" && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-[8px] text-white">✓</span>
                </span>
              )}
            </div>
            {i < AGENT_CONFIG.length - 1 && (
              <div
                className={`w-4 h-0.5 mx-0.5 ${
                  status === "done" || status === "working" ? "bg-green-500/50" : "bg-slate-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
