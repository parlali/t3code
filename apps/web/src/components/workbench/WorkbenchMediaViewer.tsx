import { FileWarningIcon } from "lucide-react";
import { memo } from "react";

import type { ProjectReadFileMediaKind } from "@t3tools/contracts";
import { basename } from "./workbenchUtils";

interface WorkbenchMediaViewerProps {
  readonly dataUrl: string;
  readonly mediaKind: ProjectReadFileMediaKind;
  readonly mediaType: string;
  readonly path: string;
}

export const WorkbenchMediaViewer = memo(function WorkbenchMediaViewer({
  dataUrl,
  mediaKind,
  mediaType,
  path,
}: WorkbenchMediaViewerProps) {
  const name = basename(path);

  if (mediaKind === "pdf") {
    return (
      <object
        aria-label={`${name} preview`}
        className="h-full w-full bg-background"
        data={dataUrl}
        type={mediaType}
      >
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
          <div className="flex max-w-sm flex-col items-center gap-2">
            <FileWarningIcon className="size-5" />
            <p>{mediaType} preview is unavailable.</p>
          </div>
        </div>
      </object>
    );
  }

  if (mediaKind === "image") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-muted/10 p-4">
        <img
          alt={name}
          className="max-h-full max-w-full object-contain"
          decoding="async"
          src={dataUrl}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      <div className="flex max-w-sm flex-col items-center gap-2">
        <FileWarningIcon className="size-5" />
        <p>{mediaType} preview is unavailable.</p>
      </div>
    </div>
  );
});
