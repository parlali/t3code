import {
  ThreadId,
  type VcsStatusLocalResult,
  type VcsStatusRemoteResult,
  type VcsStatusStreamEvent,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("./wsTransport", () => ({
  WsTransport: class WsTransport {
    dispose = vi.fn(async () => undefined);
    reconnect = vi.fn(async () => undefined);
    request = vi.fn();
    requestStream = vi.fn();
    subscribe = vi.fn(() => () => undefined);
  },
}));

import { createWsRpcClient } from "./wsRpcClient";
import { type WsTransport } from "./wsTransport";

const baseLocalStatus: VcsStatusLocalResult = {
  isRepo: true,
  hasPrimaryRemote: true,
  isDefaultRef: false,
  refName: "feature/demo",
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
};

const baseRemoteStatus: VcsStatusRemoteResult = {
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
};

function makeTransportMock() {
  return {
    dispose: vi.fn(async () => undefined),
    isConnectionOpen: vi.fn(() => true),
    isHeartbeatFresh: vi.fn(() => true),
    reconnect: vi.fn(async () => undefined),
    request: vi.fn(),
    requestStream: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } satisfies Pick<
    WsTransport,
    | "dispose"
    | "isConnectionOpen"
    | "isHeartbeatFresh"
    | "reconnect"
    | "request"
    | "requestStream"
    | "subscribe"
  >;
}

describe("wsRpcClient", () => {
  it("reduces vcs status stream events into flat status snapshots", () => {
    const subscribe = vi.fn(<TValue>(_connect: unknown, listener: (value: TValue) => void) => {
      for (const event of [
        {
          _tag: "snapshot",
          local: baseLocalStatus,
          remote: null,
        },
        {
          _tag: "remoteUpdated",
          remote: baseRemoteStatus,
        },
        {
          _tag: "localUpdated",
          local: {
            ...baseLocalStatus,
            hasWorkingTreeChanges: true,
          },
        },
      ] satisfies VcsStatusStreamEvent[]) {
        listener(event as TValue);
      }
      return () => undefined;
    });

    const transport = {
      dispose: vi.fn(async () => undefined),
      isConnectionOpen: vi.fn(() => true),
      isHeartbeatFresh: vi.fn(() => true),
      reconnect: vi.fn(async () => undefined),
      request: vi.fn(),
      requestStream: vi.fn(),
      subscribe,
    } satisfies Pick<
      WsTransport,
      | "dispose"
      | "isConnectionOpen"
      | "isHeartbeatFresh"
      | "reconnect"
      | "request"
      | "requestStream"
      | "subscribe"
    >;

    const client = createWsRpcClient(transport as unknown as WsTransport);
    const listener = vi.fn();

    client.vcs.onStatus({ cwd: "/repo" }, listener);

    expect(listener.mock.calls).toEqual([
      [
        {
          ...baseLocalStatus,
          hasUpstream: false,
          aheadCount: 0,
          behindCount: 0,
          aheadOfDefaultCount: 0,
          pr: null,
        },
      ],
      [
        {
          ...baseLocalStatus,
          ...baseRemoteStatus,
        },
      ],
      [
        {
          ...baseLocalStatus,
          ...baseRemoteStatus,
          hasWorkingTreeChanges: true,
        },
      ],
    ]);
  });

  it("routes long-lived subscriptions away from unary requests", async () => {
    const requestTransport = makeTransportMock();
    const streamTransport = makeTransportMock();
    const terminalTransport = makeTransportMock();
    const threadDetailTransport = makeTransportMock();
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      streamTransport: streamTransport as unknown as WsTransport,
      terminalTransport: terminalTransport as unknown as WsTransport,
      threadDetailTransport: threadDetailTransport as unknown as WsTransport,
    });

    client.projects.subscribeEntries({ cwd: "/repo" }, vi.fn());
    client.orchestration.subscribeShell(vi.fn());
    client.orchestration.subscribeThread({ threadId: ThreadId.make("thread-1") }, vi.fn());
    client.terminal.onSessionEvent({ threadId: "thread-1", terminalId: "default" }, vi.fn());
    await client.terminal.open({
      threadId: "thread-1",
      terminalId: "default",
      cwd: "/repo",
      cols: 80,
      rows: 24,
    });

    expect(requestTransport.request).toHaveBeenCalledOnce();
    expect(requestTransport.subscribe).not.toHaveBeenCalled();
    expect(streamTransport.subscribe).toHaveBeenCalledTimes(2);
    expect(terminalTransport.subscribe).toHaveBeenCalledOnce();
    expect(threadDetailTransport.subscribe).toHaveBeenCalledOnce();
  });

  it("creates the dedicated terminal transport lazily", async () => {
    const requestTransport = makeTransportMock();
    const terminalTransport = makeTransportMock();
    const createTerminalTransport = vi.fn(() => terminalTransport as unknown as WsTransport);
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      terminalTransport: createTerminalTransport,
    });

    expect(createTerminalTransport).not.toHaveBeenCalled();

    client.terminal.onSessionEvent({ threadId: "thread-1", terminalId: "default" }, vi.fn());
    await client.dispose();

    expect(createTerminalTransport).toHaveBeenCalledOnce();
    expect(terminalTransport.subscribe).toHaveBeenCalledOnce();
    expect(terminalTransport.dispose).toHaveBeenCalledOnce();
  });

  it("returns completed stacked git action results after recoverable stream interruptions", async () => {
    const requestTransport = makeTransportMock();
    const streamTransport = makeTransportMock();
    const terminalTransport = makeTransportMock();
    const threadDetailTransport = makeTransportMock();
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      streamTransport: streamTransport as unknown as WsTransport,
      terminalTransport: terminalTransport as unknown as WsTransport,
      threadDetailTransport: threadDetailTransport as unknown as WsTransport,
    });
    const actionResult = {
      action: "push",
      branch: { status: "skipped_not_requested" },
      commit: { status: "skipped_not_requested" },
      push: { status: "pushed", refName: "feature/demo", upstreamRef: "origin/feature/demo" },
      pr: { status: "skipped_not_requested" },
      toast: null,
    } as const;

    streamTransport.requestStream.mockImplementationOnce(async (_connect, listener) => {
      listener({ kind: "action_finished", actionId: "action-1", result: actionResult });
      throw new Error("All fibers interrupted without error");
    });

    await expect(
      client.git.runStackedAction({
        actionId: "action-1",
        cwd: "/repo",
        action: "push",
      }),
    ).resolves.toBe(actionResult);
  });

  it("throws recoverable stacked git action interruptions before a final result", async () => {
    const requestTransport = makeTransportMock();
    const streamTransport = makeTransportMock();
    const terminalTransport = makeTransportMock();
    const threadDetailTransport = makeTransportMock();
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      streamTransport: streamTransport as unknown as WsTransport,
      terminalTransport: terminalTransport as unknown as WsTransport,
      threadDetailTransport: threadDetailTransport as unknown as WsTransport,
    });

    streamTransport.requestStream.mockRejectedValueOnce(
      new Error("All fibers interrupted without error"),
    );

    await expect(
      client.git.runStackedAction({
        actionId: "action-1",
        cwd: "/repo",
        action: "push",
      }),
    ).rejects.toThrow("All fibers interrupted without error");
  });

  it("reconnects and disposes all distinct transports", async () => {
    const requestTransport = makeTransportMock();
    const streamTransport = makeTransportMock();
    const terminalTransport = makeTransportMock();
    const threadDetailTransport = makeTransportMock();
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      streamTransport: streamTransport as unknown as WsTransport,
      terminalTransport: terminalTransport as unknown as WsTransport,
      threadDetailTransport: threadDetailTransport as unknown as WsTransport,
    });

    await client.reconnect();
    await client.dispose();

    expect(requestTransport.reconnect).toHaveBeenCalledOnce();
    expect(streamTransport.reconnect).toHaveBeenCalledOnce();
    expect(terminalTransport.reconnect).toHaveBeenCalledOnce();
    expect(threadDetailTransport.reconnect).toHaveBeenCalledOnce();
    expect(requestTransport.dispose).toHaveBeenCalledOnce();
    expect(streamTransport.dispose).toHaveBeenCalledOnce();
    expect(terminalTransport.dispose).toHaveBeenCalledOnce();
    expect(threadDetailTransport.dispose).toHaveBeenCalledOnce();
  });

  it("reports stale when any transport is closed or heartbeat stale", () => {
    const requestTransport = makeTransportMock();
    const streamTransport = makeTransportMock();
    const terminalTransport = makeTransportMock();
    const threadDetailTransport = makeTransportMock();
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      streamTransport: streamTransport as unknown as WsTransport,
      terminalTransport: terminalTransport as unknown as WsTransport,
      threadDetailTransport: threadDetailTransport as unknown as WsTransport,
    });

    expect(client.isConnectionOpen()).toBe(true);
    expect(client.isHeartbeatFresh()).toBe(true);

    streamTransport.isConnectionOpen.mockReturnValue(false);
    expect(client.isConnectionOpen()).toBe(false);

    streamTransport.isConnectionOpen.mockReturnValue(true);
    terminalTransport.isHeartbeatFresh.mockReturnValue(false);
    expect(client.isHeartbeatFresh()).toBe(false);
  });
});
