import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS workspace_right_panel_state (
      project_id TEXT NOT NULL,
      workspace_root TEXT NOT NULL,
      panel_open INTEGER NOT NULL DEFAULT 1,
      active_mode TEXT NOT NULL DEFAULT 'files',
      files_relative_path TEXT,
      changes_relative_path TEXT,
      changes_source TEXT,
      files_sidebar_open INTEGER NOT NULL DEFAULT 1,
      changes_sidebar_open INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, workspace_root),
      CHECK (panel_open IN (0, 1)),
      CHECK (active_mode IN ('files', 'changes', 'tasks')),
      CHECK (files_sidebar_open IN (0, 1)),
      CHECK (changes_sidebar_open IN (0, 1)),
      CHECK (changes_source IS NULL OR changes_source IN ('working-tree', 'staged')),
      CHECK (files_relative_path IS NULL OR length(files_relative_path) > 0),
      CHECK (changes_relative_path IS NULL OR length(changes_relative_path) > 0)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_workspace_right_panel_state_updated_at
    ON workspace_right_panel_state(updated_at)
  `;

  yield* sql`
    WITH ranked_thread_state AS (
      SELECT
        threads.project_id,
        COALESCE(threads.worktree_path, projects.workspace_root) AS workspace_root,
        state.selection_source,
        state.change_source,
        state.relative_path,
        state.updated_at,
        ROW_NUMBER() OVER (
          PARTITION BY threads.project_id, COALESCE(threads.worktree_path, projects.workspace_root)
          ORDER BY state.updated_at DESC, threads.updated_at DESC, threads.thread_id DESC
        ) AS rank
      FROM thread_workbench_state AS state
      JOIN projection_threads AS threads
        ON threads.thread_id = state.thread_id
      JOIN projection_projects AS projects
        ON projects.project_id = threads.project_id
      WHERE
        state.relative_path IS NOT NULL
        AND state.selection_source IN ('files', 'changes')
        AND COALESCE(threads.worktree_path, projects.workspace_root) IS NOT NULL
    )
    INSERT OR IGNORE INTO workspace_right_panel_state (
      project_id,
      workspace_root,
      panel_open,
      active_mode,
      files_relative_path,
      changes_relative_path,
      changes_source,
      files_sidebar_open,
      changes_sidebar_open,
      updated_at
    )
    SELECT
      project_id,
      workspace_root,
      1,
      selection_source,
      CASE WHEN selection_source = 'files' THEN relative_path ELSE NULL END,
      CASE WHEN selection_source = 'changes' THEN relative_path ELSE NULL END,
      CASE
        WHEN selection_source = 'changes' AND change_source IN ('working-tree', 'staged')
          THEN change_source
        WHEN selection_source = 'changes'
          THEN 'working-tree'
        ELSE NULL
      END,
      1,
      1,
      updated_at
    FROM ranked_thread_state
    WHERE rank = 1
  `;
});
