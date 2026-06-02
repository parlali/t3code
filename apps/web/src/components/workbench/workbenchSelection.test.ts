import type { ProjectEntry, VcsStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import {
  isChangeSelectionAvailable,
  isFileSelectionAvailable,
  resolveAvailableChangeSource,
} from "./workbenchSelection";

describe("workbenchSelection", () => {
  it("checks whether selected paths still exist", () => {
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
