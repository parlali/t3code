export const IGNORED_WORKSPACE_DIRECTORY_NAMES = new Set([
  ".git",
  ".convex",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  ".cache",
]);

export const IGNORED_WORKSPACE_WATCH_DIRECTORY_NAMES = new Set([
  ...IGNORED_WORKSPACE_DIRECTORY_NAMES,
  ".logs",
  ".tmp",
  "log",
  "logs",
  "temp",
  "tmp",
]);

export const IGNORED_WORKSPACE_WATCH_FILE_SUFFIXES = [".log", ".trace", ".tmp", ".swp", ".swo"];

export function isPathInIgnoredWorkspaceDirectory(relativePath: string): boolean {
  const firstSegment = relativePath.split("/")[0];
  if (!firstSegment) return false;
  return IGNORED_WORKSPACE_DIRECTORY_NAMES.has(firstSegment);
}

export function isPathIgnoredByWorkspaceWatcher(relativePath: string): boolean {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => IGNORED_WORKSPACE_WATCH_DIRECTORY_NAMES.has(segment))) {
    return true;
  }

  const fileName = segments.at(-1) ?? "";
  return IGNORED_WORKSPACE_WATCH_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}
