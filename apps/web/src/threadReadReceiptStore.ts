import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import type {
  EnvironmentId,
  ThreadId,
  ThreadReadReceipt,
  ThreadReadReceiptSnapshot,
  ThreadReadReceiptStreamEvent,
} from "@t3tools/contracts";
import { create } from "zustand";

export interface ThreadReadReceiptEntry {
  readonly threadId: ThreadId;
  readonly lastVisitedAt: string;
  readonly updatedAt: string;
}

export interface ThreadReadReceiptSeed {
  readonly threadId: ThreadId;
  readonly seedVisitedAt: string;
}

interface ThreadReadReceiptStoreState {
  readonly receiptByThreadKey: Record<string, ThreadReadReceiptEntry>;
  readonly syncSnapshot: (
    environmentId: EnvironmentId,
    snapshot: ThreadReadReceiptSnapshot,
  ) => void;
  readonly applyStreamEvent: (
    environmentId: EnvironmentId,
    event: ThreadReadReceiptStreamEvent,
  ) => void;
  readonly syncThreadSeeds: (
    environmentId: EnvironmentId,
    seeds: ReadonlyArray<ThreadReadReceiptSeed>,
  ) => void;
  readonly markVisitedOptimistic: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
    visitedAt: string,
    observedAt?: string,
  ) => void;
  readonly markUnreadOptimistic: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
    latestTurnCompletedAt: string | null | undefined,
    observedAt?: string,
  ) => void;
  readonly removeThread: (environmentId: EnvironmentId, threadId: ThreadId) => void;
  readonly removeOrphanedThreads: (activeThreadKeys: ReadonlySet<string>) => void;
}

function keyFor(environmentId: EnvironmentId, threadId: ThreadId): string {
  return scopedThreadKey(scopeThreadRef(environmentId, threadId));
}

function environmentKeyPrefix(environmentId: EnvironmentId): string {
  return `${environmentId}:`;
}

function entryFromReceipt(receipt: ThreadReadReceipt): ThreadReadReceiptEntry {
  return {
    threadId: receipt.threadId,
    lastVisitedAt: receipt.lastVisitedAt,
    updatedAt: receipt.updatedAt,
  };
}

function unreadVisitedAt(latestTurnCompletedAt: string | null | undefined): string | null {
  if (!latestTurnCompletedAt) {
    return null;
  }
  const completedAtMs = Date.parse(latestTurnCompletedAt);
  if (Number.isNaN(completedAtMs)) {
    return null;
  }
  return new Date(Math.max(0, completedAtMs - 1)).toISOString();
}

function shouldMoveVisitedForward(previous: string | undefined, next: string): boolean {
  if (!previous) {
    return true;
  }
  return Date.parse(next) > Date.parse(previous);
}

function isNewerMutation(previousUpdatedAt: string | undefined, nextUpdatedAt: string): boolean {
  if (!previousUpdatedAt) {
    return true;
  }
  return Date.parse(nextUpdatedAt) >= Date.parse(previousUpdatedAt);
}

export const useThreadReadReceiptStore = create<ThreadReadReceiptStoreState>()((set) => ({
  receiptByThreadKey: {},
  syncSnapshot: (environmentId, snapshot) =>
    set((state) => {
      const prefix = environmentKeyPrefix(environmentId);
      const next = Object.fromEntries(
        Object.entries(state.receiptByThreadKey).filter(([key]) => !key.startsWith(prefix)),
      ) as Record<string, ThreadReadReceiptEntry>;
      for (const receipt of snapshot.receipts) {
        const key = keyFor(environmentId, receipt.threadId);
        const previous = state.receiptByThreadKey[key];
        next[key] =
          previous && !isNewerMutation(previous.updatedAt, receipt.updatedAt)
            ? previous
            : entryFromReceipt(receipt);
      }
      return { receiptByThreadKey: next };
    }),
  applyStreamEvent: (environmentId, event) => {
    if (event.type === "snapshot") {
      useThreadReadReceiptStore.getState().syncSnapshot(environmentId, event.snapshot);
      return;
    }
    set((state) => {
      const key = keyFor(environmentId, event.receipt.threadId);
      const previous = state.receiptByThreadKey[key];
      if (previous && !isNewerMutation(previous.updatedAt, event.receipt.updatedAt)) {
        return state;
      }
      return {
        receiptByThreadKey: {
          ...state.receiptByThreadKey,
          [key]: entryFromReceipt(event.receipt),
        },
      };
    });
  },
  syncThreadSeeds: (environmentId, seeds) =>
    set((state) => {
      let changed = false;
      const next = { ...state.receiptByThreadKey };
      for (const seed of seeds) {
        const key = keyFor(environmentId, seed.threadId);
        if (next[key]) {
          continue;
        }
        next[key] = {
          threadId: seed.threadId,
          lastVisitedAt: seed.seedVisitedAt,
          updatedAt: seed.seedVisitedAt,
        };
        changed = true;
      }
      return changed ? { receiptByThreadKey: next } : state;
    }),
  markVisitedOptimistic: (environmentId, threadId, visitedAt, observedAt) =>
    set((state) => {
      const key = keyFor(environmentId, threadId);
      const previous = state.receiptByThreadKey[key];
      const updatedAt = observedAt ?? visitedAt;
      if (
        !isNewerMutation(previous?.updatedAt, updatedAt) ||
        !shouldMoveVisitedForward(previous?.lastVisitedAt, visitedAt)
      ) {
        return state;
      }
      return {
        receiptByThreadKey: {
          ...state.receiptByThreadKey,
          [key]: {
            threadId,
            lastVisitedAt: visitedAt,
            updatedAt,
          },
        },
      };
    }),
  markUnreadOptimistic: (environmentId, threadId, latestTurnCompletedAt, observedAt) =>
    set((state) => {
      const nextVisitedAt = unreadVisitedAt(latestTurnCompletedAt);
      if (!nextVisitedAt) {
        return state;
      }
      const key = keyFor(environmentId, threadId);
      const previous = state.receiptByThreadKey[key];
      const updatedAt = observedAt ?? new Date().toISOString();
      if (!isNewerMutation(previous?.updatedAt, updatedAt)) {
        return state;
      }
      return {
        receiptByThreadKey: {
          ...state.receiptByThreadKey,
          [key]: {
            threadId,
            lastVisitedAt: nextVisitedAt,
            updatedAt,
          },
        },
      };
    }),
  removeThread: (environmentId, threadId) =>
    set((state) => {
      const key = keyFor(environmentId, threadId);
      if (!(key in state.receiptByThreadKey)) {
        return state;
      }
      const next = { ...state.receiptByThreadKey };
      delete next[key];
      return { receiptByThreadKey: next };
    }),
  removeOrphanedThreads: (activeThreadKeys) =>
    set((state) => {
      const next = Object.fromEntries(
        Object.entries(state.receiptByThreadKey).filter(([key]) => activeThreadKeys.has(key)),
      ) as Record<string, ThreadReadReceiptEntry>;
      if (Object.keys(next).length === Object.keys(state.receiptByThreadKey).length) {
        return state;
      }
      return { receiptByThreadKey: next };
    }),
}));
