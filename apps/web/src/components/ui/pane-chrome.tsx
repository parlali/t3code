import { PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "~/lib/utils";
import { Button } from "./button";

export const PANE_HEADER_CLASS =
  "flex h-12 shrink-0 items-center border-b border-border bg-card/40";
export const PANE_HEADER_PADDING_CLASS = "px-3";
export const PANE_ICON_BUTTON_CLASS = "size-7 shrink-0";
export const PANE_RESIZE_RAIL_CLASS =
  "group relative z-1 w-0 shrink-0 touch-none select-none cursor-col-resize bg-transparent outline-none before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border/70 before:transition-colors after:absolute after:inset-y-0 after:-left-2 after:w-4 after:cursor-col-resize after:bg-transparent hover:before:bg-primary/45 focus-visible:before:bg-primary/45";

export const PANE_RESIZE_RAIL_HORIZONTAL_CLASS =
  "group relative z-1 h-1 shrink-0 touch-none select-none cursor-row-resize bg-transparent outline-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-border/70 before:transition-colors hover:before:bg-primary/45 focus-visible:before:bg-primary/45";

interface PaneSidebarToggleButtonProps extends ComponentPropsWithoutRef<typeof Button> {
  readonly expanded: boolean;
  readonly label: string;
}

export const PaneSidebarToggleButton = forwardRef<HTMLButtonElement, PaneSidebarToggleButtonProps>(
  function PaneSidebarToggleButton(
    { expanded, label, className, title, "aria-label": ariaLabel, ...buttonProps },
    ref,
  ) {
    const Icon = expanded ? PanelLeftCloseIcon : PanelLeftIcon;

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
