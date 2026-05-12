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
): boolean {
  return files.some((file) => file.path === relativePath);
}
