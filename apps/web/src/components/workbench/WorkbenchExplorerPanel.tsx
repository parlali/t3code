import { FilePlusIcon, FolderPlusIcon, RefreshCwIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  PANE_HEADER_CLASS,
  PANE_ICON_BUTTON_CLASS,
  PANE_HEADER_PADDING_CLASS,
} from "../ui/pane-chrome";
import { ShellHeaderSlotPortal } from "../shell/shellHeaderSlot";
import {
  ExplorerTree,
  type CreateEntryKind,
  type ExplorerCreateDraft,
  type TreeNode,
} from "./ExplorerTree";

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
}

interface WorkbenchExplorerPanelProps {
  readonly cwd: string | null;
  readonly tree: readonly TreeNode[];
  readonly expanded: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly listError: Error | null;
  readonly isRefreshing?: boolean;
  readonly createDraft?: ExplorerCreateDraft | null;
  readonly createParentPath?: string | null;
  readonly onToggleExpanded: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onStartCreate?: ((kind: CreateEntryKind, parentPath: string | null) => void) | undefined;
  readonly onSubmitCreate?: ((draft: ExplorerCreateDraft, name: string) => void) | undefined;
  readonly onCancelCreate?: (() => void) | undefined;
  readonly onRefresh?: (() => void | Promise<void>) | undefined;
  /**
   * When true, the "Files" title + create/refresh actions are teleported onto
   * the unified top bar instead of rendering an inline header row.
   */
  readonly hoistHeader?: boolean;
}

export const WorkbenchExplorerPanel = memo(function WorkbenchExplorerPanel({
  cwd,
  tree,
  expanded,
  selectedPath,
  listError,
  isRefreshing = false,
  createDraft = null,
  createParentPath = null,
  onToggleExpanded,
  onOpenFile,
  onStartCreate,
  onSubmitCreate,
  onCancelCreate,
  onRefresh,
  hoistHeader = false,
}: WorkbenchExplorerPanelProps) {
  const headerActions = (
    <>
      {cwd && onStartCreate && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className={PANE_ICON_BUTTON_CLASS}
            aria-label="New file"
            title="New file"
            disabled={createDraft?.isSaving}
            onClick={() => onStartCreate("file", createParentPath)}
          >
            <FilePlusIcon className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={PANE_ICON_BUTTON_CLASS}
            aria-label="New folder"
            title="New folder"
            disabled={createDraft?.isSaving}
            onClick={() => onStartCreate("directory", createParentPath)}
          >
            <FolderPlusIcon className="size-3.5" />
          </Button>
        </>
      )}
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
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {hoistHeader ? (
        <ShellHeaderSlotPortal order={20}>
          <span className="shrink-0 text-sm font-medium text-foreground">Files</span>
          {headerActions}
        </ShellHeaderSlotPortal>
      ) : (
        <div className={`${PANE_HEADER_CLASS} ${PANE_HEADER_PADDING_CLASS} gap-2`}>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Files</span>
          {headerActions}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-[4rem] overflow-auto px-1 py-2">
          {!cwd ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No project selected.
            </div>
          ) : listError ? (
            <div className="px-3 py-8 text-center text-xs text-destructive">
              {getErrorMessage(listError)}
            </div>
          ) : (
            <ExplorerTree
              nodes={tree}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggleExpanded}
              onOpenFile={onOpenFile}
              createDraft={createDraft}
              onStartCreate={onStartCreate}
              onSubmitCreate={onSubmitCreate}
              onCancelCreate={onCancelCreate}
            />
          )}
        </div>
      </div>
    </div>
  );
});
