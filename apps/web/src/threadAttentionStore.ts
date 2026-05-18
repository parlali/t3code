import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import type {
  EnvironmentId,
  ThreadAttentionSnapshot,
  ThreadAttentionState,
  ThreadAttentionStreamEvent,
  ThreadId,
} from "@t3tools/contracts";
import { create } from "zustand";

export interface ThreadAttentionEntry {
  readonly threadId: ThreadId;
  readonly kind: ThreadAttentionState["kind"];
  readonly turnId: ThreadAttentionState["turnId"];
  readonly attentionAt: string;
  readonly acknowledgedAt: string | null;
  readonly updatedAt: string;
  readonly revision: number;
}

interface ThreadAttentionStoreState {
  readonly attentionByThreadKey: Record<string, ThreadAttentionEntry>;
  readonly manuallyUnseenThreadKeys: Record<string, true>;
  readonly syncSnapshot: (environmentId: EnvironmentId, snapshot: ThreadAttentionSnapshot) => void;
  readonly applyStreamEvent: (
    environmentId: EnvironmentId,
    event: ThreadAttentionStreamEvent,
  ) => void;
  readonly applyState: (environmentId: EnvironmentId, state: ThreadAttentionState) => void;
  readonly holdThreadUnseen: (environmentId: EnvironmentId, threadId: ThreadId) => void;
  readonly releaseThreadUnseenHold: (environmentId: EnvironmentId, threadId: ThreadId) => void;
  readonly clearThread: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
    revision?: number,
  ) => void;
  readonly removeOrphanedThreads: (activeThreadKeys: ReadonlySet<string>) => void;
}

function keyFor(environmentId: EnvironmentId, threadId: ThreadId): string {
  return scopedThreadKey(scopeThreadRef(environmentId, threadId));
}

function environmentKeyPrefix(environmentId: EnvironmentId): string {
  return `${environmentId}:`;
}

function entryFromState(state: ThreadAttentionState): ThreadAttentionEntry {
  return {
    threadId: state.threadId,
    kind: state.kind,
    turnId: state.turnId,
    attentionAt: state.attentionAt,
    acknowledgedAt: state.acknowledgedAt,
    updatedAt: state.updatedAt,
    revision: state.revision,
  };
}

function shouldApplyRevision(
  previous: ThreadAttentionEntry | undefined,
  revision: number,
): boolean {
  return previous === undefined || revision >= previous.revision;
}

export const useThreadAttentionStore = create<ThreadAttentionStoreState>()((set) => ({
  attentionByThreadKey: {},
  manuallyUnseenThreadKeys: {},
  syncSnapshot: (environmentId, snapshot) =>
    set((state) => {
      const prefix = environmentKeyPrefix(environmentId);
      const next = Object.fromEntries(
        Object.entries(state.attentionByThreadKey).filter(([key]) => !key.startsWith(prefix)),
      ) as Record<string, ThreadAttentionEntry>;
      for (const attentionState of snapshot.states) {
        const key = keyFor(environmentId, attentionState.threadId);
        const previous = state.attentionByThreadKey[key];
        next[key] =
          previous && previous.revision > attentionState.revision
            ? previous
            : entryFromState(attentionState);
      }
      return { attentionByThreadKey: next };
    }),
  applyStreamEvent: (environmentId, event) => {
    if (event.type === "snapshot") {
      useThreadAttentionStore.getState().syncSnapshot(environmentId, event.snapshot);
      return;
    }
    if (event.type === "state-cleared") {
      useThreadAttentionStore.getState().clearThread(environmentId, event.threadId, event.revision);
      return;
    }
    useThreadAttentionStore.getState().applyState(environmentId, event.state);
  },
  applyState: (environmentId, attentionState) =>
    set((state) => {
      const key = keyFor(environmentId, attentionState.threadId);
      const previous = state.attentionByThreadKey[key];
      if (!shouldApplyRevision(previous, attentionState.revision)) {
        return state;
      }
      return {
        attentionByThreadKey: {
          ...state.attentionByThreadKey,
          [key]: entryFromState(attentionState),
        },
      };
    }),
  holdThreadUnseen: (environmentId, threadId) =>
    set((state) => {
      const key = keyFor(environmentId, threadId);
      if (state.manuallyUnseenThreadKeys[key]) {
        return state;
      }
      return {
        manuallyUnseenThreadKeys: {
          ...state.manuallyUnseenThreadKeys,
          [key]: true,
        },
      };
    }),
  releaseThreadUnseenHold: (environmentId, threadId) =>
    set((state) => {
      const key = keyFor(environmentId, threadId);
      if (!state.manuallyUnseenThreadKeys[key]) {
        return state;
      }
      const next = { ...state.manuallyUnseenThreadKeys };
      delete next[key];
      return { manuallyUnseenThreadKeys: next };
    }),
  clearThread: (environmentId, threadId, revision) =>
    set((state) => {
      const key = keyFor(environmentId, threadId);
      const previous = state.attentionByThreadKey[key];
      if (!previous || (revision !== undefined && !shouldApplyRevision(previous, revision))) {
        return state;
      }
      const next = { ...state.attentionByThreadKey };
      delete next[key];
      return { attentionByThreadKey: next };
    }),
  removeOrphanedThreads: (activeThreadKeys) =>
    set((state) => {
      const next = Object.fromEntries(
        Object.entries(state.attentionByThreadKey).filter(([key]) => activeThreadKeys.has(key)),
      ) as Record<string, ThreadAttentionEntry>;
      const nextManualHolds = Object.fromEntries(
        Object.entries(state.manuallyUnseenThreadKeys).filter(([key]) => activeThreadKeys.has(key)),
      ) as Record<string, true>;
      if (
        Object.keys(next).length === Object.keys(state.attentionByThreadKey).length &&
        Object.keys(nextManualHolds).length === Object.keys(state.manuallyUnseenThreadKeys).length
      ) {
        return state;
      }
      return { attentionByThreadKey: next, manuallyUnseenThreadKeys: nextManualHolds };
    }),
}));
