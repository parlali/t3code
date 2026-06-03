export const RIGHT_WORKSPACE_ACTIVITY_RAIL_WIDTH = 3 * 16;
export const RIGHT_WORKSPACE_CENTER_MIN_WIDTH = 13 * 16;
export const RIGHT_WORKSPACE_PANEL_DEFAULT_WIDTH = 56 * 16;
export const RIGHT_WORKSPACE_PANEL_MIN_WIDTH = 28 * 16;

interface RightWorkspacePanelLayoutInput {
  readonly panelWidth: number;
  readonly sidebarWidth: number;
  readonly viewportWidth: number;
}

export function clampRightWorkspacePanelWidth({
  panelWidth,
  sidebarWidth,
  viewportWidth,
}: RightWorkspacePanelLayoutInput): number {
  const requestedWidth = Math.max(panelWidth, RIGHT_WORKSPACE_PANEL_MIN_WIDTH);
  if (viewportWidth <= 0) return requestedWidth;

  const availableWidth = viewportWidth - sidebarWidth - RIGHT_WORKSPACE_ACTIVITY_RAIL_WIDTH;
  const maxWidthWithCenter = availableWidth - RIGHT_WORKSPACE_CENTER_MIN_WIDTH;
  const maxWidth = Math.max(RIGHT_WORKSPACE_PANEL_MIN_WIDTH, maxWidthWithCenter);

  return Math.min(requestedWidth, maxWidth);
}

export function shouldHideRightWorkspaceCenter({
  panelWidth,
  sidebarWidth,
  viewportWidth,
}: RightWorkspacePanelLayoutInput): boolean {
  if (viewportWidth <= 0) return false;
  return (
    viewportWidth - sidebarWidth - RIGHT_WORKSPACE_ACTIVITY_RAIL_WIDTH - panelWidth <
    RIGHT_WORKSPACE_CENTER_MIN_WIDTH
  );
}
