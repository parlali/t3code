import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import type { DraftId } from "../../composerDraftStore";

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

export interface ShellRightPanelActions {
  readonly open: boolean;
  readonly canToggle: boolean;
  readonly onToggle: () => void;
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
  readonly bottomPanelOpen: boolean;
  readonly bottomPanelTab: BottomPanelTab;
  readonly terminalActions: ShellTerminalActions | null;
  readonly runContextActions: ShellRunContextActions | null;
  /**
   * The right workspace panel's open-state + toggle, published by
   * `RightWorkspaceShell` so the symmetric collapse button on `ShellTopBar`
   * (mirroring the left sidebar toggle) can control it.
   */
  readonly rightPanelActions: ShellRightPanelActions | null;
  readonly lastWorkspaceRoute: ShellWorkspaceRoute;
  /**
   * True when the open right panel has expanded far enough to squeeze the
   * center chat below a usable width. The layout then hides the chat entirely
   * and the right panel fills the space. Owned by `RightWorkspaceShell`,
   * consumed by `AppSidebarLayout`.
   */
  readonly centerHidden: boolean;
  readonly setBottomPanelOpen: (open: boolean) => void;
  readonly setBottomPanelTab: (tab: BottomPanelTab) => void;
  readonly setLastWorkspaceRoute: (route: ShellWorkspaceRoute) => void;
  readonly setTerminalActions: (actions: ShellTerminalActions | null) => void;
  readonly setRunContextActions: (actions: ShellRunContextActions | null) => void;
  readonly setRightPanelActions: (actions: ShellRightPanelActions | null) => void;
  readonly setCenterHidden: (hidden: boolean) => void;
  readonly toggleBottomPanel: () => void;
}

const LAST_WORKSPACE_ROUTE_STORAGE_KEY = "t3code:shell:last-workspace-route:v1";

function readString(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeString(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
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

export const useShellStore = create<ShellState>((set) => ({
  bottomPanelOpen: false,
  bottomPanelTab: "terminal",
  terminalActions: null,
  runContextActions: null,
  rightPanelActions: null,
  lastWorkspaceRoute: readWorkspaceRoute(),
  centerHidden: false,
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  setBottomPanelTab: (bottomPanelTab) => set({ bottomPanelTab }),
  setLastWorkspaceRoute: (lastWorkspaceRoute) => {
    writeWorkspaceRoute(lastWorkspaceRoute);
    set({ lastWorkspaceRoute });
  },
  setTerminalActions: (terminalActions) => set({ terminalActions }),
  setRunContextActions: (runContextActions) => set({ runContextActions }),
  setRightPanelActions: (rightPanelActions) => set({ rightPanelActions }),
  setCenterHidden: (centerHidden) => set({ centerHidden }),
  toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),
}));
