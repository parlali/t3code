import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  clearShortcutModifierState,
  syncShortcutModifierStateFromKeyboardEvent,
} from "../shortcutModifierState";
import { ActivityRail } from "./shell/ActivityRail";
import { SidePanel } from "./shell/SidePanel";
import { resolveShellWorkspaceRouteFromPathname, useShellStore } from "./shell/shellStore";
import { SidebarProvider } from "./ui/sidebar";

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      syncShortcutModifierStateFromKeyboardEvent(event);

      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const primaryModifier = event.metaKey || event.ctrlKey;
      if (!primaryModifier || event.altKey || event.shiftKey) {
        return;
      }

      if (key === "b") {
        event.preventDefault();
        event.stopPropagation();
        useShellStore.getState().togglePanel();
      } else if (key === "j") {
        const terminalActions = useShellStore.getState().terminalActions;
        if (!terminalActions?.terminalAvailable) return;
        event.preventDefault();
        event.stopPropagation();
        terminalActions.onToggleTerminal();
        useShellStore.getState().toggleBottomPanel();
      }
    };
    const onWindowKeyUp = (event: KeyboardEvent) => {
      syncShortcutModifierStateFromKeyboardEvent(event);
    };
    const onWindowBlur = () => {
      clearShortcutModifierState();
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    window.addEventListener("keyup", onWindowKeyUp, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
      window.removeEventListener("keyup", onWindowKeyUp, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        useShellStore.getState().setActiveMode("settings");
        void navigate({ to: "/settings/general" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (pathname.startsWith("/settings")) {
      const shellStore = useShellStore.getState();
      if (shellStore.activeMode !== "settings") {
        shellStore.setActiveMode("settings");
      }
      return;
    }

    const workspaceRoute = resolveShellWorkspaceRouteFromPathname(pathname);
    if (!workspaceRoute) {
      return;
    }

    const shellStore = useShellStore.getState();
    shellStore.setLastWorkspaceRoute(workspaceRoute);
    if (shellStore.activeMode === "settings") {
      shellStore.setActiveMode("threads");
    }
  }, [pathname]);

  return (
    <SidebarProvider className="h-dvh! min-h-0! overflow-hidden" defaultOpen>
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
        <ActivityRail />
        <SidePanel />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(3rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}
