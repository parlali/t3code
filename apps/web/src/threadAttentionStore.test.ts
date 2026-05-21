import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { resetThreadAttentionStoreForTests, useThreadAttentionStore } from "./threadAttentionStore";

const environmentId = EnvironmentId.make("environment-local");
const remoteEnvironmentId = EnvironmentId.make("environment-remote");
const threadId = ThreadId.make("thread-1");
const threadKey = scopedThreadKey(scopeThreadRef(environmentId, threadId));
const otherThreadId = ThreadId.make("thread-2");
const otherThreadKey = scopedThreadKey(scopeThreadRef(environmentId, otherThreadId));
const remoteThreadId = ThreadId.make("thread-remote");
const remoteThreadKey = scopedThreadKey(scopeThreadRef(remoteEnvironmentId, remoteThreadId));

function attentionState(
  overrides: { revision?: number; threadId?: ThreadId; updatedAt?: string } = {},
) {
  return {
    threadId: overrides.threadId ?? threadId,
    kind: "completed" as const,
    turnId: "turn-1" as never,
    attentionAt: "2026-05-09T10:00:00.000Z",
    acknowledgedAt: null,
    updatedAt: overrides.updatedAt ?? "2026-05-09T10:00:00.000Z",
    revision: overrides.revision ?? 1,
  };
}

describe("threadAttentionStore", () => {
  beforeEach(() => {
    resetThreadAttentionStoreForTests();
    useThreadAttentionStore.setState({ attentionByThreadKey: {}, manuallyUnseenThreadKeys: {} });
  });

  it("syncs unseen attention snapshot entries by environment", () => {
    useThreadAttentionStore.getState().syncSnapshot(environmentId, {
      states: [attentionState()],
      updatedAt: "2026-05-09T10:00:00.000Z",
    });

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toMatchObject({
      threadId,
      turnId: "turn-1",
      revision: 1,
    });
  });

  it("preserves streamed attention omitted from a stale reconnect snapshot", () => {
    const store = useThreadAttentionStore.getState();
    store.syncSnapshot(environmentId, {
      states: [],
      updatedAt: "2026-05-09T10:00:00.000Z",
    });
    store.applyState(
      environmentId,
      attentionState({ revision: 1, updatedAt: "2026-05-09T10:02:00.000Z" }),
    );

    store.syncSnapshot(environmentId, {
      states: [],
      updatedAt: "2026-05-09T10:01:00.000Z",
    });

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeDefined();
  });

  it("preserves newer local attention when an older snapshot omits it", () => {
    const store = useThreadAttentionStore.getState();
    store.applyState(
      environmentId,
      attentionState({ revision: 1, updatedAt: "2026-05-09T10:02:00.000Z" }),
    );

    store.syncSnapshot(environmentId, {
      states: [],
      updatedAt: "2026-05-09T10:01:00.000Z",
    });

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeDefined();
  });

  it("clears omitted local attention when the snapshot is current", () => {
    const store = useThreadAttentionStore.getState();
    store.applyState(
      environmentId,
      attentionState({ revision: 1, updatedAt: "2026-05-09T10:00:00.000Z" }),
    );

    store.syncSnapshot(environmentId, {
      states: [],
      updatedAt: "2026-05-09T10:01:00.000Z",
    });

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeUndefined();
  });

  it("ignores stale state updates", () => {
    const store = useThreadAttentionStore.getState();
    store.applyState(environmentId, attentionState({ revision: 3 }));
    store.applyState(environmentId, attentionState({ revision: 2 }));

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]?.revision).toBe(3);
  });

  it("clears state only when the clear revision is current", () => {
    const store = useThreadAttentionStore.getState();
    store.applyState(environmentId, attentionState({ revision: 3 }));
    store.clearThread(environmentId, threadId, 2);

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeDefined();

    store.clearThread(environmentId, threadId, 4);

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeUndefined();
  });

  it("clears only the targeted thread", () => {
    const store = useThreadAttentionStore.getState();
    store.applyState(environmentId, attentionState({ threadId, revision: 1 }));
    store.applyState(environmentId, attentionState({ threadId: otherThreadId, revision: 1 }));

    store.clearThread(environmentId, threadId, 2);

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeUndefined();
    expect(useThreadAttentionStore.getState().attentionByThreadKey[otherThreadKey]).toBeDefined();
  });

  it("applies stream update and clear events", () => {
    const store = useThreadAttentionStore.getState();
    store.applyStreamEvent(environmentId, {
      type: "state-updated",
      state: attentionState({ revision: 1 }),
    });

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeDefined();

    store.applyStreamEvent(environmentId, {
      type: "state-cleared",
      threadId,
      updatedAt: "2026-05-09T10:01:00.000Z",
      revision: 2,
    });

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeUndefined();
  });

  it("tracks manually held unseen threads separately from attention state", () => {
    const store = useThreadAttentionStore.getState();
    store.holdThreadUnseen(environmentId, threadId);

    expect(useThreadAttentionStore.getState().manuallyUnseenThreadKeys[threadKey]).toBe(true);

    store.applyStreamEvent(environmentId, {
      type: "state-cleared",
      threadId,
      updatedAt: "2026-05-09T10:01:00.000Z",
      revision: 2,
    });

    expect(useThreadAttentionStore.getState().manuallyUnseenThreadKeys[threadKey]).toBe(true);

    store.releaseThreadUnseenHold(environmentId, threadId);

    expect(useThreadAttentionStore.getState().manuallyUnseenThreadKeys[threadKey]).toBeUndefined();
  });

  it("scopes orphan cleanup to the synced environment", () => {
    const store = useThreadAttentionStore.getState();
    store.applyState(environmentId, attentionState({ threadId, revision: 1 }));
    store.applyState(
      remoteEnvironmentId,
      attentionState({ threadId: remoteThreadId, revision: 1 }),
    );
    store.holdThreadUnseen(remoteEnvironmentId, remoteThreadId);

    store.removeOrphanedThreads(new Set([threadKey]), environmentId);

    expect(useThreadAttentionStore.getState().attentionByThreadKey[threadKey]).toBeDefined();
    expect(useThreadAttentionStore.getState().attentionByThreadKey[remoteThreadKey]).toBeDefined();
    expect(useThreadAttentionStore.getState().manuallyUnseenThreadKeys[remoteThreadKey]).toBe(true);

    store.removeOrphanedThreads(new Set([threadKey]), remoteEnvironmentId);

    expect(
      useThreadAttentionStore.getState().attentionByThreadKey[remoteThreadKey],
    ).toBeUndefined();
    expect(
      useThreadAttentionStore.getState().manuallyUnseenThreadKeys[remoteThreadKey],
    ).toBeUndefined();
  });
});
