import { describe, expect, it } from "vitest";

import { SETTINGS_NAV_ITEMS } from "./SettingsSidebarNav";

describe("SettingsSidebarNav", () => {
  it("includes the integrations settings route", () => {
    expect(SETTINGS_NAV_ITEMS.some((item) => item.to === "/settings/integrations")).toBe(true);
  });
});
