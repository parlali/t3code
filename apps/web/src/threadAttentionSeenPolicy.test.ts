import { describe, expect, it } from "vitest";

import { shouldMarkThreadAttentionSeen } from "./threadAttentionSeenPolicy";

describe("shouldMarkThreadAttentionSeen", () => {
  it("marks attention seen when the user opens a thread after the attention was received", () => {
    expect(
      shouldMarkThreadAttentionSeen({
        receivedSequence: 1,
        seenGateSequence: 2,
        hasFocus: true,
        isHeld: false,
        visibilityState: "visible",
      }),
    ).toBe(true);
  });

  it("does not clear a completion received after the user was already viewing the thread", () => {
    expect(
      shouldMarkThreadAttentionSeen({
        receivedSequence: 2,
        seenGateSequence: 1,
        hasFocus: true,
        isHeld: false,
        visibilityState: "visible",
      }),
    ).toBe(false);
  });

  it("does not clear when focus returned after completion but before the event arrived", () => {
    expect(
      shouldMarkThreadAttentionSeen({
        receivedSequence: 3,
        seenGateSequence: 2,
        hasFocus: true,
        isHeld: false,
        visibilityState: "visible",
      }),
    ).toBe(false);
  });

  it("does not mark seen while hidden, unfocused, or manually held unread", () => {
    const base = {
      receivedSequence: 1,
      seenGateSequence: 2,
    };

    expect(
      shouldMarkThreadAttentionSeen({
        ...base,
        hasFocus: true,
        isHeld: false,
        visibilityState: "hidden",
      }),
    ).toBe(false);
    expect(
      shouldMarkThreadAttentionSeen({
        ...base,
        hasFocus: false,
        isHeld: false,
        visibilityState: "visible",
      }),
    ).toBe(false);
    expect(
      shouldMarkThreadAttentionSeen({
        ...base,
        hasFocus: true,
        isHeld: true,
        visibilityState: "visible",
      }),
    ).toBe(false);
  });
});
