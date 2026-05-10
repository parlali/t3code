import { CheckIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { memo } from "react";
import { Button } from "../ui/button";

interface WorkbenchToolbarActionsProps {
  readonly activeTabPath: string | null;
  readonly activeTabKind: "file" | "diff" | null;
  readonly isDirty: boolean;
  readonly onSave: () => void;
  readonly onStage: (path: string) => void;
  readonly onRevert: (path: string) => void;
  readonly variant?: "desktop" | "mobile";
}

export const WorkbenchToolbarActions = memo(function WorkbenchToolbarActions({
  activeTabPath,
  activeTabKind,
  isDirty,
  onSave,
  onStage,
  onRevert,
  variant = "desktop",
}: WorkbenchToolbarActionsProps) {
  if (!activeTabPath) return null;

  if (variant === "mobile") {
    return (
      <>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          onClick={onSave}
          disabled={!isDirty}
          aria-label="Save"
          title="Save file"
        >
          <SaveIcon className="size-3.5" />
        </Button>
        {activeTabKind === "diff" && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={() => onStage(activeTabPath)}
              aria-label="Stage"
              title="Stage file"
            >
              <CheckIcon className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={() => onRevert(activeTabPath)}
              aria-label="Revert"
              title="Revert file"
            >
              <RotateCcwIcon className="size-3.5" />
            </Button>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        onClick={onSave}
        disabled={!isDirty}
        aria-label="Save file"
        title="Save file"
      >
        <SaveIcon className="size-3" />
      </Button>
      {activeTabKind === "diff" && (
        <>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onStage(activeTabPath)}
            aria-label="Stage file"
            title="Stage file"
          >
            <CheckIcon className="size-3" />
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onRevert(activeTabPath)}
            aria-label="Revert file"
            title="Revert file"
          >
            <RotateCcwIcon className="size-3" />
          </Button>
        </>
      )}
    </>
  );
});
