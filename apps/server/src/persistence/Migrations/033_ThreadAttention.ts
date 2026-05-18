import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS thread_attention_states (
      thread_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      latest_turn_id TEXT NOT NULL,
      attention_kind TEXT NOT NULL,
      attention_at TEXT NOT NULL,
      acknowledged_turn_id TEXT,
      acknowledged_at TEXT,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL,
      PRIMARY KEY (thread_id, viewer_id),
      CHECK (attention_kind IN ('completed')),
      CHECK (revision >= 0)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_thread_attention_states_viewer
    ON thread_attention_states(viewer_id, updated_at)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_thread_attention_states_thread
    ON thread_attention_states(thread_id)
  `;

  yield* sql`
    INSERT OR IGNORE INTO thread_attention_states (
      thread_id,
      viewer_id,
      latest_turn_id,
      attention_kind,
      attention_at,
      acknowledged_turn_id,
      acknowledged_at,
      updated_at,
      revision
    )
    WITH viewers(viewer_id) AS (
      SELECT session_id
      FROM auth_sessions
      WHERE revoked_at IS NULL
      UNION
      SELECT 'unsafe-no-auth'
    ),
    latest_terminal_turns AS (
      SELECT
        threads.thread_id,
        turns.turn_id,
        COALESCE(
          turns.completed_at,
          turns.started_at,
          turns.requested_at,
          threads.updated_at,
          threads.created_at
        ) AS attention_at
      FROM projection_threads threads
      INNER JOIN projection_turns turns
        ON turns.thread_id = threads.thread_id
        AND turns.turn_id = threads.latest_turn_id
      WHERE threads.deleted_at IS NULL
        AND threads.archived_at IS NULL
        AND threads.latest_turn_id IS NOT NULL
        AND turns.turn_id IS NOT NULL
        AND turns.state IN ('completed', 'interrupted', 'error')
    )
    SELECT
      latest_terminal_turns.thread_id,
      viewers.viewer_id,
      latest_terminal_turns.turn_id,
      'completed',
      latest_terminal_turns.attention_at,
      CASE
        WHEN read_receipts.last_visited_at IS NOT NULL
          AND read_receipts.last_visited_at >= latest_terminal_turns.attention_at
        THEN latest_terminal_turns.turn_id
        ELSE NULL
      END,
      CASE
        WHEN read_receipts.last_visited_at IS NOT NULL
          AND read_receipts.last_visited_at >= latest_terminal_turns.attention_at
        THEN read_receipts.last_visited_at
        ELSE NULL
      END,
      COALESCE(read_receipts.updated_at, latest_terminal_turns.attention_at),
      1
    FROM latest_terminal_turns
    CROSS JOIN viewers
    LEFT JOIN thread_read_receipts read_receipts
      ON read_receipts.thread_id = latest_terminal_turns.thread_id
  `;
});
