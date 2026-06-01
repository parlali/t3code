import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS thread_status_states (
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
      revision INTEGER NOT NULL,
      CHECK (pending_approval IN (0, 1)),
      CHECK (awaiting_input IN (0, 1)),
      CHECK (working IN (0, 1)),
      CHECK (completed IN (0, 1)),
      CHECK (connecting IN (0, 1)),
      CHECK (plan_ready IN (0, 1)),
      CHECK (terminal IN (0, 1)),
      CHECK (revision >= 0)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_thread_status_states_updated_at
    ON thread_status_states(updated_at)
  `;

  yield* sql`
    INSERT OR IGNORE INTO thread_status_states (
      thread_id,
      pending_approval,
      awaiting_input,
      working,
      completed,
      connecting,
      plan_ready,
      terminal,
      terminal_observed_at,
      latest_turn_id,
      completed_at,
      read_at,
      manually_marked_unread_at,
      updated_at,
      revision
    )
    SELECT
      threads.thread_id,
      CASE WHEN threads.pending_approval_count > 0 THEN 1 ELSE 0 END,
      CASE WHEN threads.pending_user_input_count > 0 THEN 1 ELSE 0 END,
      CASE
        WHEN sessions.status = 'running' AND sessions.active_turn_id IS NOT NULL THEN 1
          ELSE 0
        END,
      0,
      CASE WHEN sessions.status = 'starting' THEN 1 ELSE 0 END,
      CASE
        WHEN threads.pending_user_input_count = 0
          AND threads.interaction_mode = 'plan'
          AND threads.has_actionable_proposed_plan > 0
          AND latest_turns.started_at IS NOT NULL
          AND latest_turns.completed_at IS NOT NULL
          AND COALESCE(sessions.status NOT IN ('running', 'starting'), 1)
        THEN 1
        ELSE 0
      END,
      0,
      NULL,
      threads.latest_turn_id,
      NULL,
      read_receipts.last_visited_at,
      NULL,
      COALESCE(
        read_receipts.updated_at,
        sessions.updated_at,
        threads.updated_at,
        threads.created_at
      ),
      1
    FROM projection_threads threads
    LEFT JOIN projection_thread_sessions sessions
      ON sessions.thread_id = threads.thread_id
    LEFT JOIN projection_turns latest_turns
      ON latest_turns.thread_id = threads.thread_id
      AND latest_turns.turn_id = threads.latest_turn_id
    LEFT JOIN thread_read_receipts read_receipts
      ON read_receipts.thread_id = threads.thread_id
    WHERE threads.deleted_at IS NULL
  `;

  yield* sql`DROP TABLE IF EXISTS thread_attention_states`;
  yield* sql`DROP TABLE IF EXISTS thread_read_receipts`;
});
