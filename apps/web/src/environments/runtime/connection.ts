import type {
  EnvironmentId,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
  ServerConfig,
  ServerLifecycleWelcomePayload,
  TerminalEvent,
  TerminalRuntimeStatusSnapshot,
  ThreadStatusStreamEvent,
} from "@t3tools/contracts";
import type { KnownEnvironment } from "@t3tools/client-runtime";

import type { WsRpcClient } from "~/rpc/wsRpcClient";

export interface EnvironmentConnection {
  readonly kind: "primary" | "saved";
  readonly environmentId: EnvironmentId;
  readonly knownEnvironment: KnownEnvironment;
  readonly client: WsRpcClient;
  readonly ensureBootstrapped: () => Promise<void>;
  readonly isConnectionOpen: () => boolean;
  readonly reconnect: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

interface OrchestrationHandlers {
  readonly applyShellEvent: (
    event: OrchestrationShellStreamEvent,
    environmentId: EnvironmentId,
  ) => void;
  readonly syncShellSnapshot: (
    snapshot: OrchestrationShellSnapshot,
    environmentId: EnvironmentId,
  ) => void;
  readonly applyTerminalEvent: (event: TerminalEvent, environmentId: EnvironmentId) => void;
  readonly syncTerminalStatusSnapshot?: (
    snapshot: TerminalRuntimeStatusSnapshot,
    environmentId: EnvironmentId,
  ) => void;
  readonly applyThreadStatusEvent?: (
    event: ThreadStatusStreamEvent,
    environmentId: EnvironmentId,
  ) => void;
}

interface EnvironmentConnectionInput extends OrchestrationHandlers {
  readonly kind: "primary" | "saved";
  readonly knownEnvironment: KnownEnvironment;
  readonly client: WsRpcClient;
  readonly refreshMetadata?: () => Promise<void>;
  readonly onConfigSnapshot?: (config: ServerConfig) => void;
  readonly onWelcome?: (payload: ServerLifecycleWelcomePayload) => void;
}

const RECONNECT_BOOTSTRAP_TIMEOUT_MS = 30_000;

function createBootstrapGate() {
  type Waiter = {
    readonly afterGeneration: number;
    readonly reject: (error: unknown) => void;
    readonly resolve: () => void;
  };

  let generation = 0;
  const waiters = new Set<Waiter>();

  const resolveReadyWaiters = () => {
    for (const waiter of waiters) {
      if (generation <= waiter.afterGeneration) {
        continue;
      }
      waiters.delete(waiter);
      waiter.resolve();
    }
  };

  const rejectWaiters = (error: unknown) => {
    for (const waiter of waiters) {
      waiters.delete(waiter);
      waiter.reject(error);
    }
  };

  const waitForSnapshotAfter = (afterGeneration: number, timeoutMs?: number) => {
    if (generation > afterGeneration) {
      return Promise.resolve();
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let activeWaiter!: Waiter;
    const promise = new Promise<void>((resolve, reject) => {
      activeWaiter = {
        afterGeneration,
        resolve: () => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          resolve();
        },
        reject: (error) => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          reject(error);
        },
      };
      waiters.add(activeWaiter);
    });

    if (timeoutMs !== undefined) {
      timeoutId = setTimeout(() => {
        waiters.delete(activeWaiter);
        activeWaiter.reject(
          new Error("Timed out waiting for a fresh shell snapshot after reconnect."),
        );
      }, timeoutMs);
    }

    return promise;
  };

  return {
    currentGeneration: () => generation,
    markSnapshotReceived: () => {
      generation += 1;
      resolveReadyWaiters();
    },
    wait: () => waitForSnapshotAfter(0),
    waitForSnapshotAfter,
    reject: (error: unknown) => {
      rejectWaiters(error);
    },
  };
}

export function createEnvironmentConnection(
  input: EnvironmentConnectionInput,
): EnvironmentConnection {
  const environmentId = input.knownEnvironment.environmentId;

  if (!environmentId) {
    throw new Error(
      `Known environment ${input.knownEnvironment.label} is missing its environmentId.`,
    );
  }

  let disposed = false;
  let reconnectInFlight: Promise<void> | null = null;
  const bootstrapGate = createBootstrapGate();
  const shouldObserveLifecycle = input.kind === "saved" || input.onWelcome !== undefined;
  const shouldObserveConfig = input.kind === "saved" || input.onConfigSnapshot !== undefined;

  const observeEnvironmentIdentity = (nextEnvironmentId: EnvironmentId, source: string) => {
    if (environmentId !== nextEnvironmentId) {
      throw new Error(
        `Environment connection ${environmentId} changed identity to ${nextEnvironmentId} via ${source}.`,
      );
    }
  };

  const unsubLifecycle = shouldObserveLifecycle
    ? input.client.server.subscribeLifecycle(
        (event: Parameters<Parameters<WsRpcClient["server"]["subscribeLifecycle"]>[0]>[0]) => {
          if (event.type !== "welcome") {
            return;
          }
          observeEnvironmentIdentity(
            event.payload.environment.environmentId,
            "server lifecycle welcome",
          );
          input.onWelcome?.(event.payload);
        },
      )
    : () => undefined;

  const unsubConfig = shouldObserveConfig
    ? input.client.server.subscribeConfig(
        (event: Parameters<Parameters<WsRpcClient["server"]["subscribeConfig"]>[0]>[0]) => {
          if (event.type !== "snapshot") {
            return;
          }
          observeEnvironmentIdentity(
            event.config.environment.environmentId,
            "server config snapshot",
          );
          input.onConfigSnapshot?.(event.config);
        },
      )
    : () => undefined;

  const unsubShell = input.client.orchestration.subscribeShell(
    (item: Parameters<Parameters<WsRpcClient["orchestration"]["subscribeShell"]>[0]>[0]) => {
      if (item.kind === "snapshot") {
        input.syncShellSnapshot(item.snapshot, environmentId);
        bootstrapGate.markSnapshotReceived();
        return;
      }
      input.applyShellEvent(item, environmentId);
    },
  );

  const unsubTerminalEvent = input.client.terminal.onEvent(
    (event: Parameters<Parameters<WsRpcClient["terminal"]["onEvent"]>[0]>[0]) => {
      input.applyTerminalEvent(event, environmentId);
    },
  );

  const refreshTerminalStatusSnapshot = async () => {
    try {
      const snapshot = await input.client.terminal.getStatusSnapshot({});
      if (!disposed) {
        input.syncTerminalStatusSnapshot?.(snapshot, environmentId);
      }
    } catch (error: unknown) {
      console.warn("Failed to load terminal status snapshot", error);
    }
  };

  void refreshTerminalStatusSnapshot();

  const unsubThreadStatus = input.client.threadStatus.subscribe(
    (event: Parameters<Parameters<WsRpcClient["threadStatus"]["subscribe"]>[0]>[0]) => {
      input.applyThreadStatusEvent?.(event, environmentId);
    },
  );

  const cleanup = () => {
    disposed = true;
    unsubShell();
    unsubTerminalEvent();
    unsubThreadStatus();
    unsubLifecycle();
    unsubConfig();
  };

  return {
    kind: input.kind,
    environmentId,
    knownEnvironment: input.knownEnvironment,
    client: input.client,
    ensureBootstrapped: () => bootstrapGate.wait(),
    isConnectionOpen: () => input.client.isConnectionOpen(),
    reconnect: async () => {
      reconnectInFlight ??= (async () => {
        const generation = bootstrapGate.currentGeneration();
        try {
          await input.client.reconnect();
          await Promise.all([input.refreshMetadata?.(), refreshTerminalStatusSnapshot()]);
          await bootstrapGate.waitForSnapshotAfter(generation, RECONNECT_BOOTSTRAP_TIMEOUT_MS);
        } catch (error) {
          bootstrapGate.reject(error);
          throw error;
        }
      })().finally(() => {
        reconnectInFlight = null;
      });
      return await reconnectInFlight;
    },
    dispose: async () => {
      cleanup();
      bootstrapGate.reject(new Error(`Environment connection ${environmentId} was disposed.`));
      await input.client.dispose();
    },
  };
}
