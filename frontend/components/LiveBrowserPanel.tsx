"use client";
import { useState, useEffect } from "react";
import { useTestStore } from "@/store/testStore";
import { Monitor, RefreshCw, ExternalLink, Image, Radio } from "lucide-react";

const NOVNC_URL = process.env.NEXT_PUBLIC_NOVNC_URL ?? "http://localhost:6080";
const VNC_URL   = `${NOVNC_URL}/vnc.html?autoconnect=true&reconnect=true&reconnect_delay=2000&resize=scale&quality=8&show_dot=true`;

type ViewMode = "vnc" | "screenshot";

export function LiveBrowserPanel() {
  const [key,        setKey]        = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [mode,       setMode]       = useState<ViewMode>("vnc");
  const [sandboxOk,  setSandboxOk]  = useState<boolean | null>(null);
  const [selectedIdx,setSelectedIdx]= useState<number | null>(null);

  const browserActions = useTestStore((s) => s.browserActions);
  const shots      = browserActions.filter((a) => a.screenshot);
  const latestShot = shots.length > 0 ? shots[shots.length - 1].screenshot : undefined;
  const displayShot = selectedIdx !== null ? shots[selectedIdx]?.screenshot : latestShot;

  useEffect(() => {
    const check = async () => {
      try {
        await fetch(`${NOVNC_URL}/`, { mode: "no-cors", signal: AbortSignal.timeout(3000) });
        setSandboxOk(true); setLoading(false);
      } catch {
        setSandboxOk(false); setLoading(false);
      }
    };
    check();
    const id = setInterval(check, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(t);
  }, [key]);

  const reload = () => { setLoading(true); setKey((k) => k + 1); };

  return (
    <div className="flex flex-col h-full bg-[#050810]">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border bg-surface-card/70 shrink-0">
        <div className="flex items-center gap-2.5">
          <Monitor className="w-4 h-4 text-text-secondary" />
          <span className="text-xs font-semibold text-charcoal">Live Browser</span>
          <span className={`w-2 h-2 rounded-full transition-colors ${
            sandboxOk === true  ? "bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]" :
            sandboxOk === false ? "bg-error"   : "bg-warning animate-pulse"
          }`} />
        </div>

        <div className="flex items-center gap-1">
          {/* VNC ↔ Screenshot toggle */}
          <div className="flex items-center bg-background/60 rounded-lg p-0.5 mr-2 border border-border">
            {(["vnc", "screenshot"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  mode === m
                    ? "bg-surface-card text-charcoal shadow-subtle"
                    : "text-text-secondary hover:text-charcoal"
                }`}
              >
                {m === "vnc" ? <Monitor className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                {m === "vnc" ? "VNC" : "Screenshots"}
              </button>
            ))}
          </div>

          <button onClick={reload} className="p-1.5 rounded-md text-text-secondary hover:text-charcoal hover:bg-white/5 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={VNC_URL} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-md text-text-secondary hover:text-charcoal hover:bg-white/5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">

        {/* ── VNC mode ── */}
        {mode === "vnc" && (
          <>
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#050810]">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <p className="text-xs text-text-secondary">Connecting to sandbox…</p>
              </div>
            )}
            {sandboxOk === false && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-8 bg-[#050810]">
                <Monitor className="w-12 h-12 text-slate-700" />
                <div className="text-center space-y-2">
                  <p className="text-charcoal font-semibold text-sm">Sandbox not reachable</p>
                  <p className="text-text-secondary text-xs leading-relaxed">Start the sandbox container:</p>
                  <code className="block text-text-secondary bg-surface-card border border-border px-3 py-2 rounded-lg text-[11px]">
                    docker-compose up browser-sandbox
                  </code>
                </div>
                <button onClick={reload} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            )}
            <iframe
              key={key}
              src={VNC_URL}
              className="w-full h-full border-0"
              title="Live Browser"
              allow="fullscreen"
              onLoad={() => setLoading(false)}
            />
          </>
        )}

        {/* ── Screenshot mode ── */}
        {mode === "screenshot" && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Sub-header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-border bg-surface-card/40 shrink-0">
              <span className="text-[11px] text-text-secondary font-mono">
                {shots.length === 0
                  ? "No screenshots"
                  : selectedIdx !== null
                  ? `Shot ${selectedIdx + 1} / ${shots.length}`
                  : `Latest  (${shots.length} total)`}
              </span>
              {selectedIdx !== null && (
                <button
                  onClick={() => setSelectedIdx(null)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-success hover:text-green-400 transition-colors"
                >
                  <Radio className="w-3 h-3" /> Live
                </button>
              )}
            </div>

            {/* Main screenshot */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-[#050810]">
              {displayShot ? (
                <img
                  src={`data:image/png;base64,${displayShot}`}
                  alt="Browser state"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-surface-border/60"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <Image className="w-12 h-12 text-slate-700" />
                  <p className="text-text-secondary text-sm font-medium">No screenshots yet</p>
                  <p className="text-slate-600 text-xs">Screenshots appear here as agents navigate</p>
                </div>
              )}
            </div>

            {/* Screenshot strip */}
            {shots.length > 1 && (
              <div className="shrink-0 border-t border-surface-border bg-surface-card/60 p-2">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {shots.map((a, i) => {
                    const isSelected = selectedIdx === i || (selectedIdx === null && i === shots.length - 1);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedIdx(i)}
                        className={`relative h-16 w-auto rounded shrink-0 overflow-hidden transition-all border-2 ${
                          isSelected
                            ? "border-accent shadow-[0_0_8px_rgba(56,189,248,0.4)]"
                            : "border-surface-border hover:border-accent/50"
                        }`}
                        title={a.action}
                      >
                        <img
                          src={`data:image/png;base64,${a.screenshot}`}
                          alt={`Step ${i + 1}`}
                          className="h-full w-auto object-cover"
                        />
                        <span className="absolute bottom-0 left-0 right-0 text-center bg-black/50 text-[9px] text-slate-300 py-px">
                          {i + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
