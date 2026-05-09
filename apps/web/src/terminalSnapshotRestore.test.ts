import { describe, expect, it } from "vitest";
import { DEFAULT_TERMINAL_ID, type TerminalSessionSnapshot } from "@t3tools/contracts";
import { restoreTerminalSnapshot } from "./terminalSnapshotRestore";

function snapshot(overrides: Partial<TerminalSessionSnapshot> = {}): TerminalSessionSnapshot {
  return {
    threadId: "thread-1",
    terminalId: DEFAULT_TERMINAL_ID,
    cwd: "/tmp/project",
    worktreePath: null,
    status: "running",
    pid: 1234,
    history: "transcript\n",
    sequence: 1,
    exitCode: null,
    exitSignal: null,
    updatedAt: "2026-05-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("restoreTerminalSnapshot", () => {
  it("restores serialized screen state before falling back to transcript history", () => {
    const writes: string[] = [];
    restoreTerminalSnapshot(
      { write: (data) => writes.push(data) },
      snapshot({
        screen: {
          format: "xterm-serialize",
          data: "\x1b[Hscreen",
          cols: 80,
          rows: 24,
        },
      }),
    );

    expect(writes).toEqual(["\u001bc", "\x1b[Hscreen"]);
  });

  it("falls back to transcript history for legacy snapshots", () => {
    const writes: string[] = [];
    restoreTerminalSnapshot({ write: (data) => writes.push(data) }, snapshot());

    expect(writes).toEqual(["\u001bc", "transcript\n"]);
  });
});
