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
    reconnect: vi.fn(async () => undefined),
    request: vi.fn(),
    requestStream: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } satisfies Pick<
    WsTransport,
    "dispose" | "isConnectionOpen" | "reconnect" | "request" | "requestStream" | "subscribe"
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
      reconnect: vi.fn(async () => undefined),
      request: vi.fn(),
      requestStream: vi.fn(),
      subscribe,
    } satisfies Pick<
      WsTransport,
      "dispose" | "isConnectionOpen" | "reconnect" | "request" | "requestStream" | "subscribe"
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
    const threadDetailTransport = makeTransportMock();
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      streamTransport: streamTransport as unknown as WsTransport,
      threadDetailTransport: threadDetailTransport as unknown as WsTransport,
    });

    client.projects.subscribeEntries({ cwd: "/repo" }, vi.fn());
    client.orchestration.subscribeShell(vi.fn());
    client.orchestration.subscribeThread({ threadId: ThreadId.make("thread-1") }, vi.fn());
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
    expect(threadDetailTransport.subscribe).toHaveBeenCalledOnce();
  });

  it("reconnects and disposes all distinct transports", async () => {
    const requestTransport = makeTransportMock();
    const streamTransport = makeTransportMock();
    const threadDetailTransport = makeTransportMock();
    const client = createWsRpcClient(requestTransport as unknown as WsTransport, {
      streamTransport: streamTransport as unknown as WsTransport,
      threadDetailTransport: threadDetailTransport as unknown as WsTransport,
    });

    await client.reconnect();
    await client.dispose();

    expect(requestTransport.reconnect).toHaveBeenCalledOnce();
    expect(streamTransport.reconnect).toHaveBeenCalledOnce();
    expect(threadDetailTransport.reconnect).toHaveBeenCalledOnce();
    expect(requestTransport.dispose).toHaveBeenCalledOnce();
    expect(streamTransport.dispose).toHaveBeenCalledOnce();
    expect(threadDetailTransport.dispose).toHaveBeenCalledOnce();
  });
});
