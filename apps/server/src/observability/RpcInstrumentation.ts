import { Cause, Duration, Effect, Exit, Metric, Stream } from "effect";

import { outcomeFromExit } from "./Attributes.ts";
import { metricAttributes, rpcRequestDuration, rpcRequestsTotal, withMetrics } from "./Metrics.ts";

const LARGE_RPC_PAYLOAD_WARNING_BYTES = 256 * 1024;
const payloadSizeEncoder = new TextEncoder();

const annotateRpcSpan = (
  method: string,
  traceAttributes?: Readonly<Record<string, unknown>>,
): Effect.Effect<void, never, never> =>
  Effect.annotateCurrentSpan({
    "rpc.method": method,
    ...traceAttributes,
  });

const recordRpcStreamMetrics = <E>(
  method: string,
  startedAt: number,
  exit: Exit.Exit<unknown, E>,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Metric.update(
      Metric.withAttributes(rpcRequestDuration, metricAttributes({ method })),
      Duration.millis(Math.max(0, Date.now() - startedAt)),
    );
    yield* Metric.update(
      Metric.withAttributes(
        rpcRequestsTotal,
        metricAttributes({
          method,
          outcome: outcomeFromExit(exit),
        }),
      ),
      1,
    );
  });

const estimateJsonPayloadBytes = (payload: unknown): number | null => {
  try {
    const serialized = JSON.stringify(payload);
    return serialized === undefined ? 0 : payloadSizeEncoder.encode(serialized).byteLength;
  } catch {
    return null;
  }
};

const payloadKind = (payload: unknown): string | undefined => {
  if (payload === null || typeof payload !== "object" || !("kind" in payload)) {
    return undefined;
  }
  const kind = (payload as { readonly kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
};

const logLargePayload = (
  method: string,
  payload: unknown,
  channel: "response" | "stream",
  traceAttributes?: Readonly<Record<string, unknown>>,
): Effect.Effect<void, never, never> =>
  Effect.sync(() => estimateJsonPayloadBytes(payload)).pipe(
    Effect.flatMap((payloadBytes) => {
      if (payloadBytes === null || payloadBytes < LARGE_RPC_PAYLOAD_WARNING_BYTES) {
        return Effect.void;
      }

      return Effect.logWarning("ws.rpc.large_payload", {
        method,
        channel,
        payloadBytes,
        payloadKind: payloadKind(payload),
        ...traceAttributes,
      });
    }),
  );

const observeRpcStreamPayloads = <A, E, R>(
  method: string,
  stream: Stream.Stream<A, E, R>,
  traceAttributes?: Readonly<Record<string, unknown>>,
): Stream.Stream<A, E, R> =>
  stream.pipe(
    Stream.mapEffect((payload) =>
      logLargePayload(method, payload, "stream", traceAttributes).pipe(Effect.as(payload)),
    ),
  );

export const observeRpcEffect = <A, E, R>(
  method: string,
  effect: Effect.Effect<A, E, R>,
  traceAttributes?: Readonly<Record<string, unknown>>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    yield* annotateRpcSpan(method, traceAttributes);
    const startedAt = Date.now();
    yield* Effect.logInfo("ws.rpc.start", {
      method,
      ...traceAttributes,
    });

    const exit = yield* Effect.exit(
      effect.pipe(
        withMetrics({
          counter: rpcRequestsTotal,
          timer: rpcRequestDuration,
          attributes: {
            method,
          },
        }),
      ),
    );

    const durationMs = Date.now() - startedAt;
    if (Exit.isSuccess(exit)) {
      yield* logLargePayload(method, exit.value, "response", traceAttributes);
      yield* Effect.logInfo("ws.rpc.finish", {
        method,
        durationMs,
        outcome: "success",
        ...traceAttributes,
      });
      return exit.value;
    }

    yield* Effect.logWarning("ws.rpc.finish", {
      method,
      durationMs,
      outcome: "failure",
      error: Cause.pretty(exit.cause),
      ...traceAttributes,
    });
    return yield* Effect.failCause(exit.cause);
  });

export const observeRpcStream = <A, E, R>(
  method: string,
  stream: Stream.Stream<A, E, R>,
  traceAttributes?: Readonly<Record<string, unknown>>,
): Stream.Stream<A, E, R> =>
  Stream.unwrap(
    Effect.gen(function* () {
      yield* annotateRpcSpan(method, traceAttributes);
      const startedAt = Date.now();
      return observeRpcStreamPayloads(method, stream, traceAttributes).pipe(
        Stream.onExit((exit) => recordRpcStreamMetrics(method, startedAt, exit)),
      );
    }),
  );

export const observeRpcStreamEffect = <A, StreamError, StreamContext, EffectError, EffectContext>(
  method: string,
  effect: Effect.Effect<Stream.Stream<A, StreamError, StreamContext>, EffectError, EffectContext>,
  traceAttributes?: Readonly<Record<string, unknown>>,
): Stream.Stream<A, StreamError | EffectError, StreamContext | EffectContext> =>
  Stream.unwrap(
    Effect.gen(function* () {
      yield* annotateRpcSpan(method, traceAttributes);
      const startedAt = Date.now();
      const exit = yield* Effect.exit(effect);

      if (Exit.isFailure(exit)) {
        yield* recordRpcStreamMetrics(method, startedAt, exit);
        return yield* Effect.failCause(exit.cause);
      }

      return observeRpcStreamPayloads(method, exit.value, traceAttributes).pipe(
        Stream.onExit((streamExit) => recordRpcStreamMetrics(method, startedAt, streamExit)),
      );
    }),
  );
