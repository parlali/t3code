import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import type {
  EnvironmentId,
  ThreadAttentionSnapshot,
  ThreadAttentionState,
  ThreadAttentionStreamEvent,
  ThreadId,
} from "@t3tools/contracts";
import { create } from "zustand";

import { logThreadAttention } from "./threadAttentionDebugLog";

export interface ThreadAttentionEntry {
  readonly threadId: ThreadId;
  readonly kind: ThreadAttentionState["kind"];
  readonly turnId: ThreadAttentionState["turnId"];
  readonly attentionAt: string;
  readonly receivedSequence: number;
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

let nextThreadAttentionReceivedSequence = 1;
const lastSnapshotReceivedSequenceByEnvironmentId: Record<string, number> = {};

function nextReceivedSequence(): number {
  const sequence = nextThreadAttentionReceivedSequence;
  nextThreadAttentionReceivedSequence += 1;
  return sequence;
}

export function readThreadAttentionReceivedSequence(): number {
  return nextThreadAttentionReceivedSequence - 1;
}

export function resetThreadAttentionStoreForTests(): void {
  nextThreadAttentionReceivedSequence = 1;
  for (const environmentId of Object.keys(lastSnapshotReceivedSequenceByEnvironmentId)) {
    delete lastSnapshotReceivedSequenceByEnvironmentId[environmentId];
  }
}

function entryFromState(
  state: ThreadAttentionState,
  receivedSequence: number,
): ThreadAttentionEntry {
  return {
    threadId: state.threadId,
    kind: state.kind,
    turnId: state.turnId,
    attentionAt: state.attentionAt,
    receivedSequence,
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

function shouldRetainLocalAttentionOnSnapshot(input: {
  readonly entry: ThreadAttentionEntry;
  readonly snapshotUpdatedAt: string;
  readonly lastSnapshotReceivedSequence: number;
}): boolean {
  return (
    input.entry.receivedSequence > input.lastSnapshotReceivedSequence &&
    input.entry.updatedAt > input.snapshotUpdatedAt
  );
}

export const useThreadAttentionStore = create<ThreadAttentionStoreState>()((set) => ({
  attentionByThreadKey: {},
  manuallyUnseenThreadKeys: {},
  syncSnapshot: (environmentId, snapshot) =>
    set((state) => {
      const prefix = environmentKeyPrefix(environmentId);
      const receivedSequence = nextReceivedSequence();
      const lastSnapshotReceivedSequence =
        lastSnapshotReceivedSequenceByEnvironmentId[environmentId] ?? 0;
      const snapshotThreadKeys = new Set(
        snapshot.states.map((attentionState) => keyFor(environmentId, attentionState.threadId)),
      );
      const retainedOmittedKeys: string[] = [];
      const next = Object.fromEntries(
        Object.entries(state.attentionByThreadKey).filter(([key, entry]) => {
          if (!key.startsWith(prefix)) {
            return true;
          }
          if (snapshotThreadKeys.has(key)) {
            return false;
          }
          const retain = shouldRetainLocalAttentionOnSnapshot({
            entry,
            snapshotUpdatedAt: snapshot.updatedAt,
            lastSnapshotReceivedSequence,
          });
          if (retain) {
            retainedOmittedKeys.push(key);
          }
          return retain;
        }),
      ) as Record<string, ThreadAttentionEntry>;
      for (const attentionState of snapshot.states) {
        const key = keyFor(environmentId, attentionState.threadId);
        const previous = state.attentionByThreadKey[key];
        next[key] =
          previous && previous.revision > attentionState.revision
            ? previous
            : entryFromState(
                attentionState,
                previous?.revision === attentionState.revision
                  ? previous.receivedSequence
                  : receivedSequence,
              );
      }
      lastSnapshotReceivedSequenceByEnvironmentId[environmentId] = receivedSequence;
      logThreadAttention({
        source: "store",
        action: "sync-snapshot",
        environmentId,
        receivedSequence,
        snapshotUpdatedAt: snapshot.updatedAt,
        detail: `states=${snapshot.states.length} retained=${retainedOmittedKeys.length}`,
      });
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
        logThreadAttention({
          source: "store",
          action: "apply-state-stale",
          environmentId,
          threadId: attentionState.threadId,
          threadKey: key,
          revision: attentionState.revision,
          detail: `previousRevision=${previous?.revision ?? "none"}`,
        });
        return state;
      }
      const receivedSequence =
        previous?.revision === attentionState.revision
          ? previous.receivedSequence
          : nextReceivedSequence();
      logThreadAttention({
        source: "store",
        action: "apply-state",
        environmentId,
        threadId: attentionState.threadId,
        threadKey: key,
        revision: attentionState.revision,
        receivedSequence,
        attentionAt: attentionState.attentionAt,
        updatedAt: attentionState.updatedAt,
      });
      return {
        attentionByThreadKey: {
          ...state.attentionByThreadKey,
          [key]: entryFromState(attentionState, receivedSequence),
        },
      };
    }),
  holdThreadUnseen: (environmentId, threadId) =>
    set((state) => {
      const key = keyFor(environmentId, threadId);
      if (state.manuallyUnseenThreadKeys[key]) {
        return state;
      }
      logThreadAttention({
        source: "store",
        action: "hold-unseen",
        environmentId,
        threadId,
        threadKey: key,
      });
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
      logThreadAttention({
        source: "store",
        action: "release-unseen-hold",
        environmentId,
        threadId,
        threadKey: key,
      });
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
      logThreadAttention({
        source: "store",
        action: "clear",
        environmentId,
        threadId,
        threadKey: key,
        revision,
        receivedSequence: previous.receivedSequence,
      });
      return { attentionByThreadKey: next };
    }),
  removeOrphanedThreads: (activeThreadKeys, environmentId) =>
    set((state) => {
      const prefix = environmentId ? environmentKeyPrefix(environmentId) : null;
      const shouldRetainThreadKey = (key: string) =>
        prefix !== null && !key.startsWith(prefix) ? true : activeThreadKeys.has(key);
      const next = Object.fromEntries(
        Object.entries(state.attentionByThreadKey).filter(([key]) => shouldRetainThreadKey(key)),
      ) as Record<string, ThreadAttentionEntry>;
      const nextManualHolds = Object.fromEntries(
        Object.entries(state.manuallyUnseenThreadKeys).filter(([key]) =>
          shouldRetainThreadKey(key),
        ),
      ) as Record<string, true>;
      if (
        Object.keys(next).length === Object.keys(state.attentionByThreadKey).length &&
        Object.keys(nextManualHolds).length === Object.keys(state.manuallyUnseenThreadKeys).length
      ) {
        return state;
      }
      logThreadAttention({
        source: "store",
        action: "remove-orphaned",
        environmentId,
        detail: `removed=${
          Object.keys(state.attentionByThreadKey).length - Object.keys(next).length
        }`,
      });
      return { attentionByThreadKey: next, manuallyUnseenThreadKeys: nextManualHolds };
    }),
}));
