import {
  FileDiffIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  type LucideIcon,
} from "lucide-react";
import { memo } from "react";
import { cn } from "../../lib/utils";

type WorkbenchTreeIconKind = "change-file" | "directory" | "file";

interface WorkbenchTreeIconProps {
  readonly className?: string;
  readonly expanded?: boolean;
  readonly kind: WorkbenchTreeIconKind;
}

export const WorkbenchTreeIcon = memo(function WorkbenchTreeIcon({
  className,
  expanded = false,
  kind,
}: WorkbenchTreeIconProps) {
  const Icon = iconForTreeNode(kind, expanded);
  return <Icon className={cn("size-3.5 shrink-0 text-muted-foreground/85", className)} />;
});

function iconForTreeNode(kind: WorkbenchTreeIconKind, expanded: boolean): LucideIcon {
  switch (kind) {
    case "change-file":
      return FileDiffIcon;
    case "directory":
      return expanded ? FolderOpenIcon : FolderIcon;
    case "file":
      return FileTextIcon;
  }
}
