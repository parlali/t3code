import { ChevronRightIcon, FileCodeIcon } from "lucide-react";
import { memo } from "react";
import { basename } from "./workbenchUtils";

interface WorkbenchBreadcrumbsProps {
  readonly cwd: string | null;
  readonly path: string | null;
}

export const WorkbenchBreadcrumbs = memo(function WorkbenchBreadcrumbs({
  cwd,
  path,
}: WorkbenchBreadcrumbsProps) {
  if (!path && !cwd) return null;

  const workspaceName = cwd ? basename(cwd) : null;
  const segments = path ? path.split("/").filter(Boolean) : [];
  let segmentPath = "";

  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden text-xs text-muted-foreground">
      {workspaceName && (
        <span className="max-w-32 shrink-0 truncate font-medium text-foreground/80">
          {workspaceName}
        </span>
      )}
      {workspaceName && segments.length > 0 && <BreadcrumbSeparator />}
      {segments.map((segment, index) => {
        segmentPath = segmentPath ? `${segmentPath}/${segment}` : segment;
        const isLast = index === segments.length - 1;
        return (
          <span key={segmentPath} className="flex min-w-0 items-center">
            {isLast && <FileCodeIcon className="mr-1 size-3 shrink-0 opacity-70" />}
            <span
              className={
                isLast
                  ? "min-w-0 truncate text-foreground/90"
                  : "max-w-36 shrink-0 truncate text-muted-foreground"
              }
            >
              {segment}
            </span>
            {!isLast && <BreadcrumbSeparator />}
          </span>
        );
      })}
      {!path && cwd && <span className="ml-2 truncate">{cwd}</span>}
    </div>
  );
});

function BreadcrumbSeparator() {
  return <ChevronRightIcon className="mx-1 size-3 shrink-0 opacity-60" />;
}
