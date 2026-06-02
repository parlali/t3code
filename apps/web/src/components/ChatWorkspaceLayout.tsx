import { Suspense, lazy, type ComponentProps } from "react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { type DraftId } from "../composerDraftStore";
import { SidebarInset } from "./ui/sidebar";

const ChatView = lazy(() => import("./ChatView"));

const ChatViewLoadingFallback = () => (
  <div className="h-full min-h-0 bg-background text-foreground" aria-busy="true" />
);

const LazyChatView = (props: ComponentProps<typeof ChatView>) => (
  <Suspense fallback={<ChatViewLoadingFallback />}>
    <ChatView {...props} />
  </Suspense>
);

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
  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      {props.routeKind === "draft" ? (
        <LazyChatView
          environmentId={props.environmentId}
          threadId={props.threadId}
          routeKind="draft"
          draftId={props.draftId}
        />
      ) : (
        <LazyChatView
          environmentId={props.environmentId}
          threadId={props.threadId}
          routeKind="server"
        />
      )}
    </SidebarInset>
  );
}
