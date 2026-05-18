import { Schema } from "effect";
import { IsoDateTime, NonNegativeInt, ThreadId, TurnId } from "./baseSchemas.ts";

export const ThreadAttentionKind = Schema.Literal("completed");
export type ThreadAttentionKind = typeof ThreadAttentionKind.Type;

export const ThreadAttentionState = Schema.Struct({
  threadId: ThreadId,
  kind: ThreadAttentionKind,
  turnId: TurnId,
  attentionAt: IsoDateTime,
  acknowledgedAt: Schema.NullOr(IsoDateTime),
  updatedAt: IsoDateTime,
  revision: NonNegativeInt,
});
export type ThreadAttentionState = typeof ThreadAttentionState.Type;

export const ThreadAttentionSnapshot = Schema.Struct({
  states: Schema.Array(ThreadAttentionState),
  updatedAt: IsoDateTime,
});
export type ThreadAttentionSnapshot = typeof ThreadAttentionSnapshot.Type;

export const ThreadAttentionMarkSeenInput = Schema.Struct({
  threadId: ThreadId,
  observedAt: Schema.optional(IsoDateTime),
});
export type ThreadAttentionMarkSeenInput = typeof ThreadAttentionMarkSeenInput.Type;

export const ThreadAttentionMarkUnseenInput = Schema.Struct({
  threadId: ThreadId,
  observedAt: Schema.optional(IsoDateTime),
});
export type ThreadAttentionMarkUnseenInput = typeof ThreadAttentionMarkUnseenInput.Type;

export const ThreadAttentionMutationEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("state-updated"),
    state: ThreadAttentionState,
  }),
  Schema.Struct({
    type: Schema.Literal("state-cleared"),
    threadId: ThreadId,
    updatedAt: IsoDateTime,
    revision: NonNegativeInt,
  }),
]);
export type ThreadAttentionMutationEvent = typeof ThreadAttentionMutationEvent.Type;

export const ThreadAttentionStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    snapshot: ThreadAttentionSnapshot,
  }),
  ThreadAttentionMutationEvent,
]);
export type ThreadAttentionStreamEvent = typeof ThreadAttentionStreamEvent.Type;

export class ThreadAttentionError extends Schema.TaggedErrorClass<ThreadAttentionError>()(
  "ThreadAttentionError",
  {
    operation: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `${this.operation}: ${this.detail}`;
  }
}
