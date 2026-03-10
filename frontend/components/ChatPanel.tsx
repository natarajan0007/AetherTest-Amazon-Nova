"use client";
import { useEffect, useRef, useState } from "react";
import { useTestStore } from "@/store/testStore";
import type { ChatMessage } from "@/store/testStore";
import { Bot, User, ChevronDown, ChevronUp, Send, MessageSquare } from "lucide-react";

const AGENT_COLORS: Record<string, string> = {
  orchestrator:          "bg-slate-700/40 text-slate-300 border-slate-600/40",
  "requirement-analyst": "bg-sky-800/30 text-sky-300 border-sky-700/40",
  "test-case-architect": "bg-violet-800/25 text-violet-300 border-violet-700/35",
  "browser-specialist":  "bg-orange-800/25 text-orange-300 border-orange-700/35",
  "monitor-validator":   "bg-emerald-800/25 text-emerald-300 border-emerald-700/35",
  "report-generator":    "bg-pink-800/25 text-pink-300 border-pink-700/35",
};
const AGENT_LABELS: Record<string, string> = {
  orchestrator:          "Orchestrator Agent",
  "requirement-analyst": "Analyst Agent",
  "test-case-architect": "Architect Agent",
  "browser-specialist":  "Browser Agent",
  "monitor-validator":   "Monitor Agent",
  "report-generator":    "Reporter Agent",
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

const COLLAPSE_AT = 280;

function MessageBubble({ msg, isLatest }: { msg: ChatMessage; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = msg.content.length > COLLAPSE_AT;
  const text   = isLong && !expanded ? msg.content.slice(0, COLLAPSE_AT) + "…" : msg.content;

  if (msg.role === "user") {
    return (
      <div className={`flex justify-end gap-2 ${isLatest ? "animate-slide-up" : ""}`}>
        <div className="max-w-[88%] space-y-1">
          <div className="flex justify-end">
            <span className="text-[10px] text-text-secondary font-mono">{formatTime(msg.timestamp)}</span>
          </div>
          <div className="bg-accent text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-[0_2px_12px_rgba(56,189,248,0.25)]">
            <p className="leading-relaxed break-words">{msg.content}</p>
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 mt-5">
          <User className="w-3.5 h-3.5 text-accent" />
        </div>
      </div>
    );
  }

  const colorCls   = AGENT_COLORS[msg.agent ?? ""] ?? "bg-slate-700/30 text-slate-400 border-border";
  const agentLabel = AGENT_LABELS[msg.agent ?? ""] ?? msg.agent ?? "Agent";

  return (
    <div className={`flex gap-2 ${isLatest ? "animate-slide-up" : ""}`}>
      <div className="w-7 h-7 rounded-full bg-sky-900/40 border border-sky-700/40 flex items-center justify-center shrink-0 mt-5">
        <Bot className="w-3.5 h-3.5 text-accent" />
      </div>
      <div className="max-w-[92%] space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          {msg.agent && (
            <span className={`inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${colorCls}`}>
              {agentLabel}
            </span>
          )}
          <span className="text-[10px] text-text-secondary font-mono">{formatTime(msg.timestamp)}</span>
        </div>
        <div className="bg-surface-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
          <p className="text-[12.5px] text-text-primary leading-relaxed break-words whitespace-pre-wrap">{text}</p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex items-center gap-1 text-[10px] text-text-secondary hover:text-charcoal transition-colors"
            >
              {expanded
                ? <><ChevronUp className="w-3 h-3" /> Show less</>
                : <><ChevronDown className="w-3 h-3" /> Show more</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-2 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-sky-900/40 border border-sky-700/40 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-accent" />
      </div>
      <div className="bg-surface-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 thinking-dot-1 inline-block" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 thinking-dot-2 inline-block" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 thinking-dot-3 inline-block" />
      </div>
    </div>
  );
}

interface ChatPanelProps {
  onSend?:  (message: string) => void;
  disabled?: boolean;
}

export function ChatPanel({ onSend, disabled }: ChatPanelProps) {
  const messages  = useTestStore((s) => s.messages);
  const agents    = useTestStore((s) => s.agents);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const isThinking = Object.values(agents).some((a) => a.status === "working");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !onSend) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-text-secondary" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-secondary">Activity Log</h2>
        </div>
        <span className="text-[10px] font-mono text-text-secondary">{messages.length} events</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-card border border-border flex items-center justify-center">
              <Bot className="w-5 h-5 text-text-secondary" />
            </div>
            <div>
              <p className="text-text-secondary text-sm font-medium">Waiting for agents</p>
              <p className="text-slate-600 text-xs mt-0.5">Events stream here in real-time</p>
            </div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} msg={msg} isLatest={idx === messages.length - 1} />
        ))}
        {isThinking && <ThinkingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Chat input */}
      {onSend && (
        <div className="shrink-0 border-t border-border p-3 bg-surface">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={disabled ? "Pipeline finished" : "Ask a question or give instructions…"}
              disabled={disabled}
              className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-[12.5px] text-text-primary placeholder:text-slate-600 focus:outline-none focus:border-accent/60 focus:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || disabled}
              className="px-3 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          {!disabled && (
            <p className="mt-1.5 text-[10px] text-slate-600">
              Ask questions mid-run — agents maintain context and respond in-line
            </p>
          )}
        </div>
      )}
    </div>
  );
}
