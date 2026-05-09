import { WsRpcGroup } from "@t3tools/contracts";
import { Duration, Effect, Layer, Schedule } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

import { recordClientPerfEvent } from "../observability/perfDiagnostics";
import {
  acknowledgeRpcRequest,
  clearAllTrackedRpcRequests,
  trackRpcRequestSent,
} from "./requestLatencyState";
import {
  getWsReconnectDelayMsForRetry,
  recordWsConnectionAttempt,
  recordWsConnectionClosed,
  recordWsConnectionErrored,
  recordWsConnectionOpened,
  type WsConnectionMetadata,
  WS_RECONNECT_MAX_RETRIES,
} from "./wsConnectionState";

const WS_HEARTBEAT_INTERVAL = Duration.seconds(10);
const WS_HEARTBEAT_MISSED_PONG_LIMIT = 4;

interface ClientRpcTiming {
  readonly tag: string;
  readonly stream: boolean;
  readonly startedAtMs: number;
  firstAckAtMs: number | null;
}

export interface WsProtocolCloseContext {
  readonly intentional: boolean;
}

export interface WsProtocolLifecycleHandlers {
  readonly getConnectionLabel?: () => string | null;
  readonly getVersionMismatchHint?: () => string | null;
  readonly trackConnectionStatus?: boolean;
  readonly isCloseIntentional?: () => boolean;
  readonly isActive?: () => boolean;
  readonly onAttempt?: (socketUrl: string) => void;
  readonly onOpen?: () => void;
  readonly onHeartbeatPing?: () => void;
  readonly onHeartbeatPong?: () => void;
  readonly onHeartbeatTimeout?: () => void;
  readonly onRequestStart?: (info: {
    readonly id: string;
    readonly tag: string;
    readonly stream: boolean;
  }) => void;
  readonly onRequestChunk?: (info: {
    readonly id: string;
    readonly tag: string;
    readonly chunkCount: number;
  }) => void;
  readonly onRequestExit?: (info: {
    readonly id: string;
    readonly tag: string;
    readonly stream: boolean;
  }) => void;
  readonly onRequestInterrupt?: (info: { readonly id: string; readonly tag?: string }) => void;
  readonly onError?: (message: string) => void;
  readonly onClose?: (
    details: { readonly code: number; readonly reason: string },
    context: WsProtocolCloseContext,
  ) => void;
}

export const makeWsRpcProtocolClient = RpcClient.make(WsRpcGroup);
type RpcClientFactory = typeof makeWsRpcProtocolClient;
export type WsRpcProtocolClient =
  RpcClientFactory extends Effect.Effect<infer Client, any, any> ? Client : never;
export type WsRpcProtocolSocketUrlProvider = string | (() => Promise<string>);

function formatSocketErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

function resolveWsRpcSocketUrl(rawUrl: string): string {
  const resolved = new URL(rawUrl);
  if (resolved.protocol !== "ws:" && resolved.protocol !== "wss:") {
    throw new Error(`Unsupported websocket transport URL protocol: ${resolved.protocol}`);
  }

  resolved.pathname = "/ws";
  return resolved.toString();
}

function resolveConnectionMetadata(handlers?: WsProtocolLifecycleHandlers): WsConnectionMetadata {
  return {
    connectionLabel: handlers?.getConnectionLabel?.() ?? null,
    versionMismatchHint: handlers?.getVersionMismatchHint?.() ?? null,
  };
}

function shouldTrackConnectionStatus(handlers?: WsProtocolLifecycleHandlers): boolean {
  return handlers?.trackConnectionStatus !== false;
}

type ComposedWsProtocolLifecycleHandlers = Required<
  Pick<WsProtocolLifecycleHandlers, "isActive" | "onAttempt" | "onOpen" | "onError" | "onClose">
>;

function defaultLifecycleHandlers(
  handlers?: WsProtocolLifecycleHandlers,
): ComposedWsProtocolLifecycleHandlers {
  return {
    isActive: () => true,
    onAttempt: (socketUrl) => {
      if (!shouldTrackConnectionStatus(handlers)) {
        return;
      }
      recordWsConnectionAttempt(socketUrl, resolveConnectionMetadata(handlers));
    },
    onOpen: () => {
      if (!shouldTrackConnectionStatus(handlers)) {
        return;
      }
      recordWsConnectionOpened(resolveConnectionMetadata(handlers));
    },
    onError: (message) => {
      clearAllTrackedRpcRequests();
      if (!shouldTrackConnectionStatus(handlers)) {
        return;
      }
      recordWsConnectionErrored(message, resolveConnectionMetadata(handlers));
    },
    onClose: (details, context) => {
      clearAllTrackedRpcRequests();
      if (context.intentional || !shouldTrackConnectionStatus(handlers)) {
        return;
      }
      recordWsConnectionClosed(details, resolveConnectionMetadata(handlers));
    },
  };
}

function composeLifecycleHandlers(
  handlers?: WsProtocolLifecycleHandlers,
): ComposedWsProtocolLifecycleHandlers {
  const defaults = defaultLifecycleHandlers(handlers);
  const isActive = handlers?.isActive ?? defaults.isActive;

  return {
    isActive,
    onAttempt: (socketUrl) => {
      if (!isActive()) {
        return;
      }
      defaults.onAttempt(socketUrl);
      handlers?.onAttempt?.(socketUrl);
    },
    onOpen: () => {
      if (!isActive()) {
        return;
      }
      defaults.onOpen();
      handlers?.onOpen?.();
    },
    onError: (message) => {
      if (!isActive()) {
        return;
      }
      defaults.onError(message);
      handlers?.onError?.(message);
    },
    onClose: (details, context) => {
      if (!isActive()) {
        return;
      }
      defaults.onClose(details, context);
      handlers?.onClose?.(details, context);
    },
  };
}

export function createWsRpcProtocolLayer(
  url: WsRpcProtocolSocketUrlProvider,
  handlers?: WsProtocolLifecycleHandlers,
) {
  const lifecycle = composeLifecycleHandlers(handlers);
  const clientRpcTimings = new Map<string, ClientRpcTiming>();
  let websocketAttemptStartedAtMs = 0;
  const resolvedUrl =
    typeof url === "function"
      ? Effect.promise(() => url()).pipe(
          Effect.map((rawUrl) => resolveWsRpcSocketUrl(rawUrl)),
          Effect.tapError((error) =>
            Effect.sync(() => {
              lifecycle.onError(formatSocketErrorMessage(error));
            }),
          ),
          Effect.orDie,
        )
      : resolveWsRpcSocketUrl(url);

  const trackingWebSocketConstructorLayer = Layer.succeed(
    Socket.WebSocketConstructor,
    (socketUrl, protocols) => {
      websocketAttemptStartedAtMs = performance.now();
      recordClientPerfEvent("ws.connect.start", {
        url: socketUrl,
      });
      lifecycle.onAttempt(socketUrl);
      const socket = new globalThis.WebSocket(socketUrl, protocols);

      socket.addEventListener(
        "open",
        () => {
          recordClientPerfEvent("ws.connect.open", {
            durationMs: Math.round(performance.now() - websocketAttemptStartedAtMs),
          });
          lifecycle.onOpen();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          recordClientPerfEvent("ws.connect.error", {
            durationMs: Math.round(performance.now() - websocketAttemptStartedAtMs),
          });
          lifecycle.onError("Unable to connect to the T3 server WebSocket.");
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        (event) => {
          recordClientPerfEvent("ws.connect.close", {
            durationMs: Math.round(performance.now() - websocketAttemptStartedAtMs),
            code: event.code,
            reason: event.reason,
          });
          lifecycle.onClose(
            {
              code: event.code,
              reason: event.reason,
            },
            {
              intentional: handlers?.isCloseIntentional?.() ?? false,
            },
          );
        },
        { once: true },
      );

      return socket;
    },
  );
  const socketLayer = Socket.layerWebSocket(resolvedUrl).pipe(
    Layer.provide(trackingWebSocketConstructorLayer),
  );
  const retryPolicy = Schedule.addDelay(Schedule.recurs(WS_RECONNECT_MAX_RETRIES), (retryCount) =>
    Effect.succeed(Duration.millis(getWsReconnectDelayMsForRetry(retryCount) ?? 0)),
  );
  const protocolLayer = Layer.effect(
    RpcClient.Protocol,
    Effect.map(
      RpcClient.makeProtocolSocket({
        retryPolicy,
        retryTransientErrors: true,
        pingInterval: WS_HEARTBEAT_INTERVAL,
        missedPongLimit: WS_HEARTBEAT_MISSED_PONG_LIMIT,
      }),
      (protocol) => ({
        ...protocol,
        run: (clientId, writeResponse) =>
          protocol.run(clientId, (response) => {
            if (response._tag === "ClientProtocolError" || response._tag === "Defect") {
              clearAllTrackedRpcRequests();
            }
            return writeResponse(response);
          }),
      }),
    ),
  );
  const requestHooksLayer = Layer.succeed(
    RpcClient.RequestHooks,
    RpcClient.RequestHooks.of({
      onRequestStart: (info) =>
        Effect.sync(() => {
          if (!lifecycle.isActive()) {
            return;
          }
          const requestId = String(info.id);
          const startedAtMs = performance.now();
          clientRpcTimings.set(requestId, {
            tag: info.tag,
            stream: info.stream,
            startedAtMs,
            firstAckAtMs: null,
          });
          recordClientPerfEvent("rpc.request.start", {
            requestId,
            tag: info.tag,
            stream: info.stream,
          });
          handlers?.onRequestStart?.({
            id: requestId,
            tag: info.tag,
            stream: info.stream,
          });
          trackRpcRequestSent(requestId, info.tag);
        }),
      onRequestChunk: (info) =>
        Effect.sync(() => {
          if (!lifecycle.isActive()) {
            return;
          }
          const requestId = String(info.id);
          const timing = clientRpcTimings.get(requestId);
          if (timing && timing.firstAckAtMs === null) {
            timing.firstAckAtMs = performance.now();
            recordClientPerfEvent("rpc.request.first_ack", {
              requestId,
              tag: timing.tag,
              stream: timing.stream,
              durationMs: Math.round(timing.firstAckAtMs - timing.startedAtMs),
              chunkCount: info.chunkCount,
            });
          }
          handlers?.onRequestChunk?.({
            id: requestId,
            tag: info.tag,
            chunkCount: info.chunkCount,
          });
          acknowledgeRpcRequest(requestId);
        }),
      onRequestExit: (info) =>
        Effect.sync(() => {
          if (!lifecycle.isActive()) {
            return;
          }
          const requestId = String(info.id);
          const timing = clientRpcTimings.get(requestId);
          if (timing) {
            const finishedAtMs = performance.now();
            recordClientPerfEvent("rpc.request.finish", {
              requestId,
              tag: timing.tag,
              stream: timing.stream,
              durationMs: Math.round(finishedAtMs - timing.startedAtMs),
              firstAckMs:
                timing.firstAckAtMs === null
                  ? null
                  : Math.round(timing.firstAckAtMs - timing.startedAtMs),
            });
            clientRpcTimings.delete(requestId);
          }
          handlers?.onRequestExit?.({
            id: requestId,
            tag: info.tag,
            stream: info.stream,
          });
          acknowledgeRpcRequest(requestId);
        }),
      onRequestInterrupt: (info) =>
        Effect.sync(() => {
          if (!lifecycle.isActive()) {
            return;
          }
          const requestId = String(info.id);
          const timing = clientRpcTimings.get(requestId);
          recordClientPerfEvent("rpc.request.interrupt", {
            requestId,
            tag: info.tag ?? timing?.tag ?? null,
            durationMs: timing ? Math.round(performance.now() - timing.startedAtMs) : null,
          });
          clientRpcTimings.delete(requestId);
          handlers?.onRequestInterrupt?.({
            id: requestId,
            ...(info.tag === undefined ? {} : { tag: info.tag }),
          });
          acknowledgeRpcRequest(requestId);
        }),
    }),
  );
  const connectionHooksLayer = Layer.succeed(
    RpcClient.ConnectionHooks,
    RpcClient.ConnectionHooks.of({
      onConnect: Effect.void,
      onDisconnect: Effect.void,
      onPing: Effect.sync(() => {
        if (lifecycle.isActive()) {
          handlers?.onHeartbeatPing?.();
        }
      }),
      onPong: Effect.sync(() => {
        if (lifecycle.isActive()) {
          handlers?.onHeartbeatPong?.();
        }
      }),
      onPingTimeout: Effect.sync(() => {
        if (lifecycle.isActive()) {
          clearAllTrackedRpcRequests();
          if (shouldTrackConnectionStatus(handlers)) {
            recordWsConnectionErrored(
              "WebSocket heartbeat timed out.",
              resolveConnectionMetadata(handlers),
            );
          }
          handlers?.onHeartbeatTimeout?.();
        }
      }),
    }),
  );

  return Layer.mergeAll(
    protocolLayer.pipe(
      Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson, connectionHooksLayer)),
    ),
    requestHooksLayer,
    connectionHooksLayer,
  );
}
