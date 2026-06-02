import type {
  EnvironmentId,
  ProjectId,
  WorkspaceRightPanelGetStateInput,
  WorkspaceRightPanelState,
  WorkspaceRightPanelStatePatch,
} from "@t3tools/contracts";

export function workspaceRightPanelQueryKey(input: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly workspaceRoot: string;
}) {
  return [
    "workspaceRightPanel",
    input.environmentId,
    input.projectId,
    input.workspaceRoot,
  ] as const;
}

export function defaultWorkspaceRightPanelState(
  input: WorkspaceRightPanelGetStateInput,
): WorkspaceRightPanelState {
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

export function applyWorkspaceRightPanelPatch(
  state: WorkspaceRightPanelState,
  patch: WorkspaceRightPanelStatePatch,
): WorkspaceRightPanelState {
  return {
    ...state,
    panelOpen: patch.panelOpen ?? state.panelOpen,
    activeMode: patch.activeMode ?? state.activeMode,
    files: patch.files === undefined ? state.files : patch.files,
    changes: patch.changes === undefined ? state.changes : patch.changes,
    nestedSidebarOpen: {
      files: patch.nestedSidebarOpen?.files ?? state.nestedSidebarOpen.files,
      changes: patch.nestedSidebarOpen?.changes ?? state.nestedSidebarOpen.changes,
    },
    updatedAt: new Date().toISOString(),
  };
}
