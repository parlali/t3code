import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const observedAt = new Date().toISOString();

  yield* sql`
    UPDATE thread_status_states
    SET
      completed = 0,
      completed_at = NULL,
      manually_marked_unread_at = NULL,
      updated_at = ${observedAt},
      revision = revision + 1
    WHERE completed <> 0
      OR completed_at IS NOT NULL
      OR manually_marked_unread_at IS NOT NULL
  `;
});
