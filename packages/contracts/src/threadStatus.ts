import { Schema } from "effect";
import { IsoDateTime, NonNegativeInt, ThreadId, TurnId } from "./baseSchemas.ts";

export const ThreadStatusPrimaryStatus = Schema.Literals([
  "pendingApproval",
  "awaitingInput",
  "working",
  "completed",
  "connecting",
  "planReady",
]);
export type ThreadStatusPrimaryStatus = typeof ThreadStatusPrimaryStatus.Type;

export const ThreadStatusState = Schema.Struct({
  threadId: ThreadId,
  primaryStatus: Schema.NullOr(ThreadStatusPrimaryStatus),
  pendingApproval: Schema.Boolean,
  awaitingInput: Schema.Boolean,
  working: Schema.Boolean,
  completed: Schema.Boolean,
  connecting: Schema.Boolean,
  planReady: Schema.Boolean,
  terminal: Schema.Boolean,
  latestTurnId: Schema.NullOr(TurnId),
  completedAt: Schema.NullOr(IsoDateTime),
  readAt: Schema.NullOr(IsoDateTime),
  manuallyMarkedUnreadAt: Schema.NullOr(IsoDateTime),
  updatedAt: IsoDateTime,
  revision: NonNegativeInt,
});
export type ThreadStatusState = typeof ThreadStatusState.Type;

export const ThreadStatusSnapshot = Schema.Struct({
  states: Schema.Array(ThreadStatusState),
  updatedAt: IsoDateTime,
});
export type ThreadStatusSnapshot = typeof ThreadStatusSnapshot.Type;

export const ThreadStatusMarkReadInput = Schema.Struct({
  threadId: ThreadId,
  observedAt: Schema.optional(IsoDateTime),
});
export type ThreadStatusMarkReadInput = typeof ThreadStatusMarkReadInput.Type;

export const ThreadStatusMarkUnreadInput = Schema.Struct({
  threadId: ThreadId,
  observedAt: Schema.optional(IsoDateTime),
});
export type ThreadStatusMarkUnreadInput = typeof ThreadStatusMarkUnreadInput.Type;

export const ThreadStatusMarkViewedInput = Schema.Struct({
  threadId: ThreadId,
  viewStartedAt: IsoDateTime,
  observedAt: Schema.optional(IsoDateTime),
});
export type ThreadStatusMarkViewedInput = typeof ThreadStatusMarkViewedInput.Type;

export const ThreadStatusSetTerminalOpenInput = Schema.Struct({
  threadId: ThreadId,
  terminal: Schema.Boolean,
  observedAt: Schema.optional(IsoDateTime),
});
export type ThreadStatusSetTerminalOpenInput = typeof ThreadStatusSetTerminalOpenInput.Type;

export const ThreadStatusMutationEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("state-updated"),
    state: ThreadStatusState,
  }),
  Schema.Struct({
    type: Schema.Literal("state-cleared"),
    threadId: ThreadId,
    updatedAt: IsoDateTime,
    revision: NonNegativeInt,
  }),
]);
export type ThreadStatusMutationEvent = typeof ThreadStatusMutationEvent.Type;

export const ThreadStatusStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    snapshot: ThreadStatusSnapshot,
  }),
  ThreadStatusMutationEvent,
]);
export type ThreadStatusStreamEvent = typeof ThreadStatusStreamEvent.Type;

export class ThreadStatusError extends Schema.TaggedErrorClass<ThreadStatusError>()(
  "ThreadStatusError",
  {
    operation: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `${this.operation}: ${this.detail}`;
  }
}
