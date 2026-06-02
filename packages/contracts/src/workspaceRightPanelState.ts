import { Schema } from "effect";
import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { VcsFileDiffSource } from "./git.ts";

const WORKSPACE_RIGHT_PANEL_PATH_MAX_LENGTH = 512;
const WORKSPACE_RIGHT_PANEL_WORKSPACE_ROOT_MAX_LENGTH = 4096;

const WorkspaceRightPanelPath = TrimmedNonEmptyString.check(
  Schema.isMaxLength(WORKSPACE_RIGHT_PANEL_PATH_MAX_LENGTH),
);

const WorkspaceRightPanelWorkspaceRoot = TrimmedNonEmptyString.check(
  Schema.isMaxLength(WORKSPACE_RIGHT_PANEL_WORKSPACE_ROOT_MAX_LENGTH),
);

export const WorkspaceRightPanelMode = Schema.Literals(["files", "changes", "tasks"]);
export type WorkspaceRightPanelMode = typeof WorkspaceRightPanelMode.Type;

export const WorkspaceRightPanelFileSelection = Schema.Struct({
  relativePath: WorkspaceRightPanelPath,
});
export type WorkspaceRightPanelFileSelection = typeof WorkspaceRightPanelFileSelection.Type;

export const WorkspaceRightPanelChangeSelection = Schema.Struct({
  relativePath: WorkspaceRightPanelPath,
  changeSource: Schema.optional(VcsFileDiffSource),
});
export type WorkspaceRightPanelChangeSelection = typeof WorkspaceRightPanelChangeSelection.Type;

export const WorkspaceRightPanelNestedSidebarState = Schema.Struct({
  files: Schema.Boolean,
  changes: Schema.Boolean,
});
export type WorkspaceRightPanelNestedSidebarState =
  typeof WorkspaceRightPanelNestedSidebarState.Type;

export const WorkspaceRightPanelState = Schema.Struct({
  projectId: ProjectId,
  workspaceRoot: WorkspaceRightPanelWorkspaceRoot,
  panelOpen: Schema.Boolean,
  activeMode: WorkspaceRightPanelMode,
  files: Schema.NullOr(WorkspaceRightPanelFileSelection),
  changes: Schema.NullOr(WorkspaceRightPanelChangeSelection),
  nestedSidebarOpen: WorkspaceRightPanelNestedSidebarState,
  updatedAt: IsoDateTime,
});
export type WorkspaceRightPanelState = typeof WorkspaceRightPanelState.Type;

export const WorkspaceRightPanelGetStateInput = Schema.Struct({
  projectId: ProjectId,
  workspaceRoot: WorkspaceRightPanelWorkspaceRoot,
});
export type WorkspaceRightPanelGetStateInput = typeof WorkspaceRightPanelGetStateInput.Type;

export const WorkspaceRightPanelStatePatch = Schema.Struct({
  panelOpen: Schema.optional(Schema.Boolean),
  activeMode: Schema.optional(WorkspaceRightPanelMode),
  files: Schema.optional(Schema.NullOr(WorkspaceRightPanelFileSelection)),
  changes: Schema.optional(Schema.NullOr(WorkspaceRightPanelChangeSelection)),
  nestedSidebarOpen: Schema.optional(
    Schema.Struct({
      files: Schema.optional(Schema.Boolean),
      changes: Schema.optional(Schema.Boolean),
    }),
  ),
});
export type WorkspaceRightPanelStatePatch = typeof WorkspaceRightPanelStatePatch.Type;

export const WorkspaceRightPanelSetStateInput = Schema.Struct({
  projectId: ProjectId,
  workspaceRoot: WorkspaceRightPanelWorkspaceRoot,
  patch: WorkspaceRightPanelStatePatch,
});
export type WorkspaceRightPanelSetStateInput = typeof WorkspaceRightPanelSetStateInput.Type;

export class WorkspaceRightPanelStateError extends Schema.TaggedErrorClass<WorkspaceRightPanelStateError>()(
  "WorkspaceRightPanelStateError",
  {
    operation: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `${this.operation}: ${this.detail}`;
  }
}
