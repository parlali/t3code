import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import type { DraftId } from "../../composerDraftStore";

export type ShellPanelMode = "threads" | "explorer" | "changes" | "search" | "settings";
export type BottomPanelTab = "terminal";
export type ShellWorkspaceRoute =
  | { readonly kind: "home" }
  | { readonly kind: "server"; readonly environmentId: EnvironmentId; readonly threadId: ThreadId }
  | { readonly kind: "draft"; readonly draftId: DraftId };

export interface ShellTerminalActions {
  readonly terminalAvailable: boolean;
  readonly terminalOpen: boolean;
  readonly terminalToggleShortcutLabel: string | null;
  readonly threadRef: ScopedThreadRef;
  readonly onToggleTerminal: () => void;
}

export interface ShellRunContextActions {
  readonly activeThreadBranch: string | null;
  readonly canCheckoutPullRequest: boolean;
  readonly canOverrideServerThreadEnvMode: boolean;
  readonly envLocked: boolean;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly onCheckoutPullRequestRequest?: (reference: string) => void;
  readonly onComposerFocusRequest: () => void;
  readonly onEnvModeChange: (mode: "local" | "worktree") => void;
  readonly onThreadBranchChange: (branch: string | null) => void;
}

interface ShellState {
  readonly activeMode: ShellPanelMode;
  readonly bottomPanelOpen: boolean;
  readonly bottomPanelTab: BottomPanelTab;
  readonly panelOpen: boolean;
  readonly railCollapsed: boolean;
  readonly terminalActions: ShellTerminalActions | null;
  readonly runContextActions: ShellRunContextActions | null;
  readonly lastWorkspaceRoute: ShellWorkspaceRoute;
  readonly panelWidth: number;
  readonly setActiveMode: (mode: ShellPanelMode) => void;
  readonly setBottomPanelOpen: (open: boolean) => void;
  readonly setBottomPanelTab: (tab: BottomPanelTab) => void;
  readonly setLastWorkspaceRoute: (route: ShellWorkspaceRoute) => void;
  readonly setPanelOpen: (open: boolean) => void;
  readonly setRailCollapsed: (collapsed: boolean) => void;
  readonly setTerminalActions: (actions: ShellTerminalActions | null) => void;
  readonly setRunContextActions: (actions: ShellRunContextActions | null) => void;
  readonly setPanelWidth: (width: number) => void;
  readonly toggleBottomPanel: () => void;
  readonly togglePanel: () => void;
}

const ACTIVE_MODE_STORAGE_KEY = "t3code:shell:active-side-panel-mode:v1";
const LAST_WORKSPACE_ROUTE_STORAGE_KEY = "t3code:shell:last-workspace-route:v1";
const PANEL_OPEN_STORAGE_KEY = "t3code:shell:side-panel-open:v1";
const RAIL_COLLAPSED_STORAGE_KEY = "t3code:shell:rail-collapsed:v1";
const PANEL_WIDTH_STORAGE_KEY = "t3code:shell:side-panel-width:v1";
const LEGACY_WIDTHS_STORAGE_KEY = "t3code:shell:side-panel-widths:v1";

const PANEL_MODES = new Set<ShellPanelMode>([
  "threads",
  "explorer",
  "changes",
  "search",
  "settings",
]);

const DEFAULT_PANEL_WIDTH = 320;
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 520;

function readString(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeString(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function readBoolean(key: string, fallback: boolean): boolean {
  const value = readString(key);
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

function readActiveMode(): ShellPanelMode {
  const stored = readString(ACTIVE_MODE_STORAGE_KEY);
  if (stored === "search") return "threads";
  return PANEL_MODES.has(stored as ShellPanelMode) ? (stored as ShellPanelMode) : "threads";
}

export function clampShellPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANEL_WIDTH;
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Math.round(width)));
}

function readWorkspaceRoute(): ShellWorkspaceRoute {
  const stored = readString(LAST_WORKSPACE_ROUTE_STORAGE_KEY);
  if (!stored) return { kind: "home" };

  try {
    const parsed = JSON.parse(stored) as Partial<ShellWorkspaceRoute>;
    if (parsed.kind === "home") return { kind: "home" };
    if (
      parsed.kind === "server" &&
      typeof parsed.environmentId === "string" &&
      typeof parsed.threadId === "string"
    ) {
      return {
        kind: "server",
        environmentId: parsed.environmentId as EnvironmentId,
        threadId: parsed.threadId as ThreadId,
      };
    }
    if (parsed.kind === "draft" && typeof parsed.draftId === "string") {
      return { kind: "draft", draftId: parsed.draftId as DraftId };
    }
  } catch {
    return { kind: "home" };
  }

  return { kind: "home" };
}

function writeWorkspaceRoute(route: ShellWorkspaceRoute): void {
  writeString(LAST_WORKSPACE_ROUTE_STORAGE_KEY, JSON.stringify(route));
}

function readPanelWidth(): number {
  const stored = Number.parseFloat(readString(PANEL_WIDTH_STORAGE_KEY) ?? "");
  if (Number.isFinite(stored)) {
    return clampShellPanelWidth(stored);
  }

  const legacyStored = readString(LEGACY_WIDTHS_STORAGE_KEY);
  if (!legacyStored) return DEFAULT_PANEL_WIDTH;

  try {
    const parsed = JSON.parse(legacyStored) as Record<string, unknown>;
    const width = parsed.threads ?? parsed.explorer ?? parsed.changes ?? parsed.search;
    if (typeof width === "number" && Number.isFinite(width)) {
      return clampShellPanelWidth(width);
    }
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }

  return DEFAULT_PANEL_WIDTH;
}

function writePanelWidth(width: number): void {
  writeString(PANEL_WIDTH_STORAGE_KEY, String(clampShellPanelWidth(width)));
}

export function resolveShellWorkspaceRouteFromPathname(
  pathname: string,
): ShellWorkspaceRoute | null {
  if (pathname === "/" || pathname.length === 0) {
    return { kind: "home" };
  }

  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments[0] === "settings" || segments[0] === "pair") {
    return null;
  }
  if (segments[0] === "draft" && segments[1]) {
    return { kind: "draft", draftId: segments[1] as DraftId };
  }
  if (segments[0] && segments[1]) {
    return {
      kind: "server",
      environmentId: segments[0] as EnvironmentId,
      threadId: segments[1] as ThreadId,
    };
  }

  return null;
}

export const useShellStore = create<ShellState>((set, get) => ({
  activeMode: readActiveMode(),
  bottomPanelOpen: false,
  bottomPanelTab: "terminal",
  panelOpen: readBoolean(PANEL_OPEN_STORAGE_KEY, true),
  railCollapsed: readBoolean(RAIL_COLLAPSED_STORAGE_KEY, false),
  terminalActions: null,
  runContextActions: null,
  lastWorkspaceRoute: readWorkspaceRoute(),
  panelWidth: readPanelWidth(),
  setActiveMode: (mode) => {
    writeString(ACTIVE_MODE_STORAGE_KEY, mode);
    set({ activeMode: mode, panelOpen: true });
    writeString(PANEL_OPEN_STORAGE_KEY, "1");
  },
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  setBottomPanelTab: (bottomPanelTab) => set({ bottomPanelTab }),
  setLastWorkspaceRoute: (lastWorkspaceRoute) => {
    writeWorkspaceRoute(lastWorkspaceRoute);
    set({ lastWorkspaceRoute });
  },
  setPanelOpen: (panelOpen) => {
    writeString(PANEL_OPEN_STORAGE_KEY, panelOpen ? "1" : "0");
    set({ panelOpen });
  },
  setRailCollapsed: (railCollapsed) => {
    writeString(RAIL_COLLAPSED_STORAGE_KEY, railCollapsed ? "1" : "0");
    set({ railCollapsed });
  },
  setTerminalActions: (terminalActions) => set({ terminalActions }),
  setRunContextActions: (runContextActions) => set({ runContextActions }),
  setPanelWidth: (width) => {
    const panelWidth = clampShellPanelWidth(width);
    writePanelWidth(panelWidth);
    set({ panelWidth });
  },
  toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),
  togglePanel: () => {
    const next = !get().panelOpen;
    writeString(PANEL_OPEN_STORAGE_KEY, next ? "1" : "0");
    set({ panelOpen: next });
  },
}));
