import type { ProjectEntriesStreamEvent, ProjectEntry, VcsStatusResult } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Schema from "effect/Schema";
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  GitPullRequestIcon,
  Loader2Icon,
  MinusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";

import { ensureEnvironmentApi } from "../../environmentApi";
import { gitCommitGraphQueryOptions } from "../../lib/gitReactQuery";
import { useGitStatus } from "../../lib/gitStatusState";
import { projectListEntriesQueryOptions } from "../../lib/projectReactQuery";
import { buildTurnDiffTree } from "../../lib/turnDiffTree";
import { cn, randomUUID } from "../../lib/utils";
import { refreshWorkspaceTarget, useProjectEntriesSubscription } from "../../lib/workspaceRefresh";
import { readLocalApi } from "../../localApi";
import { requestWorkbenchOpen, useWorkbenchSelection } from "../../workbenchEvents";
import { getLocalStorageItem, setLocalStorageItem } from "../../hooks/useLocalStorage";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuGroup, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { PANE_RESIZE_RAIL_HORIZONTAL_CLASS } from "../ui/pane-chrome";
import { startResizeInteraction, type ResizeInteractionHandle } from "../ui/resize-interaction";
import { Textarea } from "../ui/textarea";
import {
  buildNewEntryRelativePath,
  buildTree,
  clampGraphHeightRatio,
  DEFAULT_GRAPH_HEIGHT_RATIO,
  parentPath,
  relativePathAncestors,
  ChangesTree,
  WORKBENCH_GRAPH_HEIGHT_RATIO_STORAGE_KEY,
  type CreateEntryKind,
  type ExplorerCreateDraft,
  WorkbenchCommitGraph,
  WorkbenchExplorerPanel,
} from "../workbench";
import { useActiveShellContext } from "./useActiveShellContext";

const EMPTY_TREE_ENTRIES: readonly ProjectEntry[] = Object.freeze([]);
const EMPTY_CHANGED_FILES: VcsStatusResult["workingTree"]["files"] = Object.freeze([]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
}

type ChangeFile = VcsStatusResult["workingTree"]["files"][number];

function changeTree(files: readonly ChangeFile[]) {
  return buildTurnDiffTree(
    files.map((file) => ({
      path: file.path,
      additions: file.insertions,
      deletions: file.deletions,
    })),
  );
}

function sectionFiles(
  files: readonly ChangeFile[],
  section: "staged" | "changes" | "untracked" | "conflicts",
) {
  if (section === "conflicts") return files.filter((file) => file.conflicted === true);
  if (section === "staged") {
    return files.filter((file) => file.staged === true && file.conflicted !== true);
  }
  if (section === "untracked") {
    return files.filter((file) => file.untracked === true && file.conflicted !== true);
  }
  return files.filter(
    (file) =>
      file.conflicted !== true &&
      file.untracked !== true &&
      (file.unstaged === true || file.staged !== true),
  );
}

function statusLabelForSection(
  file: ChangeFile,
  sectionId: "conflicts" | "staged" | "changes" | "untracked",
) {
  if (sectionId === "conflicts") return "U";
  if (sectionId === "untracked") return "A";
  if (sectionId === "staged") return file.indexStatus ?? file.status ?? "M";
  return file.worktreeStatus ?? file.status ?? "M";
}

export function SidePanelWorkbenchMode({ mode }: { readonly mode: "files" | "changes" }) {
  const queryClient = useQueryClient();
  const { activeThread, cwd, routeThreadRef } = useActiveShellContext();
  const environmentId = activeThread?.environmentId ?? routeThreadRef?.environmentId ?? null;
  const workbenchSelection = useWorkbenchSelection(routeThreadRef);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsedChangeDirectories, setCollapsedChangeDirectories] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedChangeSections, setCollapsedChangeSections] = useState<Set<string>>(
    () => new Set(),
  );
  const [createDraft, setCreateDraft] = useState<ExplorerCreateDraft | null>(null);
  const listQuery = useQuery(
    projectListEntriesQueryOptions({
      environmentId,
      cwd,
      limit: 10_000,
    }),
  );
  const gitStatus = useGitStatus({ environmentId, cwd });
  const commitGraphQuery = useQuery(gitCommitGraphQueryOptions({ environmentId, cwd }));
  const treeEntries = listQuery.data?.entries ?? EMPTY_TREE_ENTRIES;
  const tree = useMemo(() => buildTree(treeEntries), [treeEntries]);
  const changedFiles = gitStatus.data?.workingTree.files ?? EMPTY_CHANGED_FILES;
  const stagedFiles = useMemo(() => sectionFiles(changedFiles, "staged"), [changedFiles]);
  const unstagedFiles = useMemo(() => sectionFiles(changedFiles, "changes"), [changedFiles]);
  const untrackedFiles = useMemo(() => sectionFiles(changedFiles, "untracked"), [changedFiles]);
  const conflictFiles = useMemo(() => sectionFiles(changedFiles, "conflicts"), [changedFiles]);
  const [commitMessage, setCommitMessage] = useState("");
  const [graphHeightRatio, setGraphHeightRatio] = useState(() =>
    clampGraphHeightRatio(
      getLocalStorageItem(WORKBENCH_GRAPH_HEIGHT_RATIO_STORAGE_KEY, Schema.Finite) ??
        DEFAULT_GRAPH_HEIGHT_RATIO,
    ),
  );
  const [sourceControlError, setSourceControlError] = useState<string | null>(null);
  const [sourceControlBusy, setSourceControlBusy] = useState<"commit" | "generate" | "push" | null>(
    null,
  );
  const [changeActionBusy, setChangeActionBusy] = useState<"stage" | "unstage" | "revert" | null>(
    null,
  );
  const changeActionBusyRef = useRef(false);
  const commitMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const changesSplitRef = useRef<HTMLDivElement | null>(null);
  const graphResizeRef = useRef<{
    readonly interaction: ResizeInteractionHandle;
    readonly pointerId: number;
    readonly startY: number;
    readonly startRatio: number;
    readonly splitHeight: number;
    pendingRatio: number;
    rafId: number | null;
  } | null>(null);

  const refreshWorkspace = useCallback(
    () =>
      refreshWorkspaceTarget({
        environmentId,
        cwd,
        queryClient,
      }),
    [cwd, environmentId, queryClient],
  );

  const beginGraphResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const splitElement = changesSplitRef.current;
      if (!splitElement) return;

      const splitHeight = splitElement.getBoundingClientRect().height;
      if (splitHeight <= 0) return;

      graphResizeRef.current?.interaction.release();
      graphResizeRef.current = {
        interaction: startResizeInteraction(event, { cursor: "row-resize", stopPropagation: true }),
        pointerId: event.pointerId,
        startY: event.clientY,
        startRatio: graphHeightRatio,
        splitHeight,
        pendingRatio: graphHeightRatio,
        rafId: null,
      };
    },
    [graphHeightRatio],
  );

  const updateGraphResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const resizeState = graphResizeRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;

    const delta = event.clientY - resizeState.startY;
    resizeState.pendingRatio = clampGraphHeightRatio(
      resizeState.startRatio - delta / resizeState.splitHeight,
    );

    if (resizeState.rafId !== null) return;
    resizeState.rafId = window.requestAnimationFrame(() => {
      const activeResizeState = graphResizeRef.current;
      if (!activeResizeState) return;
      activeResizeState.rafId = null;
      setGraphHeightRatio(activeResizeState.pendingRatio);
    });
  }, []);

  const finishGraphResize = useCallback(() => {
    const resizeState = graphResizeRef.current;
    if (!resizeState) return;

    if (resizeState.rafId !== null) {
      window.cancelAnimationFrame(resizeState.rafId);
    }
    resizeState.interaction.release();
    setLocalStorageItem(
      WORKBENCH_GRAPH_HEIGHT_RATIO_STORAGE_KEY,
      resizeState.pendingRatio,
      Schema.Finite,
    );
    graphResizeRef.current = null;
  }, []);

  const endGraphResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const resizeState = graphResizeRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      finishGraphResize();
    },
    [finishGraphResize],
  );

  useEffect(() => {
    const element = commitMessageRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [commitMessage]);

  useEffect(() => {
    return () => {
      const resizeState = graphResizeRef.current;
      if (resizeState?.rafId != null) {
        window.cancelAnimationFrame(resizeState.rafId);
      }
      resizeState?.interaction.release();
      graphResizeRef.current = null;
    };
  }, []);

  const handleEntriesChanged = useCallback(
    (event: ProjectEntriesStreamEvent) => {
      if (event.type === "entries-changed") {
        void refreshWorkspace();
      }
    },
    [refreshWorkspace],
  );
  const handleEntriesResubscribe = useCallback(
    () => void refreshWorkspace(),
    [refreshWorkspace],
  );
  useProjectEntriesSubscription(
    { environmentId, cwd },
    handleEntriesChanged,
    handleEntriesResubscribe,
  );

  const expandCreateParent = useCallback((entryParentPath: string | null) => {
    if (!entryParentPath) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const ancestor of [...relativePathAncestors(entryParentPath), entryParentPath]) {
        next.add(ancestor);
      }
      return next;
    });
  }, []);

  const startCreateEntry = useCallback(
    (kind: CreateEntryKind, entryParentPath: string | null) => {
      expandCreateParent(entryParentPath);
      setCreateDraft({
        kind,
        parentPath: entryParentPath,
        error: null,
        isSaving: false,
      });
    },
    [expandCreateParent],
  );

  const submitCreateEntry = useCallback(
    (draft: ExplorerCreateDraft, name: string) => {
      const relativePath = buildNewEntryRelativePath(draft.parentPath, name);
      if (!relativePath) {
        setCreateDraft((current) =>
          current && current.kind === draft.kind && current.parentPath === draft.parentPath
            ? { ...current, error: "Enter a valid name.", isSaving: false }
            : current,
        );
        return;
      }
      if (!cwd || !environmentId) {
        setCreateDraft((current) =>
          current && current.kind === draft.kind && current.parentPath === draft.parentPath
            ? { ...current, error: "No project selected.", isSaving: false }
            : current,
        );
        return;
      }

      setCreateDraft((current) =>
        current && current.kind === draft.kind && current.parentPath === draft.parentPath
          ? { ...current, error: null, isSaving: true }
          : current,
      );

      void (async () => {
        const api = ensureEnvironmentApi(environmentId);
        try {
          const result = await api.projects.createEntry({
            cwd,
            relativePath,
            kind: draft.kind,
          });
          setCreateDraft(null);
          const createdParentPath =
            result.kind === "directory" ? result.relativePath : parentPath(result.relativePath);
          expandCreateParent(createdParentPath);
          await refreshWorkspace();
          if (result.kind === "file") {
            requestWorkbenchOpen({ mode: "files", path: result.relativePath });
          }
        } catch (error) {
          setCreateDraft((current) =>
            current && current.kind === draft.kind && current.parentPath === draft.parentPath
              ? { ...current, error: getErrorMessage(error), isSaving: false }
              : current,
          );
        }
      })();
    },
    [cwd, environmentId, expandCreateParent, refreshWorkspace],
  );

  const runPathAction = useCallback(
    async (
      kind: "stage" | "unstage" | "revert",
      paths: readonly string[],
      action: (paths: readonly string[]) => Promise<unknown>,
    ) => {
      if (changeActionBusyRef.current) return;
      const uniquePaths = Array.from(new Set(paths.filter((path) => path.length > 0)));
      if (uniquePaths.length === 0) return;

      changeActionBusyRef.current = true;
      setChangeActionBusy(kind);
      setSourceControlError(null);
      let actionError: unknown = null;
      try {
        await action(uniquePaths);
      } catch (error) {
        actionError = error;
        setSourceControlError(getErrorMessage(error));
      } finally {
        try {
          await refreshWorkspace();
        } catch (refreshError) {
          if (!actionError) {
            setSourceControlError(getErrorMessage(refreshError));
          }
        }
        changeActionBusyRef.current = false;
        setChangeActionBusy(null);
      }
    },
    [refreshWorkspace],
  );

  const stagePaths = useCallback(
    async (paths: readonly string[]) => {
      if (!cwd || !environmentId) return;
      const api = ensureEnvironmentApi(environmentId);
      await runPathAction("stage", paths, async (relativePaths) => {
        await api.vcs.stageFiles({ cwd, relativePaths });
      });
    },
    [cwd, environmentId, runPathAction],
  );

  const unstagePaths = useCallback(
    async (paths: readonly string[]) => {
      if (!cwd || !environmentId) return;
      const api = ensureEnvironmentApi(environmentId);
      await runPathAction("unstage", paths, async (relativePaths) => {
        await api.vcs.unstageFiles({ cwd, relativePaths });
      });
    },
    [cwd, environmentId, runPathAction],
  );

  const revertPaths = useCallback(
    async (paths: readonly string[]) => {
      if (!cwd || !environmentId || changeActionBusy !== null) return;
      const uniquePaths = Array.from(new Set(paths.filter((path) => path.length > 0)));
      if (uniquePaths.length === 0) return;
      const confirmed = window.confirm(
        uniquePaths.length === 1
          ? `Discard changes in ${uniquePaths[0]}?`
          : `Discard changes in ${uniquePaths.length} files?`,
      );
      if (!confirmed) return;
      const api = ensureEnvironmentApi(environmentId);
      await runPathAction("revert", uniquePaths, async (relativePaths) => {
        const results = await Promise.allSettled(
          relativePaths.map((relativePath) => api.vcs.revertFile({ cwd, relativePath })),
        );
        const firstRejected = results.find((result) => result.status === "rejected");
        if (firstRejected?.status === "rejected") throw firstRejected.reason;
      });
    },
    [changeActionBusy, cwd, environmentId, runPathAction],
  );

  const stageFile = useCallback((path: string) => void stagePaths([path]), [stagePaths]);
  const unstageFile = useCallback((path: string) => void unstagePaths([path]), [unstagePaths]);
  const revertFile = useCallback((path: string) => void revertPaths([path]), [revertPaths]);

  const runSourceControlAction = useCallback(
    async (kind: "commit" | "generate" | "push", action: () => Promise<void>) => {
      setSourceControlBusy(kind);
      setSourceControlError(null);
      try {
        await action();
      } catch (error) {
        setSourceControlError(getErrorMessage(error));
      } finally {
        setSourceControlBusy(null);
      }
    },
    [],
  );

  const generateCommitMessage = useCallback(() => {
    void runSourceControlAction("generate", async () => {
      if (!cwd || !environmentId) throw new Error("Git action is unavailable.");
      const selectedFiles =
        stagedFiles.length > 0 ? stagedFiles : [...unstagedFiles, ...untrackedFiles];
      const result = await ensureEnvironmentApi(environmentId).git.generateCommitMessage({
        cwd,
        filePaths: selectedFiles.map((file) => file.path),
      });
      setCommitMessage(result.commitMessage);
    });
  }, [cwd, environmentId, runSourceControlAction, stagedFiles, untrackedFiles, unstagedFiles]);

  const commitStaged = useCallback(() => {
    void runSourceControlAction("commit", async () => {
      if (!cwd || !environmentId) throw new Error("Git action is unavailable.");
      await ensureEnvironmentApi(environmentId).git.commitStaged({
        cwd,
        commitMessage: commitMessage.trim(),
      });
      setCommitMessage("");
      await refreshWorkspace();
    });
  }, [commitMessage, cwd, environmentId, refreshWorkspace, runSourceControlAction]);

  const pushBranch = useCallback(() => {
    void runSourceControlAction("push", async () => {
      if (!cwd || !environmentId) throw new Error("Git action is unavailable.");
      await ensureEnvironmentApi(environmentId).git.runStackedAction({
        cwd,
        action: "push",
        actionId: randomUUID(),
      });
      await refreshWorkspace();
    });
  }, [cwd, environmentId, refreshWorkspace, runSourceControlAction]);

  const openPullRequest = useCallback(() => {
    const url = gitStatus.data?.pr?.state === "open" ? gitStatus.data.pr.url : null;
    if (!url) return;
    void readLocalApi()?.shell.openExternal(url);
  }, [gitStatus.data?.pr]);

  if (mode === "changes") {
    const status = gitStatus.data ?? null;
    const isRepo = status?.isRepo ?? true;
    const hasConflicts = conflictFiles.length > 0;
    const isSourceControlIdle = sourceControlBusy === null && changeActionBusy === null;
    const canCommit =
      Boolean(status?.isRepo) &&
      stagedFiles.length > 0 &&
      commitMessage.trim().length > 0 &&
      !gitStatus.isPending &&
      !hasConflicts &&
      isSourceControlIdle;
    const canGenerate =
      Boolean(status?.isRepo) &&
      changedFiles.length > 0 &&
      !gitStatus.isPending &&
      isSourceControlIdle;
    const showGenerate = Boolean(status?.isRepo) && changedFiles.length > 0 && !gitStatus.isPending;
    const showCommit =
      Boolean(status?.isRepo) && stagedFiles.length > 0 && !gitStatus.isPending && !hasConflicts;
    const showPush =
      Boolean(status?.isRepo) &&
      status?.refName !== null &&
      status?.hasUpstream !== false &&
      (status?.aheadCount ?? 0) > 0 &&
      (status?.behindCount ?? 0) === 0;
    const canPush = showPush && isSourceControlIdle;
    const showOpenPr = status?.pr?.state === "open";
    const showActionMenu = showOpenPr;
    const actionsDisabled =
      gitStatus.isPending || sourceControlBusy !== null || changeActionBusy !== null;
    const sections = [
      { id: "conflicts", label: "Merge Changes", files: conflictFiles, action: undefined },
      { id: "staged", label: "Staged Changes", files: stagedFiles, action: "unstage" as const },
      { id: "changes", label: "Changes", files: unstagedFiles, action: "stage" as const },
      { id: "untracked", label: "Untracked", files: untrackedFiles, action: "stage" as const },
    ].filter((section) => section.files.length > 0);

    return (
      <div ref={changesSplitRef} className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">Changes</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 cursor-pointer"
            aria-label="Refresh changes"
            disabled={actionsDisabled}
            onClick={() => void refreshWorkspace()}
          >
            <RefreshCwIcon className={cn("size-3.5", gitStatus.isPending && "animate-spin")} />
          </Button>
        </div>
        <div className="shrink-0 space-y-2 border-b border-border p-2">
          <div className="relative">
            <Textarea
              ref={commitMessageRef}
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder={`Message (⌘Enter to commit on "${status?.refName ?? "branch"}")`}
              className="text-xs [&_textarea]:max-h-40 [&_textarea]:min-h-10 [&_textarea]:resize-none [&_textarea]:overflow-hidden [&_textarea]:pr-10 [&_textarea]:text-xs"
              disabled={!isRepo || gitStatus.isPending}
              rows={1}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canCommit) {
                  event.preventDefault();
                  commitStaged();
                }
              }}
            />
            {showGenerate ? (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1 size-7 cursor-pointer"
                aria-label="Generate commit message"
                title="Generate from staged changes, or all changes when nothing is staged"
                disabled={!canGenerate}
                onClick={generateCommitMessage}
              >
                {sourceControlBusy === "generate" ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3.5" />
                )}
              </Button>
            ) : null}
          </div>
          {showCommit || showPush || showActionMenu ? (
            <div className="flex items-center gap-1">
              {showCommit && showPush ? (
                <Group aria-label="Commit and push" className="min-w-0 flex-1">
                  <Button
                    size="sm"
                    className="h-8 min-w-0 flex-1 cursor-pointer"
                    disabled={!canCommit}
                    onClick={commitStaged}
                  >
                    {sourceControlBusy === "commit" ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <CheckIcon className="size-3.5" />
                    )}
                    <span className="truncate">
                      {sourceControlBusy === "commit" ? "Committing..." : "Commit"}
                    </span>
                  </Button>
                  <GroupSeparator />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 min-w-0 flex-1 cursor-pointer"
                    disabled={!canPush}
                    onClick={pushBranch}
                  >
                    {sourceControlBusy === "push" ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <SendIcon className="size-3.5" />
                    )}
                    <span className="truncate">
                      {sourceControlBusy === "push" ? "Pushing..." : "Push"}
                    </span>
                  </Button>
                </Group>
              ) : showCommit ? (
                <Button
                  size="default"
                  className="h-9 min-w-0 flex-1 cursor-pointer"
                  disabled={!canCommit}
                  onClick={commitStaged}
                >
                  {sourceControlBusy === "commit" ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  <span className="truncate">
                    {sourceControlBusy === "commit" ? "Committing..." : "Commit"}
                  </span>
                </Button>
              ) : showPush ? (
                <Button
                  size="default"
                  className="h-9 min-w-0 flex-1 cursor-pointer"
                  disabled={!canPush}
                  onClick={pushBranch}
                >
                  {sourceControlBusy === "push" ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <SendIcon className="size-3.5" />
                  )}
                  <span className="truncate">
                    {sourceControlBusy === "push" ? "Pushing..." : "Push"}
                  </span>
                </Button>
              ) : null}
              {showActionMenu ? (
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="size-9 cursor-pointer"
                        aria-label="More source control actions"
                      >
                        <MoreHorizontalIcon className="size-3.5" />
                      </Button>
                    }
                  />
                  <MenuPopup align="end" side="bottom" className="w-44">
                    <MenuGroup>
                      {showOpenPr ? (
                        <MenuItem onClick={openPullRequest}>
                          <GitPullRequestIcon className="size-3.5" />
                          Open PR
                        </MenuItem>
                      ) : null}
                    </MenuGroup>
                  </MenuPopup>
                </Menu>
              ) : null}
            </div>
          ) : null}
          {sourceControlError ? (
            <div className="rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {sourceControlError}
            </div>
          ) : !isRepo ? (
            <div className="rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground">
              No Git repository.
            </div>
          ) : hasConflicts ? (
            <div className="rounded-sm border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
              Resolve conflicts before committing.
            </div>
          ) : null}
        </div>
        <div
          className="min-h-0 overflow-auto px-1 py-2"
          style={{ flex: `1 1 ${Math.max(0, 1 - graphHeightRatio) * 100}%` }}
        >
          {gitStatus.error ? (
            <div className="px-3 py-8 text-center text-xs text-destructive">
              {getErrorMessage(gitStatus.error)}
            </div>
          ) : gitStatus.isPending ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Loading changes...
            </div>
          ) : !isRepo ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No Git repository.
            </div>
          ) : changedFiles.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No working tree changes.
            </div>
          ) : (
            sections.map((section) => {
              const collapsed = collapsedChangeSections.has(section.id);
              const sectionId = section.id as "conflicts" | "staged" | "changes" | "untracked";
              const sectionSource = sectionId === "staged" ? "staged" : "working-tree";
              const selectedChangePath =
                workbenchSelection?.mode === "changes" &&
                (workbenchSelection.changeSource ?? "working-tree") === sectionSource
                  ? workbenchSelection.path
                  : null;
              const sectionPaths = section.files.map((file) => file.path);
              const statusByPath = new Map(
                section.files.map((file) => [file.path, statusLabelForSection(file, sectionId)]),
              );
              return (
                <section key={section.id} className="mb-2">
                  <div className="group flex h-7 w-full items-center rounded-sm pr-1 text-xs font-medium hover:bg-accent">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 text-left"
                      onClick={() =>
                        setCollapsedChangeSections((current) => {
                          const next = new Set(current);
                          if (next.has(section.id)) next.delete(section.id);
                          else next.add(section.id);
                          return next;
                        })
                      }
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-3 shrink-0 transition-transform",
                          !collapsed && "rotate-90",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{section.label}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                        {section.files.length}
                      </span>
                    </button>
                    <div className="ml-1 hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
                      {section.action === "stage" ? (
                        <button
                          type="button"
                          className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                          aria-label={`Stage all ${section.label}`}
                          disabled={actionsDisabled}
                          title="Stage all"
                          onClick={() => void stagePaths(sectionPaths)}
                        >
                          <PlusIcon className="size-3.5" />
                        </button>
                      ) : null}
                      {section.action === "unstage" ? (
                        <button
                          type="button"
                          className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                          aria-label={`Unstage all ${section.label}`}
                          disabled={actionsDisabled}
                          title="Unstage all"
                          onClick={() => void unstagePaths(sectionPaths)}
                        >
                          <MinusIcon className="size-3.5" />
                        </button>
                      ) : null}
                      {section.id !== "staged" ? (
                        <button
                          type="button"
                          className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-default disabled:opacity-50"
                          aria-label={`Discard all ${section.label}`}
                          disabled={actionsDisabled}
                          title="Discard all"
                          onClick={() => void revertPaths(sectionPaths)}
                        >
                          <Undo2Icon className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {!collapsed ? (
                    <ChangesTree
                      nodes={changeTree(section.files)}
                      collapsedDirectories={collapsedChangeDirectories}
                      selectedPath={selectedChangePath}
                      onToggleDirectory={(path) =>
                        setCollapsedChangeDirectories((current) => {
                          const next = new Set(current);
                          if (next.has(path)) next.delete(path);
                          else next.add(path);
                          return next;
                        })
                      }
                      onOpenFile={(path) =>
                        requestWorkbenchOpen({
                          mode: "changes",
                          path,
                          source: section.id === "staged" ? "staged" : "working-tree",
                        })
                      }
                      onStageFile={section.action === "stage" ? stageFile : undefined}
                      onUnstageFile={section.action === "unstage" ? unstageFile : undefined}
                      onRevertFile={section.id !== "staged" ? revertFile : undefined}
                      onStagePaths={section.action === "stage" ? stagePaths : undefined}
                      onUnstagePaths={section.action === "unstage" ? unstagePaths : undefined}
                      onRevertPaths={section.id !== "staged" ? revertPaths : undefined}
                      statusByPath={statusByPath}
                      actionsDisabled={actionsDisabled}
                    />
                  ) : null}
                </section>
              );
            })
          )}
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize graph"
          title="Drag to resize graph"
          tabIndex={0}
          className={PANE_RESIZE_RAIL_HORIZONTAL_CLASS}
          onPointerDown={beginGraphResize}
          onPointerMove={updateGraphResize}
          onPointerUp={endGraphResize}
          onPointerCancel={endGraphResize}
        />
        <div
          className="flex min-h-20 flex-col border-t border-border"
          style={{ flex: `0 0 ${graphHeightRatio * 100}%` }}
        >
          <div className="flex h-7 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Graph
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <WorkbenchCommitGraph
              commits={cwd ? (commitGraphQuery.data?.commits ?? []) : []}
              error={cwd ? commitGraphQuery.error : null}
              isLoading={commitGraphQuery.isPending}
              truncated={commitGraphQuery.data?.truncated ?? false}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <WorkbenchExplorerPanel
          cwd={cwd}
          tree={tree}
          expanded={expanded}
          selectedPath={workbenchSelection?.mode === "files" ? workbenchSelection.path : null}
          listError={listQuery.error ?? null}
          isRefreshing={listQuery.isFetching}
          createDraft={createDraft}
          createParentPath={null}
          onToggleExpanded={(path) =>
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(path)) next.delete(path);
              else next.add(path);
              return next;
            })
          }
          onOpenFile={(path) => requestWorkbenchOpen({ mode: "files", path })}
          onStartCreate={startCreateEntry}
          onSubmitCreate={submitCreateEntry}
          onCancelCreate={() => setCreateDraft(null)}
          onRefresh={refreshWorkspace}
        />
      </div>
    </div>
  );
}
