import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import type {
  EnvironmentId,
  ThreadId,
  ThreadStatusSnapshot,
  ThreadStatusState,
  ThreadStatusStreamEvent,
} from "@t3tools/contracts";
import { create } from "zustand";

export interface ThreadStatusEntry {
  readonly threadId: ThreadId;
  readonly primaryStatus: ThreadStatusState["primaryStatus"];
  readonly pendingApproval: boolean;
  readonly awaitingInput: boolean;
  readonly working: boolean;
  readonly completed: boolean;
  readonly connecting: boolean;
  readonly planReady: boolean;
  readonly terminal: boolean;
  readonly latestTurnId: ThreadStatusState["latestTurnId"];
  readonly completedAt: string | null;
  readonly readAt: string | null;
  readonly manuallyMarkedUnreadAt: string | null;
  readonly updatedAt: string;
  readonly revision: number;
}

interface ThreadStatusStoreState {
  readonly statusByThreadKey: Record<string, ThreadStatusEntry>;
  readonly syncSnapshot: (environmentId: EnvironmentId, snapshot: ThreadStatusSnapshot) => void;
  readonly applyStreamEvent: (environmentId: EnvironmentId, event: ThreadStatusStreamEvent) => void;
  readonly applyState: (environmentId: EnvironmentId, state: ThreadStatusState) => void;
  readonly clearThread: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
    revision?: number,
  ) => void;
  readonly removeOrphanedThreads: (
    activeThreadKeys: ReadonlySet<string>,
    environmentId?: EnvironmentId,
  ) => void;
}

function keyFor(environmentId: EnvironmentId, threadId: ThreadId): string {
  return scopedThreadKey(scopeThreadRef(environmentId, threadId));
}

function environmentKeyPrefix(environmentId: EnvironmentId): string {
  return `${environmentId}:`;
}

function entryFromState(state: ThreadStatusState): ThreadStatusEntry {
  return {
    threadId: state.threadId,
    primaryStatus: state.primaryStatus,
    pendingApproval: state.pendingApproval,
    awaitingInput: state.awaitingInput,
    working: state.working,
    completed: state.completed,
    connecting: state.connecting,
    planReady: state.planReady,
    terminal: state.terminal,
    latestTurnId: state.latestTurnId,
    completedAt: state.completedAt,
    readAt: state.readAt,
    manuallyMarkedUnreadAt: state.manuallyMarkedUnreadAt,
    updatedAt: state.updatedAt,
    revision: state.revision,
  };
}

function shouldApplyRevision(previous: ThreadStatusEntry | undefined, revision: number): boolean {
  return previous === undefined || revision > previous.revision;
}

export const useThreadStatusStore = create<ThreadStatusStoreState>()((set) => ({
  statusByThreadKey: {},
  syncSnapshot: (environmentId, snapshot) =>
    set((state) => {
      const prefix = environmentKeyPrefix(environmentId);
      const next = Object.fromEntries(
        Object.entries(state.statusByThreadKey).filter(([key]) => !key.startsWith(prefix)),
      ) as Record<string, ThreadStatusEntry>;
      for (const threadStatus of snapshot.states) {
        next[keyFor(environmentId, threadStatus.threadId)] = entryFromState(threadStatus);
      }
      return { statusByThreadKey: next };
    }),
  applyStreamEvent: (environmentId, event) => {
    if (event.type === "snapshot") {
      useThreadStatusStore.getState().syncSnapshot(environmentId, event.snapshot);
      return;
    }
    if (event.type === "state-cleared") {
      useThreadStatusStore.getState().clearThread(environmentId, event.threadId, event.revision);
      return;
    }
    useThreadStatusStore.getState().applyState(environmentId, event.state);
  },
  applyState: (environmentId, threadStatus) =>
    set((state) => {
      const key = keyFor(environmentId, threadStatus.threadId);
      const previous = state.statusByThreadKey[key];
      if (!shouldApplyRevision(previous, threadStatus.revision)) {
        return state;
      }
      return {
        statusByThreadKey: {
          ...state.statusByThreadKey,
          [key]: entryFromState(threadStatus),
        },
      };
    }),
  clearThread: (environmentId, threadId, revision) =>
    set((state) => {
      const key = keyFor(environmentId, threadId);
      const previous = state.statusByThreadKey[key];
      if (!previous || (revision !== undefined && !shouldApplyRevision(previous, revision))) {
        return state;
      }
      const next = { ...state.statusByThreadKey };
      delete next[key];
      return { statusByThreadKey: next };
    }),
  removeOrphanedThreads: (activeThreadKeys, environmentId) =>
    set((state) => {
      const prefix = environmentId ? environmentKeyPrefix(environmentId) : null;
      const shouldRetainThreadKey = (key: string) =>
        prefix !== null && !key.startsWith(prefix) ? true : activeThreadKeys.has(key);
      const next = Object.fromEntries(
        Object.entries(state.statusByThreadKey).filter(([key]) => shouldRetainThreadKey(key)),
      ) as Record<string, ThreadStatusEntry>;
      if (Object.keys(next).length === Object.keys(state.statusByThreadKey).length) {
        return state;
      }
      return { statusByThreadKey: next };
    }),
}));

export function selectThreadStatusEntry(
  state: ThreadStatusStoreState,
  environmentId: EnvironmentId,
  threadId: ThreadId,
): ThreadStatusEntry | undefined {
  return state.statusByThreadKey[keyFor(environmentId, threadId)];
}
