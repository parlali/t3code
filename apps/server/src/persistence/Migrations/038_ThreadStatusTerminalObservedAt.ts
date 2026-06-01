import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE thread_status_states
    ADD COLUMN terminal_observed_at TEXT
  `.pipe(Effect.catch(() => Effect.void));
});
