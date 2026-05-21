import { describe, expect, it } from "vitest";

import { shouldMarkThreadAttentionSeen } from "./threadAttentionSeenPolicy";

describe("shouldMarkThreadAttentionSeen", () => {
  it("marks attention seen when the user opens a thread after the attention was received", () => {
    expect(
      shouldMarkThreadAttentionSeen({
        attentionAt: "2026-05-09T10:00:00.000Z",
        lastFocusGainedAt: "2026-05-09T10:01:00.000Z",
        receivedSequence: 1,
        seenGateSequence: 2,
        hasFocus: true,
        isHeld: false,
        visibilityState: "visible",
      }),
    ).toBe(true);
  });

  it("marks attention seen when completion arrives while the user is viewing the thread", () => {
    expect(
      shouldMarkThreadAttentionSeen({
        attentionAt: "2026-05-09T10:02:00.000Z",
        lastFocusGainedAt: "2026-05-09T10:01:00.000Z",
        receivedSequence: 2,
        seenGateSequence: 1,
        hasFocus: true,
        isHeld: false,
        visibilityState: "visible",
      }),
    ).toBe(true);
  });

  it("does not clear when focus returned after completion but before the event arrived", () => {
    expect(
      shouldMarkThreadAttentionSeen({
        attentionAt: "2026-05-09T10:02:00.000Z",
        lastFocusGainedAt: "2026-05-09T10:03:00.000Z",
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
      attentionAt: "2026-05-09T10:00:00.000Z",
      lastFocusGainedAt: "2026-05-09T10:01:00.000Z",
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
