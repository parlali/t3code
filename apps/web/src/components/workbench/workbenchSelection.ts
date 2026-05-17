import type { ProjectEntry, ThreadWorkbenchSelection, VcsStatusResult } from "@t3tools/contracts";
import type { WorkbenchTab } from "./WorkbenchTabBar";
import { tabFor } from "./workbenchUtils";

export function selectionForTab(tab: WorkbenchTab): ThreadWorkbenchSelection {
  return {
    source: tab.kind === "file" ? "files" : "changes",
    relativePath: tab.path,
  };
}

export function tabForSelection(selection: ThreadWorkbenchSelection): WorkbenchTab {
  return tabFor(selection.source === "files" ? "file" : "diff", selection.relativePath);
}

export function isFileSelectionAvailable(
  entries: ReadonlyArray<ProjectEntry>,
  relativePath: string,
): boolean {
  return entries.some((entry) => entry.kind === "file" && entry.path === relativePath);
}

export function isChangeSelectionAvailable(
  files: VcsStatusResult["workingTree"]["files"],
  relativePath: string,
  source: "working-tree" | "staged" = "working-tree",
): boolean {
  return files.some((file) => {
    if (file.path !== relativePath) return false;
    if (source === "staged") return file.staged === true;
    return (
      file.conflicted === true ||
      file.untracked === true ||
      file.unstaged === true ||
      file.staged !== true
    );
  });
}
