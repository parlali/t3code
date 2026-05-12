import { RefreshCwIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { VcsCommitGraphCommit } from "@t3tools/contracts";
import type { TurnDiffTreeNode } from "../../lib/turnDiffTree";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  PANE_HEADER_CLASS,
  PANE_ICON_BUTTON_CLASS,
  PANE_HEADER_PADDING_CLASS,
  PANE_RESIZE_RAIL_HORIZONTAL_CLASS,
  PaneSidebarToggleButton,
} from "../ui/pane-chrome";
import { startResizeInteraction, type ResizeInteractionHandle } from "../ui/resize-interaction";
import { ExplorerModeToggle, type ExplorerMode } from "./ExplorerModeToggle";
import { ExplorerTree, type TreeNode } from "./ExplorerTree";
import { ChangesTree } from "./ChangesTree";
import { WorkbenchCommitGraph } from "./WorkbenchCommitGraph";
import {
  WORKBENCH_GRAPH_HEIGHT_RATIO_STORAGE_KEY,
  DEFAULT_GRAPH_HEIGHT_RATIO,
  clampGraphHeightRatio,
} from "./workbenchUtils";

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
}

interface WorkbenchExplorerPanelProps {
  readonly cwd: string | null;
  readonly mode: ExplorerMode;
  readonly onModeChange: (mode: ExplorerMode) => void;
  readonly tree: readonly TreeNode[];
  readonly changedTree: readonly TurnDiffTreeNode[];
  readonly expanded: ReadonlySet<string>;
  readonly collapsedChangeDirectories: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly listError: Error | null;
  readonly gitError: Error | null;
  readonly commitGraphCommits: readonly VcsCommitGraphCommit[];
  readonly commitGraphError: Error | null;
  readonly changedFilesCount: number;
  readonly commitGraphTruncated?: boolean;
  readonly isRefreshing?: boolean;
  readonly isCommitGraphLoading?: boolean;
  readonly onToggleExpanded: (path: string) => void;
  readonly onToggleCollapsedChangeDirectory: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onRefresh?: () => void | Promise<void>;
  readonly showCollapseButton?: boolean;
  readonly onCollapse?: () => void;
  readonly headerSlot?: ReactNode;
}

export const WorkbenchExplorerPanel = memo(function WorkbenchExplorerPanel({
  cwd,
  mode,
  onModeChange,
  tree,
  changedTree,
  expanded,
  collapsedChangeDirectories,
  selectedPath,
  listError,
  gitError,
  commitGraphCommits,
  commitGraphError,
  changedFilesCount,
  commitGraphTruncated = false,
  isRefreshing = false,
  isCommitGraphLoading = false,
  onToggleExpanded,
  onToggleCollapsedChangeDirectory,
  onOpenFile,
  onRefresh,
  showCollapseButton = false,
  onCollapse,
  headerSlot,
}: WorkbenchExplorerPanelProps) {
  const [graphRatio, setGraphRatio] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_GRAPH_HEIGHT_RATIO;
    const stored = window.localStorage.getItem(WORKBENCH_GRAPH_HEIGHT_RATIO_STORAGE_KEY);
    return stored ? clampGraphHeightRatio(Number(stored)) : DEFAULT_GRAPH_HEIGHT_RATIO;
  });
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef<ResizeInteractionHandle | null>(null);
  const graphRatioRef = useRef(graphRatio);
  graphRatioRef.current = graphRatio;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPointerMove = (event: PointerEvent) => {
      const interaction = resizingRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      event.preventDefault();
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) return;
      const graphHeight = rect.bottom - event.clientY;
      const ratio = clampGraphHeightRatio(graphHeight / rect.height);
      setGraphRatio(ratio);
    };
    const stop = (event: PointerEvent) => {
      const interaction = resizingRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      resizingRef.current = null;
      interaction.release();
      window.localStorage.setItem(
        WORKBENCH_GRAPH_HEIGHT_RATIO_STORAGE_KEY,
        String(graphRatioRef.current),
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      resizingRef.current?.release();
      resizingRef.current = null;
    };
  }, []);

  const handleRailPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    resizingRef.current?.release();
    resizingRef.current = startResizeInteraction(event, { cursor: "row-resize" });
  }, []);

  const filesBasis = `${(1 - graphRatio) * 100}%`;
  const graphBasis = `${graphRatio * 100}%`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`${PANE_HEADER_CLASS} ${PANE_HEADER_PADDING_CLASS} gap-2`}>
        <ExplorerModeToggle mode={mode} onModeChange={onModeChange} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {mode === "files" ? "Files" : "Changes"}
        </span>
        {onRefresh && (
          <Button
            size="icon"
            variant="ghost"
            className={PANE_ICON_BUTTON_CLASS}
            aria-label="Refresh explorer"
            title="Refresh explorer"
            disabled={isRefreshing}
            onClick={() => void onRefresh()}
          >
            <RefreshCwIcon className={cn("size-3.5", isRefreshing && "animate-spin")} />
          </Button>
        )}
        {showCollapseButton && onCollapse && (
          <PaneSidebarToggleButton
            type="button"
            expanded
            label="Collapse file browser"
            onClick={onCollapse}
          />
        )}
        {headerSlot}
      </div>
      <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col">
        <div
          className="min-h-[4rem] overflow-auto px-1 py-2"
          style={{ flexBasis: filesBasis, flexGrow: 0, flexShrink: 1 }}
        >
          {!cwd ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No project selected.
            </div>
          ) : mode === "files" && listError ? (
            <div className="px-3 py-8 text-center text-xs text-destructive">
              {getErrorMessage(listError)}
            </div>
          ) : mode === "files" ? (
            <ExplorerTree
              nodes={tree}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggleExpanded}
              onOpenFile={onOpenFile}
            />
          ) : gitError ? (
            <div className="px-3 py-8 text-center text-xs text-destructive">
              {getErrorMessage(gitError)}
            </div>
          ) : changedFilesCount === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No working tree changes.
            </div>
          ) : (
            <ChangesTree
              nodes={changedTree}
              collapsedDirectories={collapsedChangeDirectories}
              selectedPath={selectedPath}
              onToggleDirectory={onToggleCollapsedChangeDirectory}
              onOpenFile={onOpenFile}
            />
          )}
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize graph panel"
          className={PANE_RESIZE_RAIL_HORIZONTAL_CLASS}
          onPointerDown={handleRailPointerDown}
        />
        <div
          className="flex min-h-[4rem] flex-col"
          style={{ flexBasis: graphBasis, flexGrow: 0, flexShrink: 1 }}
        >
          <div className="flex h-7 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Graph
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <WorkbenchCommitGraph
              commits={cwd ? commitGraphCommits : []}
              error={cwd ? commitGraphError : null}
              isLoading={isCommitGraphLoading}
              truncated={commitGraphTruncated}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
