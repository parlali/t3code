import {
  ThreadId,
  ThreadReadReceiptError,
  type ThreadReadReceipt,
  type ThreadReadReceiptMarkUnreadInput,
  type ThreadReadReceiptMarkVisitedInput,
  type ThreadReadReceiptSnapshot,
  type ThreadReadReceiptStreamEvent,
} from "@t3tools/contracts";
import { Context, Effect, Layer, PubSub, Schema, Scope, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface ThreadReadReceiptRow {
  readonly threadId: string;
  readonly lastVisitedAt: string;
  readonly updatedAt: string;
}

export interface ThreadReadReceiptsShape {
  readonly getSnapshot: Effect.Effect<ThreadReadReceiptSnapshot, ThreadReadReceiptError>;
  readonly markVisited: (
    input: ThreadReadReceiptMarkVisitedInput,
  ) => Effect.Effect<ThreadReadReceipt, ThreadReadReceiptError>;
  readonly markUnread: (
    input: ThreadReadReceiptMarkUnreadInput,
  ) => Effect.Effect<ThreadReadReceipt, ThreadReadReceiptError>;
  readonly streamChanges: Stream.Stream<ThreadReadReceiptStreamEvent>;
  readonly streamWithSnapshot: Effect.Effect<
    Stream.Stream<ThreadReadReceiptStreamEvent>,
    ThreadReadReceiptError,
    Scope.Scope
  >;
}

export class ThreadReadReceipts extends Context.Service<
  ThreadReadReceipts,
  ThreadReadReceiptsShape
>()("t3/threadReadReceipts") {}

function toReceipt(row: ThreadReadReceiptRow): ThreadReadReceipt {
  return {
    threadId: ThreadId.make(row.threadId),
    lastVisitedAt: row.lastVisitedAt,
    updatedAt: row.updatedAt,
  };
}

function receiptError(operation: string, cause: unknown): ThreadReadReceiptError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ThreadReadReceiptError({ operation, detail });
}

function unreadTimestamp(
  latestTurnCompletedAt: string,
): Effect.Effect<string, ThreadReadReceiptError> {
  return Effect.try({
    try: () => {
      const completedAtMs = Date.parse(latestTurnCompletedAt);
      if (Number.isNaN(completedAtMs)) {
        throw new Error("latestTurnCompletedAt is not a valid timestamp");
      }
      return new Date(Math.max(0, completedAtMs - 1)).toISOString();
    },
    catch: (cause) => receiptError("ThreadReadReceipts.markUnread", cause),
  });
}

const makeThreadReadReceipts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const changesPubSub = yield* PubSub.unbounded<ThreadReadReceiptStreamEvent>();
  yield* Effect.addFinalizer(() => PubSub.shutdown(changesPubSub));

  const readReceipt = (threadId: ThreadId) =>
    sql<ThreadReadReceiptRow>`
      SELECT
        thread_id AS "threadId",
        last_visited_at AS "lastVisitedAt",
        updated_at AS "updatedAt"
      FROM thread_read_receipts
      WHERE thread_id = ${threadId}
    `.pipe(
      Effect.map((rows) => (rows[0] ? toReceipt(rows[0]) : null)),
      Effect.mapError((cause) => receiptError("ThreadReadReceipts.readReceipt", cause)),
    );

  const getSnapshot = sql<ThreadReadReceiptRow>`
    SELECT
      t.thread_id AS "threadId",
      COALESCE(r.last_visited_at, COALESCE(t.updated_at, t.created_at)) AS "lastVisitedAt",
      COALESCE(r.updated_at, COALESCE(t.updated_at, t.created_at)) AS "updatedAt"
    FROM projection_threads t
    LEFT JOIN thread_read_receipts r ON r.thread_id = t.thread_id
    WHERE t.deleted_at IS NULL
      AND (t.archived_at IS NULL)
    ORDER BY t.created_at ASC, t.thread_id ASC
  `.pipe(
    Effect.map(
      (rows): ThreadReadReceiptSnapshot => ({
        receipts: rows.map(toReceipt),
        updatedAt: new Date().toISOString(),
      }),
    ),
    Effect.mapError((cause) => receiptError("ThreadReadReceipts.getSnapshot", cause)),
  );

  const upsertReceipt = (input: {
    readonly threadId: ThreadId;
    readonly lastVisitedAt: string;
    readonly allowBackward: boolean;
  }) =>
    Effect.gen(function* () {
      const updatedAt = new Date().toISOString();
      yield* sql`
        INSERT INTO thread_read_receipts (
          thread_id,
          last_visited_at,
          updated_at
        )
        VALUES (
          ${input.threadId},
          ${input.lastVisitedAt},
          ${updatedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          last_visited_at = CASE
            WHEN ${input.allowBackward ? 1 : 0} = 1
              OR excluded.last_visited_at > thread_read_receipts.last_visited_at
            THEN excluded.last_visited_at
            ELSE thread_read_receipts.last_visited_at
          END,
          updated_at = excluded.updated_at
      `.pipe(Effect.mapError((cause) => receiptError("ThreadReadReceipts.upsertReceipt", cause)));

      const receipt = yield* readReceipt(input.threadId).pipe(
        Effect.flatMap((receipt) =>
          receipt
            ? Effect.succeed(receipt)
            : Effect.fail(
                new ThreadReadReceiptError({
                  operation: "ThreadReadReceipts.upsertReceipt",
                  detail: "receipt was not found after upsert",
                }),
              ),
        ),
      );
      yield* PubSub.publish(changesPubSub, {
        type: "receipt-updated",
        receipt,
      });
      return receipt;
    }).pipe(
      Effect.mapError((cause) =>
        Schema.is(ThreadReadReceiptError)(cause)
          ? cause
          : receiptError("ThreadReadReceipts.upsertReceipt", cause),
      ),
    );

  return {
    getSnapshot,
    markVisited: (input) =>
      upsertReceipt({
        threadId: input.threadId,
        lastVisitedAt: input.visitedAt ?? new Date().toISOString(),
        allowBackward: false,
      }),
    markUnread: (input) =>
      unreadTimestamp(input.latestTurnCompletedAt).pipe(
        Effect.flatMap((lastVisitedAt) =>
          upsertReceipt({
            threadId: input.threadId,
            lastVisitedAt,
            allowBackward: true,
          }),
        ),
      ),
    get streamChanges() {
      return Stream.fromPubSub(changesPubSub);
    },
    streamWithSnapshot: Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(changesPubSub);
      const snapshot = yield* getSnapshot;
      return Stream.concat(
        Stream.make({
          type: "snapshot" as const,
          snapshot,
        }),
        Stream.fromSubscription(subscription),
      );
    }),
  } satisfies ThreadReadReceiptsShape;
});

export const ThreadReadReceiptsLive = Layer.effect(ThreadReadReceipts, makeThreadReadReceipts);
