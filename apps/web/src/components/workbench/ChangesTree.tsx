import { ChevronRightIcon, MinusIcon, PlusIcon, Undo2Icon } from "lucide-react";
import { memo } from "react";
import { cn } from "../../lib/utils";
import type { TurnDiffTreeNode } from "../../lib/turnDiffTree";
import { DiffStatLabel, hasNonZeroStat } from "../chat/DiffStatLabel";
import { WorkbenchTreeIcon } from "./WorkbenchTreeIcon";

interface ChangesTreeProps {
  readonly nodes: readonly TurnDiffTreeNode[];
  readonly collapsedDirectories: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly onToggleDirectory: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onRevertFile?: ((path: string) => void) | undefined;
  readonly onStageFile?: ((path: string) => void) | undefined;
  readonly onUnstageFile?: ((path: string) => void) | undefined;
  readonly onRevertPaths?: ((paths: readonly string[]) => void) | undefined;
  readonly onStagePaths?: ((paths: readonly string[]) => void) | undefined;
  readonly onUnstagePaths?: ((paths: readonly string[]) => void) | undefined;
  readonly statusByPath?: ReadonlyMap<string, string> | undefined;
  readonly actionsDisabled?: boolean | undefined;
}

function collectPaths(node: TurnDiffTreeNode): string[] {
  if (node.kind === "file") return [node.path];
  return node.children.flatMap((child) => collectPaths(child));
}

export const ChangesTree = memo(function ChangesTree(props: ChangesTreeProps) {
  const renderNode = (node: TurnDiffTreeNode, depth: number) => {
    const leftPadding = 8 + depth * 14;

    if (node.kind === "directory") {
      const expanded = !props.collapsedDirectories.has(node.path);
      const descendantPaths = collectPaths(node);
      return (
        <div key={`directory:${node.path}`}>
          <div
            className="group flex h-7 w-full items-center rounded-sm pr-1 text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground"
            title={node.path}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
              style={{ paddingLeft: leftPadding }}
              onClick={() => props.onToggleDirectory(node.path)}
            >
              <ChevronRightIcon
                className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")}
              />
              <WorkbenchTreeIcon kind="directory" expanded={expanded} />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {hasNonZeroStat(node.stat) ? (
                <span className="shrink-0 text-[10px] tabular-nums">
                  <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
                </span>
              ) : null}
            </button>
            {(props.onStagePaths || props.onUnstagePaths || props.onRevertPaths) && (
              <div className="ml-1 hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
                {props.onStagePaths && (
                  <button
                    type="button"
                    className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                    aria-label={`Stage all changes in ${node.path}`}
                    disabled={props.actionsDisabled}
                    title="Stage all"
                    onClick={() => props.onStagePaths?.(descendantPaths)}
                  >
                    <PlusIcon className="size-3.5" />
                  </button>
                )}
                {props.onUnstagePaths && (
                  <button
                    type="button"
                    className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                    aria-label={`Unstage all changes in ${node.path}`}
                    disabled={props.actionsDisabled}
                    title="Unstage all"
                    onClick={() => props.onUnstagePaths?.(descendantPaths)}
                  >
                    <MinusIcon className="size-3.5" />
                  </button>
                )}
                {props.onRevertPaths && (
                  <button
                    type="button"
                    className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                    aria-label={`Discard all changes in ${node.path}`}
                    disabled={props.actionsDisabled}
                    title="Discard all"
                    onClick={() => props.onRevertPaths?.(descendantPaths)}
                  >
                    <Undo2Icon className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
          {expanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    const status = props.statusByPath?.get(node.path);
    return (
      <div
        key={`file:${node.path}`}
        className={cn(
          "group flex h-7 w-full items-center rounded-sm pr-1 text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground",
          props.selectedPath === node.path && "bg-accent text-foreground",
        )}
        title={node.path}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          style={{ paddingLeft: leftPadding }}
          onClick={() => props.onOpenFile(node.path)}
        >
          <span className="w-3 shrink-0" />
          <WorkbenchTreeIcon kind="change-file" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {status ? (
            <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-muted-foreground">
              {status}
            </span>
          ) : null}
          {node.stat ? (
            <span className="shrink-0 text-[10px] tabular-nums">
              <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
            </span>
          ) : null}
        </button>
        {(props.onStageFile || props.onUnstageFile || props.onRevertFile) && (
          <div className="ml-1 hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
            {props.onStageFile && (
              <button
                type="button"
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                aria-label={`Stage ${node.path}`}
                disabled={props.actionsDisabled}
                title="Stage"
                onClick={() => props.onStageFile?.(node.path)}
              >
                <PlusIcon className="size-3.5" />
              </button>
            )}
            {props.onUnstageFile && (
              <button
                type="button"
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                aria-label={`Unstage ${node.path}`}
                disabled={props.actionsDisabled}
                title="Unstage"
                onClick={() => props.onUnstageFile?.(node.path)}
              >
                <MinusIcon className="size-3.5" />
              </button>
            )}
            {props.onRevertFile && (
              <button
                type="button"
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                aria-label={`Revert ${node.path}`}
                disabled={props.actionsDisabled}
                title="Revert"
                onClick={() => props.onRevertFile?.(node.path)}
              >
                <Undo2Icon className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return <>{props.nodes.map((node) => renderNode(node, 0))}</>;
});
