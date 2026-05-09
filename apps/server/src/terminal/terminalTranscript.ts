const ESC_PATTERN = "\\u001b";
const BEL_PATTERN = "\\u0007";
const OSC_11_SEQUENCE_PATTERN = new RegExp(
  `${ESC_PATTERN}\\]11;(?:[^${BEL_PATTERN}${ESC_PATTERN}]|${ESC_PATTERN}(?!\\\\))*?(?:${BEL_PATTERN}|${ESC_PATTERN}\\\\)`,
  "g",
);
const CURSOR_POSITION_REPORT_PATTERN = new RegExp(`${ESC_PATTERN}\\[[0-9;]*R`, "g");

export function stripReplayUnsafeTerminalHistory(history: string): string {
  return history.replace(OSC_11_SEQUENCE_PATTERN, "").replace(CURSOR_POSITION_REPORT_PATTERN, "");
}

export function trimTerminalHistoryLines(history: string, lineLimit: number): string {
  if (lineLimit <= 0 || history.length === 0) {
    return "";
  }

  const hasTrailingNewline = history.endsWith("\n");
  const lines = history.split("\n");
  if (hasTrailingNewline) {
    lines.pop();
  }

  if (lines.length <= lineLimit) {
    return history;
  }

  return `${lines.slice(-lineLimit).join("\n")}${hasTrailingNewline ? "\n" : ""}`;
}

export function normalizeTerminalHistory(history: string, lineLimit: number): string {
  return trimTerminalHistoryLines(stripReplayUnsafeTerminalHistory(history), lineLimit);
}

export function appendTerminalHistory(
  currentHistory: string,
  data: string,
  lineLimit: number,
): string {
  return normalizeTerminalHistory(`${currentHistory}${data}`, lineLimit);
}
