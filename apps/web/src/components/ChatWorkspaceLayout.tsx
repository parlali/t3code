import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { type DraftId } from "../composerDraftStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { subscribeWorkbenchOpen } from "../workbenchEvents";
import { cn } from "../lib/utils";
import { SidebarInset } from "./ui/sidebar";
import { PANE_RESIZE_RAIL_CLASS } from "./ui/pane-chrome";
import { startResizeInteraction, type ResizeInteractionHandle } from "./ui/resize-interaction";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench";

const ChatView = lazy(() => import("./ChatView"));

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
const INLINE_WORKBENCH_OPEN_STORAGE_KEY = "t3code:chat-workbench-open:v1";
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

function readInitialInlineWorkbenchOpen(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(INLINE_WORKBENCH_OPEN_STORAGE_KEY) !== "0";
}

type ChatWorkspaceLayoutProps =
  | {
      readonly environmentId: EnvironmentId;
      readonly threadId: ThreadId;
      readonly routeKind: "server";
      readonly draftId?: never;
    }
  | {
      readonly environmentId: EnvironmentId;
      readonly threadId: ThreadId;
      readonly routeKind: "draft";
      readonly draftId: DraftId;
    };

export function ChatWorkspaceLayout(props: ChatWorkspaceLayoutProps) {
  const shouldUseWorkbenchSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const [mobilePane, setMobilePane] = useState<MobileWorkbenchPane>("chat");
  const inlineLayoutRef = useRef<HTMLDivElement | null>(null);
  const [inlineChatPaneWidth, setInlineChatPaneWidth] = useState(readInitialInlineChatPaneWidth);
  const [inlineWorkbenchOpen, setInlineWorkbenchOpenState] = useState(
    readInitialInlineWorkbenchOpen,
  );
  const splitResizeRef = useRef<{
    readonly containerWidth: number;
    readonly interaction: ResizeInteractionHandle;
    readonly pointerId: number;
    readonly startWidth: number;
    readonly startX: number;
  } | null>(null);

  const setInlineWorkbenchOpen = useCallback((open: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INLINE_WORKBENCH_OPEN_STORAGE_KEY, open ? "1" : "0");
    }
    setInlineWorkbenchOpenState(open);
  }, []);

  useEffect(() => {
    if (!shouldUseWorkbenchSheet) {
      setMobilePane("chat");
      return subscribeWorkbenchOpen(() => {
        setInlineWorkbenchOpen(true);
      });
    }

    return subscribeWorkbenchOpen(() => {
      setMobilePane("workbench");
    });
  }, [setInlineWorkbenchOpen, shouldUseWorkbenchSheet]);

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
      event.preventDefault();
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
      resize.interaction.release();
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
      splitResizeRef.current?.interaction.release();
      splitResizeRef.current = null;
    };
  }, []);

  const startInlineSplitResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = inlineLayoutRef.current;
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    const currentWidth =
      event.currentTarget.previousElementSibling?.getBoundingClientRect().width ??
      INLINE_CHAT_PANE_DEFAULT_WIDTH;

    splitResizeRef.current?.interaction.release();
    const interaction = startResizeInteraction(event, { cursor: "col-resize" });
    splitResizeRef.current = {
      containerWidth,
      interaction,
      pointerId: event.pointerId,
      startWidth: currentWidth,
      startX: event.clientX,
    };
  }, []);

  const mobileWorkbenchContent = shouldUseWorkbenchSheet ? (
    <WorkspaceWorkbench
      environmentId={props.environmentId}
      threadId={props.threadId}
      embedded
      onSwitchToChat={() => setMobilePane("chat")}
    />
  ) : null;
  const chatViewProps = {
    environmentId: props.environmentId,
    threadId: props.threadId,
    inlineWorkbenchAvailable: !shouldUseWorkbenchSheet,
    inlineWorkbenchOpen,
    onInlineWorkbenchOpenChange: setInlineWorkbenchOpen,
    mobileWorkbenchAvailable: shouldUseWorkbenchSheet,
    mobileWorkbenchPane: mobilePane,
    onMobileWorkbenchPaneChange: setMobilePane,
    ...(mobileWorkbenchContent ? { mobileWorkbenchContent } : {}),
  };
  const inlineSplitActive = !shouldUseWorkbenchSheet && inlineWorkbenchOpen;

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div ref={inlineLayoutRef} className="flex h-full min-h-0 min-w-0">
        <div
          data-thread-message-pane="true"
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            inlineSplitActive ? "shrink-0 grow-0" : null,
          )}
          style={inlineSplitActive ? { flexBasis: inlineChatPaneWidth } : undefined}
        >
          {props.routeKind === "draft" ? (
            <LazyChatView {...chatViewProps} routeKind="draft" draftId={props.draftId} />
          ) : (
            <LazyChatView {...chatViewProps} routeKind="server" />
          )}
        </div>
        {!shouldUseWorkbenchSheet ? (
          <>
            {inlineWorkbenchOpen ? (
              <div
                aria-label="Resize chat and workbench panes"
                aria-orientation="vertical"
                className={PANE_RESIZE_RAIL_CLASS}
                role="separator"
                tabIndex={0}
                onPointerDown={startInlineSplitResize}
              />
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col" hidden={!inlineWorkbenchOpen}>
              <WorkspaceWorkbench
                environmentId={props.environmentId}
                threadId={props.threadId}
                visible={inlineWorkbenchOpen}
              />
            </div>
          </>
        ) : null}
      </div>
    </SidebarInset>
  );
}
