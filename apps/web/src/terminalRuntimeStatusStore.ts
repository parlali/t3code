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

const EMPTY_TERMINAL_IDS: readonly string[] = Object.freeze([]);
const EMPTY_THREAD_TERMINAL_RUNTIME_STATUS: ThreadTerminalRuntimeStatus = Object.freeze({
  terminalIds: EMPTY_TERMINAL_IDS,
  openTerminalIds: EMPTY_TERMINAL_IDS,
  runningTerminalIds: EMPTY_TERMINAL_IDS,
});
const threadStatusCache = new WeakMap<
  Record<string, TerminalRuntimeSessionStatus>,
  Map<string, ThreadTerminalRuntimeStatus>
>();

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

function terminalRuntimeSessionStatusEqual(
  left: TerminalRuntimeSessionStatus | undefined,
  right: TerminalRuntimeSessionStatus | undefined,
): boolean {
  return (
    left?.threadId === right?.threadId &&
    left?.terminalId === right?.terminalId &&
    left?.status === right?.status &&
    left?.hasRunningSubprocess === right?.hasRunningSubprocess &&
    left?.updatedAt === right?.updatedAt
  );
}

function sessionByTerminalKeyEqual(
  left: Record<string, TerminalRuntimeSessionStatus>,
  right: Record<string, TerminalRuntimeSessionStatus>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!terminalRuntimeSessionStatusEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

function buildThreadRuntimeStatus(
  sessionByTerminalKey: Record<string, TerminalRuntimeSessionStatus>,
  environmentId: EnvironmentId,
  threadId: ThreadId,
): ThreadTerminalRuntimeStatus {
  const threadKey = scopedThreadKey(scopeThreadRef(environmentId, threadId));
  let cachedByThread = threadStatusCache.get(sessionByTerminalKey);
  if (!cachedByThread) {
    cachedByThread = new Map();
    threadStatusCache.set(sessionByTerminalKey, cachedByThread);
  }

  const cached = cachedByThread.get(threadKey);
  if (cached) {
    return cached;
  }

  const prefix = `${threadKey}:`;
  const sessions = Object.entries(sessionByTerminalKey)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, session]) => session);

  if (sessions.length === 0) {
    cachedByThread.set(threadKey, EMPTY_THREAD_TERMINAL_RUNTIME_STATUS);
    return EMPTY_THREAD_TERMINAL_RUNTIME_STATUS;
  }

  const terminalIds = Object.freeze(sessions.map((session) => session.terminalId));
  const openTerminalIds = Object.freeze(
    sessions
      .filter((session) => session.status === "running" || session.status === "starting")
      .map((session) => session.terminalId),
  );
  const runningTerminalIds = Object.freeze(
    sessions.filter((session) => session.hasRunningSubprocess).map((session) => session.terminalId),
  );
  const status = Object.freeze({
    terminalIds,
    openTerminalIds,
    runningTerminalIds,
  });
  cachedByThread.set(threadKey, status);
  return status;
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
        if (sessionByTerminalKeyEqual(state.sessionByTerminalKey, next)) {
          return state;
        }
        return { sessionByTerminalKey: next };
      }),
    applyTerminalEvent: (environmentId, event) =>
      set((state) => {
        const threadId = ThreadIdSchema.make(event.threadId);
        const key = terminalKey(environmentId, threadId, event.terminalId);
        const previousStatus = state.sessionByTerminalKey[key];
        const nextStatus = statusFromEvent(event, previousStatus);
        if (!nextStatus) {
          return state;
        }
        if (terminalRuntimeSessionStatusEqual(previousStatus, nextStatus)) {
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
    selectThreadStatus: (environmentId, threadId) =>
      selectThreadTerminalRuntimeStatus(get(), environmentId, threadId),
  }),
);

export function selectThreadTerminalRuntimeStatus(
  state: TerminalRuntimeStatusStoreState,
  environmentId: EnvironmentId,
  threadId: ThreadId,
): ThreadTerminalRuntimeStatus {
  return buildThreadRuntimeStatus(state.sessionByTerminalKey, environmentId, threadId);
}
