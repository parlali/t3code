import type { ProjectEntry, VcsStatusResult } from "@t3tools/contracts";

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

export function resolveAvailableChangeSource(
  files: VcsStatusResult["workingTree"]["files"],
  relativePath: string,
  preferredSource: "working-tree" | "staged" = "working-tree",
): "working-tree" | "staged" | null {
  if (isChangeSelectionAvailable(files, relativePath, preferredSource)) {
    return preferredSource;
  }
  const alternateSource = preferredSource === "working-tree" ? "staged" : "working-tree";
  return isChangeSelectionAvailable(files, relativePath, alternateSource) ? alternateSource : null;
}
