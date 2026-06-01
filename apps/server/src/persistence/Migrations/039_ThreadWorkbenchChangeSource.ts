import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(thread_workbench_state)
  `;

  if (!columns.some((column) => column.name === "change_source")) {
    yield* sql`
      ALTER TABLE thread_workbench_state
      ADD COLUMN change_source TEXT
    `;
  }
});
