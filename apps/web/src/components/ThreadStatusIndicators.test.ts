import { describe, expect, it } from "vitest";

import { terminalStatusFromOpenState } from "./ThreadStatusIndicators";

describe("terminalStatusFromOpenState", () => {
  it("shows the terminal indicator only when the terminal drawer is open", () => {
    expect(terminalStatusFromOpenState(false)).toBeNull();
    expect(terminalStatusFromOpenState(true)?.label).toBe("Terminal open");
  });
});
