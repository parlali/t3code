import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { useThreadAttentionStore } from "./threadAttentionStore";

const environmentId = EnvironmentId.make("environment-local");
const threadId = ThreadId.make("thread-1");
const threadKey = scopedThreadKey(scopeThreadRef(environmentId, threadId));

function attentionState(overrides: { revision?: number } = {}) {
  return {
    threadId,
    kind: "completed" as const,
    turnId: "turn-1" as never,
    attentionAt: "2026-05-09T10:00:00.000Z",
    acknowledgedAt: null,
    updatedAt: "2026-05-09T10:00:00.000Z",
    revision: overrides.revision ?? 1,
  };
}

describe("threadAttentionStore", () => {
  beforeEach(() => {
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
});
