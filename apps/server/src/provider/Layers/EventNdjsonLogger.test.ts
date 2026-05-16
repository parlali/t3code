import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { makeEventNdjsonLogger } from "./EventNdjsonLogger.ts";

function parseLogLine(line: string) {
  const match = /^\[([^\]]+)\] ([A-Z]+): (.+)$/.exec(line);
  assert.notEqual(match, null);
  if (!match) {
    throw new Error(`invalid log line: ${line}`);
  }
  const observedAt = match[1];
  const stream = match[2];
  const payload = match[3];
  if (!observedAt || !stream || payload === undefined) {
    throw new Error(`invalid log line: ${line}`);
  }
  return {
    observedAt,
    stream,
    payload,
  };
}

function readParsedLogLines(filePath: string) {
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => parseLogLine(line));
}

describe("EventNdjsonLogger", () => {
  it.effect("writes effect-style lines to thread-scoped files", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-provider-log-"));
      const basePath = path.join(tempDir, "provider-native.ndjson");

      try {
        const logger = yield* makeEventNdjsonLogger(basePath, { stream: "native" });
        assert.notEqual(logger, undefined);
        if (!logger) {
          return;
        }

        yield* logger.write(
          { threadId: "provider-thread-1", id: "evt-1" },
          ThreadId.make("thread-1"),
        );
        yield* logger.write(
          { type: "turn.completed", threadId: "provider-thread-2", id: "evt-2" },
          ThreadId.make("thread-2"),
        );
        yield* logger.close();

        const threadOnePath = path.join(tempDir, "thread-1.log");
        const threadTwoPath = path.join(tempDir, "thread-2.log");
        assert.equal(fs.existsSync(threadOnePath), true);
        assert.equal(fs.existsSync(threadTwoPath), true);

        const first = parseLogLine(fs.readFileSync(threadOnePath, "utf8").trim());
        const second = parseLogLine(fs.readFileSync(threadTwoPath, "utf8").trim());

        assert.equal(Number.isNaN(Date.parse(first.observedAt)), false);
        assert.equal(first.stream, "NTIVE");
        assert.equal(first.payload, '{"threadId":"provider-thread-1","id":"evt-1"}');

        assert.equal(Number.isNaN(Date.parse(second.observedAt)), false);
        assert.equal(second.stream, "NTIVE");
        assert.equal(
          second.payload,
          '{"type":"turn.completed","threadId":"provider-thread-2","id":"evt-2"}',
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "falls back to a global segment when orchestration thread id is missing or invalid",
    () =>
      Effect.gen(function* () {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-provider-log-"));
        const basePath = path.join(tempDir, "provider-canonical.ndjson");

        try {
          const logger = yield* makeEventNdjsonLogger(basePath, { stream: "orchestration" });
          assert.notEqual(logger, undefined);
          if (!logger) {
            return;
          }

          yield* logger.write({ id: "evt-no-thread" }, null);
          yield* logger.write({ id: "evt-invalid-thread" }, "!!!" as unknown as ThreadId);
          yield* logger.close();

          const globalPath = path.join(tempDir, "_global.log");
          assert.equal(fs.existsSync(globalPath), true);
          const lines = fs
            .readFileSync(globalPath, "utf8")
            .trim()
            .split("\n")
            .map((line) => parseLogLine(line));
          assert.equal(lines.length, 2);
          assert.equal(Number.isNaN(Date.parse(lines[0]?.observedAt ?? "")), false);
          assert.equal(Number.isNaN(Date.parse(lines[1]?.observedAt ?? "")), false);
          assert.equal(lines[0]?.stream, "CANON");
          assert.equal(lines[0]?.payload, '{"id":"evt-no-thread"}');
          assert.equal(lines[1]?.stream, "CANON");
          assert.equal(lines[1]?.payload, '{"id":"evt-invalid-thread"}');
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }),
  );

  it.effect("serializes concurrent first writes for the same segment", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-provider-log-"));
      const basePath = path.join(tempDir, "provider-canonical.ndjson");

      try {
        const logger = yield* makeEventNdjsonLogger(basePath, {
          stream: "canonical",
          batchWindowMs: 0,
        });
        assert.notEqual(logger, undefined);
        if (!logger) {
          return;
        }

        yield* Effect.all(
          [
            logger.write({ id: "evt-concurrent-1" }, null),
            logger.write({ id: "evt-concurrent-2" }, null),
          ],
          { concurrency: "unbounded" },
        );
        yield* logger.close();

        const globalPath = path.join(tempDir, "_global.log");
        assert.equal(fs.existsSync(globalPath), true);
        const lines = fs
          .readFileSync(globalPath, "utf8")
          .trim()
          .split("\n")
          .map((line) => parseLogLine(line));

        assert.equal(lines.length, 2);
        assert.deepEqual(lines.map((line) => line.payload).toSorted(), [
          '{"id":"evt-concurrent-1"}',
          '{"id":"evt-concurrent-2"}',
        ]);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("summarizes canonical chunk events instead of logging every chunk payload", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-provider-log-"));
      const basePath = path.join(tempDir, "provider-canonical.ndjson");

      try {
        const logger = yield* makeEventNdjsonLogger(basePath, {
          stream: "canonical",
          batchWindowMs: 0,
        });
        assert.notEqual(logger, undefined);
        if (!logger) {
          return;
        }

        const threadId = ThreadId.make("thread-chunks");
        const createdAt = "2026-05-16T12:00:00.000Z";
        yield* logger.write(
          {
            type: "content.delta",
            provider: "codex",
            createdAt,
            threadId,
            turnId: "turn-chunks",
            payload: { streamKind: "assistant_text", delta: "hello" },
          },
          threadId,
        );
        yield* logger.write(
          {
            type: "content.delta",
            provider: "codex",
            createdAt,
            threadId,
            turnId: "turn-chunks",
            payload: { streamKind: "assistant_text", delta: " world" },
          },
          threadId,
        );
        yield* logger.write(
          {
            type: "turn.proposed.delta",
            provider: "codex",
            createdAt,
            threadId,
            turnId: "turn-chunks",
            payload: { delta: "plan" },
          },
          threadId,
        );
        yield* logger.write(
          {
            type: "turn.diff.updated",
            provider: "codex",
            createdAt,
            threadId,
            turnId: "turn-chunks",
            payload: { unifiedDiff: "difftext" },
          },
          threadId,
        );
        yield* logger.write(
          {
            type: "turn.completed",
            provider: "codex",
            createdAt,
            threadId,
            turnId: "turn-chunks",
            payload: { state: "completed" },
          },
          threadId,
        );
        yield* logger.close();

        const lines = readParsedLogLines(path.join(tempDir, "thread-chunks.log"));
        assert.equal(lines.length, 2);
        const summary = JSON.parse(lines[0]?.payload ?? "{}") as {
          readonly type?: string;
          readonly payload?: Record<string, unknown>;
        };
        const completed = JSON.parse(lines[1]?.payload ?? "{}") as { readonly type?: string };

        assert.equal(summary.type, "turn.chunk-summary");
        assert.equal(summary.payload?.contentDeltaChunks, 2);
        assert.equal(summary.payload?.contentDeltaChars, 11);
        assert.equal(summary.payload?.assistantTextChunks, 2);
        assert.equal(summary.payload?.assistantTextChars, 11);
        assert.equal(summary.payload?.proposedPlanDeltaChunks, 1);
        assert.equal(summary.payload?.proposedPlanDeltaChars, 4);
        assert.equal(summary.payload?.diffUpdateCount, 1);
        assert.equal(summary.payload?.diffPayloadChars, 8);
        assert.equal(lines[0]?.payload.includes("hello"), false);
        assert.equal(lines[0]?.payload.includes("difftext"), false);
        assert.equal(completed.type, "turn.completed");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("drops high-volume native chunk updates while keeping lifecycle events", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-provider-log-"));
      const basePath = path.join(tempDir, "provider-native.ndjson");

      try {
        const logger = yield* makeEventNdjsonLogger(basePath, {
          stream: "native",
          batchWindowMs: 0,
        });
        assert.notEqual(logger, undefined);
        if (!logger) {
          return;
        }

        const threadId = ThreadId.make("thread-native-chunks");
        const createdAt = "2026-05-16T12:00:00.000Z";
        yield* logger.write(
          {
            id: "evt-native-delta",
            kind: "notification",
            provider: "codex",
            createdAt,
            threadId,
            method: "item/agentMessage/delta",
            textDelta: "drop me",
            payload: { delta: "drop me" },
          },
          threadId,
        );
        yield* logger.write(
          {
            observedAt: createdAt,
            event: {
              id: "evt-native-update",
              kind: "notification",
              provider: "opencode",
              createdAt,
              threadId,
              method: "message.part.updated",
              payload: { text: "drop me too" },
            },
          },
          threadId,
        );
        yield* logger.write(
          {
            id: "evt-native-completed",
            kind: "notification",
            provider: "codex",
            createdAt,
            threadId,
            method: "turn/completed",
          },
          threadId,
        );
        yield* logger.close();

        const lines = readParsedLogLines(path.join(tempDir, "thread-native-chunks.log"));
        assert.equal(lines.length, 1);
        assert.equal(lines[0]?.payload.includes("turn/completed"), true);
        assert.equal(lines[0]?.payload.includes("drop me"), false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rotates per-thread files when max size is exceeded", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-provider-log-"));
      const basePath = path.join(tempDir, "provider-native.ndjson");

      try {
        const logger = yield* makeEventNdjsonLogger(basePath, {
          stream: "native",
          maxBytes: 120,
          maxFiles: 2,
        });
        assert.notEqual(logger, undefined);
        if (!logger) {
          return;
        }

        for (let index = 0; index < 10; index += 1) {
          yield* logger.write(
            {
              threadId: "provider-thread-rotate",
              id: `evt-${index}`,
              payload: "x".repeat(40),
            },
            ThreadId.make("thread-rotate"),
          );
        }
        yield* logger.close();

        const fileStem = "thread-rotate.log";
        const matchingFiles = fs
          .readdirSync(tempDir)
          .filter((entry) => entry === fileStem || entry.startsWith(`${fileStem}.`))
          .toSorted();

        assert.equal(
          matchingFiles.some((entry) => entry === `${fileStem}.1`),
          true,
        );
        assert.equal(
          matchingFiles.some((entry) => entry === fileStem || entry === `${fileStem}.2`),
          true,
        );
        assert.equal(
          matchingFiles.some((entry) => entry === `${fileStem}.3`),
          false,
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );
});
