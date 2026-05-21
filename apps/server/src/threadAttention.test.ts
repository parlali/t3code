import { assert, it } from "@effect/vitest";
import { AuthSessionId, ThreadId } from "@t3tools/contracts";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as SqliteClient from "./persistence/NodeSqliteClient.ts";
import { ThreadAttention, ThreadAttentionLive } from "./threadAttention.ts";

const sqliteLayer = SqliteClient.layerMemory();
const layer = it.layer(
  Layer.mergeAll(sqliteLayer, ThreadAttentionLive.pipe(Layer.provide(sqliteLayer))),
);

function setupSchema() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DROP TABLE IF EXISTS projection_threads`;
    yield* sql`DROP TABLE IF EXISTS projection_turns`;
    yield* sql`DROP TABLE IF EXISTS thread_attention_states`;
    yield* sql`
      CREATE TABLE projection_threads (
        thread_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        latest_turn_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        archived_at TEXT
      )
    `;
    yield* sql`
      CREATE TABLE projection_turns (
        thread_id TEXT NOT NULL,
        turn_id TEXT,
        state TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        UNIQUE (thread_id, turn_id)
      )
    `;
    yield* sql`
      CREATE TABLE thread_attention_states (
        thread_id TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        latest_turn_id TEXT NOT NULL,
        attention_kind TEXT NOT NULL,
        attention_at TEXT NOT NULL,
        acknowledged_turn_id TEXT,
        acknowledged_at TEXT,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL,
        PRIMARY KEY (thread_id, viewer_id)
      )
    `;
  });
}

function insertCompletedThread(threadId: ThreadId) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_threads (
        thread_id,
        project_id,
        title,
        model,
        latest_turn_id,
        created_at,
        updated_at,
        deleted_at,
        archived_at
      )
      VALUES (
        ${threadId},
        'project-1',
        'Thread',
        'gpt-5',
        'turn-1',
        '2026-05-09T09:00:00.000Z',
        '2026-05-09T10:00:00.000Z',
        NULL,
        NULL
      )
    `;
    yield* sql`
      INSERT INTO projection_turns (
        thread_id,
        turn_id,
        state,
        requested_at,
        started_at,
        completed_at
      )
      VALUES (
        ${threadId},
        'turn-1',
        'completed',
        '2026-05-09T09:59:00.000Z',
        '2026-05-09T09:59:10.000Z',
        '2026-05-09T10:00:00.000Z'
      )
    `;
  });
}

layer("ThreadAttention", (it) => {
  it.effect("creates unseen attention from the latest terminal turn", () =>
    Effect.gen(function* () {
      const attention = yield* ThreadAttention;
      const threadId = ThreadId.make("thread-1");
      const viewerId = AuthSessionId.make("viewer-1");

      yield* setupSchema();
      yield* insertCompletedThread(threadId);

      const snapshot = yield* attention.getSnapshot(viewerId);

      assert.equal(snapshot.states.length, 1);
      assert.equal(snapshot.states[0]?.threadId, threadId);
      assert.equal(snapshot.states[0]?.turnId, "turn-1");
      assert.equal(snapshot.states[0]?.attentionAt, "2026-05-09T10:00:00.000Z");
    }),
  );

  it.effect("marks one viewer seen without clearing another viewer", () =>
    Effect.gen(function* () {
      const attention = yield* ThreadAttention;
      const threadId = ThreadId.make("thread-1");
      const viewerA = AuthSessionId.make("viewer-a");
      const viewerB = AuthSessionId.make("viewer-b");

      yield* setupSchema();
      yield* insertCompletedThread(threadId);
      yield* attention.getSnapshot(viewerA);
      yield* attention.getSnapshot(viewerB);

      const seen = yield* attention.markSeen(viewerA, {
        threadId,
        observedAt: "2026-05-09T10:01:00.000Z",
      });
      const snapshotA = yield* attention.getSnapshot(viewerA);
      const snapshotB = yield* attention.getSnapshot(viewerB);

      assert.equal(seen.type, "state-cleared");
      assert.deepEqual(snapshotA.states, []);
      assert.equal(snapshotB.states.length, 1);
      assert.equal(snapshotB.states[0]?.threadId, threadId);
    }),
  );

  it.effect("marks one thread seen without clearing another thread for the same viewer", () =>
    Effect.gen(function* () {
      const attention = yield* ThreadAttention;
      const threadA = ThreadId.make("thread-a");
      const threadB = ThreadId.make("thread-b");
      const viewerId = AuthSessionId.make("viewer-1");

      yield* setupSchema();
      yield* insertCompletedThread(threadA);
      yield* insertCompletedThread(threadB);
      yield* attention.getSnapshot(viewerId);

      const seen = yield* attention.markSeen(viewerId, {
        threadId: threadA,
        observedAt: "2026-05-09T10:01:00.000Z",
      });
      const snapshot = yield* attention.getSnapshot(viewerId);

      assert.equal(seen.type, "state-cleared");
      assert.deepEqual(
        snapshot.states.map((state) => state.threadId),
        [threadB],
      );
    }),
  );

  it.effect("markUnseen restores attention for a seen terminal turn", () =>
    Effect.gen(function* () {
      const attention = yield* ThreadAttention;
      const threadId = ThreadId.make("thread-1");
      const viewerId = AuthSessionId.make("viewer-1");

      yield* setupSchema();
      yield* insertCompletedThread(threadId);
      yield* attention.markSeen(viewerId, {
        threadId,
        observedAt: "2026-05-09T10:01:00.000Z",
      });

      const unseen = yield* attention.markUnseen(viewerId, {
        threadId,
        observedAt: "2026-05-09T10:02:00.000Z",
      });
      const snapshot = yield* attention.getSnapshot(viewerId);

      assert.equal(unseen.type, "state-updated");
      assert.equal(snapshot.states.length, 1);
      assert.equal(snapshot.states[0]?.threadId, threadId);
    }),
  );

  it.effect(
    "makes same-turn completion unseen again when the terminal attention time changes",
    () =>
      Effect.gen(function* () {
        const attention = yield* ThreadAttention;
        const sql = yield* SqlClient.SqlClient;
        const threadId = ThreadId.make("thread-1");
        const viewerId = AuthSessionId.make("viewer-1");

        yield* setupSchema();
        yield* insertCompletedThread(threadId);
        yield* attention.markSeen(viewerId, {
          threadId,
          observedAt: "2026-05-09T10:01:00.000Z",
        });

        yield* sql`
        UPDATE projection_turns
        SET completed_at = '2026-05-09T10:02:00.000Z'
        WHERE thread_id = ${threadId}
          AND turn_id = 'turn-1'
      `;
        const snapshot = yield* attention.getSnapshot(viewerId);

        assert.equal(snapshot.states.length, 1);
        assert.equal(snapshot.states[0]?.threadId, threadId);
        assert.equal(snapshot.states[0]?.turnId, "turn-1");
        assert.equal(snapshot.states[0]?.attentionAt, "2026-05-09T10:02:00.000Z");
      }),
  );
});
