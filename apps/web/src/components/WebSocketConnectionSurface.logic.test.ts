import { describe, expect, it } from "vitest";

import { shouldShowRecoveredToast } from "./WebSocketConnectionSurface";

describe("WebSocketConnectionSurface.logic", () => {
  it("suppresses recovered toasts for short reconnect blips", () => {
    expect(
      shouldShowRecoveredToast(
        "2026-04-03T20:00:00.000Z",
        "2026-04-03T20:00:03.000Z",
        0,
        new Date("2026-04-03T20:00:03.000Z").getTime(),
      ),
    ).toBe(false);

    expect(
      shouldShowRecoveredToast(
        "2026-04-03T20:00:00.000Z",
        "2026-04-03T20:00:12.000Z",
        0,
        new Date("2026-04-03T20:00:12.000Z").getTime(),
      ),
    ).toBe(true);
  });

  it("throttles repeated recovered toasts", () => {
    expect(
      shouldShowRecoveredToast(
        "2026-04-03T20:00:00.000Z",
        "2026-04-03T20:00:15.000Z",
        new Date("2026-04-03T20:00:10.000Z").getTime(),
        new Date("2026-04-03T20:00:30.000Z").getTime(),
      ),
    ).toBe(false);
  });
});
