import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChatMessage, TestCase, AgentState, AgentName,
} from "./testStore";

/* ── Full session snapshot (everything needed to revisit a past run) ──────── */
export interface SessionSnapshot {
  // ── Identity / status ──────────────────────────────────────────────────
  sessionId:        string;
  requirement:      string;
  targetUrl:        string;
  status:           "completed" | "failed" | "cancelled";
  completedAt:      string;   // ISO string

  // ── Summary stats (for list view) ─────────────────────────────────────
  qualityScore:     number | null;
  testCount:        number;
  passedCount:      number;
  reportId?:        string;
  recordingFilename: string | null;  // full path e.g. /local-storage/recordings/xxx.mp4

  // ── Full session data (for revisit) ───────────────────────────────────
  messages:   ChatMessage[];
  testCases:  TestCase[];
  agents:     Record<AgentName, AgentState>;
  summary:    string | null;
  report:     { reportId: string; data: Record<string, unknown> } | null;
  // Note: browserActions (screenshots) intentionally excluded — too large for localStorage
}

interface SessionsState {
  history: SessionSnapshot[];
  addOrUpdateSession: (s: SessionSnapshot) => void;
  clearHistory: () => void;
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set) => ({
      history: [],

      addOrUpdateSession: (s) =>
        set((state) => ({
          history: [
            s,
            ...state.history.filter((h) => h.sessionId !== s.sessionId),
          ].slice(0, 100),  // keep last 100 sessions
        })),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name:    "aethertest-sessions",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
