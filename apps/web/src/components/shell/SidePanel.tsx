import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { FolderIcon, PanelLeftCloseIcon } from "lucide-react";
import { useLocation } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { useDelayedUnmount } from "../../hooks/useDelayedUnmount";
import { SettingsSidebarNav } from "../settings/SettingsSidebarNav";
import { PANEL_EXIT_ANIMATION_MS, SNAPPY_TRANSITION_EASING_CLASS } from "../ui/animation";
import { Button } from "../ui/button";
import { startResizeInteraction, type ResizeInteractionHandle } from "../ui/resize-interaction";
import { SidePanelWorkbenchMode } from "./SidePanelWorkbenchMode";
import { clampShellPanelWidth, type ShellPanelMode, useShellStore } from "./shellStore";
import { useActiveShellContext } from "./useActiveShellContext";

const ThreadSidebar = lazy(() => import("../Sidebar"));
const SIDE_PANEL_RESIZE_RAIL_CLASS =
  "relative z-1 hidden w-0 shrink-0 touch-none select-none outline-none md:block before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border/70 before:transition-colors after:absolute after:inset-y-0 after:-left-2 after:w-4 after:cursor-col-resize after:bg-transparent hover:before:bg-primary/45 focus-visible:before:bg-primary/45";
const SIDE_PANEL_WIDTH_TRANSITION_CLASS = `transition-[width] duration-[150ms] ${SNAPPY_TRANSITION_EASING_CLASS} motion-reduce:transition-none`;
const SIDE_PANEL_CONTENT_TRANSITION_CLASS = `transition-[opacity,transform] duration-[120ms] ${SNAPPY_TRANSITION_EASING_CLASS} motion-reduce:transition-none`;

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

function SidePanelContent({ mode }: { readonly mode: ShellPanelMode }) {
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
  return <SidePanelThreads />;
}

function SidePanelContentFrame({ mode }: { readonly mode: ShellPanelMode }) {
  return (
    <SidePanelErrorBoundary key={mode}>
      <div
        className="h-full min-h-0 animate-[shell-panel-content-in_120ms_cubic-bezier(0.2,0.8,0.2,1)_both] motion-reduce:animate-none"
        key={mode}
      >
        <SidePanelContent mode={mode} />
      </div>
    </SidePanelErrorBoundary>
  );
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
  const setPanelWidth = useShellStore((state) => state.setPanelWidth);
  const panelMounted = useDelayedUnmount(panelOpen, PANEL_EXIT_ANIMATION_MS);
  const [isResizing, setIsResizing] = useState(false);
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
      setIsResizing(false);
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
      setIsResizing(true);
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
          !isResizing && SIDE_PANEL_WIDTH_TRANSITION_CLASS,
        )}
        style={{ width: panelOpen ? width : 0 }}
        aria-hidden={!panelOpen}
      >
        {panelMounted ? (
          <div className="h-full min-h-0 overflow-hidden" style={{ width }}>
            <div
              className={cn(
                "h-full min-h-0",
                SIDE_PANEL_CONTENT_TRANSITION_CLASS,
                panelOpen ? "translate-x-0 opacity-100" : "-translate-x-1.5 opacity-0",
              )}
            >
              <SidePanelContentFrame mode={activeMode} />
            </div>
          </div>
        ) : null}
      </aside>
      {panelMounted ? (
        <div
          className={cn(
            SIDE_PANEL_RESIZE_RAIL_CLASS,
            `transition-opacity duration-[120ms] ${SNAPPY_TRANSITION_EASING_CLASS} motion-reduce:transition-none`,
            panelOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onPointerDown={panelOpen ? startResize : undefined}
          aria-hidden={!panelOpen}
        />
      ) : null}

      <div
        className={cn(
          "fixed inset-x-0 top-0 z-30 flex h-[calc(100dvh-3rem-env(safe-area-inset-bottom))] flex-col border-r border-border bg-card text-card-foreground transition-transform duration-200 md:hidden",
          panelOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!panelOpen}
      >
        {panelMounted ? <SidePanelContentFrame mode={activeMode} /> : null}
      </div>
    </>
  );
}
