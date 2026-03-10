import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AgentName =
  | "orchestrator"
  | "requirement-analyst"
  | "test-case-architect"
  | "browser-specialist"
  | "monitor-validator"
  | "report-generator";

export type AgentStatus = "idle" | "working" | "done" | "error";

export interface AgentState {
  name: AgentName;
  status: AgentStatus;
  lastMessage: string;
}

export interface TestCase {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "running" | "passed" | "failed" | "blocked" | "skipped";
  evidence?: string;
}

export interface BrowserAction {
  action: string;
  screenshot?: string;
  timestamp: number;
}

export interface MonitorResult {
  testId: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  evidence: string;
  timestamp: number;
}

export interface Report {
  reportId: string;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "agent";
  content: string;
  agent?: string;
  timestamp: number;
}

export interface TestSession {
  sessionId: string | null;
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  requirement: string;
  targetUrl: string;
  testCaseCount: number;
  agents: Record<AgentName, AgentState>;
  testCases: TestCase[];
  browserActions: BrowserAction[];
  monitorResults: MonitorResult[];
  report: Report | null;
  qualityScore: number | null;
  summary: string | null;
  messages: ChatMessage[];
  isConnected: boolean;
  recordingFilename: string | null;
}

const DEFAULT_AGENTS: Record<AgentName, AgentState> = {
  orchestrator:          { name: "orchestrator",          status: "idle", lastMessage: "" },
  "requirement-analyst": { name: "requirement-analyst",   status: "idle", lastMessage: "" },
  "test-case-architect": { name: "test-case-architect",   status: "idle", lastMessage: "" },
  "browser-specialist":  { name: "browser-specialist",    status: "idle", lastMessage: "" },
  "monitor-validator":   { name: "monitor-validator",     status: "idle", lastMessage: "" },
  "report-generator":    { name: "report-generator",      status: "idle", lastMessage: "" },
};

export interface SessionRestoreData {
  sessionId:         string;
  status:            TestSession["status"];
  requirement:       string;
  targetUrl:         string;
  agents:            Record<AgentName, AgentState>;
  testCases:         TestCase[];
  report:            { reportId: string; data: Record<string, unknown> } | null;
  qualityScore:      number | null;
  summary:           string | null;
  messages:          ChatMessage[];
  recordingFilename: string | null;
}

interface TestStore extends TestSession {
  setSession:       (id: string)                              => void;
  setRequirement:   (r: string)                               => void;
  setTargetUrl:     (u: string)                               => void;
  setTestCaseCount: (n: number)                               => void;
  setConnected:     (v: boolean)                              => void;
  setStatus:        (s: TestSession["status"])                => void;

  updateAgent:      (name: AgentName, status: AgentStatus, message: string) => void;
  setTestCases:     (cases: TestCase[])                       => void;
  addTestCases:     (cases: TestCase[])                       => void;
  updateTestCase:   (id: string, update: Partial<TestCase>)   => void;
  addBrowserAction: (action: string, screenshot?: string)     => void;
  addMonitorResult: (result: MonitorResult)                   => void;
  setReport:        (reportId: string, data: Record<string, unknown>) => void;
  setComplete:      (summary: string, score: number)          => void;
  addMessage:       (role: "user" | "agent", content: string, agent?: string) => void;
  setRecording:     (filename: string | null)                 => void;
  restoreSession:   (data: SessionRestoreData)                => void;
  reset:            ()                                        => void;
}

const initialState: TestSession = {
  sessionId:       null,
  status:          "idle",
  requirement:     "",
  targetUrl:       "",
  testCaseCount:   20,
  agents:          { ...DEFAULT_AGENTS },
  testCases:       [],
  browserActions:  [],
  monitorResults:  [],
  report:          null,
  qualityScore:    null,
  summary:         null,
  messages:        [],
  isConnected:     false,
  recordingFilename: null,
};

export const useTestStore = create<TestStore>()(
  persist(
    (set) => ({
      ...initialState,

      setSession:       (id) => set({ sessionId: id }),
      setRequirement:   (r)  => set({ requirement: r }),
      setTargetUrl:     (u)  => set({ targetUrl: u }),
      setTestCaseCount: (n)  => set({ testCaseCount: n }),
      setConnected:     (v)  => set({ isConnected: v }),
      setStatus:        (s)  => set({ status: s }),

      updateAgent: (name, status, message) =>
        set((state) => ({
          agents: { ...state.agents, [name]: { name, status, lastMessage: message } },
        })),

      setTestCases: (cases) => set({ testCases: cases }),

      addTestCases: (cases) =>
        set((state) => {
          // Add new test cases, avoiding duplicates by id
          const existingIds = new Set(state.testCases.map(tc => tc.id));
          const newCases = cases.filter(tc => !existingIds.has(tc.id));
          return { testCases: [...state.testCases, ...newCases] };
        }),

      updateTestCase: (id, update) =>
        set((state) => ({
          testCases: state.testCases.map((tc) => {
            // Normalize both IDs for comparison (case-insensitive, handle TC001 vs TC-001)
            const normalizeId = (testId: string) => testId.toUpperCase().replace(/TC-?(\d+)/i, 'TC-$1');
            return normalizeId(tc.id) === normalizeId(id) ? { ...tc, ...update } : tc;
          }),
        })),

      addBrowserAction: (action, screenshot) =>
        set((state) => ({
          browserActions: [...state.browserActions, { action, screenshot, timestamp: Date.now() }],
        })),

      addMonitorResult: (result) =>
        set((state) => ({ monitorResults: [...state.monitorResults, result] })),

      setReport: (reportId, data) => set({ report: { reportId, data } }),

      setComplete: (summary, qualityScore) =>
        set({ summary, qualityScore, status: "completed" }),

      addMessage: (role, content, agent) =>
        set((state) => ({
          messages: [...state.messages, { role, content, agent, timestamp: Date.now() }],
        })),

      setRecording: (filename) => set({ recordingFilename: filename }),

      restoreSession: (data) =>
        set({
          sessionId:        data.sessionId,
          status:           data.status,
          requirement:      data.requirement,
          targetUrl:        data.targetUrl,
          agents:           data.agents,
          testCases:        data.testCases,
          report:           data.report,
          qualityScore:     data.qualityScore,
          summary:          data.summary,
          messages:         data.messages,
          recordingFilename: data.recordingFilename,
          browserActions:   [],    // not stored in history (screenshots too large)
          monitorResults:   [],
          isConnected:      false,
        }),

      reset: () => set(initialState),
    }),
    {
      name: "aethertest-session",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionId:        state.sessionId,
        status:           state.status,
        requirement:      state.requirement,
        targetUrl:        state.targetUrl,
        testCaseCount:    state.testCaseCount,
        agents:           state.agents,
        testCases:        state.testCases,
        browserActions:   state.browserActions,
        monitorResults:   state.monitorResults,
        report:           state.report,
        qualityScore:     state.qualityScore,
        summary:          state.summary,
        messages:         state.messages,
        recordingFilename: state.recordingFilename,
      }),
    }
  )
);
