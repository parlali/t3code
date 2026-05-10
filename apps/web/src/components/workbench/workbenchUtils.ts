import type { ProjectEntry } from "@t3tools/contracts";
import type { TreeNode } from "./ExplorerTree";
import type { WorkbenchTab } from "./WorkbenchTabBar";
import type { ParsedHunk } from "./WorkbenchHunkBar";

export function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export function parentPath(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index === -1 ? null : path.slice(0, index);
}

export function sortTreeNodes(items: TreeNode[]): void {
  items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
  for (const item of items) sortTreeNodes(item.children);
}

export function tabFor(kind: WorkbenchTab["kind"], path: string): WorkbenchTab {
  return { id: `${kind}:${path}`, kind, path };
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

export function parseHunks(diff: string): ParsedHunk[] {
  const lines = diff.split("\n");
  const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@"));
  if (firstHunkIndex === -1) return [];
  const header = lines.slice(0, firstHunkIndex);
  const hunks: ParsedHunk[] = [];
  let index = firstHunkIndex;

  while (index < lines.length) {
    const headerLine = lines[index];
    if (!headerLine?.startsWith("@@")) {
      index += 1;
      continue;
    }
    const hunkLines = [headerLine];
    index += 1;
    while (index < lines.length && !lines[index]?.startsWith("@@")) {
      hunkLines.push(lines[index] ?? "");
      index += 1;
    }
    const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(headerLine);
    const label = match ? `Lines ${match[1]} -> ${match[2]}` : `Hunk ${hunks.length + 1}`;
    hunks.push({
      id: `${hunks.length}:${headerLine}`,
      label,
      patch: [...header, ...hunkLines].join("\n"),
    });
  }
  return hunks;
}

export const WORKBENCH_EXPLORER_WIDTH_STORAGE_KEY = "t3code:workbench-explorer-width";
export const WORKBENCH_EXPLORER_COLLAPSED_STORAGE_KEY = "t3code:workbench-explorer-collapsed";
export const MOBILE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";
export const DEFAULT_EXPLORER_WIDTH = 280;
export const MIN_EXPLORER_WIDTH = 190;
export const MAX_EXPLORER_WIDTH = 420;
export const COLLAPSED_EXPLORER_WIDTH = 44;

export function clampExplorerWidth(width: number): number {
  return Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, width));
}
