import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { threadHasStarted } from "../components/ChatView.logic";
import { WorkspaceWorkbench } from "../components/WorkspaceWorkbench";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { selectEnvironmentState, selectThreadExistsByRef, useStore } from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { resolveThreadRouteRef } from "../threadRoutes";
import { subscribeWorkbenchOpen } from "../workbenchEvents";
import { SidebarInset } from "~/components/ui/sidebar";
import { PANE_RESIZE_RAIL_CLASS } from "~/components/ui/pane-chrome";
import { cn } from "~/lib/utils";

const ChatView = lazy(() => import("../components/ChatView"));

const ChatViewLoadingFallback = () => (
  <div className="h-full min-h-0 bg-background text-foreground" aria-busy="true" />
);

const LazyChatView = (props: ComponentProps<typeof ChatView>) => (
  <Suspense fallback={<ChatViewLoadingFallback />}>
    <ChatView {...props} />
  </Suspense>
);

type MobileWorkbenchPane = "chat" | "workbench";

const INLINE_SPLIT_STORAGE_KEY = "t3code:chat-workbench-split-width";
const INLINE_CHAT_PANE_DEFAULT_WIDTH = 46 * 16;
const INLINE_PANE_MIN_WIDTH = 28 * 16;

function clampInlineChatPaneWidth(width: number, containerWidth: number): number {
  const boundedMinimum = Math.min(INLINE_PANE_MIN_WIDTH, containerWidth / 2);
  const boundedMaximum = Math.max(boundedMinimum, containerWidth - boundedMinimum);
  return Math.min(Math.max(width, boundedMinimum), boundedMaximum);
}

function readInitialInlineChatPaneWidth(): number {
  if (typeof window === "undefined") return INLINE_CHAT_PANE_DEFAULT_WIDTH;
  const stored = Number.parseFloat(window.localStorage.getItem(INLINE_SPLIT_STORAGE_KEY) ?? "");
  return Number.isFinite(stored) ? stored : INLINE_CHAT_PANE_DEFAULT_WIDTH;
}

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const { environmentId, threadId } = Route.useParams();
  const threadRef = useMemo(
    () => resolveThreadRouteRef({ environmentId, threadId }),
    [environmentId, threadId],
  );
  const bootstrapComplete = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).bootstrapComplete,
  );
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const threadExists = useStore((store) => selectThreadExistsByRef(store, threadRef));
  const environmentHasServerThreads = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).threadIds.length > 0,
  );
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) return false;
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const routeThreadExists = threadExists || draftThreadExists;
  const serverThreadStarted = threadHasStarted(serverThread);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;
  const shouldUseWorkbenchSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const [mobilePane, setMobilePane] = useState<MobileWorkbenchPane>("chat");
  const inlineLayoutRef = useRef<HTMLDivElement | null>(null);
  const [inlineChatPaneWidth, setInlineChatPaneWidth] = useState(readInitialInlineChatPaneWidth);
  const splitResizeRef = useRef<{
    readonly containerWidth: number;
    readonly pointerId: number;
    readonly startWidth: number;
    readonly startX: number;
  } | null>(null);

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) return;
    if (!routeThreadExists && environmentHasAnyThreads) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, environmentHasAnyThreads, navigate, routeThreadExists, threadRef]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread?.promotedTo) return;
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread?.promotedTo, serverThreadStarted, threadRef]);

  useEffect(() => {
    if (!shouldUseWorkbenchSheet) {
      setMobilePane("chat");
      return;
    }

    return subscribeWorkbenchOpen(() => {
      setMobilePane("workbench");
    });
  }, [shouldUseWorkbenchSheet]);

  useEffect(() => {
    if (shouldUseWorkbenchSheet) return;
    const container = inlineLayoutRef.current;
    if (!container) return;

    const clampToContainer = () => {
      const containerWidth = container.getBoundingClientRect().width;
      setInlineChatPaneWidth((current) => clampInlineChatPaneWidth(current, containerWidth));
    };
    clampToContainer();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(clampToContainer);
    resizeObserver?.observe(container);
    return () => {
      resizeObserver?.disconnect();
    };
  }, [shouldUseWorkbenchSheet]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resize = splitResizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;
      const next = clampInlineChatPaneWidth(
        resize.startWidth + event.clientX - resize.startX,
        resize.containerWidth,
      );
      setInlineChatPaneWidth(next);
    };

    const stopResize = (event: PointerEvent) => {
      const resize = splitResizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;
      splitResizeRef.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      const next = clampInlineChatPaneWidth(
        resize.startWidth + event.clientX - resize.startX,
        resize.containerWidth,
      );
      window.localStorage.setItem(INLINE_SPLIT_STORAGE_KEY, String(next));
      setInlineChatPaneWidth(next);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, []);

  const startInlineSplitResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = inlineLayoutRef.current;
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    const currentWidth =
      event.currentTarget.previousElementSibling?.getBoundingClientRect().width ??
      INLINE_CHAT_PANE_DEFAULT_WIDTH;

    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    splitResizeRef.current = {
      containerWidth,
      pointerId: event.pointerId,
      startWidth: currentWidth,
      startX: event.clientX,
    };
  }, []);

  if (!threadRef || !bootstrapComplete || !routeThreadExists) {
    return null;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <div ref={inlineLayoutRef} className="flex h-full min-h-0 min-w-0">
        <div
          data-thread-message-pane="true"
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            shouldUseWorkbenchSheet ? null : "shrink-0 grow-0",
          )}
          style={shouldUseWorkbenchSheet ? undefined : { flexBasis: inlineChatPaneWidth }}
        >
          <LazyChatView
            environmentId={threadRef.environmentId}
            threadId={threadRef.threadId}
            routeKind="server"
            mobileWorkbenchAvailable={shouldUseWorkbenchSheet}
            mobileWorkbenchPane={mobilePane}
            onMobileWorkbenchPaneChange={setMobilePane}
            {...(shouldUseWorkbenchSheet
              ? {
                  mobileWorkbenchContent: (
                    <WorkspaceWorkbench
                      environmentId={threadRef.environmentId}
                      threadId={threadRef.threadId}
                      embedded
                      onSwitchToChat={() => setMobilePane("chat")}
                    />
                  ),
                }
              : {})}
          />
        </div>
        {!shouldUseWorkbenchSheet ? (
          <>
            <div
              aria-label="Resize chat and workbench panes"
              aria-orientation="vertical"
              className={PANE_RESIZE_RAIL_CLASS}
              role="separator"
              tabIndex={0}
              onPointerDown={startInlineSplitResize}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <WorkspaceWorkbench
                environmentId={threadRef.environmentId}
                threadId={threadRef.threadId}
              />
            </div>
          </>
        ) : null}
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  component: ChatThreadRouteView,
});
