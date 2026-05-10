import { ChevronRightIcon, FolderClosedIcon, FolderIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "../../lib/utils";
import type { TurnDiffTreeNode } from "../../lib/turnDiffTree";
import { DiffStatLabel, hasNonZeroStat } from "../chat/DiffStatLabel";
import { VscodeEntryIcon } from "../chat/VscodeEntryIcon";

interface ChangesTreeProps {
  readonly nodes: readonly TurnDiffTreeNode[];
  readonly collapsedDirectories: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly theme: "light" | "dark";
  readonly onToggleDirectory: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
}

export const ChangesTree = memo(function ChangesTree(props: ChangesTreeProps) {
  const renderNode = (node: TurnDiffTreeNode, depth: number) => {
    const leftPadding = 8 + depth * 14;

    if (node.kind === "directory") {
      const expanded = !props.collapsedDirectories.has(node.path);
      return (
        <div key={`directory:${node.path}`}>
          <button
            type="button"
            className="group flex h-7 w-full items-center gap-1.5 rounded-sm pr-2 text-left text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground"
            style={{ paddingLeft: leftPadding }}
            onClick={() => props.onToggleDirectory(node.path)}
            title={node.path}
          >
            <ChevronRightIcon
              className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")}
            />
            {expanded ? (
              <FolderIcon className="size-3.5 shrink-0" />
            ) : (
              <FolderClosedIcon className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {hasNonZeroStat(node.stat) ? (
              <span className="shrink-0 text-[10px] tabular-nums">
                <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
              </span>
            ) : null}
          </button>
          {expanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    return (
      <button
        key={`file:${node.path}`}
        type="button"
        className={cn(
          "flex h-7 w-full items-center gap-1.5 rounded-sm pr-2 text-left text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground",
          props.selectedPath === node.path && "bg-accent text-foreground",
        )}
        style={{ paddingLeft: leftPadding }}
        onClick={() => props.onOpenFile(node.path)}
        title={node.path}
      >
        <span className="w-3 shrink-0" />
        <VscodeEntryIcon
          pathValue={node.path}
          kind="file"
          theme={props.theme}
          className="size-3.5 shrink-0"
        />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.stat ? (
          <span className="shrink-0 text-[10px] tabular-nums">
            <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
          </span>
        ) : null}
      </button>
    );
  };

  return <>{props.nodes.map((node) => renderNode(node, 0))}</>;
});
