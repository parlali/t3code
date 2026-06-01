import { assert, it } from "@effect/vitest";
import {
  CheckpointRef,
  CommandId,
  EventId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { Effect, Layer, Option } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as SqliteClient from "./persistence/NodeSqliteClient.ts";
import { ThreadStatusStates, ThreadStatusStatesLive } from "./threadStatusState.ts";

const sqliteLayer = SqliteClient.layerMemory();
const layer = it.layer(
  Layer.mergeAll(sqliteLayer, ThreadStatusStatesLive.pipe(Layer.provide(sqliteLayer))),
);

const threadId = ThreadId.make("thread-1");
const projectId = ProjectId.make("project-1");
const turnId = TurnId.make("turn-1");

function eventBase(type: string, occurredAt: string) {
  return {
    sequence: 1,
    eventId: EventId.make(`event-${type}`),
    aggregateKind: "thread" as const,
    aggregateId: threadId,
    occurredAt,
    commandId: CommandId.make(`command-${type}`),
    causationEventId: null,
    correlationId: CommandId.make(`command-${type}`),
    metadata: {},
  };
}

function sessionSetEvent(
  status: "starting" | "running" | "ready",
  occurredAt: string,
): OrchestrationEvent {
  return {
    ...eventBase(`session-${status}`, occurredAt),
    type: "thread.session-set",
    payload: {
      threadId,
      session: {
        threadId,
        status,
        providerName: "codex",
        runtimeMode: "full-access",
        activeTurnId: status === "running" ? turnId : null,
        lastError: null,
        updatedAt: occurredAt,
      },
    },
  } as OrchestrationEvent;
}

function turnCompletedEvent(completedAt: string): OrchestrationEvent {
  return {
    ...eventBase("turn-completed", completedAt),
    type: "thread.turn-diff-completed",
    payload: {
      threadId,
      turnId,
      checkpointTurnCount: 1,
      checkpointRef: CheckpointRef.make("checkpoint-1"),
      status: "ready",
      files: [],
      assistantMessageId: null,
      completedAt,
    },
  } as OrchestrationEvent;
}

function setupSchema() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DROP TABLE IF EXISTS projection_threads`;
    yield* sql`DROP TABLE IF EXISTS projection_thread_sessions`;
    yield* sql`DROP TABLE IF EXISTS projection_turns`;
    yield* sql`DROP TABLE IF EXISTS thread_status_states`;
    yield* sql`
      CREATE TABLE projection_threads (
        thread_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        interaction_mode TEXT NOT NULL DEFAULT 'default',
        latest_turn_id TEXT,
        pending_approval_count INTEGER NOT NULL DEFAULT 0,
        pending_user_input_count INTEGER NOT NULL DEFAULT 0,
        has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        archived_at TEXT
      )
    `;
    yield* sql`
      CREATE TABLE projection_thread_sessions (
        thread_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        active_turn_id TEXT,
        updated_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE projection_turns (
        turn_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        state TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      )
    `;
    yield* sql`
      CREATE TABLE thread_status_states (
        thread_id TEXT PRIMARY KEY,
        pending_approval INTEGER NOT NULL DEFAULT 0,
        awaiting_input INTEGER NOT NULL DEFAULT 0,
        working INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        connecting INTEGER NOT NULL DEFAULT 0,
        plan_ready INTEGER NOT NULL DEFAULT 0,
        terminal INTEGER NOT NULL DEFAULT 0,
        terminal_observed_at TEXT,
        latest_turn_id TEXT,
        completed_at TEXT,
        read_at TEXT,
        manually_marked_unread_at TEXT,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL
      )
    `;
    yield* sql`
      INSERT INTO projection_threads (
        thread_id,
        project_id,
        title,
        model,
        interaction_mode,
        latest_turn_id,
        pending_approval_count,
        pending_user_input_count,
        has_actionable_proposed_plan,
        created_at,
        updated_at,
        deleted_at,
        archived_at
      )
      VALUES (
        ${threadId},
        ${projectId},
        'Thread',
        'gpt-5',
        'default',
        NULL,
        0,
        0,
        0,
        '2026-05-09T09:00:00.000Z',
        '2026-05-09T09:00:00.000Z',
        NULL,
        NULL
      )
    `;
  });
}

layer("ThreadStatusStates", (it) => {
  it.effect("keeps working during checkpoint completion and completes on session settle", () =>
    Effect.gen(function* () {
      const statuses = yield* ThreadStatusStates;
      const sql = yield* SqlClient.SqlClient;
      yield* setupSchema();

      yield* sql`
        INSERT INTO projection_thread_sessions (thread_id, status, active_turn_id, updated_at)
        VALUES (${threadId}, 'running', ${turnId}, '2026-05-09T10:00:00.000Z')
      `;
      const working = yield* statuses.applyOrchestrationEvent(
        sessionSetEvent("running", "2026-05-09T10:00:00.000Z"),
      );
      assert.equal(Option.isSome(working) ? working.value.type : null, "state-updated");
      const workingSnapshot = yield* statuses.getSnapshot();
      assert.equal(workingSnapshot.states[0]?.working, true);
      assert.equal(workingSnapshot.states[0]?.completed, false);

      yield* statuses.applyOrchestrationEvent(turnCompletedEvent("2026-05-09T10:01:00.000Z"));
      const checkpointSnapshot = yield* statuses.getSnapshot();
      assert.equal(checkpointSnapshot.states[0]?.working, true);
      assert.equal(checkpointSnapshot.states[0]?.completed, false);

      yield* sql`
        UPDATE projection_thread_sessions
        SET status = 'ready', active_turn_id = NULL, updated_at = '2026-05-09T10:01:00.000Z'
        WHERE thread_id = ${threadId}
      `;
      yield* statuses.applyOrchestrationEvent(sessionSetEvent("ready", "2026-05-09T10:01:00.000Z"));
      const completedSnapshot = yield* statuses.getSnapshot();
      assert.equal(completedSnapshot.states[0]?.working, false);
      assert.equal(completedSnapshot.states[0]?.completed, true);
      assert.equal(completedSnapshot.states[0]?.latestTurnId, turnId);
    }),
  );

  it.effect("clears completed after a one-second active view", () =>
    Effect.gen(function* () {
      const statuses = yield* ThreadStatusStates;
      const sql = yield* SqlClient.SqlClient;
      yield* setupSchema();
      yield* sql`
        INSERT INTO projection_thread_sessions (thread_id, status, active_turn_id, updated_at)
        VALUES (${threadId}, 'running', ${turnId}, '2026-05-09T10:00:00.000Z')
      `;
      yield* statuses.applyOrchestrationEvent(
        sessionSetEvent("running", "2026-05-09T10:00:00.000Z"),
      );
      yield* sql`
        UPDATE projection_thread_sessions
        SET status = 'ready', active_turn_id = NULL, updated_at = '2026-05-09T10:01:00.000Z'
        WHERE thread_id = ${threadId}
      `;
      yield* statuses.applyOrchestrationEvent(sessionSetEvent("ready", "2026-05-09T10:01:00.000Z"));

      yield* statuses.markViewed({
        threadId,
        viewStartedAt: "2026-05-09T10:01:00.000Z",
        observedAt: "2026-05-09T10:01:00.999Z",
      });
      assert.equal((yield* statuses.getSnapshot()).states[0]?.completed, true);

      yield* statuses.markViewed({
        threadId,
        viewStartedAt: "2026-05-09T10:01:00.000Z",
        observedAt: "2026-05-09T10:01:01.000Z",
      });
      assert.equal((yield* statuses.getSnapshot()).states[0]?.completed, false);
    }),
  );

  it.effect("does not clear manual unread until a later route view", () =>
    Effect.gen(function* () {
      const statuses = yield* ThreadStatusStates;
      yield* setupSchema();
      yield* statuses.markUnread({
        threadId,
        observedAt: "2026-05-09T10:02:00.000Z",
      });

      yield* statuses.markViewed({
        threadId,
        viewStartedAt: "2026-05-09T10:01:00.000Z",
        observedAt: "2026-05-09T10:02:02.000Z",
      });
      assert.equal((yield* statuses.getSnapshot()).states[0]?.completed, true);

      yield* statuses.markViewed({
        threadId,
        viewStartedAt: "2026-05-09T10:02:01.000Z",
        observedAt: "2026-05-09T10:02:02.000Z",
      });
      assert.equal((yield* statuses.getSnapshot()).states[0]?.completed, false);
    }),
  );

  it.effect("stores terminal status on the same per-thread row", () =>
    Effect.gen(function* () {
      const statuses = yield* ThreadStatusStates;
      yield* setupSchema();

      yield* statuses.setTerminalOpen(threadId, true, "2026-05-09T10:03:00.000Z");
      assert.equal((yield* statuses.getSnapshot()).states[0]?.terminal, true);

      yield* statuses.setTerminalOpen(threadId, false, "2026-05-09T10:04:00.000Z");
      assert.equal((yield* statuses.getSnapshot()).states[0]?.terminal, false);
    }),
  );

  it.effect("ignores stale terminal status writes", () =>
    Effect.gen(function* () {
      const statuses = yield* ThreadStatusStates;
      yield* setupSchema();

      yield* statuses.setTerminalOpen(threadId, false, "2026-05-09T10:04:00.000Z");
      yield* statuses.setTerminalOpen(threadId, true, "2026-05-09T10:03:00.000Z");

      assert.equal((yield* statuses.getSnapshot()).states[0]?.terminal, false);
    }),
  );

  it.effect("does not infer completed from historical projection turns", () =>
    Effect.gen(function* () {
      const statuses = yield* ThreadStatusStates;
      const sql = yield* SqlClient.SqlClient;
      yield* setupSchema();

      yield* sql`
        INSERT INTO projection_turns (
          turn_id,
          thread_id,
          state,
          requested_at,
          started_at,
          completed_at
        )
        VALUES (
          ${turnId},
          ${threadId},
          'completed',
          '2026-05-09T10:00:00.000Z',
          '2026-05-09T10:00:10.000Z',
          '2026-05-09T10:01:00.000Z'
        )
      `;
      yield* sql`
        UPDATE projection_threads
        SET latest_turn_id = ${turnId}
        WHERE thread_id = ${threadId}
      `;

      const state = (yield* statuses.getSnapshot()).states[0];
      assert.equal(state?.completed, false);
      assert.equal(state?.completedAt, null);
      assert.equal(state?.primaryStatus, null);
    }),
  );

  it.effect("projects lifecycle badge fields into the central thread status row", () =>
    Effect.gen(function* () {
      const statuses = yield* ThreadStatusStates;
      const sql = yield* SqlClient.SqlClient;
      yield* setupSchema();

      yield* sql`
        UPDATE projection_threads
        SET pending_approval_count = 1
        WHERE thread_id = ${threadId}
      `;
      let state = (yield* statuses.getSnapshot()).states[0];
      assert.equal(state?.pendingApproval, true);
      assert.equal(state?.primaryStatus, "pendingApproval");

      yield* sql`
        UPDATE projection_threads
        SET
          pending_approval_count = 0,
          pending_user_input_count = 1
        WHERE thread_id = ${threadId}
      `;
      state = (yield* statuses.getSnapshot()).states[0];
      assert.equal(state?.awaitingInput, true);
      assert.equal(state?.primaryStatus, "awaitingInput");

      yield* sql`
        UPDATE projection_threads
        SET pending_user_input_count = 0
        WHERE thread_id = ${threadId}
      `;
      yield* sql`
        INSERT INTO projection_thread_sessions (thread_id, status, active_turn_id, updated_at)
        VALUES (${threadId}, 'starting', NULL, '2026-05-09T10:05:00.000Z')
        ON CONFLICT(thread_id)
        DO UPDATE SET
          status = excluded.status,
          active_turn_id = excluded.active_turn_id,
          updated_at = excluded.updated_at
      `;
      state = (yield* statuses.getSnapshot()).states[0];
      assert.equal(state?.connecting, true);
      assert.equal(state?.primaryStatus, "connecting");

      yield* sql`
        UPDATE projection_thread_sessions
        SET status = 'ready', updated_at = '2026-05-09T10:06:00.000Z'
        WHERE thread_id = ${threadId}
      `;
      yield* sql`
        INSERT INTO projection_turns (
          turn_id,
          thread_id,
          state,
          requested_at,
          started_at,
          completed_at
        )
        VALUES (
          ${turnId},
          ${threadId},
          'completed',
          '2026-05-09T10:00:00.000Z',
          '2026-05-09T10:00:10.000Z',
          '2026-05-09T10:01:00.000Z'
        )
      `;
      yield* sql`
        UPDATE projection_threads
        SET
          interaction_mode = 'plan',
          latest_turn_id = ${turnId},
          has_actionable_proposed_plan = 1
        WHERE thread_id = ${threadId}
      `;

      state = (yield* statuses.getSnapshot()).states[0];
      assert.equal(state?.planReady, true);
      assert.equal(state?.completed, false);
      assert.equal(state?.primaryStatus, "planReady");
    }),
  );
});
