import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { FolderIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { useStore } from "../../store";
import type { Project, SidebarThreadSummary } from "../../types";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { SettingsSidebarNav } from "../settings/SettingsSidebarNav";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { startResizeInteraction, type ResizeInteractionHandle } from "../ui/resize-interaction";
import { SidePanelWorkbenchMode } from "./SidePanelWorkbenchMode";
import { clampShellPanelWidth, type ShellPanelMode, useShellStore } from "./shellStore";
import { useActiveShellContext } from "./useActiveShellContext";

const ThreadSidebar = lazy(() => import("../Sidebar"));
const SIDE_PANEL_RESIZE_RAIL_CLASS =
  "relative z-1 hidden w-0 shrink-0 touch-none select-none outline-none md:block before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border/70 before:transition-colors after:absolute after:inset-y-0 after:-left-2 after:w-4 after:cursor-col-resize after:bg-transparent hover:before:bg-primary/45 focus-visible:before:bg-primary/45";

function PanelLoadingState() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <div className="h-11 shrink-0 border-b border-border" />
      <div className="min-h-0 flex-1 px-2 py-3">
        <div className="h-7 rounded-md bg-muted/45" />
        <div className="mt-3 space-y-2">
          <div className="h-5 rounded-md bg-muted/35" />
          <div className="h-5 rounded-md bg-muted/25" />
          <div className="h-5 rounded-md bg-muted/20" />
        </div>
      </div>
    </div>
  );
}

function ProjectPanelHeader() {
  const { activeProject } = useActiveShellContext();
  const setPanelOpen = useShellStore((state) => state.setPanelOpen);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-xs font-medium text-foreground">
          {activeProject?.name ?? "No project"}
        </span>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        className="size-7 md:hidden"
        aria-label="Close side panel"
        onClick={() => setPanelOpen(false)}
      >
        <PanelLeftCloseIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function SidePanelThreads() {
  return (
    <Suspense fallback={<PanelLoadingState />}>
      <ThreadSidebar />
    </Suspense>
  );
}

function SidePanelSettings() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectPanelHeader />
      <SettingsSidebarNav pathname={pathname} />
    </div>
  );
}

function SidePanelSearch() {
  const navigate = useNavigate();
  const { handleNewThread } = useNewThreadHandler();
  const [query, setQuery] = useState("");
  const environmentStateById = useStore((state) => state.environmentStateById);
  const projects = useMemo<Project[]>(
    () =>
      Object.values(environmentStateById).flatMap((environmentState) =>
        environmentState.projectIds.flatMap((projectId) => {
          const project = environmentState.projectById[projectId];
          return project ? [project] : [];
        }),
      ),
    [environmentStateById],
  );
  const threads = useMemo<SidebarThreadSummary[]>(
    () =>
      Object.entries(environmentStateById).flatMap(([environmentId, environmentState]) =>
        environmentState.threadIds.flatMap((threadId) => {
          const thread = environmentState.sidebarThreadSummaryById[threadId];
          return thread && thread.environmentId === environmentId ? [thread] : [];
        }),
      ),
    [environmentStateById],
  );
  const trimmedQuery = query.trim().toLowerCase();
  const projectResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return projects
      .filter((project) =>
        [project.name, project.cwd].some((value) => value.toLowerCase().includes(trimmedQuery)),
      )
      .slice(0, 8);
  }, [projects, trimmedQuery]);
  const projectByKey = useMemo(() => {
    const next = new Map<string, (typeof projects)[number]>();
    for (const project of projects) {
      next.set(`${project.environmentId}:${project.id}`, project);
    }
    return next;
  }, [projects]);
  const threadResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return threads
      .filter((thread) =>
        [
          thread.title,
          projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.name,
          projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.cwd,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(trimmedQuery)),
      )
      .slice(0, 20);
  }, [projectByKey, threads, trimmedQuery]);
  const hasQuery = trimmedQuery.length > 0;
  const hasResults = projectResults.length > 0 || threadResults.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectPanelHeader />
      <div className="border-b border-border p-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search threads and projects"
          className="h-8 text-xs"
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {!hasQuery ? (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            Search threads and projects.
          </div>
        ) : !hasResults ? (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            No results for "{query.trim()}".
          </div>
        ) : (
          <div className="space-y-3">
            {projectResults.length > 0 ? (
              <section>
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Projects
                </div>
                <div className="space-y-0.5">
                  {projectResults.map((project) => (
                    <button
                      key={`${project.environmentId}:${project.id}`}
                      type="button"
                      className="flex w-full cursor-pointer flex-col rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        void handleNewThread(scopeProjectRef(project.environmentId, project.id));
                      }}
                    >
                      <span className="truncate font-medium">{project.name}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {project.cwd}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {threadResults.length > 0 ? (
              <section>
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Threads
                </div>
                <div className="space-y-0.5">
                  {threadResults.map((thread) => {
                    const threadRef = scopeThreadRef(thread.environmentId, thread.id);
                    return (
                      <button
                        key={`${thread.environmentId}:${thread.id}`}
                        type="button"
                        className="flex w-full cursor-pointer flex-col rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          void navigate({
                            to: "/$environmentId/$threadId",
                            params: {
                              environmentId: threadRef.environmentId,
                              threadId: threadRef.threadId,
                            },
                          }).catch(() => undefined);
                        }}
                      >
                        <span className="truncate font-medium">
                          {thread.title || "Untitled thread"}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.name ??
                            thread.environmentId}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SidePanelContent({ mode }: { readonly mode: ShellPanelMode }) {
  if (mode === "threads") return <SidePanelThreads />;
  if (mode === "explorer") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ProjectPanelHeader />
        <div className="min-h-0 flex-1">
          <SidePanelWorkbenchMode mode="files" />
        </div>
      </div>
    );
  }
  if (mode === "changes") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ProjectPanelHeader />
        <div className="min-h-0 flex-1">
          <SidePanelWorkbenchMode mode="changes" />
        </div>
      </div>
    );
  }
  if (mode === "settings") return <SidePanelSettings />;
  return <SidePanelSearch />;
}

class SidePanelErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  override state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Side panel render failed", { error, componentStack: info.componentStack });
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return <SidePanelErrorFallback error={this.state.error} />;
  }
}

function SidePanelErrorFallback({ error }: { readonly error: Error }) {
  const setPanelOpen = useShellStore((state) => state.setPanelOpen);
  const setActiveMode = useShellStore((state) => state.setActiveMode);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectPanelHeader />
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-4 text-center">
        <div>
          <div className="text-sm font-medium text-foreground">Panel failed to render.</div>
          <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">{error.message}</div>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setActiveMode("threads");
            }}
          >
            Open threads
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPanelOpen(false)}>
            Close panel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SidePanel() {
  const activeMode = useShellStore((state) => state.activeMode);
  const panelOpen = useShellStore((state) => state.panelOpen);
  const width = useShellStore((state) => state.panelWidth);
  const setPanelOpen = useShellStore((state) => state.setPanelOpen);
  const setPanelWidth = useShellStore((state) => state.setPanelWidth);
  const resizeRef = useRef<{
    readonly interaction: ResizeInteractionHandle;
    readonly pointerId: number;
    readonly startWidth: number;
    readonly startX: number;
  } | null>(null);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;
      event.preventDefault();
      setPanelWidth(clampShellPanelWidth(resize.startWidth + event.clientX - resize.startX));
    };
    const stopResize = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;
      resize.interaction.release();
      resizeRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      resizeRef.current?.interaction.release();
      resizeRef.current = null;
    };
  }, [setPanelWidth]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      resizeRef.current?.interaction.release();
      resizeRef.current = {
        interaction: startResizeInteraction(event, { cursor: "col-resize" }),
        pointerId: event.pointerId,
        startWidth: width,
        startX: event.clientX,
      };
    },
    [width],
  );

  return (
    <>
      <aside
        className={cn(
          "hidden h-full min-h-0 shrink-0 flex-col overflow-hidden bg-card text-card-foreground md:flex",
          !panelOpen && "w-0",
        )}
        style={panelOpen ? { width } : undefined}
      >
        {panelOpen ? (
          <SidePanelErrorBoundary key={activeMode}>
            <SidePanelContent mode={activeMode} />
          </SidePanelErrorBoundary>
        ) : null}
      </aside>
      {panelOpen ? (
        <div className={SIDE_PANEL_RESIZE_RAIL_CLASS} onPointerDown={startResize} />
      ) : (
        <Button
          size="icon-sm"
          variant="ghost"
          className="hidden h-8 w-3 rounded-none border-r border-border md:inline-flex"
          aria-label="Open side panel"
          onClick={() => setPanelOpen(true)}
        >
          <PanelLeftOpenIcon className="size-3" />
        </Button>
      )}

      <div
        className={cn(
          "fixed inset-x-0 top-0 z-30 flex h-[calc(100dvh-3rem-env(safe-area-inset-bottom))] flex-col border-r border-border bg-card text-card-foreground transition-transform duration-200 md:hidden",
          panelOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!panelOpen}
      >
        {panelOpen ? (
          <SidePanelErrorBoundary key={activeMode}>
            <SidePanelContent mode={activeMode} />
          </SidePanelErrorBoundary>
        ) : null}
      </div>
    </>
  );
}
