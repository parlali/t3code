import { describe, expect, it } from "vitest";

import {
  clampRightWorkspacePanelWidth,
  RIGHT_WORKSPACE_ACTIVITY_RAIL_WIDTH,
  RIGHT_WORKSPACE_CENTER_MIN_WIDTH,
  RIGHT_WORKSPACE_PANEL_DEFAULT_WIDTH,
  RIGHT_WORKSPACE_PANEL_MIN_WIDTH,
  shouldHideRightWorkspaceCenter,
} from "./rightWorkspacePanelLayout";

describe("right workspace panel layout", () => {
  it("preserves the center chat when the minimum panel and chat both fit", () => {
    const panelWidth = clampRightWorkspacePanelWidth({
      panelWidth: RIGHT_WORKSPACE_PANEL_DEFAULT_WIDTH,
      sidebarWidth: 20 * 16,
      viewportWidth: 1028,
    });

    expect(panelWidth).toBe(
      1028 - 20 * 16 - RIGHT_WORKSPACE_ACTIVITY_RAIL_WIDTH - RIGHT_WORKSPACE_CENTER_MIN_WIDTH,
    );
    expect(panelWidth).toBeGreaterThanOrEqual(RIGHT_WORKSPACE_PANEL_MIN_WIDTH);
    expect(
      shouldHideRightWorkspaceCenter({
        panelWidth,
        sidebarWidth: 20 * 16,
        viewportWidth: 1028,
      }),
    ).toBe(false);
  });

  it("hides the center only when minimum panel and chat cannot both fit", () => {
    const panelWidth = clampRightWorkspacePanelWidth({
      panelWidth: RIGHT_WORKSPACE_PANEL_DEFAULT_WIDTH,
      sidebarWidth: 20 * 16,
      viewportWidth: 900,
    });

    expect(panelWidth).toBe(RIGHT_WORKSPACE_PANEL_MIN_WIDTH);
    expect(
      shouldHideRightWorkspaceCenter({
        panelWidth,
        sidebarWidth: 20 * 16,
        viewportWidth: 900,
      }),
    ).toBe(true);
  });

  it("uses stored widths on roomy viewports", () => {
    expect(
      clampRightWorkspacePanelWidth({
        panelWidth: 760,
        sidebarWidth: 20 * 16,
        viewportWidth: 1600,
      }),
    ).toBe(760);
  });
});
