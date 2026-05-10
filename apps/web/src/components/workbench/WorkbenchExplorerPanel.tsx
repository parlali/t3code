import { memo, type ReactNode } from "react";
import type { TurnDiffTreeNode } from "../../lib/turnDiffTree";
import {
  PANE_HEADER_CLASS,
  PANE_HEADER_PADDING_CLASS,
  PaneSidebarToggleButton,
} from "../ui/pane-chrome";
import { ExplorerModeToggle, type ExplorerMode } from "./ExplorerModeToggle";
import { ExplorerTree, type TreeNode } from "./ExplorerTree";
import { ChangesTree } from "./ChangesTree";

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
  readonly theme: "light" | "dark";
  readonly listError: Error | null;
  readonly gitError: Error | null;
  readonly changedFilesCount: number;
  readonly onToggleExpanded: (path: string) => void;
  readonly onToggleCollapsedChangeDirectory: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
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
  theme,
  listError,
  gitError,
  changedFilesCount,
  onToggleExpanded,
  onToggleCollapsedChangeDirectory,
  onOpenFile,
  showCollapseButton = false,
  onCollapse,
  headerSlot,
}: WorkbenchExplorerPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`${PANE_HEADER_CLASS} ${PANE_HEADER_PADDING_CLASS} gap-2`}>
        <ExplorerModeToggle mode={mode} onModeChange={onModeChange} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {mode === "files" ? "Files" : "Changes"}
        </span>
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
      <div className="min-h-0 flex-1 overflow-auto px-1 py-2">
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
            theme={theme}
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
            theme={theme}
            onToggleDirectory={onToggleCollapsedChangeDirectory}
            onOpenFile={onOpenFile}
          />
        )}
      </div>
    </div>
  );
});
