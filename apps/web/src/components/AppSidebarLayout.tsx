import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Sidebar, SidebarProvider, SidebarRail } from "./ui/sidebar";
import {
  clearShortcutModifierState,
  syncShortcutModifierStateFromKeyboardEvent,
} from "../shortcutModifierState";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 28 * 16;
const THREAD_MESSAGE_PANE_SELECTOR = "[data-thread-message-pane='true']";
const ThreadSidebar = lazy(() => import("./Sidebar"));

function shouldAcceptThreadSidebarWidth(input: {
  readonly currentWidth?: number;
  readonly nextWidth: number;
  readonly wrapper: HTMLElement;
}): boolean {
  const messagePane = input.wrapper.querySelector<HTMLElement>(THREAD_MESSAGE_PANE_SELECTOR);
  if (!messagePane) {
    return input.wrapper.clientWidth - input.nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH;
  }

  const sidebarContainer = input.wrapper.querySelector<HTMLElement>(
    "[data-slot='sidebar-container']",
  );
  const currentSidebarWidth =
    input.currentWidth ?? sidebarContainer?.getBoundingClientRect().width ?? 0;
  if (currentSidebarWidth <= 0) {
    return true;
  }

  const sidebarDelta = input.nextWidth - currentSidebarWidth;
  if (sidebarDelta <= 0) {
    return true;
  }

  const nextMessagePaneWidth = messagePane.getBoundingClientRect().width - sidebarDelta;
  return nextMessagePaneWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH;
}

function ThreadSidebarLoadingState() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <div className="h-12 shrink-0 border-b border-border" />
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

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      syncShortcutModifierStateFromKeyboardEvent(event);
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
        void navigate({ to: "/settings" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground group-data-[collapsible=offcanvas]:border-r-0"
        resizable={{
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptThreadSidebarWidth,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <Suspense fallback={<ThreadSidebarLoadingState />}>
          <ThreadSidebar />
        </Suspense>
        <SidebarRail />
      </Sidebar>
      {children}
    </SidebarProvider>
  );
}
