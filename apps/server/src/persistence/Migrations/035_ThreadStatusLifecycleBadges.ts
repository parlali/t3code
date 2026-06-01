import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE thread_status_states
    ADD COLUMN pending_approval INTEGER NOT NULL DEFAULT 0
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE thread_status_states
    ADD COLUMN awaiting_input INTEGER NOT NULL DEFAULT 0
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE thread_status_states
    ADD COLUMN connecting INTEGER NOT NULL DEFAULT 0
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE thread_status_states
    ADD COLUMN plan_ready INTEGER NOT NULL DEFAULT 0
  `.pipe(Effect.catch(() => Effect.void));

  const observedAt = new Date().toISOString();

  yield* sql`
    UPDATE thread_status_states
    SET
      pending_approval = COALESCE(
        (
          SELECT CASE WHEN threads.pending_approval_count > 0 THEN 1 ELSE 0 END
          FROM projection_threads threads
          WHERE threads.thread_id = thread_status_states.thread_id
            AND threads.deleted_at IS NULL
          LIMIT 1
        ),
        pending_approval
      ),
      awaiting_input = COALESCE(
        (
          SELECT CASE WHEN threads.pending_user_input_count > 0 THEN 1 ELSE 0 END
          FROM projection_threads threads
          WHERE threads.thread_id = thread_status_states.thread_id
            AND threads.deleted_at IS NULL
          LIMIT 1
        ),
        awaiting_input
      ),
      connecting = COALESCE(
        (
          SELECT CASE WHEN sessions.status = 'starting' THEN 1 ELSE 0 END
          FROM projection_threads threads
          LEFT JOIN projection_thread_sessions sessions
            ON sessions.thread_id = threads.thread_id
          WHERE threads.thread_id = thread_status_states.thread_id
            AND threads.deleted_at IS NULL
          LIMIT 1
        ),
        connecting
      ),
      plan_ready = COALESCE(
        (
          SELECT CASE
            WHEN threads.pending_user_input_count = 0
              AND threads.interaction_mode = 'plan'
              AND threads.has_actionable_proposed_plan > 0
              AND latest_turns.started_at IS NOT NULL
              AND latest_turns.completed_at IS NOT NULL
              AND COALESCE(sessions.status NOT IN ('running', 'starting'), 1)
            THEN 1
            ELSE 0
          END
          FROM projection_threads threads
          LEFT JOIN projection_thread_sessions sessions
            ON sessions.thread_id = threads.thread_id
          LEFT JOIN projection_turns latest_turns
            ON latest_turns.thread_id = threads.thread_id
            AND latest_turns.turn_id = threads.latest_turn_id
          WHERE threads.thread_id = thread_status_states.thread_id
            AND threads.deleted_at IS NULL
          LIMIT 1
        ),
        plan_ready
      ),
      updated_at = ${observedAt},
      revision = revision + 1
    WHERE EXISTS (
      SELECT 1
      FROM projection_threads threads
      WHERE threads.thread_id = thread_status_states.thread_id
        AND threads.deleted_at IS NULL
    )
  `;
});
