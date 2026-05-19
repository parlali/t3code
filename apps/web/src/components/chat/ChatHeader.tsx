import { FilesIcon, MessageSquareIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { PaneSidebarToggleButton } from "../ui/pane-chrome";

interface ChatHeaderProps {
  readonly activeThreadTitle: string;
  readonly inlineWorkbenchAvailable?: boolean;
  readonly inlineWorkbenchOpen?: boolean;
  readonly onInlineWorkbenchOpenChange?: (open: boolean) => void;
  readonly mobileWorkbenchAvailable?: boolean;
  readonly mobileWorkbenchPane?: "chat" | "workbench";
  readonly onMobileWorkbenchPaneChange?: (pane: "chat" | "workbench") => void;
}

const ACTIVE_BUTTON_CLASS = "bg-accent/80 text-foreground dark:bg-input/70";

const MobileViewToggle = memo(function MobileViewToggle({
  pane,
  onPaneChange,
}: {
  pane: "chat" | "workbench";
  onPaneChange: (pane: "chat" | "workbench") => void;
}) {
  return (
    <Group aria-label="Mobile workspace view" className="shrink-0">
      <Button
        size="icon-sm"
        variant="outline"
        className={cn("size-8", pane === "chat" && ACTIVE_BUTTON_CLASS)}
        aria-label="Show chat"
        aria-pressed={pane === "chat"}
        onClick={() => onPaneChange("chat")}
      >
        <MessageSquareIcon className="size-3.5" />
      </Button>
      <GroupSeparator />
      <Button
        size="icon-sm"
        variant="outline"
        className={cn("size-8", pane === "workbench" && ACTIVE_BUTTON_CLASS)}
        aria-label="Show files"
        aria-pressed={pane === "workbench"}
        onClick={() => onPaneChange("workbench")}
      >
        <FilesIcon className="size-3.5" />
      </Button>
    </Group>
  );
});

export const ChatHeader = memo(function ChatHeader({
  activeThreadTitle,
  inlineWorkbenchAvailable = false,
  inlineWorkbenchOpen = true,
  onInlineWorkbenchOpenChange,
  mobileWorkbenchAvailable = false,
  mobileWorkbenchPane = "chat",
  onMobileWorkbenchPaneChange,
}: ChatHeaderProps) {
  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-medium text-foreground">
          {activeThreadTitle.trim().length > 0 ? activeThreadTitle : "Untitled thread"}
        </h1>
      </div>
      {inlineWorkbenchAvailable && onInlineWorkbenchOpenChange ? (
        <PaneSidebarToggleButton
          side="right"
          expanded={inlineWorkbenchOpen}
          label={inlineWorkbenchOpen ? "Collapse workbench" : "Expand workbench"}
          onClick={() => onInlineWorkbenchOpenChange(!inlineWorkbenchOpen)}
        />
      ) : null}
      {mobileWorkbenchAvailable && onMobileWorkbenchPaneChange ? (
        <MobileViewToggle pane={mobileWorkbenchPane} onPaneChange={onMobileWorkbenchPaneChange} />
      ) : null}
    </div>
  );
});
