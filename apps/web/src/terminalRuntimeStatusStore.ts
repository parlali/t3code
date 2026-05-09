import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import type {
  EnvironmentId,
  TerminalEvent,
  TerminalRuntimeSessionStatus as ContractTerminalRuntimeSessionStatus,
  TerminalRuntimeStatusSnapshot,
  TerminalSessionSnapshot,
  ThreadId,
} from "@t3tools/contracts";
import { ThreadId as ThreadIdSchema } from "@t3tools/contracts";
import { create } from "zustand";

export interface TerminalRuntimeSessionStatus {
  readonly threadId: ThreadId;
  readonly terminalId: string;
  readonly status: ContractTerminalRuntimeSessionStatus["status"];
  readonly hasRunningSubprocess: boolean;
  readonly updatedAt: string;
}

export interface ThreadTerminalRuntimeStatus {
  readonly terminalIds: readonly string[];
  readonly openTerminalIds: readonly string[];
  readonly runningTerminalIds: readonly string[];
}

interface TerminalRuntimeStatusStoreState {
  readonly sessionByTerminalKey: Record<string, TerminalRuntimeSessionStatus>;
  readonly syncSnapshot: (
    environmentId: EnvironmentId,
    snapshot: TerminalRuntimeStatusSnapshot,
  ) => void;
  readonly applyTerminalEvent: (environmentId: EnvironmentId, event: TerminalEvent) => void;
  readonly removeThread: (environmentId: EnvironmentId, threadId: ThreadId) => void;
  readonly selectThreadStatus: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
  ) => ThreadTerminalRuntimeStatus;
}

function terminalKey(environmentId: EnvironmentId, threadId: ThreadId, terminalId: string): string {
  return `${scopedThreadKey(scopeThreadRef(environmentId, threadId))}:${terminalId}`;
}

function environmentKeyPrefix(environmentId: EnvironmentId): string {
  return `${environmentId}:`;
}

function statusFromSnapshot(snapshot: TerminalSessionSnapshot): TerminalRuntimeSessionStatus {
  return {
    threadId: ThreadIdSchema.make(snapshot.threadId),
    terminalId: snapshot.terminalId,
    status: snapshot.status,
    hasRunningSubprocess: false,
    updatedAt: snapshot.updatedAt,
  };
}

function statusFromRuntimeSession(
  session: ContractTerminalRuntimeSessionStatus,
): TerminalRuntimeSessionStatus {
  return {
    threadId: ThreadIdSchema.make(session.threadId),
    terminalId: session.terminalId,
    status: session.status,
    hasRunningSubprocess: session.hasRunningSubprocess,
    updatedAt: session.updatedAt,
  };
}

function statusFromEvent(
  event: TerminalEvent,
  previous: TerminalRuntimeSessionStatus | undefined,
): TerminalRuntimeSessionStatus | null {
  const threadId = ThreadIdSchema.make(event.threadId);
  switch (event.type) {
    case "started":
    case "restarted":
      return statusFromSnapshot(event.snapshot);
    case "activity":
      return {
        threadId,
        terminalId: event.terminalId,
        status: previous?.status ?? "running",
        hasRunningSubprocess: event.hasRunningSubprocess,
        updatedAt: event.createdAt,
      };
    case "exited":
      return {
        threadId,
        terminalId: event.terminalId,
        status: "exited",
        hasRunningSubprocess: false,
        updatedAt: event.createdAt,
      };
    case "error":
      return {
        threadId,
        terminalId: event.terminalId,
        status: "error",
        hasRunningSubprocess: false,
        updatedAt: event.createdAt,
      };
    case "output":
    case "cleared":
      return previous ?? null;
  }
}

export const useTerminalRuntimeStatusStore = create<TerminalRuntimeStatusStoreState>()(
  (set, get) => ({
    sessionByTerminalKey: {},
    syncSnapshot: (environmentId, snapshot) =>
      set((state) => {
        const prefix = environmentKeyPrefix(environmentId);
        const next = Object.fromEntries(
          Object.entries(state.sessionByTerminalKey).filter(([key]) => !key.startsWith(prefix)),
        ) as Record<string, TerminalRuntimeSessionStatus>;
        for (const session of snapshot.sessions) {
          const status = statusFromRuntimeSession(session);
          next[terminalKey(environmentId, status.threadId, status.terminalId)] = status;
        }
        return { sessionByTerminalKey: next };
      }),
    applyTerminalEvent: (environmentId, event) =>
      set((state) => {
        const threadId = ThreadIdSchema.make(event.threadId);
        const key = terminalKey(environmentId, threadId, event.terminalId);
        const nextStatus = statusFromEvent(event, state.sessionByTerminalKey[key]);
        if (!nextStatus) {
          return state;
        }
        return {
          sessionByTerminalKey: {
            ...state.sessionByTerminalKey,
            [key]: nextStatus,
          },
        };
      }),
    removeThread: (environmentId, threadId) =>
      set((state) => {
        const prefix = `${scopedThreadKey(scopeThreadRef(environmentId, threadId))}:`;
        const next = Object.fromEntries(
          Object.entries(state.sessionByTerminalKey).filter(([key]) => !key.startsWith(prefix)),
        ) as Record<string, TerminalRuntimeSessionStatus>;
        if (Object.keys(next).length === Object.keys(state.sessionByTerminalKey).length) {
          return state;
        }
        return { sessionByTerminalKey: next };
      }),
    selectThreadStatus: (environmentId, threadId) => {
      const prefix = `${scopedThreadKey(scopeThreadRef(environmentId, threadId))}:`;
      const sessions = Object.entries(get().sessionByTerminalKey)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, session]) => session);
      return {
        terminalIds: sessions.map((session) => session.terminalId),
        openTerminalIds: sessions
          .filter((session) => session.status === "running" || session.status === "starting")
          .map((session) => session.terminalId),
        runningTerminalIds: sessions
          .filter((session) => session.hasRunningSubprocess)
          .map((session) => session.terminalId),
      };
    },
  }),
);

export function selectThreadTerminalRuntimeStatus(
  state: TerminalRuntimeStatusStoreState,
  environmentId: EnvironmentId,
  threadId: ThreadId,
): ThreadTerminalRuntimeStatus {
  return state.selectThreadStatus(environmentId, threadId);
}
