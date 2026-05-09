import type { TerminalSessionSnapshot } from "@t3tools/contracts";

export interface TerminalSnapshotWriter {
  write(data: string): void;
}

export function restoreTerminalSnapshot(
  terminal: TerminalSnapshotWriter,
  snapshot: TerminalSessionSnapshot,
): void {
  terminal.write("\u001bc");
  const screen = snapshot.screen;
  if (screen?.format === "xterm-serialize") {
    terminal.write(screen.data);
    return;
  }
  if (snapshot.history.length > 0) {
    terminal.write(snapshot.history);
  }
}
