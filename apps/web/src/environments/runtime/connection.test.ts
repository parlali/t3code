import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import { createEnvironmentConnection } from "./connection";
import type { WsRpcClient } from "~/rpc/wsRpcClient";

function createTestClient(options?: { readonly reconnectTriggersShellResubscribe?: boolean }) {
  const lifecycleListeners = new Set<(event: any) => void>();
  const configListeners = new Set<(event: any) => void>();
  const terminalListeners = new Set<(event: any) => void>();
  const shellListeners = new Set<(event: any) => void>();
  let shellResubscribe: (() => void) | undefined;

  const client = {
    dispose: vi.fn(async () => undefined),
    isConnectionOpen: vi.fn(() => true),
    reconnect: vi.fn(async () => {
      if (options?.reconnectTriggersShellResubscribe !== false) {
        shellResubscribe?.();
      }
    }),
    server: {
      getConfig: vi.fn(async () => ({
        environment: {
          environmentId: EnvironmentId.make("env-1"),
        },
      })),
      subscribeConfig: vi.fn((listener: (event: any) => void) => {
        configListeners.add(listener);
        return () => configListeners.delete(listener);
      }),
      subscribeLifecycle: vi.fn((listener: (event: any) => void) => {
        lifecycleListeners.add(listener);
        return () => lifecycleListeners.delete(listener);
      }),
      subscribeAuthAccess: () => () => undefined,
      refreshProviders: vi.fn(async () => undefined),
      updateProvider: vi.fn(async () => undefined),
      upsertKeybinding: vi.fn(async () => undefined),
      getSettings: vi.fn(async () => undefined),
      updateSettings: vi.fn(async () => undefined),
    },
    orchestration: {
      dispatchCommand: vi.fn(async () => undefined),
      getTurnDiff: vi.fn(async () => undefined),
      getFullThreadDiff: vi.fn(async () => undefined),
      getCheckpointFileRestoreAvailability: vi.fn(async () => undefined),
      subscribeShell: vi.fn(
        (listener: (event: any) => void, options?: { onResubscribe?: () => void }) => {
          shellListeners.add(listener);
          shellResubscribe = options?.onResubscribe;
          queueMicrotask(() => {
            listener({
              kind: "snapshot",
              snapshot: {
                snapshotSequence: 1,
                projects: [],
                threads: [],
                updatedAt: "2026-04-12T00:00:00.000Z",
              },
            });
          });
          return () => {
            shellListeners.delete(listener);
            if (shellResubscribe === options?.onResubscribe) {
              shellResubscribe = undefined;
            }
          };
        },
      ),
      subscribeThread: vi.fn(() => () => undefined),
    },
    terminal: {
      open: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      getStatusSnapshot: vi.fn(async () => ({ sessions: [], updatedAt: new Date().toISOString() })),
      onEvent: (listener: (event: any) => void) => {
        terminalListeners.add(listener);
        return () => terminalListeners.delete(listener);
      },
      onSessionEvent: (_input: unknown, listener: (event: any) => void) => {
        terminalListeners.add(listener);
        return () => terminalListeners.delete(listener);
      },
    },
    threadStatus: {
      getSnapshot: vi.fn(async () => ({ states: [], updatedAt: new Date().toISOString() })),
      markRead: vi.fn(async (input) => ({
        type: "state-cleared" as const,
        threadId: input.threadId,
        updatedAt: input.observedAt ?? new Date().toISOString(),
        revision: 1,
      })),
      markUnread: vi.fn(async (input) => ({
        type: "state-cleared" as const,
        threadId: input.threadId,
        updatedAt: input.observedAt ?? new Date().toISOString(),
        revision: 1,
      })),
      markViewed: vi.fn(async (input) => ({
        type: "state-cleared" as const,
        threadId: input.threadId,
        updatedAt: input.observedAt ?? new Date().toISOString(),
        revision: 1,
      })),
      setTerminalOpen: vi.fn(async (input) => ({
        type: "state-updated" as const,
        state: {
          threadId: input.threadId,
          primaryStatus: null,
          pendingApproval: false,
          awaitingInput: false,
          working: false,
          completed: false,
          connecting: false,
          planReady: false,
          terminal: input.terminal,
          latestTurnId: null,
          completedAt: null,
          readAt: null,
          manuallyMarkedUnreadAt: null,
          updatedAt: input.observedAt ?? new Date().toISOString(),
          revision: 1,
        },
      })),
      subscribe: vi.fn(() => () => undefined),
    },
    workspaceRightPanel: {
      getState: vi.fn(async () => ({
        projectId: "project-1",
        workspaceRoot: "/tmp/project",
        panelOpen: true,
        activeMode: "files",
        files: null,
        changes: null,
        nestedSidebarOpen: {
          files: true,
          changes: true,
        },
        updatedAt: new Date().toISOString(),
      })),
      setState: vi.fn(async (input: any) => ({
        projectId: input.projectId,
        workspaceRoot: input.workspaceRoot,
        panelOpen: input.patch.panelOpen ?? true,
        activeMode: input.patch.activeMode ?? "files",
        files: input.patch.files ?? null,
        changes: input.patch.changes ?? null,
        nestedSidebarOpen: {
          files: input.patch.nestedSidebarOpen?.files ?? true,
          changes: input.patch.nestedSidebarOpen?.changes ?? true,
        },
        updatedAt: new Date().toISOString(),
      })),
    },
    projects: {
      searchEntries: vi.fn(async () => []),
      writeFile: vi.fn(async () => undefined),
    },
    shell: {
      openInEditor: vi.fn(async () => undefined),
    },
    git: {
      runStackedAction: vi.fn(async () => ({}) as any),
      resolvePullRequest: vi.fn(async () => undefined),
      preparePullRequestThread: vi.fn(async () => undefined),
    },
  } as unknown as WsRpcClient;

  return {
    client,
    emitWelcome: (environmentId: EnvironmentId) => {
      for (const listener of lifecycleListeners) {
        listener({
          type: "welcome",
          payload: {
            environment: {
              environmentId,
            },
          },
        });
      }
    },
    emitConfigSnapshot: (environmentId: EnvironmentId) => {
      for (const listener of configListeners) {
        listener({
          type: "snapshot",
          config: {
            environment: {
              environmentId,
            },
          },
        });
      }
    },
    emitShellSnapshot: (snapshotSequence: number) => {
      for (const listener of shellListeners) {
        listener({
          kind: "snapshot",
          snapshot: {
            snapshotSequence,
            projects: [],
            threads: [],
            updatedAt: "2026-04-12T00:00:00.000Z",
          },
        });
      }
    },
    emitShellResubscribe: () => {
      shellResubscribe?.();
    },
  };
}

describe("createEnvironmentConnection", () => {
  it("bootstraps from the shell subscription snapshot", async () => {
    const environmentId = EnvironmentId.make("env-1");
    const { client } = createTestClient();
    const syncShellSnapshot = vi.fn();

    const connection = createEnvironmentConnection({
      kind: "saved",
      knownEnvironment: {
        id: "env-1",
        label: "Remote env",
        source: "manual",
        target: {
          httpBaseUrl: "http://example.test",
          wsBaseUrl: "ws://example.test",
        },
        environmentId,
      },
      client,
      applyShellEvent: vi.fn(),
      syncShellSnapshot,
      applyTerminalEvent: vi.fn(),
    });

    await connection.ensureBootstrapped();

    expect(syncShellSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotSequence: 1 }),
      environmentId,
    );

    await connection.dispose();
  });

  it("rejects welcome/config identity drift", async () => {
    const environmentId = EnvironmentId.make("env-1");
    const { client, emitWelcome } = createTestClient();

    const connection = createEnvironmentConnection({
      kind: "saved",
      knownEnvironment: {
        id: "env-1",
        label: "Remote env",
        source: "manual",
        target: {
          httpBaseUrl: "http://example.test",
          wsBaseUrl: "ws://example.test",
        },
        environmentId,
      },
      client,
      applyShellEvent: vi.fn(),
      syncShellSnapshot: vi.fn(),
      applyTerminalEvent: vi.fn(),
    });

    expect(() => emitWelcome(EnvironmentId.make("env-2"))).toThrow(
      "Environment connection env-1 changed identity to env-2 via server lifecycle welcome.",
    );

    await connection.dispose();
  });

  it("waits for a fresh shell snapshot after reconnect", async () => {
    const environmentId = EnvironmentId.make("env-1");
    const { client, emitShellSnapshot } = createTestClient();
    const syncShellSnapshot = vi.fn();

    const connection = createEnvironmentConnection({
      kind: "saved",
      knownEnvironment: {
        id: "env-1",
        label: "Remote env",
        source: "manual",
        target: {
          httpBaseUrl: "http://example.test",
          wsBaseUrl: "ws://example.test",
        },
        environmentId,
      },
      client,
      applyShellEvent: vi.fn(),
      syncShellSnapshot,
      applyTerminalEvent: vi.fn(),
    });

    await connection.ensureBootstrapped();

    const reconnectPromise = connection.reconnect();
    await Promise.resolve();
    expect(syncShellSnapshot).toHaveBeenCalledTimes(1);

    emitShellSnapshot(2);
    await reconnectPromise;

    expect(client.reconnect).toHaveBeenCalledTimes(1);
    expect(syncShellSnapshot).toHaveBeenCalledTimes(2);
    expect(syncShellSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotSequence: 2 }),
      environmentId,
    );

    await connection.dispose();
  });

  it("does not strand reconnect waiters when shell resubscribe starts after reconnect returns", async () => {
    const environmentId = EnvironmentId.make("env-1");
    const { client, emitShellResubscribe, emitShellSnapshot } = createTestClient({
      reconnectTriggersShellResubscribe: false,
    });
    const syncShellSnapshot = vi.fn();

    const connection = createEnvironmentConnection({
      kind: "saved",
      knownEnvironment: {
        id: "env-1",
        label: "Remote env",
        source: "manual",
        target: {
          httpBaseUrl: "http://example.test",
          wsBaseUrl: "ws://example.test",
        },
        environmentId,
      },
      client,
      applyShellEvent: vi.fn(),
      syncShellSnapshot,
      applyTerminalEvent: vi.fn(),
    });

    await connection.ensureBootstrapped();

    const reconnectPromise = connection.reconnect();
    await Promise.resolve();

    emitShellResubscribe();
    emitShellSnapshot(2);

    await expect(reconnectPromise).resolves.toBeUndefined();
    expect(syncShellSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshotSequence: 2 }),
      environmentId,
    );

    await connection.dispose();
  });

  it("refreshes terminal status snapshots after reconnect", async () => {
    const environmentId = EnvironmentId.make("env-1");
    const { client, emitShellSnapshot } = createTestClient();

    const connection = createEnvironmentConnection({
      kind: "saved",
      knownEnvironment: {
        id: "env-1",
        label: "Remote env",
        source: "manual",
        target: {
          httpBaseUrl: "http://example.test",
          wsBaseUrl: "ws://example.test",
        },
        environmentId,
      },
      client,
      applyShellEvent: vi.fn(),
      syncShellSnapshot: vi.fn(),
      applyTerminalEvent: vi.fn(),
      syncTerminalStatusSnapshot: vi.fn(),
    });

    await connection.ensureBootstrapped();
    expect(client.terminal.getStatusSnapshot).toHaveBeenCalledTimes(1);

    const reconnectPromise = connection.reconnect();
    await Promise.resolve();
    emitShellSnapshot(2);
    await reconnectPromise;

    expect(client.terminal.getStatusSnapshot).toHaveBeenCalledTimes(2);

    await connection.dispose();
  });

  it("skips primary lifecycle/config subscriptions when no handlers are registered", async () => {
    const environmentId = EnvironmentId.make("env-1");
    const { client } = createTestClient();

    const connection = createEnvironmentConnection({
      kind: "primary",
      knownEnvironment: {
        id: "env-1",
        label: "Local env",
        source: "manual",
        target: {
          httpBaseUrl: "http://example.test",
          wsBaseUrl: "ws://example.test",
        },
        environmentId,
      },
      client,
      applyShellEvent: vi.fn(),
      syncShellSnapshot: vi.fn(),
      applyTerminalEvent: vi.fn(),
    });

    expect(client.server.subscribeLifecycle).not.toHaveBeenCalled();
    expect(client.server.subscribeConfig).not.toHaveBeenCalled();
    expect(client.orchestration.subscribeShell).toHaveBeenCalledOnce();

    await connection.dispose();
  });
});
