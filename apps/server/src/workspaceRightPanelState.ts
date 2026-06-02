import {
  ProjectId,
  WorkspaceRightPanelStateError,
  type WorkspaceRightPanelChangeSelection,
  type WorkspaceRightPanelFileSelection,
  type WorkspaceRightPanelGetStateInput,
  type WorkspaceRightPanelMode,
  type WorkspaceRightPanelNestedSidebarState,
  type WorkspaceRightPanelSetStateInput,
  type WorkspaceRightPanelState,
} from "@t3tools/contracts";
import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface WorkspaceRightPanelStateRow {
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly panelOpen: number;
  readonly activeMode: string;
  readonly filesRelativePath: string | null;
  readonly changesRelativePath: string | null;
  readonly changesSource: string | null;
  readonly filesSidebarOpen: number;
  readonly changesSidebarOpen: number;
  readonly updatedAt: string;
}

export interface WorkspaceRightPanelStatesShape {
  readonly getState: (
    input: WorkspaceRightPanelGetStateInput,
  ) => Effect.Effect<WorkspaceRightPanelState, WorkspaceRightPanelStateError>;
  readonly setState: (
    input: WorkspaceRightPanelSetStateInput,
  ) => Effect.Effect<WorkspaceRightPanelState, WorkspaceRightPanelStateError>;
}

export class WorkspaceRightPanelStates extends Context.Service<
  WorkspaceRightPanelStates,
  WorkspaceRightPanelStatesShape
>()("t3/workspaceRightPanelStates") {}

function rightPanelStateError(operation: string, cause: unknown): WorkspaceRightPanelStateError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new WorkspaceRightPanelStateError({ operation, detail });
}

function toBoolean(value: number): boolean {
  return value !== 0;
}

function normalizeMode(value: string | null | undefined): WorkspaceRightPanelMode {
  return value === "changes" || value === "tasks" || value === "files" ? value : "files";
}

function fileSelection(path: string | null): WorkspaceRightPanelFileSelection | null {
  return path && path.length > 0 ? { relativePath: path } : null;
}

function changeSelection(
  path: string | null,
  source: string | null,
): WorkspaceRightPanelChangeSelection | null {
  if (!path || path.length === 0) return null;
  return {
    relativePath: path,
    ...(source === "staged" || source === "working-tree" ? { changeSource: source } : {}),
  };
}

function defaultState(input: WorkspaceRightPanelGetStateInput): WorkspaceRightPanelState {
  return {
    projectId: input.projectId,
    workspaceRoot: input.workspaceRoot,
    panelOpen: true,
    activeMode: "files",
    files: null,
    changes: null,
    nestedSidebarOpen: {
      files: true,
      changes: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

function toState(row: WorkspaceRightPanelStateRow): WorkspaceRightPanelState {
  return {
    projectId: ProjectId.make(row.projectId),
    workspaceRoot: row.workspaceRoot,
    panelOpen: toBoolean(row.panelOpen),
    activeMode: normalizeMode(row.activeMode),
    files: fileSelection(row.filesRelativePath),
    changes: changeSelection(row.changesRelativePath, row.changesSource),
    nestedSidebarOpen: {
      files: toBoolean(row.filesSidebarOpen),
      changes: toBoolean(row.changesSidebarOpen),
    },
    updatedAt: row.updatedAt,
  };
}

function mergeNestedSidebarOpen(
  current: WorkspaceRightPanelNestedSidebarState,
  patch: WorkspaceRightPanelSetStateInput["patch"]["nestedSidebarOpen"] | undefined,
): WorkspaceRightPanelNestedSidebarState {
  if (!patch) return current;
  return {
    files: patch.files ?? current.files,
    changes: patch.changes ?? current.changes,
  };
}

function mergeState(
  current: WorkspaceRightPanelState,
  input: WorkspaceRightPanelSetStateInput,
  updatedAt: string,
): WorkspaceRightPanelState {
  return {
    projectId: input.projectId,
    workspaceRoot: input.workspaceRoot,
    panelOpen: input.patch.panelOpen ?? current.panelOpen,
    activeMode: input.patch.activeMode ?? current.activeMode,
    files: input.patch.files === undefined ? current.files : input.patch.files,
    changes: input.patch.changes === undefined ? current.changes : input.patch.changes,
    nestedSidebarOpen: mergeNestedSidebarOpen(
      current.nestedSidebarOpen,
      input.patch.nestedSidebarOpen,
    ),
    updatedAt,
  };
}

const makeWorkspaceRightPanelStates = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const readState = (input: WorkspaceRightPanelGetStateInput) =>
    sql<WorkspaceRightPanelStateRow>`
      SELECT
        project_id AS "projectId",
        workspace_root AS "workspaceRoot",
        panel_open AS "panelOpen",
        active_mode AS "activeMode",
        files_relative_path AS "filesRelativePath",
        changes_relative_path AS "changesRelativePath",
        changes_source AS "changesSource",
        files_sidebar_open AS "filesSidebarOpen",
        changes_sidebar_open AS "changesSidebarOpen",
        updated_at AS "updatedAt"
      FROM workspace_right_panel_state
      WHERE project_id = ${input.projectId}
        AND workspace_root = ${input.workspaceRoot}
    `.pipe(
      Effect.map((rows): WorkspaceRightPanelState => {
        const row = rows[0];
        return row ? toState(row) : defaultState(input);
      }),
      Effect.mapError((cause) =>
        rightPanelStateError("WorkspaceRightPanelStates.readState", cause),
      ),
    );

  const getState: WorkspaceRightPanelStatesShape["getState"] = (input) => readState(input);

  const setState: WorkspaceRightPanelStatesShape["setState"] = (input) =>
    Effect.gen(function* () {
      const current = yield* readState(input);
      const next = mergeState(current, input, new Date().toISOString());

      yield* sql`
        INSERT INTO workspace_right_panel_state (
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
        VALUES (
          ${next.projectId},
          ${next.workspaceRoot},
          ${next.panelOpen ? 1 : 0},
          ${next.activeMode},
          ${next.files?.relativePath ?? null},
          ${next.changes?.relativePath ?? null},
          ${next.changes?.changeSource ?? null},
          ${next.nestedSidebarOpen.files ? 1 : 0},
          ${next.nestedSidebarOpen.changes ? 1 : 0},
          ${next.updatedAt}
        )
        ON CONFLICT (project_id, workspace_root)
        DO UPDATE SET
          panel_open = excluded.panel_open,
          active_mode = excluded.active_mode,
          files_relative_path = excluded.files_relative_path,
          changes_relative_path = excluded.changes_relative_path,
          changes_source = excluded.changes_source,
          files_sidebar_open = excluded.files_sidebar_open,
          changes_sidebar_open = excluded.changes_sidebar_open,
          updated_at = excluded.updated_at
      `.pipe(
        Effect.mapError((cause) =>
          rightPanelStateError("WorkspaceRightPanelStates.setState", cause),
        ),
      );

      return yield* readState(input);
    }).pipe(
      Effect.mapError((cause) =>
        Schema.is(WorkspaceRightPanelStateError)(cause)
          ? cause
          : rightPanelStateError("WorkspaceRightPanelStates.setState", cause),
      ),
    );

  return {
    getState,
    setState,
  } satisfies WorkspaceRightPanelStatesShape;
});

export const WorkspaceRightPanelStatesLive = Layer.effect(
  WorkspaceRightPanelStates,
  makeWorkspaceRightPanelStates,
);
