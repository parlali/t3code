import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("042_TaskPlanProjectionRepair", (it) => {
  it.effect("repairs terminal task plans and clears stale persisted task mode", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 41 });

      yield* sql`
        INSERT INTO projection_turns (
          thread_id,
          turn_id,
          state,
          requested_at,
          started_at,
          completed_at,
          checkpoint_files_json
        )
        VALUES (
          'thread-1',
          'turn-1',
          'completed',
          '2026-05-16T11:00:00.000Z',
          '2026-05-16T11:00:01.000Z',
          '2026-05-16T11:00:03.000Z',
          '[]'
        )
      `;

      yield* sql`
        INSERT INTO projection_turns (
          thread_id,
          turn_id,
          state,
          requested_at,
          started_at,
          completed_at,
          checkpoint_files_json
        )
        VALUES
          (
            'thread-1',
            'turn-2',
            'completed',
            '2026-05-16T11:01:00.000Z',
            '2026-05-16T11:01:01.000Z',
            '2026-05-16T11:01:03.000Z',
            '[]'
          ),
          (
            'thread-1',
            'turn-3',
            'completed',
            '2026-05-16T11:02:00.000Z',
            '2026-05-16T11:02:01.000Z',
            '2026-05-16T11:02:03.000Z',
            '[]'
          )
      `;

      yield* sql`
        INSERT INTO projection_thread_task_plans (
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
        VALUES (
          'thread-1',
          'turn-1',
          'interrupted',
          NULL,
          '[{"step":"Inspect","status":"completed"},{"step":"Patch","status":"inProgress"}]',
          'activity-1',
          '2026-05-16T11:00:01.000Z',
          '2026-05-16T11:00:02.000Z',
          '2026-05-16T11:00:02.000Z'
        )
      `;

      yield* sql`
        INSERT INTO projection_thread_task_plans (
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
        VALUES
          (
            'thread-1',
            'turn-2',
            'active',
            NULL,
            '[{"step":"Late plan","status":"inProgress"}]',
            'activity-2',
            '2026-05-16T11:01:01.000Z',
            '2026-05-16T11:01:02.000Z',
            NULL
          ),
          (
            'thread-1',
            'turn-3',
            'active',
            NULL,
            '[{"step":"Still running","status":"inProgress"}]',
            'activity-3',
            '2026-05-16T11:02:01.000Z',
            '2026-05-16T11:02:02.000Z',
            NULL
          )
      `;

      yield* sql`
        INSERT INTO projection_thread_sessions (
          thread_id,
          status,
          provider_name,
          provider_instance_id,
          runtime_mode,
          active_turn_id,
          last_error,
          updated_at
        )
        VALUES (
          'thread-1',
          'running',
          'codex',
          NULL,
          'full-access',
          'turn-3',
          NULL,
          '2026-05-16T11:02:02.500Z'
        )
      `;

      yield* sql`
        INSERT INTO workspace_right_panel_state (
          project_id,
          workspace_root,
          panel_open,
          active_mode,
          files_sidebar_open,
          changes_sidebar_open,
          updated_at
        )
        VALUES (
          'project-1',
          '/tmp/project',
          1,
          'tasks',
          1,
          1,
          '2026-05-16T11:00:02.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 42 });

      const plans = yield* sql<{
        readonly turnId: string;
        readonly status: string;
        readonly stepsJson: string;
        readonly settledAt: string | null;
      }>`
        SELECT
          turn_id AS "turnId",
          status,
          steps_json AS "stepsJson",
          settled_at AS "settledAt"
        FROM projection_thread_task_plans
        WHERE thread_id = 'thread-1'
        ORDER BY turn_id ASC
      `;
      assert.deepEqual(plans, [
        {
          turnId: "turn-1",
          status: "completed",
          stepsJson:
            '[{"step":"Inspect","status":"completed"},{"step":"Patch","status":"completed"}]',
          settledAt: "2026-05-16T11:00:03.000Z",
        },
        {
          turnId: "turn-2",
          status: "completed",
          stepsJson: '[{"step":"Late plan","status":"completed"}]',
          settledAt: "2026-05-16T11:01:03.000Z",
        },
        {
          turnId: "turn-3",
          status: "active",
          stepsJson: '[{"step":"Still running","status":"inProgress"}]',
          settledAt: null,
        },
      ]);

      const panels = yield* sql<{ readonly activeMode: string }>`
        SELECT active_mode AS "activeMode"
        FROM workspace_right_panel_state
        WHERE project_id = 'project-1'
          AND workspace_root = '/tmp/project'
      `;
      assert.deepEqual(panels, [{ activeMode: "files" }]);
    }),
  );
});
