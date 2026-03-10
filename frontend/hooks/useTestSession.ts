"use client";
import { useCallback } from "react";
import { useTestStore } from "@/store/testStore";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export function useTestSession() {
  const store = useTestStore();

  const startSession = useCallback(
    async (
      requirement:     string,
      targetUrl:       string,
      credentialName?: string,
      testCaseCount?:  number,
    ) => {
      store.reset();
      store.setRequirement(requirement);
      store.setTargetUrl(targetUrl);
      const count = testCaseCount ?? store.testCaseCount;
      store.setTestCaseCount(count);
      store.setStatus("running");
      store.addMessage("user", requirement);

      const resp = await fetch(`${API}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement,
          target_url:      targetUrl,
          credential_name: credentialName || null,
          test_case_count: count,
        }),
      });

      if (!resp.ok) {
        store.setStatus("failed");
        throw new Error(`Failed to create session: ${resp.statusText}`);
      }

      const session = await resp.json();
      store.setSession(session.id);
      return session.id as string;
    },
    [store]
  );

  const cancelSession = useCallback(
    async (sessionId: string) => {
      await fetch(`${API}/api/sessions/${sessionId}`, { method: "DELETE" });
      store.setStatus("cancelled");
    },
    [store]
  );

  const saveCredential = useCallback(
    async (name: string, username: string, password: string) => {
      const resp = await fetch(`${API}/api/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password }),
      });
      if (!resp.ok) throw new Error("Failed to save credential");
      return resp.json();
    },
    []
  );

  return { ...store, startSession, cancelSession, saveCredential };
}
