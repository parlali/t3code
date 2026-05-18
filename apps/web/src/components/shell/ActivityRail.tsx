import {
  Code2Icon,
  FilesIcon,
  GitBranchIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PanelBottomIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuGroup, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { type ShellPanelMode, useShellStore } from "./shellStore";
import { useNavigateToShellWorkspace } from "./useShellNavigation";

interface RailItem {
  readonly mode: ShellPanelMode;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly disabled?: boolean;
}

const PRIMARY_ITEMS: readonly RailItem[] = [
  { mode: "threads", label: "Threads", icon: MessageSquareTextIcon },
  { mode: "explorer", label: "Explorer", icon: FilesIcon },
  { mode: "changes", label: "Changes", icon: GitBranchIcon },
  { mode: "search", label: "Search", icon: SearchIcon, disabled: true },
  { mode: "settings", label: "Settings", icon: SettingsIcon },
];

const MOBILE_VISIBLE_ITEMS: readonly RailItem[] = PRIMARY_ITEMS.slice(0, 3);
const MOBILE_MORE_ITEMS: readonly RailItem[] = PRIMARY_ITEMS.slice(3);

function RailButton({
  item,
  mobile = false,
}: {
  readonly item: RailItem;
  readonly mobile?: boolean;
}) {
  const activeMode = useShellStore((state) => state.activeMode);
  const lastWorkspaceRoute = useShellStore((state) => state.lastWorkspaceRoute);
  const setActiveMode = useShellStore((state) => state.setActiveMode);
  const setPanelOpen = useShellStore((state) => state.setPanelOpen);
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const navigateToWorkspace = useNavigateToShellWorkspace();
  const active = activeMode === item.mode;
  const Icon = item.icon;

  const onClick = () => {
    if (item.disabled) return;
    setActiveMode(item.mode);
    setPanelOpen(true);
    if (item.mode === "settings") {
      void navigate({ to: "/settings/general" });
      return;
    }
    if (pathname.startsWith("/settings")) {
      void navigateToWorkspace(lastWorkspaceRoute);
    }
  };

  const button = (
    <Button
      size={mobile ? "sm" : "icon-sm"}
      variant={active ? "secondary" : "ghost"}
      className={cn(
        mobile
          ? "h-11 min-w-0 flex-1 flex-col gap-0.5 rounded-none px-1 text-[10px]"
          : "size-9 rounded-md",
        active && "bg-accent text-foreground",
      )}
      aria-label={item.label}
      aria-pressed={active}
      disabled={item.disabled}
      onClick={onClick}
    >
      <Icon className={mobile ? "size-4" : "size-4"} />
      {mobile ? <span className="max-w-full truncate">{item.label}</span> : null}
    </Button>
  );

  if (mobile) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup side="right">
        {item.disabled ? `${item.label} unavailable` : item.label}
      </TooltipPopup>
    </Tooltip>
  );
}

export function ActivityRail() {
  const setPanelOpen = useShellStore((state) => state.setPanelOpen);
  const setActiveMode = useShellStore((state) => state.setActiveMode);
  const lastWorkspaceRoute = useShellStore((state) => state.lastWorkspaceRoute);
  const terminalActions = useShellStore((state) => state.terminalActions);
  const setBottomPanelOpen = useShellStore((state) => state.setBottomPanelOpen);
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const navigateToWorkspace = useNavigateToShellWorkspace();

  return (
    <>
      <nav
        aria-label="Activity"
        className="hidden h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-card px-1.5 py-2 text-card-foreground md:flex"
      >
        <div className="flex h-9 w-full items-center justify-center">
          <Code2Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="flex w-full flex-1 flex-col items-center gap-1">
          {PRIMARY_ITEMS.map((item) => (
            <RailButton key={item.mode} item={item} />
          ))}
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
          <TooltipPopup side="right">
            {terminalActions?.terminalToggleShortcutLabel ?? "Toggle terminal"}
          </TooltipPopup>
        </Tooltip>
      </nav>

      <nav
        aria-label="Mobile activity"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3rem+env(safe-area-inset-bottom))] border-t border-border bg-card pb-safe text-card-foreground md:hidden"
      >
        <Button
          size="sm"
          variant="ghost"
          className="h-11 min-w-0 flex-1 flex-col gap-0.5 rounded-none px-1 text-[10px]"
          aria-label="Chat"
          onClick={() => {
            setActiveMode("threads");
            setPanelOpen(false);
            if (pathname.startsWith("/settings")) {
              void navigateToWorkspace(lastWorkspaceRoute);
            }
          }}
        >
          <MessageSquareTextIcon className="size-4" />
          <span>Chat</span>
        </Button>
        {MOBILE_VISIBLE_ITEMS.map((item) => (
          <RailButton key={item.mode} item={item} mobile />
        ))}
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                className="h-11 min-w-0 flex-1 flex-col gap-0.5 rounded-none px-1 text-[10px]"
                aria-label="More"
              >
                <MoreHorizontalIcon className="size-4" />
                <span>More</span>
              </Button>
            }
          />
          <MenuPopup side="top" align="end" className="w-44">
            <MenuGroup>
              {MOBILE_MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <MenuItem
                    key={item.mode}
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      setActiveMode(item.mode);
                      setPanelOpen(true);
                      if (item.mode === "settings") {
                        void navigate({ to: "/settings/general" });
                        return;
                      }
                      if (pathname.startsWith("/settings")) {
                        void navigateToWorkspace(lastWorkspaceRoute);
                      }
                    }}
                  >
                    <Icon className="size-3.5" />
                    <span>{item.label}</span>
                  </MenuItem>
                );
              })}
            </MenuGroup>
            <MenuSeparator />
            <MenuItem
              disabled={!terminalActions?.terminalAvailable}
              onClick={() => {
                terminalActions?.onToggleTerminal();
                setBottomPanelOpen(!terminalActions?.terminalOpen);
              }}
            >
              <PanelBottomIcon className="size-3.5" />
              Toggle terminal
            </MenuItem>
          </MenuPopup>
        </Menu>
      </nav>
    </>
  );
}
