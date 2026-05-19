import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  getWorkbenchSelectionSnapshot,
  publishWorkbenchSelection,
  subscribeWorkbenchSelection,
  type WorkbenchSelectionScope,
} from "./workbenchEvents";

function scope(threadId: string): WorkbenchSelectionScope {
  return {
    environmentId: EnvironmentId.make("environment-local"),
    threadId: ThreadId.make(threadId),
  };
}

describe("workbenchEvents selection store", () => {
  it("stores active workbench selections by thread scope", () => {
    const first = scope("thread-selection-store-1");
    const second = scope("thread-selection-store-2");

    publishWorkbenchSelection({
      scope: first,
      selection: { mode: "files", path: "src/App.tsx" },
    });
    publishWorkbenchSelection({
      scope: second,
      selection: { mode: "changes", path: "README.md", changeSource: "staged" },
    });

    expect(getWorkbenchSelectionSnapshot(first)).toEqual({
      mode: "files",
      path: "src/App.tsx",
    });
    expect(getWorkbenchSelectionSnapshot(second)).toEqual({
      mode: "changes",
      path: "README.md",
      changeSource: "staged",
    });
  });

  it("notifies subscribers only when a scoped selection changes", () => {
    const activeScope = scope("thread-selection-store-notify");
    const listener = vi.fn();
    const unsubscribe = subscribeWorkbenchSelection(listener);

    try {
      publishWorkbenchSelection({
        scope: activeScope,
        selection: { mode: "files", path: "src/App.tsx" },
      });
      publishWorkbenchSelection({
        scope: activeScope,
        selection: { mode: "files", path: "src/App.tsx" },
      });
      publishWorkbenchSelection({ scope: activeScope, selection: null });

      expect(listener).toHaveBeenCalledTimes(2);
      expect(getWorkbenchSelectionSnapshot(activeScope)).toBeNull();
    } finally {
      unsubscribe();
    }
  });
});
