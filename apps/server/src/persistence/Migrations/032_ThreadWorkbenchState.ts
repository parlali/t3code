import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS thread_workbench_state (
      thread_id TEXT PRIMARY KEY,
      selection_source TEXT,
      relative_path TEXT,
      updated_at TEXT NOT NULL,
      CHECK (
        (
          selection_source IS NULL
          AND relative_path IS NULL
        )
        OR (
          selection_source IN ('files', 'changes')
          AND relative_path IS NOT NULL
        )
      )
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_thread_workbench_state_updated_at
    ON thread_workbench_state(updated_at)
  `;
});
