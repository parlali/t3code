import type {
  EnvironmentId,
  ThreadAttentionMarkSeenInput,
  ThreadAttentionMutationEvent,
  ThreadId,
} from "@t3tools/contracts";

import { logThreadAttention } from "./threadAttentionDebugLog";

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export async function markThreadAttentionSeenWithRetry(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly observedAt: string;
  readonly markSeen: (
    request: ThreadAttentionMarkSeenInput,
  ) => Promise<ThreadAttentionMutationEvent>;
  readonly maxAttempts?: number | undefined;
}): Promise<ThreadAttentionMutationEvent> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const event = await input.markSeen({
        threadId: input.threadId,
        observedAt: input.observedAt,
      });
      logThreadAttention({
        source: "mark-seen",
        action: "success",
        environmentId: input.environmentId,
        threadId: input.threadId,
        detail: `attempt ${attempt}/${maxAttempts}`,
      });
      return event;
    } catch (error) {
      lastError = error;
      logThreadAttention({
        source: "mark-seen",
        action: "retry",
        environmentId: input.environmentId,
        threadId: input.threadId,
        detail:
          error instanceof Error
            ? `attempt ${attempt}/${maxAttempts}: ${error.message}`
            : `attempt ${attempt}/${maxAttempts}`,
      });
      if (attempt < maxAttempts) {
        await delay(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  logThreadAttention({
    source: "mark-seen",
    action: "failed",
    environmentId: input.environmentId,
    threadId: input.threadId,
    detail: lastError instanceof Error ? lastError.message : "markSeen failed",
  });
  throw lastError;
}
