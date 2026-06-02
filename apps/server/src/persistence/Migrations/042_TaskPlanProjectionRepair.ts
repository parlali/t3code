import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    UPDATE projection_thread_task_plans
    SET
      status = (
        SELECT
          CASE turn.state
            WHEN 'completed' THEN 'completed'
            WHEN 'error' THEN 'failed'
            WHEN 'interrupted' THEN 'interrupted'
          END
        FROM projection_turns AS turn
        WHERE
          turn.thread_id = projection_thread_task_plans.thread_id
          AND turn.turn_id = projection_thread_task_plans.turn_id
      ),
      settled_at = COALESCE(
        (
          SELECT turn.completed_at
          FROM projection_turns AS turn
          WHERE
            turn.thread_id = projection_thread_task_plans.thread_id
            AND turn.turn_id = projection_thread_task_plans.turn_id
        ),
        settled_at,
        updated_at
      ),
      updated_at = MAX(
        updated_at,
        COALESCE(
          (
            SELECT turn.completed_at
            FROM projection_turns AS turn
            WHERE
              turn.thread_id = projection_thread_task_plans.thread_id
              AND turn.turn_id = projection_thread_task_plans.turn_id
          ),
          settled_at,
          updated_at
        )
      )
    WHERE
      EXISTS (
        SELECT 1
        FROM projection_turns AS turn
        WHERE
          turn.thread_id = projection_thread_task_plans.thread_id
          AND turn.turn_id = projection_thread_task_plans.turn_id
          AND turn.state IN ('completed', 'error', 'interrupted')
          AND projection_thread_task_plans.status <> CASE turn.state
            WHEN 'completed' THEN 'completed'
            WHEN 'error' THEN 'failed'
            WHEN 'interrupted' THEN 'interrupted'
          END
      )
      AND NOT EXISTS (
        SELECT 1
        FROM projection_thread_sessions AS session
        WHERE
          session.thread_id = projection_thread_task_plans.thread_id
          AND session.active_turn_id = projection_thread_task_plans.turn_id
          AND session.status IN ('running', 'starting')
      )
  `;

  yield* sql`
    UPDATE projection_thread_task_plans
    SET steps_json = (
      SELECT json_group_array(json(patched_step))
      FROM (
        SELECT json_set(step.value, '$.status', 'completed') AS patched_step
        FROM json_each(projection_thread_task_plans.steps_json) AS step
        ORDER BY CAST(step.key AS INTEGER)
      )
    )
    WHERE status = 'completed'
      AND EXISTS (
        SELECT 1
        FROM json_each(projection_thread_task_plans.steps_json) AS step
        WHERE json_extract(step.value, '$.status') <> 'completed'
      )
  `;

  yield* sql`
    UPDATE workspace_right_panel_state
    SET
      active_mode = 'files',
      updated_at = CURRENT_TIMESTAMP
    WHERE active_mode = 'tasks'
  `;
});
