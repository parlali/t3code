import { Buffer } from "node:buffer";

const ESC_PATTERN = "\\u001b";
const BEL_PATTERN = "\\u0007";
const OSC_11_SEQUENCE_PATTERN = new RegExp(
  `${ESC_PATTERN}\\]11;(?:[^${BEL_PATTERN}${ESC_PATTERN}]|${ESC_PATTERN}(?!\\\\))*?(?:${BEL_PATTERN}|${ESC_PATTERN}\\\\)`,
  "g",
);
const CURSOR_POSITION_REPORT_PATTERN = new RegExp(`${ESC_PATTERN}\\[[0-9;]*R`, "g");
export const DEFAULT_TERMINAL_HISTORY_PRUNE_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const DEFAULT_TERMINAL_HISTORY_PRUNE_TARGET_BYTES = 3 * 1024 * 1024;
export const DEFAULT_TERMINAL_HISTORY_CHUNK_TARGET_BYTES = 16 * 1024;

export interface TerminalHistoryBuffer {
  chunks: string[];
  byteEstimate: number;
  tailChunkByteEstimate: number;
}

export interface AppendTerminalHistoryChunkOptions {
  lineLimit: number;
  pruneThresholdBytes?: number;
  pruneTargetBytes?: number;
  chunkTargetBytes?: number;
}

export interface AppendTerminalHistoryChunkResult {
  materialized: boolean;
}

export interface MaterializeTerminalHistoryOptions {
  maxBytes?: number;
}

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

export function trimTerminalHistoryBytes(history: string, maxBytes: number): string {
  if (maxBytes <= 0 || history.length === 0) {
    return "";
  }

  const bytes = Buffer.from(history);
  if (bytes.byteLength <= maxBytes) {
    return history;
  }

  let start = bytes.byteLength - maxBytes;
  while (start < bytes.byteLength) {
    const byte = bytes[start];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) {
      break;
    }
    start += 1;
  }

  return bytes.subarray(start).toString("utf8");
}

export function appendTerminalHistory(
  currentHistory: string,
  data: string,
  lineLimit: number,
): string {
  return normalizeTerminalHistory(`${currentHistory}${data}`, lineLimit);
}

export function createTerminalHistoryBuffer(initialHistory = ""): TerminalHistoryBuffer {
  const byteEstimate = Buffer.byteLength(initialHistory);
  return {
    chunks: initialHistory.length > 0 ? [initialHistory] : [],
    byteEstimate,
    tailChunkByteEstimate: byteEstimate,
  };
}

export function clearTerminalHistoryBuffer(buffer: TerminalHistoryBuffer): void {
  buffer.chunks = [];
  buffer.byteEstimate = 0;
  buffer.tailChunkByteEstimate = 0;
}

function replaceTerminalHistoryBuffer(
  buffer: TerminalHistoryBuffer,
  materializedHistory: string,
): void {
  const byteEstimate = Buffer.byteLength(materializedHistory);
  buffer.chunks = materializedHistory.length > 0 ? [materializedHistory] : [];
  buffer.byteEstimate = byteEstimate;
  buffer.tailChunkByteEstimate = byteEstimate;
}

export function materializeTerminalHistory(
  buffer: TerminalHistoryBuffer,
  lineLimit: number,
  options: MaterializeTerminalHistoryOptions = {},
): string {
  let history = normalizeTerminalHistory(buffer.chunks.join(""), lineLimit);
  if (options.maxBytes !== undefined) {
    history = trimTerminalHistoryBytes(history, options.maxBytes);
  }
  replaceTerminalHistoryBuffer(buffer, history);
  return history;
}

export function appendTerminalHistoryChunk(
  buffer: TerminalHistoryBuffer,
  data: string,
  options: AppendTerminalHistoryChunkOptions,
): AppendTerminalHistoryChunkResult {
  if (data.length === 0) {
    return { materialized: false };
  }

  const dataBytes = Buffer.byteLength(data);
  const chunkTargetBytes = options.chunkTargetBytes ?? DEFAULT_TERMINAL_HISTORY_CHUNK_TARGET_BYTES;
  const lastChunkIndex = buffer.chunks.length - 1;
  const tailChunk = buffer.chunks[lastChunkIndex];
  if (tailChunk !== undefined && buffer.tailChunkByteEstimate + dataBytes <= chunkTargetBytes) {
    buffer.chunks[lastChunkIndex] = `${tailChunk}${data}`;
    buffer.tailChunkByteEstimate += dataBytes;
  } else {
    buffer.chunks.push(data);
    buffer.tailChunkByteEstimate = dataBytes;
  }

  buffer.byteEstimate += dataBytes;

  const pruneThresholdBytes =
    options.pruneThresholdBytes ?? DEFAULT_TERMINAL_HISTORY_PRUNE_THRESHOLD_BYTES;
  if (buffer.byteEstimate <= pruneThresholdBytes) {
    return { materialized: false };
  }

  materializeTerminalHistory(buffer, options.lineLimit, {
    maxBytes: options.pruneTargetBytes ?? DEFAULT_TERMINAL_HISTORY_PRUNE_TARGET_BYTES,
  });
  return { materialized: true };
}
