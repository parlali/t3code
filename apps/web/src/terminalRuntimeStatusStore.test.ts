import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import {
  selectThreadTerminalRuntimeStatus,
  useTerminalRuntimeStatusStore,
} from "./terminalRuntimeStatusStore";

const environmentId = EnvironmentId.make("env-1");
const threadId = ThreadId.make("thread-1");

describe("terminalRuntimeStatusStore", () => {
  beforeEach(() => {
    useTerminalRuntimeStatusStore.setState({ sessionByTerminalKey: {} });
  });

  it("hydrates open and busy terminal ids from a server snapshot", () => {
    useTerminalRuntimeStatusStore.getState().syncSnapshot(environmentId, {
      updatedAt: "2026-05-09T10:00:00.000Z",
      sessions: [
        {
          threadId,
          terminalId: "default",
          status: "running",
          hasRunningSubprocess: true,
          updatedAt: "2026-05-09T10:00:00.000Z",
        },
      ],
    });

    const status = selectThreadTerminalRuntimeStatus(
      useTerminalRuntimeStatusStore.getState(),
      environmentId,
      threadId,
    );

    expect(status.openTerminalIds).toEqual(["default"]);
    expect(status.runningTerminalIds).toEqual(["default"]);
  });

  it("updates status from terminal activity events", () => {
    useTerminalRuntimeStatusStore.getState().applyTerminalEvent(environmentId, {
      type: "activity",
      threadId,
      terminalId: "default",
      hasRunningSubprocess: true,
      createdAt: "2026-05-09T10:00:00.000Z",
    });

    expect(
      useTerminalRuntimeStatusStore.getState().sessionByTerminalKey[
        `${scopedThreadKey(scopeThreadRef(environmentId, threadId))}:default`
      ]?.hasRunningSubprocess,
    ).toBe(true);
  });
});
