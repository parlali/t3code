import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  clearShortcutModifierState,
  syncShortcutModifierStateFromKeyboardEvent,
} from "../shortcutModifierState";
import { cn } from "../lib/utils";
import { resolveShellWorkspaceRouteFromPathname, useShellStore } from "./shell/shellStore";
import { ShellHeaderSlotProvider } from "./shell/shellHeaderSlot";
import { RightWorkspaceShell } from "./shell/RightWorkspaceShell";
import { ShellTopBar } from "./shell/ShellTopBar";
import ProjectSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, useSidebar } from "./ui/sidebar";

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const centerHidden = useShellStore((state) => state.centerHidden);

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
        toggleSidebar();
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
  }, [toggleSidebar]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        void navigate({ to: "/settings/general" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  useEffect(() => {
    const workspaceRoute = resolveShellWorkspaceRouteFromPathname(pathname);
    if (!workspaceRoute) {
      return;
    }

    useShellStore.getState().setLastWorkspaceRoute(workspaceRoute);
  }, [pathname]);

  return (
    <ShellHeaderSlotProvider>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
        <ShellTopBar />
        <div className="flex min-h-0 w-full flex-1 overflow-hidden">
          <Sidebar
            collapsible="offcanvas"
            resizable={{
              minWidth: 18 * 16,
              maxWidth: 28 * 16,
              storageKey: "t3code:left-project-sidebar-width:v1",
            }}
          >
            <ProjectSidebar />
          </Sidebar>
          <div
            data-resize-freeze
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(3rem+env(safe-area-inset-bottom))] md:pb-0",
              centerHidden && "hidden",
            )}
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
          </div>
          <RightWorkspaceShell />
        </div>
      </div>
    </ShellHeaderSlotProvider>
  );
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      className="h-dvh! min-h-0! overflow-hidden"
      defaultOpen
      style={{ "--sidebar-width": "20rem" } as CSSProperties}
    >
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  );
}
