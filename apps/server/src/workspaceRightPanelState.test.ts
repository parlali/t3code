import { assert, it } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as SqliteClient from "./persistence/NodeSqliteClient.ts";
import {
  WorkspaceRightPanelStates,
  WorkspaceRightPanelStatesLive,
} from "./workspaceRightPanelState.ts";

const sqliteLayer = SqliteClient.layerMemory();
const layer = it.layer(
  Layer.mergeAll(sqliteLayer, WorkspaceRightPanelStatesLive.pipe(Layer.provide(sqliteLayer))),
);

layer("WorkspaceRightPanelStates", (it) => {
  it.effect("persists workspace-local panel state", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const states = yield* WorkspaceRightPanelStates;
      const projectId = ProjectId.make("project-1");
      const workspaceRoot = "/tmp/project";

      yield* sql`
        CREATE TABLE workspace_right_panel_state (
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
          PRIMARY KEY (project_id, workspace_root)
        )
      `;

      const empty = yield* states.getState({ projectId, workspaceRoot });
      assert.deepEqual(empty, {
        projectId,
        workspaceRoot,
        panelOpen: true,
        activeMode: "files",
        files: null,
        changes: null,
        nestedSidebarOpen: {
          files: true,
          changes: true,
        },
        updatedAt: empty.updatedAt,
      });

      const selected = yield* states.setState({
        projectId,
        workspaceRoot,
        patch: {
          activeMode: "changes",
          panelOpen: true,
          changes: {
            relativePath: "apps/web/src/App.tsx",
            changeSource: "staged",
          },
          nestedSidebarOpen: {
            changes: false,
          },
        },
      });
      assert.deepEqual(selected.changes, {
        relativePath: "apps/web/src/App.tsx",
        changeSource: "staged",
      });
      assert.equal(selected.activeMode, "changes");
      assert.equal(selected.nestedSidebarOpen.changes, false);

      const loaded = yield* states.getState({ projectId, workspaceRoot });
      assert.deepEqual(loaded, selected);

      const filesSelected = yield* states.setState({
        projectId,
        workspaceRoot,
        patch: {
          activeMode: "files",
          files: {
            relativePath: "README.md",
          },
        },
      });
      assert.deepEqual(filesSelected.files, { relativePath: "README.md" });
      assert.deepEqual(filesSelected.changes, selected.changes);
    }),
  );
});
