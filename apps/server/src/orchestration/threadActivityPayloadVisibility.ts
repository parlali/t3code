import type { OrchestrationThreadActivity } from "@t3tools/contracts";

export const CLIENT_VISIBLE_THREAD_ACTIVITY_PAYLOAD_KINDS = [
  "approval.requested",
  "approval.resolved",
  "provider.approval.respond.failed",
  "user-input.requested",
  "user-input.resolved",
  "provider.user-input.respond.failed",
  "turn.plan.updated",
  "task.started",
  "task.progress",
  "task.completed",
  "runtime.error",
  "runtime.warning",
  "context-compaction",
] as const;

const CLIENT_VISIBLE_THREAD_ACTIVITY_PAYLOAD_KIND_SET = new Set<string>(
  CLIENT_VISIBLE_THREAD_ACTIVITY_PAYLOAD_KINDS,
);

export function shouldExposeThreadActivityPayload(kind: string): boolean {
  return CLIENT_VISIBLE_THREAD_ACTIVITY_PAYLOAD_KIND_SET.has(kind);
}

export function redactThreadActivityPayloadForDetail(
  activity: OrchestrationThreadActivity,
): OrchestrationThreadActivity {
  if (shouldExposeThreadActivityPayload(activity.kind)) {
    return activity;
  }
  if (activity.payload === null) {
    return activity;
  }
  return {
    ...activity,
    payload: null,
  };
}
