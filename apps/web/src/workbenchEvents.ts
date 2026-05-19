import type { EnvironmentId, ThreadId, TurnId } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

export interface WorkbenchOpenRequest {
  readonly mode?: "files" | "changes";
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly source?: "working-tree" | "staged";
  readonly turnId?: TurnId;
}

export interface WorkbenchSelectionScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export interface WorkbenchActiveSelection {
  readonly mode: "files" | "changes";
  readonly path: string;
  readonly changeSource?: "working-tree" | "staged";
}

const WORKBENCH_OPEN_EVENT = "t3code:workbench-open";
const workbenchSelectionByScope = new Map<string, WorkbenchActiveSelection>();
const workbenchSelectionListeners = new Set<() => void>();

function workbenchSelectionScopeKey(scope: WorkbenchSelectionScope): string {
  return JSON.stringify([scope.environmentId, scope.threadId]);
}

function isSameWorkbenchSelection(
  left: WorkbenchActiveSelection | null,
  right: WorkbenchActiveSelection | null,
): boolean {
  return (
    left?.mode === right?.mode &&
    left?.path === right?.path &&
    left?.changeSource === right?.changeSource
  );
}

export function requestWorkbenchOpen(request: WorkbenchOpenRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkbenchOpenRequest>(WORKBENCH_OPEN_EVENT, { detail: request }),
  );
}

export function subscribeWorkbenchOpen(
  listener: (request: WorkbenchOpenRequest) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (event: Event) => {
    const request = (event as CustomEvent<WorkbenchOpenRequest>).detail;
    if (!request) return;
    listener(request);
  };
  window.addEventListener(WORKBENCH_OPEN_EVENT, onEvent);
  return () => window.removeEventListener(WORKBENCH_OPEN_EVENT, onEvent);
}

export function getWorkbenchSelectionSnapshot(
  scope: WorkbenchSelectionScope | null,
): WorkbenchActiveSelection | null {
  if (!scope) return null;
  return workbenchSelectionByScope.get(workbenchSelectionScopeKey(scope)) ?? null;
}

export function publishWorkbenchSelection(input: {
  readonly scope: WorkbenchSelectionScope;
  readonly selection: WorkbenchActiveSelection | null;
}): void {
  const key = workbenchSelectionScopeKey(input.scope);
  const previous = workbenchSelectionByScope.get(key) ?? null;
  if (isSameWorkbenchSelection(previous, input.selection)) return;

  if (input.selection) {
    workbenchSelectionByScope.set(key, input.selection);
  } else {
    workbenchSelectionByScope.delete(key);
  }

  for (const listener of workbenchSelectionListeners) {
    listener();
  }
}

export function subscribeWorkbenchSelection(listener: () => void): () => void {
  workbenchSelectionListeners.add(listener);
  return () => {
    workbenchSelectionListeners.delete(listener);
  };
}

export function useWorkbenchSelection(
  scope: WorkbenchSelectionScope | null,
): WorkbenchActiveSelection | null {
  return useSyncExternalStore(
    subscribeWorkbenchSelection,
    () => getWorkbenchSelectionSnapshot(scope),
    () => null,
  );
}
