import { describe, expect, it } from "vitest";

import {
  isRecoverableSubscriptionErrorMessage,
  isTransportConnectionErrorMessage,
  sanitizeThreadErrorMessage,
} from "./transportError";

describe("transportError", () => {
  it("detects websocket transport failures", () => {
    expect(isTransportConnectionErrorMessage("SocketCloseError: 1006")).toBe(true);
    expect(isTransportConnectionErrorMessage("Unable to connect to the T3 server WebSocket.")).toBe(
      true,
    );
    expect(isTransportConnectionErrorMessage("SocketOpenError: Timeout")).toBe(true);
    expect(isTransportConnectionErrorMessage("WebSocket heartbeat timed out")).toBe(true);
  });

  it("treats effect stream completion shapes as recoverable subscription failures", () => {
    expect(
      isRecoverableSubscriptionErrorMessage(
        '{"~effect/Cause/Done":{"_tag":"Done","value":"SocketCloseError"}}',
      ),
    ).toBe(true);
    expect(isRecoverableSubscriptionErrorMessage('{"_tag":"Done"}')).toBe(true);
    expect(isRecoverableSubscriptionErrorMessage("All fibers interrupted without error")).toBe(
      true,
    );
  });

  it("preserves non-transport thread errors", () => {
    expect(sanitizeThreadErrorMessage("Turn failed")).toBe("Turn failed");
    expect(sanitizeThreadErrorMessage("Select a base branch before sending.")).toBe(
      "Select a base branch before sending.",
    );
  });

  it("drops transport failures from thread surfaces", () => {
    expect(sanitizeThreadErrorMessage("SocketCloseError: 1006")).toBeNull();
  });
});
