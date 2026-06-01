import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const observedAt = new Date().toISOString();

  yield* sql`
    UPDATE thread_status_states
    SET
      terminal = 0,
      updated_at = ${observedAt},
      revision = revision + 1
    WHERE terminal <> 0
  `;
});
