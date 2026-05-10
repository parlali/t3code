import { FilesIcon, GitBranchIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";

export type ExplorerMode = "files" | "changes";

interface ExplorerModeToggleProps {
  readonly mode: ExplorerMode;
  readonly onModeChange: (mode: ExplorerMode) => void;
  readonly size?: "sm" | "md";
}

export const ExplorerModeToggle = memo(function ExplorerModeToggle({
  mode,
  onModeChange,
  size = "sm",
}: ExplorerModeToggleProps) {
  const iconSize = size === "sm" ? "size-3" : "size-3.5";
  const buttonSize = size === "sm" ? "h-7 w-8" : "size-8";
  const activeClass = "bg-accent/80 text-foreground dark:bg-input/70";

  return (
    <Group aria-label="Explorer mode">
      <Button
        size="icon-sm"
        variant="outline"
        className={cn(buttonSize, mode === "files" && activeClass)}
        aria-label="Files"
        aria-pressed={mode === "files"}
        title="Files"
        onClick={() => onModeChange("files")}
      >
        <FilesIcon className={iconSize} />
      </Button>
      <GroupSeparator />
      <Button
        size="icon-sm"
        variant="outline"
        className={cn(buttonSize, mode === "changes" && activeClass)}
        aria-label="Changes"
        aria-pressed={mode === "changes"}
        title="Changes"
        onClick={() => onModeChange("changes")}
      >
        <GitBranchIcon className={iconSize} />
      </Button>
    </Group>
  );
});
