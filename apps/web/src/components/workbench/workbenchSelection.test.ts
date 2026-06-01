import type { ProjectEntry, VcsStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import {
  isChangeSelectionAvailable,
  isFileSelectionAvailable,
  resolveAvailableChangeSource,
  selectionForTab,
  tabForSelection,
} from "./workbenchSelection";

describe("workbenchSelection", () => {
  it("round-trips file and change selections", () => {
    expect(selectionForTab({ id: "file:README.md", kind: "file", path: "README.md" })).toEqual({
      source: "files",
      relativePath: "README.md",
    });
    expect(
      selectionForTab({
        id: "diff:working-tree:README.md",
        kind: "diff",
        path: "README.md",
        source: "working-tree",
      }),
    ).toEqual({
      source: "changes",
      relativePath: "README.md",
      changeSource: "working-tree",
    });
    expect(
      selectionForTab({
        id: "diff:staged:README.md",
        kind: "diff",
        path: "README.md",
        source: "staged",
      }),
    ).toEqual({
      source: "changes",
      relativePath: "README.md",
      changeSource: "staged",
    });
    expect(tabForSelection({ source: "files", relativePath: "src/App.tsx" })).toEqual({
      id: "file:src/App.tsx",
      kind: "file",
      path: "src/App.tsx",
    });
    expect(tabForSelection({ source: "changes", relativePath: "src/App.tsx" })).toEqual({
      id: "diff:working-tree:src/App.tsx",
      kind: "diff",
      path: "src/App.tsx",
      source: "working-tree",
    });
    expect(
      tabForSelection({
        source: "changes",
        relativePath: "src/App.tsx",
        changeSource: "staged",
      }),
    ).toEqual({
      id: "diff:staged:src/App.tsx",
      kind: "diff",
      path: "src/App.tsx",
      source: "staged",
    });
  });

  it("checks whether persisted selections still exist", () => {
    const entries: ProjectEntry[] = [
      { kind: "directory", path: "src" },
      { kind: "file", path: "src/App.tsx", parentPath: "src" },
    ];
    const changedFiles: VcsStatusResult["workingTree"]["files"] = [
      {
        path: "src/App.tsx",
        insertions: 2,
        deletions: 1,
      },
    ];

    expect(isFileSelectionAvailable(entries, "src/App.tsx")).toBe(true);
    expect(isFileSelectionAvailable(entries, "src")).toBe(false);
    expect(isChangeSelectionAvailable(changedFiles, "src/App.tsx")).toBe(true);
    expect(isChangeSelectionAvailable(changedFiles, "README.md")).toBe(false);
  });

  it("falls across staged and working-tree change sources without dropping the path", () => {
    const changedFiles: VcsStatusResult["workingTree"]["files"] = [
      {
        path: "src/App.tsx",
        insertions: 2,
        deletions: 0,
        staged: true,
        unstaged: false,
      },
    ];

    expect(resolveAvailableChangeSource(changedFiles, "src/App.tsx", "working-tree")).toBe(
      "staged",
    );
    expect(resolveAvailableChangeSource(changedFiles, "src/App.tsx", "staged")).toBe("staged");
    expect(resolveAvailableChangeSource(changedFiles, "README.md", "working-tree")).toBeNull();
  });
});
