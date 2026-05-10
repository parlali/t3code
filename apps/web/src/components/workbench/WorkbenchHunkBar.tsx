import { memo } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export interface ParsedHunk {
  readonly id: string;
  readonly label: string;
  readonly patch: string;
}

interface WorkbenchHunkBarProps {
  readonly hunks: readonly ParsedHunk[];
  readonly isMobile: boolean;
  readonly onApplyPatch: (patch: string, mode: "stage" | "revert") => void;
}

export const WorkbenchHunkBar = memo(function WorkbenchHunkBar({
  hunks,
  isMobile,
  onApplyPatch,
}: WorkbenchHunkBarProps) {
  if (hunks.length === 0) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1",
        isMobile && "gap-0.5 px-1.5 py-0.5",
      )}
    >
      {hunks.map((hunk) => (
        <div
          key={hunk.id}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-1 text-[11px] text-muted-foreground",
            isMobile && "gap-0.5 px-1 py-0.5 text-[10px]",
          )}
        >
          <span className={cn(isMobile && "hidden min-[400px]:inline")}>{hunk.label}</span>
          <Button
            size="xs"
            variant="ghost"
            className={cn(isMobile && "h-5 px-1 text-[10px]")}
            onClick={() => onApplyPatch(hunk.patch, "stage")}
          >
            Stage
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className={cn(isMobile && "h-5 px-1 text-[10px]")}
            onClick={() => onApplyPatch(hunk.patch, "revert")}
          >
            Revert
          </Button>
        </div>
      ))}
    </div>
  );
});
