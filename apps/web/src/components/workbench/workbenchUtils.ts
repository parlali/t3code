import type { ProjectEntry } from "@t3tools/contracts";
import type { TreeNode } from "./ExplorerTree";
import type { WorkbenchTab } from "./WorkbenchTabBar";

export function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export function parentPath(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index === -1 ? null : path.slice(0, index);
}

export function relativePathAncestors(path: string): string[] {
  const ancestors: string[] = [];
  let current = parentPath(path);
  while (current) {
    ancestors.unshift(current);
    current = parentPath(current);
  }
  return ancestors;
}

function normalizePathSeparators(path: string): string {
  return path.replaceAll("\\", "/");
}

function canonicalizeWindowsDrivePath(path: string): string {
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

function trimTrailingPathSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function stripRelativePrefixes(path: string): string {
  return path.replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function isSafeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  );
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function resolveWorkbenchRelativePath(
  path: string,
  cwd: string | null | undefined,
): string | null {
  const trimmedPath = path.trim();
  const normalizedPath = canonicalizeWindowsDrivePath(normalizePathSeparators(trimmedPath));
  if (normalizedPath.length === 0) return null;

  if (!isAbsolutePath(trimmedPath)) {
    const relativePath = stripRelativePrefixes(normalizedPath);
    return isSafeRelativePath(relativePath) ? relativePath : null;
  }

  if (!cwd) return null;

  const normalizedCwd = canonicalizeWindowsDrivePath(
    normalizePathSeparators(trimTrailingPathSeparators(cwd)),
  );
  const pathForCompare = normalizedPath.toLowerCase();
  const cwdForCompare = normalizedCwd.toLowerCase();
  const cwdWithSeparator = `${cwdForCompare}/`;

  if (pathForCompare.startsWith(cwdWithSeparator)) {
    const relativePath = normalizedPath.slice(normalizedCwd.length + 1);
    return isSafeRelativePath(relativePath) ? relativePath : null;
  }

  return null;
}

export function normalizeNewEntryName(input: string): string | null {
  const segments = input
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return segments.join("/");
}

export function buildNewEntryRelativePath(parent: string | null, input: string): string | null {
  const name = normalizeNewEntryName(input);
  if (!name) return null;
  return parent ? `${parent}/${name}` : name;
}

export function sortTreeNodes(items: TreeNode[]): void {
  items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
  for (const item of items) sortTreeNodes(item.children);
}

export function tabFor(
  kind: WorkbenchTab["kind"],
  path: string,
  options?: { readonly source?: "working-tree" | "staged" },
): WorkbenchTab {
  if (kind === "diff") {
    const source = options?.source ?? "working-tree";
    return { id: `diff:${source}:${path}`, kind, path, source };
  }
  return { id: `file:${path}`, kind, path };
}

export function setBufferValue(
  current: Record<string, string>,
  path: string,
  contents: string,
): Record<string, string> {
  return current[path] === contents ? current : { ...current, [path]: contents };
}

export function markDirty(current: Set<string>, tabId: string): Set<string> {
  if (current.has(tabId)) return current;
  const next = new Set(current);
  next.add(tabId);
  return next;
}

export function languageFor(path: string): string | undefined {
  const extension = path.split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
    case "mdx":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
      return "toml";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "go":
      return "go";
    default:
      return undefined;
  }
}

export function buildTree(entries: ReadonlyArray<ProjectEntry>): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const entry of entries) {
    nodes.set(entry.path, {
      path: entry.path,
      name: basename(entry.path),
      kind: entry.kind,
      children: [],
    });
  }

  for (const node of nodes.values()) {
    const parent = parentPath(node.path);
    const parentNode = parent ? nodes.get(parent) : undefined;
    if (parentNode) {
      (parentNode.children as TreeNode[]).push(node);
    } else {
      roots.push(node);
    }
  }

  sortTreeNodes(roots);
  return roots;
}

export const WORKBENCH_EXPLORER_WIDTH_STORAGE_KEY = "t3code:workbench-explorer-width";
export const WORKBENCH_EXPLORER_COLLAPSED_STORAGE_KEY = "t3code:workbench-explorer-collapsed";
export const WORKBENCH_GRAPH_HEIGHT_RATIO_STORAGE_KEY = "t3code:workbench-graph-height-ratio";
export const MOBILE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";
export const DEFAULT_EXPLORER_WIDTH = 280;
export const MIN_EXPLORER_WIDTH = 190;
export const MAX_EXPLORER_WIDTH = 420;
export const COLLAPSED_EXPLORER_WIDTH = 44;
export const DEFAULT_GRAPH_HEIGHT_RATIO = 0.43;
export const MIN_GRAPH_HEIGHT_RATIO = 0.1;
export const MAX_GRAPH_HEIGHT_RATIO = 0.9;

export function clampExplorerWidth(width: number): number {
  return Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, width));
}

export function clampGraphHeightRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_GRAPH_HEIGHT_RATIO;
  return Math.min(MAX_GRAPH_HEIGHT_RATIO, Math.max(MIN_GRAPH_HEIGHT_RATIO, ratio));
}
