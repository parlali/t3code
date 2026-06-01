import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_task_plans (
      thread_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      status TEXT NOT NULL,
      explanation TEXT,
      steps_json TEXT NOT NULL,
      source_activity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      settled_at TEXT,
      PRIMARY KEY (thread_id, turn_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_task_plans_thread_updated
    ON projection_thread_task_plans(thread_id, updated_at, turn_id)
  `;

  yield* sql`
    WITH ranked_plan_activities AS (
      SELECT
        activity.thread_id,
        activity.turn_id,
        activity.activity_id,
        activity.payload_json,
        activity.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY activity.thread_id, activity.turn_id
          ORDER BY
            CASE WHEN activity.sequence IS NULL THEN 0 ELSE 1 END DESC,
            activity.sequence DESC,
            activity.created_at DESC,
            activity.activity_id DESC
        ) AS rank
      FROM projection_thread_activities AS activity
      WHERE
        activity.kind = 'turn.plan.updated'
        AND activity.turn_id IS NOT NULL
        AND json_type(activity.payload_json, '$.plan') = 'array'
        AND json_array_length(activity.payload_json, '$.plan') > 0
    )
    INSERT OR IGNORE INTO projection_thread_task_plans (
      thread_id,
      turn_id,
      status,
      explanation,
      steps_json,
      source_activity_id,
      created_at,
      updated_at,
      settled_at
    )
    SELECT
      activity.thread_id,
      activity.turn_id,
      CASE
        WHEN turn.state = 'completed' THEN 'completed'
        WHEN turn.state = 'error' THEN 'failed'
        WHEN turn.state = 'interrupted' THEN 'interrupted'
        ELSE 'active'
      END AS status,
      NULLIF(TRIM(json_extract(activity.payload_json, '$.explanation')), '') AS explanation,
      COALESCE(
        (
          SELECT json_group_array(
            json_object(
              'step',
              COALESCE(
                NULLIF(TRIM(json_extract(step.value, '$.step')), ''),
                NULLIF(TRIM(json_extract(step.value, '$.content')), ''),
                NULLIF(TRIM(json_extract(step.value, '$.title')), ''),
                'Task ' || (CAST(step.key AS INTEGER) + 1)
              ),
              'status',
              CASE json_extract(step.value, '$.status')
                WHEN 'completed' THEN 'completed'
                WHEN 'complete' THEN 'completed'
                WHEN 'done' THEN 'completed'
                WHEN 'inProgress' THEN 'inProgress'
                WHEN 'in_progress' THEN 'inProgress'
                WHEN 'in-progress' THEN 'inProgress'
                WHEN 'running' THEN 'inProgress'
                WHEN 'active' THEN 'inProgress'
                ELSE 'pending'
              END
            )
          )
          FROM json_each(activity.payload_json, '$.plan') AS step
        ),
        '[]'
      ) AS steps_json,
      activity.activity_id,
      activity.created_at,
      activity.created_at,
      turn.completed_at
    FROM ranked_plan_activities AS activity
    LEFT JOIN projection_turns AS turn
      ON turn.thread_id = activity.thread_id
      AND turn.turn_id = activity.turn_id
    WHERE activity.rank = 1
  `;
});
