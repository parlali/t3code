export function shouldMarkThreadAttentionSeen(input: {
  readonly attentionAt: string;
  readonly lastFocusGainedAt: string | null;
  readonly receivedSequence: number;
  readonly seenGateSequence: number;
  readonly hasFocus: boolean;
  readonly isHeld: boolean;
  readonly visibilityState: DocumentVisibilityState;
}): boolean {
  if (input.isHeld) return false;
  if (input.visibilityState !== "visible") return false;
  if (!input.hasFocus) return false;

  if (input.lastFocusGainedAt !== null && input.attentionAt >= input.lastFocusGainedAt) {
    return true;
  }

  if (!Number.isFinite(input.receivedSequence)) return false;
  if (!Number.isFinite(input.seenGateSequence)) return false;
  return input.receivedSequence <= input.seenGateSequence;
}
