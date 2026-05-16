/**
 * Provider event logger helper.
 *
 * Best-effort writer for observability logs. Each record is formatted as a
 * single effect-style text line in a thread-scoped file. Failures are
 * downgraded to warnings so provider runtime behavior is unaffected.
 */
import fs from "node:fs";
import path from "node:path";

import type { ThreadId } from "@t3tools/contracts";
import { RotatingFileSink } from "@t3tools/shared/logging";
import { Effect, Exit, Logger, Scope, SynchronizedRef } from "effect";

import { toSafeThreadAttachmentSegment } from "../../attachmentStore.ts";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 10;
const DEFAULT_BATCH_WINDOW_MS = 200;
const GLOBAL_THREAD_SEGMENT = "_global";
const LOG_SCOPE = "provider-observability";

export type EventNdjsonStream = "native" | "canonical" | "orchestration";

export interface EventNdjsonLogger {
  readonly filePath: string;
  write: (event: unknown, threadId: ThreadId | null) => Effect.Effect<void>;
  close: () => Effect.Effect<void>;
}

export interface EventNdjsonLoggerOptions {
  readonly stream: EventNdjsonStream;
  readonly maxBytes?: number;
  readonly maxFiles?: number;
  readonly batchWindowMs?: number;
}

interface ThreadWriter {
  writeMessage: (message: string) => Effect.Effect<void>;
  close: () => Effect.Effect<void>;
}

interface LoggerState {
  readonly threadWriters: Map<string, ThreadWriter>;
  readonly failedSegments: Set<string>;
}

type JsonRecord = Record<string, unknown>;

type ChunkLogSample =
  | {
      readonly kind: "contentDelta";
      readonly streamKind: string | undefined;
      readonly charCount: number;
    }
  | {
      readonly kind: "proposedPlanDelta";
      readonly charCount: number;
    }
  | {
      readonly kind: "diffUpdate";
      readonly charCount: number;
    }
  | {
      readonly kind: "dropNative";
    };

interface TurnChunkSummaryState {
  readonly threadSegment: string;
  readonly threadId: string | null;
  readonly turnId: string | null;
  readonly provider: string | undefined;
  readonly providerInstanceId: string | undefined;
  readonly firstEventAt: string | undefined;
  readonly lastEventAt: string | undefined;
  readonly contentDeltaChunks: number;
  readonly contentDeltaChars: number;
  readonly assistantTextChunks: number;
  readonly assistantTextChars: number;
  readonly reasoningTextChunks: number;
  readonly reasoningTextChars: number;
  readonly commandOutputChunks: number;
  readonly commandOutputChars: number;
  readonly proposedPlanDeltaChunks: number;
  readonly proposedPlanDeltaChars: number;
  readonly diffUpdateCount: number;
  readonly diffPayloadChars: number;
}

interface SummaryLogEntry {
  readonly threadSegment: string;
  readonly event: JsonRecord;
}

function logWarning(message: string, context: Record<string, unknown>): Effect.Effect<void> {
  return Effect.logWarning(message, context).pipe(Effect.annotateLogs({ scope: LOG_SCOPE }));
}

function resolveThreadSegment(raw: string | null | undefined): string {
  const normalized = typeof raw === "string" ? toSafeThreadAttachmentSegment(raw) : null;
  return normalized ?? GLOBAL_THREAD_SEGMENT;
}

function formatLoggerMessage(message: unknown): string {
  if (Array.isArray(message)) {
    return message.map((part) => (typeof part === "string" ? part : String(part))).join(" ");
  }
  return typeof message === "string" ? message : String(message);
}

function makeLineLogger(streamLabel: string): Logger.Logger<unknown, string> {
  return Logger.make(
    ({ date, message }) =>
      `[${date.toISOString()}] ${streamLabel}: ${formatLoggerMessage(message)}\n`,
  );
}

function resolveStreamLabel(stream: EventNdjsonStream): string {
  switch (stream) {
    case "native":
      return "NTIVE";
    case "canonical":
    case "orchestration":
    default:
      return "CANON";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRecordField(record: JsonRecord, key: string): JsonRecord | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function providerEventRecord(event: unknown): JsonRecord | undefined {
  if (!isRecord(event)) {
    return undefined;
  }
  return readRecordField(event, "event") ?? event;
}

function readRecordString(record: JsonRecord | undefined, key: string): string | undefined {
  return record ? readString(record[key]) : undefined;
}

function readPayloadRecord(record: JsonRecord | undefined): JsonRecord | undefined {
  return record ? readRecordField(record, "payload") : undefined;
}

function readPayloadText(record: JsonRecord | undefined, key: string): string | undefined {
  return readRecordString(readPayloadRecord(record), key);
}

function isHighVolumeNativeMethod(method: string): boolean {
  const normalized = method.toLowerCase();
  return (
    normalized.includes("delta") ||
    normalized === "turn/diff/updated" ||
    normalized === "message.updated" ||
    normalized === "message.part.updated"
  );
}

function classifyChunkLogEvent(
  stream: EventNdjsonStream,
  event: unknown,
): ChunkLogSample | undefined {
  const record = providerEventRecord(event);
  if (!record) {
    return undefined;
  }

  const type = readRecordString(record, "type");
  const method = readRecordString(record, "method");

  if (stream === "native" && method && isHighVolumeNativeMethod(method)) {
    return { kind: "dropNative" };
  }

  if (stream !== "canonical") {
    return undefined;
  }

  if (type === "content.delta") {
    return {
      kind: "contentDelta",
      streamKind: readPayloadText(record, "streamKind"),
      charCount: readPayloadText(record, "delta")?.length ?? 0,
    };
  }

  if (type === "turn.proposed.delta") {
    return {
      kind: "proposedPlanDelta",
      charCount: readPayloadText(record, "delta")?.length ?? 0,
    };
  }

  if (type === "turn.diff.updated") {
    return {
      kind: "diffUpdate",
      charCount:
        readPayloadText(record, "unifiedDiff")?.length ??
        readPayloadText(record, "diff")?.length ??
        0,
    };
  }

  if (type?.endsWith(".delta")) {
    return {
      kind: "contentDelta",
      streamKind: readPayloadText(record, "streamKind") ?? type,
      charCount: readPayloadText(record, "delta")?.length ?? 0,
    };
  }

  return undefined;
}

function terminalTurnIdForEvent(stream: EventNdjsonStream, event: unknown): string | undefined {
  if (stream !== "canonical") {
    return undefined;
  }

  const record = providerEventRecord(event);
  if (!record) {
    return undefined;
  }

  const type = readRecordString(record, "type");
  if (type !== "turn.completed" && type !== "turn.aborted") {
    return undefined;
  }

  return readRecordString(record, "turnId");
}

function summaryKey(threadSegment: string, turnId: string | null): string {
  return `${threadSegment}:${turnId ?? "_unknown-turn"}`;
}

function initialSummary(
  threadSegment: string,
  record: JsonRecord,
  turnId: string | null,
): TurnChunkSummaryState {
  const createdAt = readRecordString(record, "createdAt");
  return {
    threadSegment,
    threadId: readRecordString(record, "threadId") ?? null,
    turnId,
    provider: readRecordString(record, "provider"),
    providerInstanceId: readRecordString(record, "providerInstanceId"),
    firstEventAt: createdAt,
    lastEventAt: createdAt,
    contentDeltaChunks: 0,
    contentDeltaChars: 0,
    assistantTextChunks: 0,
    assistantTextChars: 0,
    reasoningTextChunks: 0,
    reasoningTextChars: 0,
    commandOutputChunks: 0,
    commandOutputChars: 0,
    proposedPlanDeltaChunks: 0,
    proposedPlanDeltaChars: 0,
    diffUpdateCount: 0,
    diffPayloadChars: 0,
  };
}

function updateChunkSummary(
  summary: TurnChunkSummaryState,
  sample: ChunkLogSample,
  record: JsonRecord,
): TurnChunkSummaryState {
  const lastEventAt = readRecordString(record, "createdAt") ?? summary.lastEventAt;
  if (sample.kind === "proposedPlanDelta") {
    return {
      ...summary,
      lastEventAt,
      proposedPlanDeltaChunks: summary.proposedPlanDeltaChunks + 1,
      proposedPlanDeltaChars: summary.proposedPlanDeltaChars + sample.charCount,
    };
  }

  if (sample.kind === "diffUpdate") {
    return {
      ...summary,
      lastEventAt,
      diffUpdateCount: summary.diffUpdateCount + 1,
      diffPayloadChars: summary.diffPayloadChars + sample.charCount,
    };
  }

  if (sample.kind !== "contentDelta") {
    return summary;
  }

  const base = {
    ...summary,
    lastEventAt,
    contentDeltaChunks: summary.contentDeltaChunks + 1,
    contentDeltaChars: summary.contentDeltaChars + sample.charCount,
  };

  switch (sample.streamKind) {
    case "assistant_text":
      return {
        ...base,
        assistantTextChunks: summary.assistantTextChunks + 1,
        assistantTextChars: summary.assistantTextChars + sample.charCount,
      };
    case "reasoning_text":
      return {
        ...base,
        reasoningTextChunks: summary.reasoningTextChunks + 1,
        reasoningTextChars: summary.reasoningTextChars + sample.charCount,
      };
    case "command_output":
      return {
        ...base,
        commandOutputChunks: summary.commandOutputChunks + 1,
        commandOutputChars: summary.commandOutputChars + sample.charCount,
      };
    default:
      return base;
  }
}

function numberFields(fields: ReadonlyArray<readonly [string, number]>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of fields) {
    if (value > 0) {
      result[key] = value;
    }
  }
  return result;
}

function toSummaryLogEntry(summary: TurnChunkSummaryState): SummaryLogEntry {
  return {
    threadSegment: summary.threadSegment,
    event: {
      type: "turn.chunk-summary",
      ...(summary.threadId ? { threadId: summary.threadId } : {}),
      ...(summary.turnId ? { turnId: summary.turnId } : {}),
      ...(summary.provider ? { provider: summary.provider } : {}),
      ...(summary.providerInstanceId ? { providerInstanceId: summary.providerInstanceId } : {}),
      ...(summary.firstEventAt ? { firstEventAt: summary.firstEventAt } : {}),
      ...(summary.lastEventAt ? { lastEventAt: summary.lastEventAt } : {}),
      payload: numberFields([
        ["contentDeltaChunks", summary.contentDeltaChunks],
        ["contentDeltaChars", summary.contentDeltaChars],
        ["assistantTextChunks", summary.assistantTextChunks],
        ["assistantTextChars", summary.assistantTextChars],
        ["reasoningTextChunks", summary.reasoningTextChunks],
        ["reasoningTextChars", summary.reasoningTextChars],
        ["commandOutputChunks", summary.commandOutputChunks],
        ["commandOutputChars", summary.commandOutputChars],
        ["proposedPlanDeltaChunks", summary.proposedPlanDeltaChunks],
        ["proposedPlanDeltaChars", summary.proposedPlanDeltaChars],
        ["diffUpdateCount", summary.diffUpdateCount],
        ["diffPayloadChars", summary.diffPayloadChars],
      ]),
    },
  };
}

const toLogMessage = Effect.fn("toLogMessage")(function* (
  event: unknown,
): Effect.fn.Return<string | undefined> {
  const serialized = yield* Effect.sync(() => {
    try {
      return { ok: true as const, value: JSON.stringify(event) };
    } catch (error) {
      return { ok: false as const, error };
    }
  });

  if (!serialized.ok) {
    yield* logWarning("failed to serialize provider event log record", {
      error: serialized.error,
    });
    return undefined;
  }

  if (typeof serialized.value !== "string") {
    return undefined;
  }

  return serialized.value;
});

const makeThreadWriter = Effect.fn("makeThreadWriter")(function* (input: {
  readonly filePath: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
  readonly batchWindowMs: number;
  readonly streamLabel: string;
}): Effect.fn.Return<ThreadWriter | undefined> {
  const sinkResult = yield* Effect.sync(() => {
    try {
      return {
        ok: true as const,
        sink: new RotatingFileSink({
          filePath: input.filePath,
          maxBytes: input.maxBytes,
          maxFiles: input.maxFiles,
          throwOnError: true,
        }),
      };
    } catch (error) {
      return { ok: false as const, error };
    }
  });

  if (!sinkResult.ok) {
    yield* logWarning("failed to initialize provider thread log file", {
      filePath: input.filePath,
      error: sinkResult.error,
    });
    return undefined;
  }

  const sink = sinkResult.sink;
  const scope = yield* Scope.make();
  const lineLogger = makeLineLogger(input.streamLabel);
  const batchedLogger = yield* Logger.batched(lineLogger, {
    window: input.batchWindowMs,
    flush: Effect.fn("makeThreadWriter.flush")(function* (messages) {
      const flushResult = yield* Effect.sync(() => {
        try {
          for (const message of messages) {
            sink.write(message);
          }
          return { ok: true as const };
        } catch (error) {
          return { ok: false as const, error };
        }
      });

      if (!flushResult.ok) {
        yield* logWarning("provider event log batch flush failed", {
          filePath: input.filePath,
          error: flushResult.error,
        });
      }
    }),
  }).pipe(Effect.provideService(Scope.Scope, scope));

  const loggerLayer = Logger.layer([batchedLogger], { mergeWithExisting: false });

  return {
    writeMessage(message: string) {
      return Effect.log(message).pipe(Effect.provide(loggerLayer));
    },
    close() {
      return Scope.close(scope, Exit.void);
    },
  } satisfies ThreadWriter;
});

export const makeEventNdjsonLogger = Effect.fn("makeEventNdjsonLogger")(function* (
  filePath: string,
  options: EventNdjsonLoggerOptions,
): Effect.fn.Return<EventNdjsonLogger | undefined> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const batchWindowMs = options.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS;
  const streamLabel = resolveStreamLabel(options.stream);

  const directoryReady = yield* Effect.sync(() => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      return true;
    } catch (error) {
      return { ok: false as const, error };
    }
  });
  if (directoryReady !== true) {
    yield* logWarning("failed to create provider event log directory", {
      filePath,
      error: directoryReady.error,
    });
    return undefined;
  }

  const stateRef = yield* SynchronizedRef.make<LoggerState>({
    threadWriters: new Map(),
    failedSegments: new Set(),
  });
  const summaryRef = yield* SynchronizedRef.make<Map<string, TurnChunkSummaryState>>(new Map());

  const resolveThreadWriter = Effect.fn("resolveThreadWriter")(function* (
    threadSegment: string,
  ): Effect.fn.Return<ThreadWriter | undefined> {
    return yield* SynchronizedRef.modifyEffect(stateRef, (state) => {
      if (state.failedSegments.has(threadSegment)) {
        return Effect.succeed([undefined, state] as const);
      }

      const existing = state.threadWriters.get(threadSegment);
      if (existing) {
        return Effect.succeed([existing, state] as const);
      }

      return makeThreadWriter({
        filePath: path.join(path.dirname(filePath), `${threadSegment}.log`),
        maxBytes,
        maxFiles,
        batchWindowMs,
        streamLabel,
      }).pipe(
        Effect.map((writer) => {
          if (!writer) {
            const nextFailedSegments = new Set(state.failedSegments);
            nextFailedSegments.add(threadSegment);
            return [
              undefined,
              {
                ...state,
                failedSegments: nextFailedSegments,
              },
            ] as const;
          }

          const nextThreadWriters = new Map(state.threadWriters);
          nextThreadWriters.set(threadSegment, writer);
          return [
            writer,
            {
              ...state,
              threadWriters: nextThreadWriters,
            },
          ] as const;
        }),
      );
    });
  });

  const writeEventToSegment = Effect.fn("writeEventToSegment")(function* (
    threadSegment: string,
    event: unknown,
  ) {
    const message = yield* toLogMessage(event);
    if (!message) {
      return;
    }

    const writer = yield* resolveThreadWriter(threadSegment);
    if (!writer) {
      return;
    }

    yield* writer.writeMessage(message);
  });

  const recordChunkSummary = Effect.fn("recordChunkSummary")(function* (
    threadSegment: string,
    event: unknown,
    sample: ChunkLogSample,
  ) {
    if (sample.kind === "dropNative") {
      return;
    }

    const record = providerEventRecord(event);
    if (!record) {
      return;
    }

    const turnId = readRecordString(record, "turnId") ?? null;
    const key = summaryKey(threadSegment, turnId);
    yield* SynchronizedRef.update(summaryRef, (summaries) => {
      const next = new Map(summaries);
      const previous = next.get(key) ?? initialSummary(threadSegment, record, turnId);
      next.set(key, updateChunkSummary(previous, sample, record));
      return next;
    });
  });

  const drainTurnSummaries = Effect.fn("drainTurnSummaries")(function* (
    threadSegment: string,
    turnId: string | undefined,
  ): Effect.fn.Return<ReadonlyArray<SummaryLogEntry>> {
    return yield* SynchronizedRef.modifyEffect(summaryRef, (summaries) =>
      Effect.sync(() => {
        const next = new Map(summaries);
        const drained: SummaryLogEntry[] = [];
        for (const [key, summary] of summaries) {
          if (summary.threadSegment !== threadSegment) {
            continue;
          }
          if (turnId !== undefined && summary.turnId !== turnId) {
            continue;
          }
          drained.push(toSummaryLogEntry(summary));
          next.delete(key);
        }
        return [drained, next] as const;
      }),
    );
  });

  const drainAllSummaries = Effect.fn("drainAllSummaries")(function* (): Effect.fn.Return<
    ReadonlyArray<SummaryLogEntry>
  > {
    return yield* SynchronizedRef.modifyEffect(summaryRef, (summaries) =>
      Effect.sync(() => {
        const drained = [...summaries.values()].map(toSummaryLogEntry);
        return [drained, new Map<string, TurnChunkSummaryState>()] as const;
      }),
    );
  });

  const write = Effect.fn("write")(function* (event: unknown, threadId: ThreadId | null) {
    const threadSegment = resolveThreadSegment(threadId);
    const chunkSample = classifyChunkLogEvent(options.stream, event);
    if (chunkSample) {
      yield* recordChunkSummary(threadSegment, event, chunkSample);
      return;
    }

    const turnId = terminalTurnIdForEvent(options.stream, event);
    if (turnId !== undefined) {
      const summaries = yield* drainTurnSummaries(threadSegment, turnId);
      for (const summary of summaries) {
        yield* writeEventToSegment(summary.threadSegment, summary.event);
      }
    }

    yield* writeEventToSegment(threadSegment, event);
  });

  const close = Effect.fn("close")(function* () {
    const pendingSummaries = yield* drainAllSummaries();
    for (const summary of pendingSummaries) {
      yield* writeEventToSegment(summary.threadSegment, summary.event);
    }

    yield* SynchronizedRef.modifyEffect(stateRef, (state) =>
      Effect.gen(function* () {
        for (const writer of state.threadWriters.values()) {
          yield* writer.close();
        }

        return [
          undefined,
          {
            threadWriters: new Map<string, ThreadWriter>(),
            failedSegments: new Set<string>(),
          },
        ] as const;
      }),
    );
  });

  return {
    filePath,
    write,
    close,
  } satisfies EventNdjsonLogger;
});
