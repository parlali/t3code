import { Schema } from "effect";
import { IsoDateTime, ThreadId } from "./baseSchemas.ts";

export const ThreadReadReceipt = Schema.Struct({
  threadId: ThreadId,
  lastVisitedAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ThreadReadReceipt = typeof ThreadReadReceipt.Type;

export const ThreadReadReceiptSnapshot = Schema.Struct({
  receipts: Schema.Array(ThreadReadReceipt),
  updatedAt: IsoDateTime,
});
export type ThreadReadReceiptSnapshot = typeof ThreadReadReceiptSnapshot.Type;

export const ThreadReadReceiptMarkVisitedInput = Schema.Struct({
  threadId: ThreadId,
  visitedAt: Schema.optional(IsoDateTime),
});
export type ThreadReadReceiptMarkVisitedInput = typeof ThreadReadReceiptMarkVisitedInput.Type;

export const ThreadReadReceiptMarkUnreadInput = Schema.Struct({
  threadId: ThreadId,
  latestTurnCompletedAt: IsoDateTime,
});
export type ThreadReadReceiptMarkUnreadInput = typeof ThreadReadReceiptMarkUnreadInput.Type;

export const ThreadReadReceiptStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    snapshot: ThreadReadReceiptSnapshot,
  }),
  Schema.Struct({
    type: Schema.Literal("receipt-updated"),
    receipt: ThreadReadReceipt,
  }),
]);
export type ThreadReadReceiptStreamEvent = typeof ThreadReadReceiptStreamEvent.Type;

export class ThreadReadReceiptError extends Schema.TaggedErrorClass<ThreadReadReceiptError>()(
  "ThreadReadReceiptError",
  {
    operation: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `${this.operation}: ${this.detail}`;
  }
}
