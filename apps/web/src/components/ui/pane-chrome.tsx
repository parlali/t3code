import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PanelRightCloseIcon,
  PanelRightIcon,
} from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Button } from "./button";

export const PANE_HEADER_CLASS =
  "flex h-11 shrink-0 items-center border-b border-border bg-card/40";
export const PANE_HEADER_PADDING_CLASS = "px-3";
export const PANE_ICON_BUTTON_CLASS = "size-7 shrink-0";
export const PANE_RESIZE_RAIL_CLASS =
  "group relative z-1 w-0 shrink-0 touch-none select-none cursor-col-resize bg-transparent outline-none before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border/70 before:transition-colors after:absolute after:inset-y-0 after:-left-2 after:w-4 after:cursor-col-resize after:bg-transparent hover:before:bg-primary/45 focus-visible:before:bg-primary/45";

export const PANE_RESIZE_RAIL_HORIZONTAL_CLASS =
  "group relative z-1 h-1 shrink-0 touch-none select-none cursor-row-resize bg-transparent outline-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-border/70 before:transition-colors hover:before:bg-primary/45 focus-visible:before:bg-primary/45";

interface PaneHeaderProps {
  readonly title?: ReactNode;
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function PaneHeader({ title, leading, actions, className, children }: PaneHeaderProps) {
  return (
    <div className={cn(PANE_HEADER_CLASS, PANE_HEADER_PADDING_CLASS, "gap-2", className)}>
      {children ?? (
        <>
          {leading ? <span className="shrink-0">{leading}</span> : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {title}
          </span>
          {actions ? (
            <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
          ) : null}
        </>
      )}
    </div>
  );
}

interface PaneSidebarToggleButtonProps extends ComponentPropsWithoutRef<typeof Button> {
  readonly expanded: boolean;
  readonly label: string;
  readonly side?: "left" | "right";
}

export const PaneSidebarToggleButton = forwardRef<HTMLButtonElement, PaneSidebarToggleButtonProps>(
  function PaneSidebarToggleButton(
    { expanded, label, side = "left", className, title, "aria-label": ariaLabel, ...buttonProps },
    ref,
  ) {
    const Icon =
      side === "right"
        ? expanded
          ? PanelRightCloseIcon
          : PanelRightIcon
        : expanded
          ? PanelLeftCloseIcon
          : PanelLeftIcon;

    return (
      <Button
        {...buttonProps}
        ref={ref}
        size="icon"
        variant="ghost"
        className={cn(PANE_ICON_BUTTON_CLASS, className)}
        aria-label={ariaLabel ?? label}
        title={title ?? label}
      >
        <Icon />
        <span className="sr-only">{label}</span>
      </Button>
    );
  },
);
