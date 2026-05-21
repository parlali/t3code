import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import { clearThreadAttentionLog, readThreadAttentionLog } from "./threadAttentionDebugLog";
import { markThreadAttentionSeenWithRetry } from "./threadAttentionMarkSeen";

const environmentId = EnvironmentId.make("environment-local");
const threadId = ThreadId.make("thread-1");

describe("markThreadAttentionSeenWithRetry", () => {
  it("retries markSeen before surfacing the failure", async () => {
    clearThreadAttentionLog();
    const markSeen = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        type: "state-cleared" as const,
        threadId,
        updatedAt: "2026-05-09T10:01:00.000Z",
        revision: 2,
      });

    const event = await markThreadAttentionSeenWithRetry({
      environmentId,
      threadId,
      observedAt: "2026-05-09T10:01:00.000Z",
      markSeen,
      maxAttempts: 2,
    });

    expect(event.type).toBe("state-cleared");
    expect(markSeen).toHaveBeenCalledTimes(2);
    expect(readThreadAttentionLog().some((entry) => entry.action === "retry")).toBe(true);
  });
});
