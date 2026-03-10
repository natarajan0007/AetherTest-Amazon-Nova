"use client";
import { useState, useRef, useEffect } from "react";
import {
  Film, Play, Pause, Download, Volume2, VolumeX,
  SkipBack, Maximize2, Clock, AlertCircle,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

interface Props {
  filename:  string | null;
  isRunning: boolean;
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordingPlayer({ filename, isRunning }: Props) {
  const videoRef   = useRef<HTMLVideoElement | null>(null);
  const [playing,  setPlaying]  = useState(false);
  const [muted,    setMuted]    = useState(true);
  const [current,  setCurrent]  = useState(0);
  const [duration, setDuration] = useState(0);
  const [error,    setError]    = useState(false);

  const videoUrl = filename ? `${API}${filename}` : null;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime  = () => setCurrent(v.currentTime);
    const onMeta  = () => setDuration(v.duration);
    const onError = () => setError(true);
    v.addEventListener("play",  onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate",     onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error",          onError);
    return () => {
      v.removeEventListener("play",  onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate",     onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error",          onError);
    };
  }, [videoUrl]);

  const togglePlay = () => { const v = videoRef.current; if (!v) return; playing ? v.pause() : v.play(); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); };
  const restart    = () => { const v = videoRef.current; if (!v) return; v.currentTime = 0; v.play(); };
  const seekTo     = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    v.currentTime = parseFloat(e.target.value);
  };
  const fullscreen = () => videoRef.current?.requestFullscreen();
  const download   = () => {
    if (!videoUrl || !filename) return;
    const a = document.createElement("a");
    a.href = videoUrl; a.download = filename.split("/").pop() ?? "recording.mp4"; a.click();
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  /* ── Empty / recording-in-progress state ─────────────────────────────── */
  if (!videoUrl) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 text-center px-6 bg-[#050810]">
        {isRunning ? (
          <>
            <div className="relative">
              <Film className="w-12 h-12 text-slate-700" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-error animate-pulse" />
            </div>
            <div>
              <p className="text-charcoal text-sm font-semibold">Recording in progress…</p>
              <p className="text-text-secondary text-xs mt-1">The MP4 will appear here when the test completes.</p>
            </div>
          </>
        ) : (
          <>
            <Film className="w-12 h-12 text-slate-700" />
            <p className="text-text-secondary text-sm">No recording for this session.</p>
          </>
        )}
      </div>
    );
  }

  /* ── Video player ─────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full bg-black">

      {/* Video area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black relative group">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <AlertCircle className="w-10 h-10 text-error" />
            <p className="text-text-primary text-sm">Could not load recording.</p>
            <p className="text-[11px] text-text-secondary font-mono break-all">{videoUrl}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              muted={muted}
              className="max-w-full max-h-full object-contain"
              onClick={togglePlay}
              playsInline
            />
            {!playing && !error && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/45 transition-colors"
              >
                <div className="w-16 h-16 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm flex items-center justify-center transition-colors">
                  <Play className="w-7 h-7 text-white fill-white ml-1" />
                </div>
              </button>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {!error && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-900/90 px-4 py-3 space-y-2">
          {/* Seek bar */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span className="w-10 text-right">{formatTime(current)}</span>
            <div className="relative flex-1 h-1.5">
              <div className="h-full bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-none" style={{ width: `${pct}%` }} />
              </div>
              <input
                type="range" min={0} max={duration || 1} step={0.1} value={current}
                onChange={seekTo}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              />
            </div>
            <span className="w-10">{formatTime(duration)}</span>
          </div>

          {/* Button row */}
          <div className="flex items-center gap-1">
            <button onClick={restart}     className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors" title="Restart">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={togglePlay}  className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/8 transition-colors">
              {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <button onClick={toggleMute}  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors" title={muted ? "Unmute" : "Mute"}>
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div className="flex-1" />
            {duration > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-slate-500 mr-2">
                <Clock className="w-3 h-3" /> {formatTime(duration)}
              </span>
            )}
            <button onClick={fullscreen} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors" title="Fullscreen">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={download}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-accent hover:border-accent/50 hover:bg-accent/8 text-[11px] font-semibold ml-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> MP4
            </button>
          </div>

          <p className="text-[9px] text-slate-600 font-mono truncate">{filename?.split("/").pop()}</p>
        </div>
      )}
    </div>
  );
}
