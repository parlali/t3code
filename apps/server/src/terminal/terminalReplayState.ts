import { SerializeAddon } from "@xterm/addon-serialize";
import headlessXterm from "@xterm/headless";
import type { TerminalScreenSnapshot } from "@t3tools/contracts";

const { Terminal: HeadlessTerminal } = headlessXterm;

export interface TerminalReplayState {
  readonly terminal: InstanceType<typeof HeadlessTerminal>;
  readonly serializer: SerializeAddon;
}

export function createTerminalReplayState(
  cols: number,
  rows: number,
  scrollback: number,
): TerminalReplayState {
  const terminal = new HeadlessTerminal({
    cols,
    rows,
    scrollback,
    logLevel: "off",
    allowProposedApi: true,
  });
  const serializer = new SerializeAddon();
  terminal.loadAddon(serializer as never);
  return { terminal, serializer };
}

export function serializeTerminalReplayState(
  replay: TerminalReplayState,
  scrollback: number,
): TerminalScreenSnapshot {
  return {
    format: "xterm-serialize",
    data: replay.serializer.serialize({ scrollback }),
    cols: replay.terminal.cols,
    rows: replay.terminal.rows,
  };
}

export function writeTerminalReplayState(replay: TerminalReplayState, data: string): void {
  if (data.length === 0) {
    return;
  }
  const terminal = replay.terminal as typeof replay.terminal & {
    writeSync?: (data: string) => void;
  };
  if (terminal.writeSync) {
    terminal.writeSync(data);
    return;
  }

  const core = (terminal as unknown as Record<string, unknown>)["_core"];
  if (typeof core === "object" && core !== null) {
    const writeSync = (core as { readonly writeSync?: unknown }).writeSync;
    if (typeof writeSync === "function") {
      (writeSync as (data: string) => void).call(core, data);
      return;
    }
  }

  replay.terminal.write(data);
}

export function resizeTerminalReplayState(
  replay: TerminalReplayState,
  cols: number,
  rows: number,
): void {
  replay.terminal.resize(cols, rows);
}

export function resetTerminalReplayState(replay: TerminalReplayState): void {
  replay.terminal.reset();
}

export function disposeTerminalReplayState(replay: TerminalReplayState): void {
  replay.serializer.dispose();
  replay.terminal.dispose();
}
