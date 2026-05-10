import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "../../lib/utils";
import { VscodeEntryIcon } from "../chat/VscodeEntryIcon";

export interface TreeNode {
  readonly path: string;
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly children: TreeNode[];
}

interface ExplorerTreeProps {
  readonly nodes: readonly TreeNode[];
  readonly expanded: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly theme: "light" | "dark";
  readonly onToggle: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
}

export const ExplorerTree = memo(function ExplorerTree(props: ExplorerTreeProps) {
  const renderNode = (node: TreeNode, depth: number) => {
    const expanded = props.expanded.has(node.path);
    return (
      <div key={node.path}>
        <button
          type="button"
          className={cn(
            "flex h-7 w-full items-center gap-1.5 rounded-sm px-2 text-left text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground",
            props.selectedPath === node.path && "bg-accent text-foreground",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() =>
            node.kind === "directory" ? props.onToggle(node.path) : props.onOpenFile(node.path)
          }
          title={node.path}
        >
          {node.kind === "directory" ? (
            expanded ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )
          ) : (
            <span className="w-3" />
          )}
          <VscodeEntryIcon
            pathValue={node.path}
            kind={node.kind}
            theme={props.theme}
            className="size-3.5"
          />
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
        {node.kind === "directory" && expanded
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return <>{props.nodes.map((node) => renderNode(node, 0))}</>;
});
