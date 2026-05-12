import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { useThreadReadReceiptStore } from "./threadReadReceiptStore";

const environmentId = EnvironmentId.make("env-1");
const threadId = ThreadId.make("thread-1");
const threadKey = scopedThreadKey(scopeThreadRef(environmentId, threadId));

describe("threadReadReceiptStore", () => {
  beforeEach(() => {
    useThreadReadReceiptStore.setState({ receiptByThreadKey: {} });
  });

  it("hydrates receipts from a server snapshot", () => {
    useThreadReadReceiptStore.getState().syncSnapshot(environmentId, {
      updatedAt: "2026-05-09T10:00:00.000Z",
      receipts: [
        {
          threadId,
          lastVisitedAt: "2026-05-09T09:59:00.000Z",
          updatedAt: "2026-05-09T10:00:00.000Z",
        },
      ],
    });

    expect(useThreadReadReceiptStore.getState().receiptByThreadKey[threadKey]).toMatchObject({
      threadId,
      lastVisitedAt: "2026-05-09T09:59:00.000Z",
    });
  });

  it("seeds new thread receipts from creation time without replacing existing receipts", () => {
    const store = useThreadReadReceiptStore.getState();

    store.syncThreadSeeds(environmentId, [
      {
        threadId,
        seedVisitedAt: "2026-05-09T10:00:00.000Z",
      },
    ]);
    store.syncThreadSeeds(environmentId, [
      {
        threadId,
        seedVisitedAt: "2026-05-09T10:05:00.000Z",
      },
    ]);

    expect(useThreadReadReceiptStore.getState().receiptByThreadKey[threadKey]?.lastVisitedAt).toBe(
      "2026-05-09T10:00:00.000Z",
    );
  });

  it("does not move visited state backwards for optimistic visited writes", () => {
    const store = useThreadReadReceiptStore.getState();
    store.markVisitedOptimistic(
      environmentId,
      threadId,
      "2026-05-09T10:00:00.000Z",
      "2026-05-09T10:00:00.000Z",
    );
    store.markVisitedOptimistic(
      environmentId,
      threadId,
      "2026-05-09T11:00:00.000Z",
      "2026-05-09T09:00:00.000Z",
    );

    expect(useThreadReadReceiptStore.getState().receiptByThreadKey[threadKey]?.lastVisitedAt).toBe(
      "2026-05-09T10:00:00.000Z",
    );
  });

  it("moves the receipt just before completion when marking unread", () => {
    useThreadReadReceiptStore
      .getState()
      .markUnreadOptimistic(environmentId, threadId, "2026-05-09T10:00:00.000Z");

    expect(useThreadReadReceiptStore.getState().receiptByThreadKey[threadKey]?.lastVisitedAt).toBe(
      "2026-05-09T09:59:59.999Z",
    );
  });

  it("ignores stale receipt stream events", () => {
    const store = useThreadReadReceiptStore.getState();
    store.markUnreadOptimistic(
      environmentId,
      threadId,
      "2026-05-09T10:00:00.000Z",
      "2026-05-09T10:05:00.000Z",
    );
    store.applyStreamEvent(environmentId, {
      type: "receipt-updated",
      receipt: {
        threadId,
        lastVisitedAt: "2026-05-09T10:10:00.000Z",
        updatedAt: "2026-05-09T10:04:00.000Z",
      },
    });

    expect(useThreadReadReceiptStore.getState().receiptByThreadKey[threadKey]).toMatchObject({
      lastVisitedAt: "2026-05-09T09:59:59.999Z",
      updatedAt: "2026-05-09T10:05:00.000Z",
    });
  });
});
