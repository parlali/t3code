import { scopeProjectRef } from "@t3tools/client-runtime";
import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { useMemo } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { useStore } from "../../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../../storeSelectors";
import type { Project, Thread } from "../../types";

export interface ActiveShellContext {
  readonly activeProject: Project | undefined;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeThread: Thread | undefined;
  readonly cwd: string | null;
  readonly gitCwd: string | null;
  readonly routeThreadRef: ScopedThreadRef | null;
}

export function useActiveShellContext(): ActiveShellContext {
  const routeTarget = useThreadRouteTarget();
  const draftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const routeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const activeThread = useStore(
    useMemo(() => createThreadSelectorByRef(routeThreadRef), [routeThreadRef]),
  );
  const activeProjectRef = useMemo(() => {
    if (activeThread) {
      return scopeProjectRef(activeThread.environmentId, activeThread.projectId);
    }
    if (draftSession) {
      return scopeProjectRef(draftSession.environmentId, draftSession.projectId);
    }
    return null;
  }, [activeThread, draftSession]);
  const activeProject = useStore(
    useMemo(() => createProjectSelectorByRef(activeProjectRef), [activeProjectRef]),
  );
  const cwd =
    activeThread?.worktreePath ?? draftSession?.worktreePath ?? activeProject?.cwd ?? null;

  return {
    activeProject,
    activeProjectRef,
    activeThread,
    cwd,
    gitCwd: cwd,
    routeThreadRef:
      routeThreadRef ??
      (draftSession
        ? {
            environmentId: draftSession.environmentId,
            threadId: draftSession.threadId,
          }
        : null),
  };
}
