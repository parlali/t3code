export type ThreadAttentionLogEntry = {
  readonly at: string;
  readonly source: string;
  readonly action: string;
  readonly threadId?: string | undefined;
  readonly threadKey?: string | undefined;
  readonly environmentId?: string | undefined;
  readonly revision?: number | undefined;
  readonly receivedSequence?: number | undefined;
  readonly attentionAt?: string | undefined;
  readonly updatedAt?: string | undefined;
  readonly snapshotUpdatedAt?: string | undefined;
  readonly seenGateSequence?: number | undefined;
  readonly lastFocusGainedAt?: string | undefined;
  readonly hasFocus?: boolean | undefined;
  readonly isHeld?: boolean | undefined;
  readonly visibilityState?: string | undefined;
  readonly shouldMarkSeen?: boolean | undefined;
  readonly sessionStatus?: string | undefined;
  readonly resolvedPill?: string | null | undefined;
  readonly detail?: string | undefined;
};

const MAX_LOG_ENTRIES = 300;
const entries: ThreadAttentionLogEntry[] = [];

export function logThreadAttention(
  entry: Omit<ThreadAttentionLogEntry, "at"> & { readonly at?: string | undefined },
): void {
  entries.push({
    at: entry.at ?? new Date().toISOString(),
    source: entry.source,
    action: entry.action,
    threadId: entry.threadId,
    threadKey: entry.threadKey,
    environmentId: entry.environmentId,
    revision: entry.revision,
    receivedSequence: entry.receivedSequence,
    attentionAt: entry.attentionAt,
    updatedAt: entry.updatedAt,
    snapshotUpdatedAt: entry.snapshotUpdatedAt,
    seenGateSequence: entry.seenGateSequence,
    lastFocusGainedAt: entry.lastFocusGainedAt,
    hasFocus: entry.hasFocus,
    isHeld: entry.isHeld,
    visibilityState: entry.visibilityState,
    shouldMarkSeen: entry.shouldMarkSeen,
    sessionStatus: entry.sessionStatus,
    resolvedPill: entry.resolvedPill,
    detail: entry.detail,
  });
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.splice(0, entries.length - MAX_LOG_ENTRIES);
  }
}

export function readThreadAttentionLog(): readonly ThreadAttentionLogEntry[] {
  return entries;
}

export function clearThreadAttentionLog(): void {
  entries.length = 0;
}

declare global {
  interface Window {
    __t3ThreadAttentionLog?: {
      readonly read: () => readonly ThreadAttentionLogEntry[];
      readonly clear: () => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.__t3ThreadAttentionLog = {
    read: readThreadAttentionLog,
    clear: clearThreadAttentionLog,
  };
}
