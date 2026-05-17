import type { ProjectEntry, VcsStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import {
  isChangeSelectionAvailable,
  isFileSelectionAvailable,
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
});
