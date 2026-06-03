import type {
  EnvironmentId,
  OrchestrationTaskPlan,
  ThreadId,
  WorkspaceRightPanelMode,
  WorkspaceRightPanelState,
  WorkspaceRightPanelStatePatch,
} from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilesIcon, GitBranchIcon, ListTodoIcon, PanelBottomIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { ensureEnvironmentApi } from "../../environmentApi";
import { useSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  findSidebarProposedPlan,
  isLatestTurnSettled,
  type LatestProposedPlanState,
} from "../../session-logic";
import { useStore } from "../../store";
import { createThreadSelectorAcrossEnvironments } from "../../storeSelectors";
import {
  applyWorkspaceRightPanelPatch,
  defaultWorkspaceRightPanelState,
  workspaceRightPanelQueryKey,
} from "../../workspaceRightPanelState";
import {
  requestWorkbenchOpen,
  subscribeWorkbenchOpen,
  type WorkbenchOpenRequest,
} from "../../workbenchEvents";
import { ServerProcessDialog } from "../sidebar/ServerProcessDialog";
import { Button } from "../ui/button";
import { PANE_RESIZE_RAIL_CLASS, PaneSidebarToggleButton } from "../ui/pane-chrome";
import { startResizeInteraction, type ResizeInteractionHandle } from "../ui/resize-interaction";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WorkspaceWorkbench } from "../WorkspaceWorkbench";
import { resolveWorkbenchRelativePath } from "../workbench";
import { SidePanelWorkbenchMode } from "./SidePanelWorkbenchMode";
import { useShellStore } from "./shellStore";
import { useActiveShellContext } from "./useActiveShellContext";

const RAIL_WIDTH = 48;
const CENTER_MIN_WIDTH = 13 * 16;

const LazyPlanSidebar = lazy(() => import("../PlanSidebar"));

const RIGHT_PANEL_WIDTH_STORAGE_KEY = "t3code:right-workspace-panel-width:v1";
const NESTED_PANEL_WIDTH_STORAGE_KEY = "t3code:right-workspace-nested-width:v1";
const RIGHT_PANEL_DEFAULT_WIDTH = 56 * 16;
const RIGHT_PANEL_MIN_WIDTH = 28 * 16;
const NESTED_PANEL_DEFAULT_WIDTH = 20 * 16;
const NESTED_PANEL_MIN_WIDTH = 16 * 16;
const NESTED_PANEL_MAX_WIDTH = 30 * 16;

interface RightRailItem {
  readonly mode: WorkspaceRightPanelMode;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
}

const RIGHT_RAIL_ITEMS: readonly RightRailItem[] = [
  { mode: "files", label: "Files", icon: FilesIcon },
  { mode: "changes", label: "Changes", icon: GitBranchIcon },
  { mode: "tasks", label: "Tasks", icon: ListTodoIcon },
];

function normalizePanelWidth(width: number): number {
  return Math.max(width, RIGHT_PANEL_MIN_WIDTH);
}

function clampNestedPanelWidth(width: number): number {
  return Math.min(Math.max(width, NESTED_PANEL_MIN_WIDTH), NESTED_PANEL_MAX_WIDTH);
}

function readStoredNumber(key: string, fallback: number, clamp: (value: number) => number): number {
  if (typeof window === "undefined") return fallback;
  const parsed = Number.parseFloat(window.localStorage.getItem(key) ?? "");
  return Number.isFinite(parsed) ? clamp(parsed) : fallback;
}

function writeStoredNumber(key: string, value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

function modeSelection(state: WorkspaceRightPanelState) {
  if (state.activeMode === "files") {
    return {
      selectedPath: state.files?.relativePath ?? null,
      selectedChangeSource: null,
    };
  }
  if (state.activeMode === "changes") {
    return {
      selectedPath: state.changes?.relativePath ?? null,
      selectedChangeSource: state.changes?.changeSource ?? "working-tree",
    };
  }
  return {
    selectedPath: null,
    selectedChangeSource: null,
  };
}

function patchForWorkbenchRequest(
  request: WorkbenchOpenRequest,
  cwd: string | null,
): WorkspaceRightPanelStatePatch | null {
  if (request.mode !== "files" && request.mode !== "changes") return null;
  const patch: WorkspaceRightPanelStatePatch = {
    panelOpen: true,
    activeMode: request.mode,
  };

  if (!request.path) return patch;
  const relativePath = resolveWorkbenchRelativePath(request.path, cwd);
  if (!relativePath) return patch;

  if (request.mode === "files") {
    return {
      ...patch,
      files: { relativePath },
    };
  }

  return {
    ...patch,
    changes: {
      relativePath,
      changeSource: request.source ?? "working-tree",
    },
  };
}

function nestedSidebarPatch(
  mode: "files" | "changes",
  open: boolean,
): WorkspaceRightPanelStatePatch {
  return mode === "files"
    ? { nestedSidebarOpen: { files: open } }
    : { nestedSidebarOpen: { changes: open } };
}

function ShellMessage({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-5 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function useRightPanelPlanState(
  activeThread: ReturnType<typeof useActiveShellContext>["activeThread"],
): {
  readonly activePlan: OrchestrationTaskPlan | null;
  readonly sidebarProposedPlan: LatestProposedPlanState | null;
  readonly label: string;
} {
  const activeLatestTurn = activeThread?.latestTurn ?? null;
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread?.session ?? null);
  const sourcePlanThreadId =
    !latestTurnSettled && activeLatestTurn?.sourceProposedPlan?.threadId !== activeThread?.id
      ? (activeLatestTurn?.sourceProposedPlan?.threadId ?? null)
      : null;
  const sourcePlanThread = useStore(
    useMemo(() => createThreadSelectorAcrossEnvironments(sourcePlanThreadId), [sourcePlanThreadId]),
  );
  const threadPlanCatalog = useMemo(
    () => [
      ...(activeThread ? [{ id: activeThread.id, proposedPlans: activeThread.proposedPlans }] : []),
      ...(sourcePlanThread
        ? [{ id: sourcePlanThread.id, proposedPlans: sourcePlanThread.proposedPlans }]
        : []),
    ],
    [activeThread, sourcePlanThread],
  );
  const sidebarProposedPlan = useMemo(
    () =>
      findSidebarProposedPlan({
        threads: threadPlanCatalog,
        latestTurn: activeLatestTurn,
        latestTurnSettled,
        threadId: activeThread?.id ?? null,
      }),
    [activeLatestTurn, activeThread?.id, latestTurnSettled, threadPlanCatalog],
  );
  const latestTaskPlan = activeThread?.latestTaskPlan ?? null;
  const activePlan =
    latestTaskPlan &&
    (activeLatestTurn === null || latestTaskPlan.turnId === activeLatestTurn.turnId)
      ? latestTaskPlan
      : null;
  return {
    activePlan,
    sidebarProposedPlan,
    label: sidebarProposedPlan || activeThread?.interactionMode === "plan" ? "Plan" : "Tasks",
  };
}

function RightRailButton({
  item,
  disabled,
  state,
  onPatch,
}: {
  readonly item: RightRailItem;
  readonly disabled: boolean;
  readonly state: WorkspaceRightPanelState | null;
  readonly onPatch: (patch: WorkspaceRightPanelStatePatch) => void;
}) {
  const Icon = item.icon;
  const active = state?.activeMode === item.mode;
  const onClick = () => {
    if (disabled) return;
    if (active && state?.panelOpen && (item.mode === "files" || item.mode === "changes")) {
      onPatch({
        activeMode: item.mode,
        panelOpen: true,
        ...nestedSidebarPatch(item.mode, true),
      });
      return;
    }
    onPatch({ activeMode: item.mode, panelOpen: true });
  };

  const button = (
    <Button
      size="icon-sm"
      variant={active ? "secondary" : "ghost"}
      className={cn("size-9 rounded-md", active && "bg-accent text-foreground")}
      aria-label={item.label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup side="left">{item.label}</TooltipPopup>
    </Tooltip>
  );
}

function RightActivityRail({
  disabled,
  state,
  nestedToggle,
  onPatch,
}: {
  readonly disabled: boolean;
  readonly state: WorkspaceRightPanelState | null;
  readonly nestedToggle: {
    readonly open: boolean;
    readonly label: string;
    readonly onToggle: () => void;
  } | null;
  readonly onPatch: (patch: WorkspaceRightPanelStatePatch) => void;
}) {
  const terminalActions = useShellStore((store) => store.terminalActions);
  const setBottomPanelOpen = useShellStore((store) => store.setBottomPanelOpen);

  return (
    <nav
      aria-label="Workspace tools"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-l border-border bg-card px-1.5 py-2 text-card-foreground"
    >
      <div className="flex w-full flex-1 flex-col items-center gap-1">
        {RIGHT_RAIL_ITEMS.map((item) => (
          <RightRailButton
            key={item.mode}
            item={item}
            disabled={disabled}
            state={state}
            onPatch={onPatch}
          />
        ))}
        <ServerProcessDialog />
        {nestedToggle ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <PaneSidebarToggleButton
                  side="right"
                  expanded={nestedToggle.open}
                  label={nestedToggle.label}
                  className="size-9 rounded-md"
                  onClick={nestedToggle.onToggle}
                />
              }
            />
            <TooltipPopup side="left">{nestedToggle.label}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant={terminalActions?.terminalOpen ? "secondary" : "ghost"}
              className="size-9 rounded-md"
              aria-label="Toggle terminal"
              aria-pressed={terminalActions?.terminalOpen ?? false}
              disabled={!terminalActions?.terminalAvailable}
              onClick={() => {
                terminalActions?.onToggleTerminal();
                setBottomPanelOpen(!terminalActions?.terminalOpen);
              }}
            >
              <PanelBottomIcon className="size-4" />
            </Button>
          }
        />
        <TooltipPopup side="left">
          {terminalActions?.terminalToggleShortcutLabel ?? "Toggle terminal"}
        </TooltipPopup>
      </Tooltip>
    </nav>
  );
}

function RightPanelResizeRail({
  onPointerDown,
}: {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-label="Resize right panel"
      aria-orientation="vertical"
      className={PANE_RESIZE_RAIL_CLASS}
      role="separator"
      tabIndex={0}
      onPointerDown={onPointerDown}
    />
  );
}

function WorkbenchRightPanel({
  environmentId,
  threadId,
  mode,
  state,
  fill,
  panelWidth,
  nestedPanelWidth,
  onNestedResizePointerDown,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly mode: "files" | "changes";
  readonly state: WorkspaceRightPanelState;
  readonly fill: boolean;
  readonly panelWidth: number;
  readonly nestedPanelWidth: number;
  readonly onNestedResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const nestedOpen = state.nestedSidebarOpen[mode];
  const selection = modeSelection(state);
  const requestOpen = useCallback(
    (input: {
      readonly mode: "files" | "changes";
      readonly path: string;
      readonly source?: "working-tree" | "staged";
    }) => {
      requestWorkbenchOpen({
        mode: input.mode,
        path: input.path,
        ...(input.source ? { source: input.source } : {}),
      });
    },
    [],
  );

  return (
    <div
      className={cn("flex h-full min-h-0 min-w-0", fill ? "flex-1" : "")}
      style={fill ? undefined : { width: panelWidth }}
    >
      <div className="min-w-0 flex-1">
        <WorkspaceWorkbench
          environmentId={environmentId}
          threadId={threadId}
          embedded
          visible={state.panelOpen}
        />
      </div>
      {nestedOpen ? (
        <>
          <RightPanelResizeRail onPointerDown={onNestedResizePointerDown} />
          <aside
            className="h-full min-h-0 shrink-0 overflow-hidden border-l border-border bg-card/35"
            style={{ width: nestedPanelWidth }}
          >
            <SidePanelWorkbenchMode
              mode={mode}
              selectedPath={selection.selectedPath}
              selectedChangeSource={selection.selectedChangeSource}
              onOpenFile={requestOpen}
            />
          </aside>
        </>
      ) : null}
    </div>
  );
}

function TasksRightPanel({
  environmentId,
  activePlan,
  sidebarProposedPlan,
  label,
  markdownCwd,
  workspaceRoot,
  timestampFormat,
  onPatch,
}: {
  readonly environmentId: EnvironmentId;
  readonly activePlan: OrchestrationTaskPlan | null;
  readonly sidebarProposedPlan: LatestProposedPlanState | null;
  readonly label: string;
  readonly markdownCwd: string | undefined;
  readonly workspaceRoot: string | undefined;
  readonly timestampFormat: "12-hour" | "24-hour" | "locale";
  readonly onPatch: (patch: WorkspaceRightPanelStatePatch) => void;
}) {
  return (
    <div className="h-full min-h-0" style={{ width: "min(28rem, 100vw - 3rem)" }}>
      <Suspense fallback={<ShellMessage>Loading tasks...</ShellMessage>}>
        <LazyPlanSidebar
          activePlan={activePlan}
          activeProposedPlan={sidebarProposedPlan}
          label={label}
          environmentId={environmentId}
          markdownCwd={markdownCwd}
          workspaceRoot={workspaceRoot}
          timestampFormat={timestampFormat}
          mode="sheet"
          onClose={() => onPatch({ panelOpen: false })}
        />
      </Suspense>
    </div>
  );
}

export function RightWorkspaceShell() {
  const queryClient = useQueryClient();
  const { activeProject, activeProjectRef, activeThread, cwd, routeThreadRef } =
    useActiveShellContext();
  const settings = useSettings();
  const environmentId = activeProjectRef?.environmentId ?? routeThreadRef?.environmentId ?? null;
  const projectId = activeProjectRef?.projectId ?? null;
  const stateInput = useMemo(
    () =>
      environmentId && projectId && cwd
        ? {
            environmentId,
            projectId,
            workspaceRoot: cwd,
          }
        : null,
    [cwd, environmentId, projectId],
  );
  const queryKey = stateInput
    ? workspaceRightPanelQueryKey(stateInput)
    : (["workspaceRightPanel", "idle"] as const);
  const stateQuery = useQuery({
    queryKey,
    enabled: stateInput !== null,
    queryFn: async () => {
      if (!stateInput) throw new Error("No project selected.");
      return ensureEnvironmentApi(stateInput.environmentId).workspaceRightPanel.getState({
        projectId: stateInput.projectId,
        workspaceRoot: stateInput.workspaceRoot,
      });
    },
  });
  const state =
    stateInput === null
      ? null
      : (stateQuery.data ??
        defaultWorkspaceRightPanelState({
          projectId: stateInput.projectId,
          workspaceRoot: stateInput.workspaceRoot,
        }));
  const { activePlan, sidebarProposedPlan, label } = useRightPanelPlanState(activeThread);
  const activeThreadId = activeThread?.id ?? null;
  const activeLatestTurn = activeThread?.latestTurn ?? null;
  const activeSession = activeThread?.session ?? null;
  const autoOpenedPlanTurnRef = useRef<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(() =>
    readStoredNumber(RIGHT_PANEL_WIDTH_STORAGE_KEY, RIGHT_PANEL_DEFAULT_WIDTH, normalizePanelWidth),
  );
  const [nestedPanelWidth, setNestedPanelWidth] = useState(() =>
    readStoredNumber(
      NESTED_PANEL_WIDTH_STORAGE_KEY,
      NESTED_PANEL_DEFAULT_WIDTH,
      clampNestedPanelWidth,
    ),
  );
  interface ColumnResizeState {
    readonly interaction: ResizeInteractionHandle;
    readonly pointerId: number;
    readonly startWidth: number;
    readonly startX: number;
    pendingWidth: number;
    rafId: number | null;
  }
  const panelResizeRef = useRef<ColumnResizeState | null>(null);
  const nestedResizeRef = useRef<ColumnResizeState | null>(null);
  const [outerDragActive, setOuterDragActive] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    sidebar: 0,
  }));
  const viewportRef = useRef(viewport);

  // Caps the panel so sidebar + panel + rail never exceed the viewport (the
  // center can shrink to zero, at which point the chat is hidden — see below).
  const clampPanelWidthForViewport = useCallback((width: number) => {
    const v = viewportRef.current;
    const lower = Math.max(width, RIGHT_PANEL_MIN_WIDTH);
    if (v.width <= 0) return lower;
    const upper = Math.max(RIGHT_PANEL_MIN_WIDTH, v.width - v.sidebar - RAIL_WIDTH);
    return Math.min(lower, upper);
  }, []);

  const patchState = useCallback(
    (
      patch: WorkspaceRightPanelStatePatch,
      options?: {
        readonly persist?: boolean;
      },
    ) => {
      if (!stateInput) return;
      const key = workspaceRightPanelQueryKey(stateInput);
      queryClient.setQueryData<WorkspaceRightPanelState>(key, (current) =>
        applyWorkspaceRightPanelPatch(
          current ??
            defaultWorkspaceRightPanelState({
              projectId: stateInput.projectId,
              workspaceRoot: stateInput.workspaceRoot,
            }),
          patch,
        ),
      );

      if (options?.persist === false) {
        return;
      }

      void ensureEnvironmentApi(stateInput.environmentId)
        .workspaceRightPanel.setState({
          projectId: stateInput.projectId,
          workspaceRoot: stateInput.workspaceRoot,
          patch,
        })
        .then((nextState) => {
          queryClient.setQueryData(key, nextState);
        })
        .catch(() => undefined);
    },
    [queryClient, stateInput],
  );

  useEffect(() => {
    return subscribeWorkbenchOpen((request) => {
      const patch = patchForWorkbenchRequest(request, cwd);
      if (patch) patchState(patch);
    });
  }, [cwd, patchState]);

  useEffect(() => {
    if (!settings.autoOpenPlanSidebar || activePlan?.status !== "active") return;
    if (activeThreadId === null) return;
    if (activeLatestTurn?.turnId !== activePlan.turnId) return;
    if (isLatestTurnSettled(activeLatestTurn, activeSession)) return;
    const autoOpenKey = `${activeThreadId}:${activePlan.turnId}`;
    if (autoOpenedPlanTurnRef.current === autoOpenKey) return;
    autoOpenedPlanTurnRef.current = autoOpenKey;
    patchState({ activeMode: "tasks", panelOpen: true }, { persist: false });
  }, [
    activeLatestTurn,
    activePlan,
    activeSession,
    activeThreadId,
    patchState,
    settings.autoOpenPlanSidebar,
  ]);

  // Resizes apply width via rAF-throttled state (at most one update per frame)
  // and the chat is layout-frozen for the drag (see resize-interaction.ts +
  // data-resize-freeze), so dragging a column never thrashes the heavy panes.
  useEffect(() => {
    const flushPanel = () => {
      const resize = panelResizeRef.current;
      if (!resize) return;
      resize.rafId = null;
      setPanelWidth(resize.pendingWidth);
    };
    const flushNested = () => {
      const resize = nestedResizeRef.current;
      if (!resize) return;
      resize.rafId = null;
      setNestedPanelWidth(resize.pendingWidth);
    };

    const onPointerMove = (event: PointerEvent) => {
      const panelResize = panelResizeRef.current;
      if (panelResize && event.pointerId === panelResize.pointerId) {
        event.preventDefault();
        panelResize.pendingWidth = clampPanelWidthForViewport(
          panelResize.startWidth + panelResize.startX - event.clientX,
        );
        if (panelResize.rafId === null) panelResize.rafId = requestAnimationFrame(flushPanel);
        return;
      }

      const nestedResize = nestedResizeRef.current;
      if (nestedResize && event.pointerId === nestedResize.pointerId) {
        event.preventDefault();
        nestedResize.pendingWidth = clampNestedPanelWidth(
          nestedResize.startWidth + nestedResize.startX - event.clientX,
        );
        if (nestedResize.rafId === null) nestedResize.rafId = requestAnimationFrame(flushNested);
      }
    };

    const stopResize = (event: PointerEvent) => {
      const panelResize = panelResizeRef.current;
      if (panelResize && event.pointerId === panelResize.pointerId) {
        if (panelResize.rafId !== null) cancelAnimationFrame(panelResize.rafId);
        const nextWidth = panelResize.pendingWidth;
        panelResize.interaction.release();
        panelResizeRef.current = null;
        setPanelWidth(nextWidth);
        writeStoredNumber(RIGHT_PANEL_WIDTH_STORAGE_KEY, nextWidth);
        setOuterDragActive(false);
        return;
      }

      const nestedResize = nestedResizeRef.current;
      if (nestedResize && event.pointerId === nestedResize.pointerId) {
        if (nestedResize.rafId !== null) cancelAnimationFrame(nestedResize.rafId);
        const nextWidth = nestedResize.pendingWidth;
        nestedResize.interaction.release();
        nestedResizeRef.current = null;
        setNestedPanelWidth(nextWidth);
        writeStoredNumber(NESTED_PANEL_WIDTH_STORAGE_KEY, nextWidth);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      if (panelResizeRef.current?.rafId != null) cancelAnimationFrame(panelResizeRef.current.rafId);
      if (nestedResizeRef.current?.rafId != null)
        cancelAnimationFrame(nestedResizeRef.current.rafId);
      panelResizeRef.current?.interaction.release();
      nestedResizeRef.current?.interaction.release();
      panelResizeRef.current = null;
      nestedResizeRef.current = null;
    };
  }, [clampPanelWidthForViewport]);

  const beginPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      panelResizeRef.current?.interaction.release();
      panelResizeRef.current = {
        interaction: startResizeInteraction(event, { cursor: "col-resize" }),
        pointerId: event.pointerId,
        startWidth: panelWidth,
        startX: event.clientX,
        pendingWidth: panelWidth,
        rafId: null,
      };
      setOuterDragActive(true);
    },
    [panelWidth],
  );

  const beginNestedResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      nestedResizeRef.current?.interaction.release();
      nestedResizeRef.current = {
        interaction: startResizeInteraction(event, { cursor: "col-resize" }),
        pointerId: event.pointerId,
        startWidth: nestedPanelWidth,
        startX: event.clientX,
        pendingWidth: nestedPanelWidth,
        rafId: null,
      };
    },
    [nestedPanelWidth],
  );

  // Track viewport + sidebar width so we know when the open panel has squeezed
  // the center chat out of usable space.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sidebarEl = document.querySelector<HTMLElement>('[data-slot="sidebar"]');
    const measure = () => {
      const next = {
        width: window.innerWidth,
        sidebar: sidebarEl?.getBoundingClientRect().width ?? 0,
      };
      viewportRef.current = next;
      setViewport(next);
    };
    measure();
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | undefined;
    if (sidebarEl && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(sidebarEl);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  const workbenchMode =
    state?.activeMode === "files" || state?.activeMode === "changes" ? state.activeMode : null;
  const nestedOpen = state && workbenchMode ? state.nestedSidebarOpen[workbenchMode] : false;
  const nestedLabel =
    workbenchMode === "files"
      ? nestedOpen
        ? "Collapse file browser"
        : "Expand file browser"
      : nestedOpen
        ? "Collapse changes browser"
        : "Expand changes browser";
  const toggleNested = useCallback(() => {
    if (workbenchMode) patchState(nestedSidebarPatch(workbenchMode, !nestedOpen));
  }, [workbenchMode, nestedOpen, patchState]);

  const effectivePanelWidth = clampPanelWidthForViewport(panelWidth);
  // The open workbench has squeezed the center chat below a usable width: hide
  // the chat entirely and let the panel fill (see AppSidebarLayout). Suspended
  // mid-drag so the outer resize rail does not vanish under the pointer.
  const centerHidden =
    Boolean(state?.panelOpen) &&
    workbenchMode !== null &&
    !outerDragActive &&
    viewport.width > 0 &&
    viewport.width - viewport.sidebar - RAIL_WIDTH - effectivePanelWidth < CENTER_MIN_WIDTH;

  const setCenterHidden = useShellStore((store) => store.setCenterHidden);
  useEffect(() => {
    setCenterHidden(centerHidden);
  }, [centerHidden, setCenterHidden]);
  useEffect(() => () => setCenterHidden(false), [setCenterHidden]);

  const disabled = stateInput === null || state === null;
  const panelOpen = Boolean(state?.panelOpen);

  // Publish the panel open-state + toggle so the symmetric collapse button on
  // the top bar (mirroring the left sidebar toggle) can drive it.
  const setRightPanelActions = useShellStore((store) => store.setRightPanelActions);
  useEffect(() => {
    setRightPanelActions({
      open: panelOpen,
      canToggle: !disabled,
      onToggle: () => patchState({ panelOpen: !panelOpen }),
    });
  }, [panelOpen, disabled, patchState, setRightPanelActions]);
  useEffect(() => () => setRightPanelActions(null), [setRightPanelActions]);

  const railNestedToggle =
    panelOpen && workbenchMode && routeThreadRef
      ? { open: nestedOpen, label: nestedLabel, onToggle: toggleNested }
      : null;

  const rightPanel =
    state?.panelOpen && stateInput ? (
      <>
        {!centerHidden ? <RightPanelResizeRail onPointerDown={beginPanelResize} /> : null}
        <section
          className={cn(
            "h-full min-h-0 overflow-hidden border-l border-border bg-background text-foreground",
            centerHidden ? "min-w-0 flex-1" : "shrink-0",
          )}
        >
          {state.activeMode === "tasks" ? (
            <TasksRightPanel
              environmentId={stateInput.environmentId}
              activePlan={activePlan}
              sidebarProposedPlan={sidebarProposedPlan}
              label={label}
              markdownCwd={cwd ?? undefined}
              workspaceRoot={cwd ?? activeProject?.cwd ?? undefined}
              timestampFormat={settings.timestampFormat}
              onPatch={patchState}
            />
          ) : routeThreadRef && workbenchMode ? (
            <WorkbenchRightPanel
              environmentId={routeThreadRef.environmentId}
              threadId={routeThreadRef.threadId}
              mode={workbenchMode}
              state={state}
              fill={centerHidden}
              panelWidth={effectivePanelWidth}
              nestedPanelWidth={nestedPanelWidth}
              onNestedResizePointerDown={beginNestedResize}
            />
          ) : (
            <div style={{ width: effectivePanelWidth }}>
              <ShellMessage>Select a thread to open workspace tools.</ShellMessage>
            </div>
          )}
        </section>
      </>
    ) : null;

  return (
    <div className={cn("flex h-full min-h-0", centerHidden ? "min-w-0 flex-1" : "shrink-0")}>
      {rightPanel}
      <RightActivityRail
        disabled={disabled}
        state={state}
        nestedToggle={railNestedToggle}
        onPatch={patchState}
      />
    </div>
  );
}
