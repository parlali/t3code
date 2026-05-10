import { Editor, type BeforeMount, type OnMount } from "@monaco-editor/react";
import type { EnvironmentId, ProjectEntry, ThreadId, VcsStatusResult } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ensureEnvironmentApi } from "../environmentApi";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTheme } from "../hooks/useTheme";
import { buildTurnDiffTree } from "../lib/turnDiffTree";
import { gitFileDiffQueryOptions, gitQueryKeys } from "../lib/gitReactQuery";
import { refreshGitStatus, useGitStatus } from "../lib/gitStatusState";
import {
  projectListEntriesQueryOptions,
  projectQueryKeys,
  projectReadFileQueryOptions,
} from "../lib/projectReactQuery";
import { cn } from "../lib/utils";
import { useStore } from "../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../storeSelectors";
import { subscribeWorkbenchOpen } from "../workbenchEvents";
import { Button } from "./ui/button";
import {
  PANE_HEADER_CLASS,
  PANE_HEADER_PADDING_CLASS,
  PANE_ICON_BUTTON_CLASS,
  PANE_RESIZE_RAIL_CLASS,
  PaneSidebarToggleButton,
} from "./ui/pane-chrome";
import { Sheet, SheetClose, SheetPopup, SheetTrigger } from "./ui/sheet";
import {
  type ExplorerMode,
  WorkbenchExplorerPanel,
  WorkbenchToolbarActions,
  WorkbenchTabBar,
  WorkbenchBreadcrumbs,
  WorkbenchDiffEditor,
  type WorkbenchTab,
  basename,
  tabFor,
  setBufferValue,
  markDirty,
  languageFor,
  buildTree,
  configureWorkbenchMonaco,
  workbenchCodeEditorOptions,
  workbenchEditorTheme,
  clampExplorerWidth,
  WORKBENCH_EXPLORER_WIDTH_STORAGE_KEY,
  WORKBENCH_EXPLORER_COLLAPSED_STORAGE_KEY,
  MOBILE_LAYOUT_MEDIA_QUERY,
  DEFAULT_EXPLORER_WIDTH,
} from "./workbench";

interface WorkbenchTabState {
  readonly tabs: readonly WorkbenchTab[];
  readonly activeTabId: string | null;
}

const EMPTY_TREE_ENTRIES: readonly ProjectEntry[] = Object.freeze([]);
const EMPTY_CHANGED_FILES: VcsStatusResult["workingTree"]["files"] = Object.freeze([]);

function WorkbenchMessage(props: { readonly children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      {props.children}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
}

export interface WorkspaceWorkbenchProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly embedded?: boolean;
  readonly onSwitchToChat?: () => void;
}

export function WorkspaceWorkbench(props: WorkspaceWorkbenchProps) {
  const { embedded = false, onSwitchToChat } = props;
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isMobileLayout = useMediaQuery(MOBILE_LAYOUT_MEDIA_QUERY);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const activeThread = useStore(
    useMemo(
      () =>
        createThreadSelectorByRef({ environmentId: props.environmentId, threadId: props.threadId }),
      [props.environmentId, props.threadId],
    ),
  );
  const activeProjectEnvironmentId = activeThread?.environmentId ?? null;
  const activeProjectId = activeThread?.projectId ?? null;
  const activeProjectRef = useMemo(
    () =>
      activeProjectEnvironmentId && activeProjectId
        ? { environmentId: activeProjectEnvironmentId, projectId: activeProjectId }
        : null,
    [activeProjectEnvironmentId, activeProjectId],
  );
  const activeProject = useStore(
    useMemo(() => createProjectSelectorByRef(activeProjectRef), [activeProjectRef]),
  );
  const cwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;
  const gitStatus = useGitStatus({
    environmentId: props.environmentId,
    cwd,
  });
  const [mode, setMode] = useState<ExplorerMode>("changes");
  const [tabState, setTabState] = useState<WorkbenchTabState>({
    tabs: [],
    activeTabId: null,
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsedChangeDirectories, setCollapsedChangeDirectories] = useState<Set<string>>(
    () => new Set(),
  );
  const [fileBuffers, setFileBuffers] = useState<Record<string, string>>({});
  const [diffBuffers, setDiffBuffers] = useState<Record<string, string>>({});
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(() => new Set());
  const [explorerWidth, setExplorerWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_EXPLORER_WIDTH;
    const stored = window.localStorage.getItem(WORKBENCH_EXPLORER_WIDTH_STORAGE_KEY);
    return stored
      ? clampExplorerWidth(Number(stored) || DEFAULT_EXPLORER_WIDTH)
      : DEFAULT_EXPLORER_WIDTH;
  });
  const [explorerCollapsed, setExplorerCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(WORKBENCH_EXPLORER_COLLAPSED_STORAGE_KEY) === "1";
  });
  const [explorerResizing, setExplorerResizing] = useState(false);
  const workbenchRef = useRef<HTMLElement | null>(null);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef<{ readonly clientX: number; readonly width: number } | null>(null);
  const explorerWidthRef = useRef(explorerWidth);
  const fileBuffersRef = useRef(fileBuffers);
  const diffBuffersRef = useRef(diffBuffers);
  const saveActiveRef = useRef<() => void>(() => undefined);

  const { tabs, activeTabId } = tabState;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTabRef = useRef<WorkbenchTab | null>(activeTab);
  activeTabRef.current = activeTab;
  const activePath = activeTab?.path ?? null;
  const activeKind = activeTab?.kind ?? null;
  const activeTabDirty = activeTab ? dirtyTabs.has(activeTab.id) : false;
  const listQuery = useQuery(
    projectListEntriesQueryOptions({
      environmentId: props.environmentId,
      cwd,
      limit: 10_000,
    }),
  );
  const fileQuery = useQuery(
    projectReadFileQueryOptions({
      environmentId: props.environmentId,
      cwd,
      relativePath: activeKind === "file" ? activePath : null,
    }),
  );
  const diffQuery = useQuery(
    gitFileDiffQueryOptions({
      environmentId: props.environmentId,
      cwd,
      relativePath: activeKind === "diff" ? activePath : null,
    }),
  );
  const treeEntries = listQuery.data?.entries ?? EMPTY_TREE_ENTRIES;
  const tree = useMemo(() => buildTree(treeEntries), [treeEntries]);
  const changedFiles = gitStatus.data?.workingTree.files ?? EMPTY_CHANGED_FILES;
  const changedTree = useMemo(
    () =>
      buildTurnDiffTree(
        changedFiles.map((file) => ({
          path: file.path,
          additions: file.insertions,
          deletions: file.deletions,
        })),
      ),
    [changedFiles],
  );
  const fileQueryContents = fileQuery.data?.contents;
  const diffQueryOriginal = diffQuery.data?.original;
  const diffQueryModified = diffQuery.data?.modified;

  const openTab = useCallback((tab: WorkbenchTab) => {
    setTabState((current) => ({
      tabs: current.tabs.some((entry) => entry.id === tab.id)
        ? current.tabs
        : [...current.tabs, tab],
      activeTabId: tab.id,
    }));
  }, []);

  useEffect(() => {
    return subscribeWorkbenchOpen((request) => {
      if (request.mode) setMode(request.mode);
      if (request.path) {
        openTab(tabFor(request.mode === "files" ? "file" : "diff", request.path));
      }
    });
  }, [openTab]);

  useEffect(() => {
    if (fileQueryContents !== undefined && activeKind === "file" && activePath && !activeTabDirty) {
      setFileBuffers((current) => {
        const next = setBufferValue(current, activePath, fileQueryContents);
        fileBuffersRef.current = next;
        return next;
      });
    }
  }, [activeKind, activePath, activeTabDirty, fileQueryContents]);

  useEffect(() => {
    if (diffQueryModified !== undefined && activeKind === "diff" && activePath && !activeTabDirty) {
      setDiffBuffers((current) => {
        const next = setBufferValue(current, activePath, diffQueryModified);
        diffBuffersRef.current = next;
        return next;
      });
    }
  }, [activeKind, activePath, activeTabDirty, diffQueryModified]);

  const closeTab = useCallback((tabId: string) => {
    setTabState((current) => {
      const tabs = current.tabs.filter((tab) => tab.id !== tabId);
      return {
        tabs,
        activeTabId:
          current.activeTabId === tabId ? (tabs.at(-1)?.id ?? null) : current.activeTabId,
      };
    });
    setDirtyTabs((current) => {
      const next = new Set(current);
      next.delete(tabId);
      return next;
    });
  }, []);

  const selectTab = useCallback((tabId: string) => {
    setTabState((current) =>
      current.activeTabId === tabId ? current : { ...current, activeTabId: tabId },
    );
  }, []);

  useEffect(() => {
    setTabState({ tabs: [], activeTabId: null });
    fileBuffersRef.current = {};
    diffBuffersRef.current = {};
    setFileBuffers({});
    setDiffBuffers({});
    setDirtyTabs(new Set());
    setExpanded(new Set());
    setCollapsedChangeDirectories(new Set());
  }, [cwd]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: gitQueryKeys.all }),
      refreshGitStatus({ environmentId: props.environmentId, cwd }),
    ]);
  }, [cwd, props.environmentId, queryClient]);

  const saveActive = useCallback(async () => {
    if (!activeTab || !cwd) return;
    const contents =
      activeTab.kind === "file"
        ? fileBuffersRef.current[activeTab.path]
        : diffBuffersRef.current[activeTab.path];
    if (contents === undefined) return;
    const api = ensureEnvironmentApi(props.environmentId);
    await api.projects.writeFile({ cwd, relativePath: activeTab.path, contents });
    setDirtyTabs((current) => {
      const next = new Set(current);
      next.delete(activeTab.id);
      return next;
    });
    await refreshWorkspace();
  }, [activeTab, cwd, props.environmentId, refreshWorkspace]);

  useEffect(() => {
    saveActiveRef.current = () => {
      void saveActive();
    };
  }, [saveActive]);

  const stageFile = useCallback(
    async (path: string) => {
      if (!cwd) return;
      await ensureEnvironmentApi(props.environmentId).vcs.stageFile({ cwd, relativePath: path });
      await refreshWorkspace();
    },
    [cwd, props.environmentId, refreshWorkspace],
  );

  const revertFile = useCallback(
    async (path: string) => {
      if (!cwd) return;
      await ensureEnvironmentApi(props.environmentId).vcs.revertFile({ cwd, relativePath: path });
      await refreshWorkspace();
    },
    [cwd, props.environmentId, refreshWorkspace],
  );

  const beforeEditorMount: BeforeMount = useCallback((monaco) => {
    configureWorkbenchMonaco(monaco);
  }, []);

  const onEditorMount: OnMount = useCallback((editor, monaco) => {
    editor.focus();
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActiveRef.current();
    });
  }, []);

  const handleDiffModifiedChange = useCallback(
    (value: string) => {
      const tab = activeTabRef.current;
      if (!tab || tab.kind !== "diff") return;
      const nextDiffBuffers = setBufferValue(diffBuffersRef.current, tab.path, value);
      diffBuffersRef.current = nextDiffBuffers;
      setDiffBuffers(nextDiffBuffers);
      setDirtyTabs((current) => {
        if (value !== (diffQueryModified ?? "")) return markDirty(current, tab.id);
        if (!current.has(tab.id)) return current;
        const next = new Set(current);
        next.delete(tab.id);
        return next;
      });
    },
    [diffQueryModified],
  );

  useEffect(() => {
    explorerWidthRef.current = explorerWidth;
  }, [explorerWidth]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !workbenchRef.current?.contains(target)) return;
      if (event.key.toLowerCase() !== "s") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      saveActiveRef.current();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      WORKBENCH_EXPLORER_COLLAPSED_STORAGE_KEY,
      explorerCollapsed ? "1" : "0",
    );
  }, [explorerCollapsed]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!resizingRef.current) return;
      const start = resizeStartRef.current;
      if (!start) return;
      const next = clampExplorerWidth(start.width + event.clientX - start.clientX);
      setExplorerWidth(next);
    };
    const stop = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      setExplorerResizing(false);
      resizeStartRef.current = null;
      window.localStorage.setItem(
        WORKBENCH_EXPLORER_WIDTH_STORAGE_KEY,
        String(explorerWidthRef.current),
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  const handleToggleExpanded = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleToggleCollapsedChangeDirectory = useCallback((path: string) => {
    setCollapsedChangeDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleOpenFileFromExplorer = useCallback(
    (path: string) => {
      openTab(tabFor(mode === "files" ? "file" : "diff", path));
      if (isMobileLayout) setMobileExplorerOpen(false);
    },
    [isMobileLayout, mode, openTab],
  );

  const mobileToolbar = (
    <div className={`${PANE_HEADER_CLASS} ${PANE_HEADER_PADDING_CLASS} gap-1.5`}>
      {onSwitchToChat && (
        <Button
          size="icon"
          variant="ghost"
          className={PANE_ICON_BUTTON_CLASS}
          aria-label="Back to chat"
          title="Back to chat"
          onClick={onSwitchToChat}
        >
          <MessageSquareIcon className="size-4" />
        </Button>
      )}

      <Sheet open={mobileExplorerOpen} onOpenChange={setMobileExplorerOpen}>
        <SheetTrigger
          render={<PaneSidebarToggleButton expanded={false} label="Open file browser" />}
        />
        <SheetPopup side="left" showCloseButton={false} className="w-72 max-w-[85vw]">
          <SheetClose
            render={
              <PaneSidebarToggleButton
                expanded
                label="Close file browser"
                className="absolute right-3 top-3 z-10"
              />
            }
          />
          <WorkbenchExplorerPanel
            cwd={cwd}
            mode={mode}
            onModeChange={setMode}
            tree={tree}
            changedTree={changedTree}
            expanded={expanded}
            collapsedChangeDirectories={collapsedChangeDirectories}
            selectedPath={activePath}
            listError={listQuery.error ?? null}
            gitError={gitStatus.error ?? null}
            changedFilesCount={changedFiles.length}
            onToggleExpanded={handleToggleExpanded}
            onToggleCollapsedChangeDirectory={handleToggleCollapsedChangeDirectory}
            onOpenFile={handleOpenFileFromExplorer}
          />
        </SheetPopup>
      </Sheet>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {activeTab ? (
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {basename(activeTab.path)}
            {dirtyTabs.has(activeTab.id) ? " *" : ""}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Select a file</span>
        )}
      </div>

      <WorkbenchToolbarActions
        activeTabPath={activeTab?.path ?? null}
        activeTabKind={activeTab?.kind ?? null}
        isDirty={activeTabDirty}
        onSave={saveActive}
        onStage={stageFile}
        onRevert={revertFile}
        variant="mobile"
      />
    </div>
  );

  const desktopSidebar = (
    <>
      <aside
        className={cn(
          "flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-card/60 transition-[width] duration-200 ease-linear",
          !explorerCollapsed && "border-r border-border",
          explorerResizing && "transition-none",
        )}
        inert={explorerCollapsed || undefined}
        style={{ width: explorerCollapsed ? 0 : explorerWidth }}
      >
        {!explorerCollapsed && (
          <WorkbenchExplorerPanel
            cwd={cwd}
            mode={mode}
            onModeChange={setMode}
            tree={tree}
            changedTree={changedTree}
            expanded={expanded}
            collapsedChangeDirectories={collapsedChangeDirectories}
            selectedPath={activePath}
            listError={listQuery.error ?? null}
            gitError={gitStatus.error ?? null}
            changedFilesCount={changedFiles.length}
            onToggleExpanded={handleToggleExpanded}
            onToggleCollapsedChangeDirectory={handleToggleCollapsedChangeDirectory}
            onOpenFile={(path) => openTab(tabFor(mode === "files" ? "file" : "diff", path))}
            showCollapseButton
            onCollapse={() => setExplorerCollapsed(true)}
          />
        )}
      </aside>
      {!explorerCollapsed && (
        <div
          className={PANE_RESIZE_RAIL_CLASS}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setExplorerResizing(true);
            resizingRef.current = true;
            resizeStartRef.current = { clientX: event.clientX, width: explorerWidthRef.current };
          }}
        />
      )}
    </>
  );

  const desktopHeader = (
    <>
      <div className={`${PANE_HEADER_CLASS} items-stretch overflow-x-auto`}>
        {explorerCollapsed && (
          <div
            className={`${PANE_HEADER_PADDING_CLASS} flex h-full shrink-0 items-center border-r border-border`}
          >
            <PaneSidebarToggleButton
              expanded={false}
              label="Expand file browser"
              onClick={() => setExplorerCollapsed(false)}
            />
          </div>
        )}
        <WorkbenchTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          dirtyTabs={dirtyTabs}
          onSelectTab={selectTab}
          onCloseTab={closeTab}
        />
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <WorkbenchBreadcrumbs cwd={cwd} path={activeTab?.path ?? null} />
        <WorkbenchToolbarActions
          activeTabPath={activeTab?.path ?? null}
          activeTabKind={activeTab?.kind ?? null}
          isDirty={activeTabDirty}
          onSave={saveActive}
          onStage={stageFile}
          onRevert={revertFile}
          variant="desktop"
        />
      </div>
    </>
  );

  const embeddedMobileBar = embedded && isMobileLayout && (
    <div className={`${PANE_HEADER_CLASS} ${PANE_HEADER_PADDING_CLASS} gap-1.5`}>
      <Sheet open={mobileExplorerOpen} onOpenChange={setMobileExplorerOpen}>
        <SheetTrigger render={<PaneSidebarToggleButton expanded={false} label="Browse files" />} />
        <SheetPopup side="left" showCloseButton={false} className="w-72 max-w-[85vw]">
          <SheetClose
            render={
              <PaneSidebarToggleButton
                expanded
                label="Close file browser"
                className="absolute right-3 top-3 z-10"
              />
            }
          />
          <WorkbenchExplorerPanel
            cwd={cwd}
            mode={mode}
            onModeChange={setMode}
            tree={tree}
            changedTree={changedTree}
            expanded={expanded}
            collapsedChangeDirectories={collapsedChangeDirectories}
            selectedPath={activePath}
            listError={listQuery.error ?? null}
            gitError={gitStatus.error ?? null}
            changedFilesCount={changedFiles.length}
            onToggleExpanded={handleToggleExpanded}
            onToggleCollapsedChangeDirectory={handleToggleCollapsedChangeDirectory}
            onOpenFile={handleOpenFileFromExplorer}
          />
        </SheetPopup>
      </Sheet>

      <div className="flex min-w-0 flex-1 items-center">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {activeTab ? activeTab.path : "Select a file"}
        </span>
        {activeTabDirty && <span className="ml-1 text-xs text-muted-foreground">*</span>}
      </div>

      <WorkbenchToolbarActions
        activeTabPath={activeTab?.path ?? null}
        activeTabKind={activeTab?.kind ?? null}
        isDirty={activeTabDirty}
        onSave={saveActive}
        onStage={stageFile}
        onRevert={revertFile}
        variant="mobile"
      />
    </div>
  );

  const showStandaloneToolbar = isMobileLayout && !embedded;

  return (
    <section
      ref={workbenchRef}
      className={cn(
        "flex h-full min-h-0 min-w-0 overflow-hidden bg-background text-foreground",
        !isMobileLayout && !embedded && "border-l border-border",
      )}
    >
      {!isMobileLayout && desktopSidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {showStandaloneToolbar && mobileToolbar}
        {embeddedMobileBar}
        {!isMobileLayout && desktopHeader}
        <div className="min-h-0 flex-1">
          {!activeTab ? (
            <WorkbenchMessage>Open a file or change from the explorer.</WorkbenchMessage>
          ) : activeTab.kind === "file" && fileQuery.isError ? (
            <WorkbenchMessage>{getErrorMessage(fileQuery.error)}</WorkbenchMessage>
          ) : activeTab.kind === "diff" && diffQuery.isError ? (
            <WorkbenchMessage>{getErrorMessage(diffQuery.error)}</WorkbenchMessage>
          ) : activeTab.kind === "file" ? (
            <Editor
              key={activeTab.id}
              beforeMount={beforeEditorMount}
              className="t3-workbench-monaco"
              theme={workbenchEditorTheme(resolvedTheme === "dark" ? "dark" : "light")}
              path={activeTab.path}
              language={languageFor(activeTab.path) ?? "plaintext"}
              value={fileBuffers[activeTab.path] ?? fileQueryContents ?? ""}
              onChange={(value) => {
                const nextValue = value ?? "";
                const nextFileBuffers = setBufferValue(
                  fileBuffersRef.current,
                  activeTab.path,
                  nextValue,
                );
                fileBuffersRef.current = nextFileBuffers;
                setFileBuffers(nextFileBuffers);
                setDirtyTabs((current) => markDirty(current, activeTab.id));
              }}
              onMount={onEditorMount}
              options={workbenchCodeEditorOptions(isMobileLayout)}
            />
          ) : (
            <WorkbenchDiffEditor
              diff={diffQuery.data?.diff ?? ""}
              id={activeTab.id}
              isMobileLayout={isMobileLayout}
              language={languageFor(activeTab.path) ?? "plaintext"}
              original={diffQueryOriginal ?? ""}
              modified={diffBuffers[activeTab.path] ?? diffQueryModified ?? ""}
              onModifiedChange={handleDiffModifiedChange}
              onSave={() => saveActiveRef.current()}
              path={activeTab.path}
              resolvedTheme={resolvedTheme === "dark" ? "dark" : "light"}
            />
          )}
        </div>
      </div>
    </section>
  );
}
