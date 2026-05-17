import type { TurnId } from "@t3tools/contracts";

export interface WorkbenchOpenRequest {
  readonly mode?: "files" | "changes";
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly source?: "working-tree" | "staged";
  readonly turnId?: TurnId;
}

const WORKBENCH_OPEN_EVENT = "t3code:workbench-open";

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
