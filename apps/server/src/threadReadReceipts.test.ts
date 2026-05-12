import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as SqliteClient from "./persistence/NodeSqliteClient.ts";
import { ThreadReadReceipts, ThreadReadReceiptsLive } from "./threadReadReceipts.ts";

const sqliteLayer = SqliteClient.layerMemory();
const layer = it.layer(
  Layer.mergeAll(sqliteLayer, ThreadReadReceiptsLive.pipe(Layer.provide(sqliteLayer))),
);

const resetReceiptTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DROP TABLE IF EXISTS projection_threads`;
  yield* sql`DROP TABLE IF EXISTS thread_read_receipts`;
  yield* sql`
    CREATE TABLE projection_threads (
      thread_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      archived_at TEXT
    )
  `;
  yield* sql`
    CREATE TABLE thread_read_receipts (
      thread_id TEXT PRIMARY KEY,
      last_visited_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});

layer("ThreadReadReceipts", (it) => {
  it.effect("seeds missing receipts from thread creation time, not update time", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const receipts = yield* ThreadReadReceipts;

      yield* resetReceiptTables;
      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          created_at,
          updated_at,
          deleted_at,
          archived_at
        )
        VALUES (
          ${"thread-1"},
          ${"2026-05-09T10:00:00.000Z"},
          ${"2026-05-09T10:05:00.000Z"},
          NULL,
          NULL
        )
      `;

      const snapshot = yield* receipts.getSnapshot;
      assert.deepEqual(snapshot.receipts, [
        {
          threadId: ThreadId.make("thread-1"),
          lastVisitedAt: "2026-05-09T10:00:00.000Z",
          updatedAt: "2026-05-09T10:00:00.000Z",
        },
      ]);
    }),
  );

  it.effect("does not let a stale visited write clear a newer manual unread", () =>
    Effect.gen(function* () {
      const receipts = yield* ThreadReadReceipts;
      const threadId = ThreadId.make("thread-1");

      yield* resetReceiptTables;
      yield* receipts.markVisited({
        threadId,
        visitedAt: "2000-01-01T00:00:20.000Z",
      });
      const unread = yield* receipts.markUnread({
        threadId,
        latestTurnCompletedAt: "2000-01-01T00:00:10.000Z",
      });
      assert.equal(unread.lastVisitedAt, "2000-01-01T00:00:09.999Z");

      const staleVisited = yield* receipts.markVisited({
        threadId,
        visitedAt: "2000-01-01T00:00:20.000Z",
      });
      assert.equal(staleVisited.lastVisitedAt, "2000-01-01T00:00:09.999Z");

      const freshVisited = yield* receipts.markVisited({
        threadId,
        visitedAt: "2999-01-01T00:00:00.000Z",
      });
      assert.equal(freshVisited.lastVisitedAt, "2999-01-01T00:00:00.000Z");
    }),
  );

  it.effect("does not let a stale manual unread override a newer visit", () =>
    Effect.gen(function* () {
      const receipts = yield* ThreadReadReceipts;
      const threadId = ThreadId.make("thread-1");

      yield* resetReceiptTables;
      yield* receipts.markUnread({
        threadId,
        latestTurnCompletedAt: "2000-01-01T00:00:10.000Z",
        observedAt: "2000-01-01T00:00:10.000Z",
      });
      yield* receipts.markVisited({
        threadId,
        visitedAt: "2000-01-01T00:00:30.000Z",
        observedAt: "2000-01-01T00:00:30.000Z",
      });

      const staleUnread = yield* receipts.markUnread({
        threadId,
        latestTurnCompletedAt: "2000-01-01T00:00:10.000Z",
        observedAt: "2000-01-01T00:00:20.000Z",
      });
      assert.equal(staleUnread.lastVisitedAt, "2000-01-01T00:00:30.000Z");
    }),
  );
});
