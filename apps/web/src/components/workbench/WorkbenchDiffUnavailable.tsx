import { FileWarningIcon } from "lucide-react";
import { memo } from "react";

interface WorkbenchDiffUnavailableProps {
  readonly mediaType: string;
}

export const WorkbenchDiffUnavailable = memo(function WorkbenchDiffUnavailable({
  mediaType,
}: WorkbenchDiffUnavailableProps) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      <div className="flex max-w-sm flex-col items-center gap-2">
        <FileWarningIcon className="size-5" />
        <p>Diff preview is unavailable for {mediaType} files.</p>
      </div>
    </div>
  );
});
