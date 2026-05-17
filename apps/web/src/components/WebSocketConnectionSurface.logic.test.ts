import { describe, expect, it } from "vitest";

import type { WsConnectionStatus } from "../rpc/wsConnectionState";
import {
  shouldRestartStalledReconnect,
  shouldShowRecoveredToast,
} from "./WebSocketConnectionSurface";

function makeStatus(overrides: Partial<WsConnectionStatus> = {}): WsConnectionStatus {
  return {
    attemptCount: 0,
    closeCode: null,
    closeReason: null,
    connectionLabel: null,
    connectedAt: null,
    disconnectedAt: null,
    hasConnected: false,
    lastError: null,
    lastErrorAt: null,
    nextRetryAt: null,
    online: true,
    phase: "idle",
    reconnectAttemptCount: 0,
    reconnectMaxAttempts: 8,
    reconnectPhase: "idle",
    socketUrl: null,
    ...overrides,
  };
}

describe("WebSocketConnectionSurface.logic", () => {
  it("restarts a stalled reconnect window after the scheduled retry time passes", () => {
    expect(
      shouldRestartStalledReconnect(
        makeStatus({
          hasConnected: true,
          nextRetryAt: "2026-04-03T20:00:01.000Z",
          online: true,
          phase: "disconnected",
          reconnectAttemptCount: 3,
          reconnectPhase: "waiting",
        }),
        "2026-04-03T20:00:01.000Z",
      ),
    ).toBe(true);

    expect(
      shouldRestartStalledReconnect(
        makeStatus({
          hasConnected: true,
          nextRetryAt: "2026-04-03T20:00:01.000Z",
          online: true,
          phase: "disconnected",
          reconnectAttemptCount: 3,
          reconnectPhase: "attempting",
        }),
        "2026-04-03T20:00:01.000Z",
      ),
    ).toBe(false);
  });

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
