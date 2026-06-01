import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as SqliteClient from "./persistence/NodeSqliteClient.ts";
import { ThreadWorkbenchStates, ThreadWorkbenchStatesLive } from "./threadWorkbenchState.ts";

const sqliteLayer = SqliteClient.layerMemory();
const layer = it.layer(
  Layer.mergeAll(sqliteLayer, ThreadWorkbenchStatesLive.pipe(Layer.provide(sqliteLayer))),
);

layer("ThreadWorkbenchStates", (it) => {
  it.effect("persists and clears a thread selection", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const states = yield* ThreadWorkbenchStates;
      const threadId = ThreadId.make("thread-1");

      yield* sql`
        CREATE TABLE thread_workbench_state (
          thread_id TEXT PRIMARY KEY,
          selection_source TEXT,
          change_source TEXT,
          relative_path TEXT,
          updated_at TEXT NOT NULL
        )
      `;

      const empty = yield* states.getState({ threadId });
      assert.deepEqual(empty.selection, null);

      const selected = yield* states.setState({
        threadId,
        selection: {
          source: "changes",
          relativePath: "apps/web/src/App.tsx",
        },
      });
      assert.deepEqual(selected.selection, {
        source: "changes",
        changeSource: "working-tree",
        relativePath: "apps/web/src/App.tsx",
      });

      const loaded = yield* states.getState({ threadId });
      assert.deepEqual(loaded.selection, selected.selection);

      const cleared = yield* states.setState({ threadId, selection: null });
      assert.deepEqual(cleared.selection, null);

      const rows = yield* sql<{
        readonly selectionSource: string | null;
        readonly changeSource: string | null;
        readonly relativePath: string | null;
      }>`
        SELECT
          selection_source AS "selectionSource",
          change_source AS "changeSource",
          relative_path AS "relativePath"
        FROM thread_workbench_state
        WHERE thread_id = ${threadId}
      `;
      assert.deepEqual(rows, [
        {
          selectionSource: null,
          changeSource: null,
          relativePath: null,
        },
      ]);
    }),
  );
});
