import { Editor, type BeforeMount, type OnMount } from "@monaco-editor/react";
import type {
  EnvironmentId,
  ProjectEntriesStreamEvent,
  ProjectEntry,
  ThreadWorkbenchSelection,
  ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Columns2Icon, MessageSquareIcon, Rows3Icon, SaveIcon, WrapTextIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { ensureEnvironmentApi } from "../environmentApi";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTheme } from "../hooks/useTheme";
import { gitFileDiffQueryOptions, gitQueryKeys } from "../lib/gitReactQuery";
import { refreshGitStatus, useGitStatus } from "../lib/gitStatusState";
import {
  projectListEntriesQueryOptions,
  projectQueryKeys,
  projectReadFileQueryOptions,
} from "../lib/projectReactQuery";
import { useStore } from "../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../storeSelectors";
import { subscribeWorkbenchOpen } from "../workbenchEvents";
import { Button } from "./ui/button";
import {
  PANE_HEADER_CLASS,
  PANE_HEADER_PADDING_CLASS,
  PANE_ICON_BUTTON_CLASS,
} from "./ui/pane-chrome";
import {
  WorkbenchTabBar,
  WorkbenchBreadcrumbs,
  WorkbenchDiffEditor,
  type WorkbenchTab,
  basename,
  tabFor,
  setBufferValue,
  markDirty,
  languageFor,
  configureWorkbenchMonaco,
  isChangeSelectionAvailable,
  isFileSelectionAvailable,
  selectionForTab,
  tabForSelection,
  workbenchCodeEditorOptions,
  workbenchEditorTheme,
  MOBILE_LAYOUT_MEDIA_QUERY,
} from "./workbench";

interface WorkbenchTabState {
  readonly tabs: readonly WorkbenchTab[];
  readonly activeTabId: string | null;
}

const EMPTY_TREE_ENTRIES: readonly ProjectEntry[] = Object.freeze([]);

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
  const threadRef = useMemo(
    () => scopeThreadRef(props.environmentId, props.threadId),
    [props.environmentId, props.threadId],
  );
  const activeThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const draftThread = useComposerDraftStore((store) => store.getDraftThreadByRef(threadRef));
  const activeProjectEnvironmentId =
    activeThread?.environmentId ?? draftThread?.environmentId ?? null;
  const activeProjectId = activeThread?.projectId ?? draftThread?.projectId ?? null;
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
  const cwd = activeThread?.worktreePath ?? draftThread?.worktreePath ?? activeProject?.cwd ?? null;
  const gitStatus = useGitStatus({
    environmentId: props.environmentId,
    cwd,
  });
  const [tabState, setTabState] = useState<WorkbenchTabState>({
    tabs: [],
    activeTabId: null,
  });
  const [fileBuffers, setFileBuffers] = useState<Record<string, string>>({});
  const [diffBuffers, setDiffBuffers] = useState<Record<string, string>>({});
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(() => new Set());
  const [diffLineWrap, setDiffLineWrap] = useState(false);
  const [diffLayout, setDiffLayout] = useState<"side-by-side" | "inline">("side-by-side");
  const workbenchRef = useRef<HTMLElement | null>(null);
  const fileBuffersRef = useRef(fileBuffers);
  const diffBuffersRef = useRef(diffBuffers);
  const saveActiveRef = useRef<() => void>(() => undefined);
  const workbenchSelectionVersionRef = useRef(0);

  const { tabs, activeTabId } = tabState;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTabRef = useRef<WorkbenchTab | null>(activeTab);
  activeTabRef.current = activeTab;
  const activePath = activeTab?.path ?? null;
  const activeKind = activeTab?.kind ?? null;
  const activeDiffSource =
    activeTab?.kind === "diff" ? activeTab.source : ("working-tree" as const);
  const activeDiffBufferKey = activeTab?.kind === "diff" ? activeTab.id : null;
  const activeTabReadOnly = activeTab?.kind === "diff" && activeTab.source !== "working-tree";
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
      source: activeDiffSource,
    }),
  );
  const treeEntries = listQuery.data?.entries ?? EMPTY_TREE_ENTRIES;
  const fileQueryContents = fileQuery.data?.contents;
  const diffQueryOriginal = diffQuery.data?.original;
  const diffQueryModified = diffQuery.data?.modified;

  const persistWorkbenchSelection = useCallback(
    (selection: ThreadWorkbenchSelection | null) => {
      workbenchSelectionVersionRef.current += 1;
      try {
        const api = ensureEnvironmentApi(props.environmentId);
        void api.threadWorkbench
          .setState({
            threadId: props.threadId,
            selection,
          })
          .catch(() => undefined);
      } catch {
        // Selection persistence should never block local workbench navigation.
      }
    },
    [props.environmentId, props.threadId],
  );

  const openTab = useCallback(
    (tab: WorkbenchTab, options?: { readonly persist?: boolean }) => {
      setTabState((current) => ({
        tabs: current.tabs.some((entry) => entry.id === tab.id)
          ? current.tabs
          : [...current.tabs, tab],
        activeTabId: tab.id,
      }));
      if (options?.persist !== false) persistWorkbenchSelection(selectionForTab(tab));
    },
    [persistWorkbenchSelection],
  );

  useEffect(() => {
    return subscribeWorkbenchOpen((request) => {
      if (request.path) {
        if (request.mode === "files") {
          openTab(tabFor("file", request.path));
          return;
        }
        openTab(
          tabFor(
            "diff",
            request.path,
            request.source === undefined ? undefined : { source: request.source },
          ),
        );
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
    if (diffQueryModified !== undefined && activeDiffBufferKey !== null && !activeTabDirty) {
      setDiffBuffers((current) => {
        const next = setBufferValue(current, activeDiffBufferKey, diffQueryModified);
        diffBuffersRef.current = next;
        return next;
      });
    }
  }, [activeDiffBufferKey, activeTabDirty, diffQueryModified]);

  const closeTab = useCallback(
    (tabId: string) => {
      const nextTabs = tabs.filter((tab) => tab.id !== tabId);
      const nextActiveTabId = activeTabId === tabId ? (nextTabs.at(-1)?.id ?? null) : activeTabId;
      setTabState({
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
      });
      setDirtyTabs((current) => {
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
      if (activeTabId === tabId) {
        const nextActiveTab = nextTabs.find((tab) => tab.id === nextActiveTabId) ?? null;
        persistWorkbenchSelection(nextActiveTab ? selectionForTab(nextActiveTab) : null);
      }
    },
    [activeTabId, persistWorkbenchSelection, tabs],
  );

  const selectTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((tab) => tab.id === tabId);
      if (!tab) return;
      setTabState((current) =>
        current.activeTabId === tabId ? current : { ...current, activeTabId: tabId },
      );
      persistWorkbenchSelection(selectionForTab(tab));
    },
    [persistWorkbenchSelection, tabs],
  );

  useEffect(() => {
    workbenchSelectionVersionRef.current += 1;
    const restoreVersion = workbenchSelectionVersionRef.current;
    setTabState({ tabs: [], activeTabId: null });
    fileBuffersRef.current = {};
    diffBuffersRef.current = {};
    setFileBuffers({});
    setDiffBuffers({});
    setDirtyTabs(new Set());

    if (!cwd) return;

    let cancelled = false;
    try {
      const api = ensureEnvironmentApi(props.environmentId);
      void api.threadWorkbench
        .getState({ threadId: props.threadId })
        .then((state) => {
          if (
            cancelled ||
            workbenchSelectionVersionRef.current !== restoreVersion ||
            state.selection === null
          ) {
            return;
          }
          openTab(tabForSelection(state.selection), { persist: false });
        })
        .catch(() => undefined);
    } catch {
      return;
    }

    return () => {
      cancelled = true;
    };
  }, [cwd, openTab, props.environmentId, props.threadId]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: gitQueryKeys.all }),
      refreshGitStatus({ environmentId: props.environmentId, cwd }, { force: true }),
    ]);
  }, [cwd, props.environmentId, queryClient]);

  useEffect(() => {
    if (!cwd) return;
    const api = ensureEnvironmentApi(props.environmentId);
    const handleEntriesChanged = (event: ProjectEntriesStreamEvent) => {
      if (event.type === "entries-changed") {
        void refreshWorkspace();
      }
    };
    return api.projects.subscribeEntries({ cwd }, handleEntriesChanged, {
      onResubscribe: () => void refreshWorkspace(),
    });
  }, [cwd, props.environmentId, refreshWorkspace]);

  const saveActive = useCallback(async () => {
    if (!activeTab || !cwd) return;
    if (activeTab.kind === "diff" && activeTab.source !== "working-tree") return;
    const contents =
      activeTab.kind === "file"
        ? fileBuffersRef.current[activeTab.path]
        : diffBuffersRef.current[activeTab.id];
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
      if (tab.source !== "working-tree") return;
      const nextDiffBuffers = setBufferValue(diffBuffersRef.current, tab.id, value);
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

  const clearUnavailableActiveSelection = useCallback(
    (tabId: string) => {
      setTabState((current) => {
        if (current.activeTabId !== tabId) return current;
        return {
          tabs: current.tabs.filter((tab) => tab.id !== tabId),
          activeTabId: null,
        };
      });
      setDirtyTabs((current) => {
        if (!current.has(tabId)) return current;
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
      persistWorkbenchSelection(null);
    },
    [persistWorkbenchSelection],
  );

  useEffect(() => {
    if (!cwd || !activeTab) return;

    if (activeTab.kind === "file") {
      if (!listQuery.isSuccess || listQuery.isPlaceholderData) return;
      if (!isFileSelectionAvailable(treeEntries, activeTab.path)) {
        clearUnavailableActiveSelection(activeTab.id);
      }
      return;
    }

    if (gitStatus.isPending || gitStatus.data === null) return;
    if (
      !isChangeSelectionAvailable(
        gitStatus.data.workingTree.files,
        activeTab.path,
        activeTab.source,
      )
    ) {
      clearUnavailableActiveSelection(activeTab.id);
    }
  }, [
    activeTab,
    clearUnavailableActiveSelection,
    cwd,
    gitStatus.data,
    gitStatus.isPending,
    listQuery.isPlaceholderData,
    listQuery.isSuccess,
    treeEntries,
  ]);

  const saveButton =
    activeTab && !activeTabReadOnly ? (
      <Button
        size="icon-sm"
        variant="ghost"
        className="size-7"
        disabled={!activeTabDirty}
        aria-label="Save file"
        title="Save file"
        onClick={saveActive}
      >
        <SaveIcon className="size-3.5" />
      </Button>
    ) : null;
  const diffControls =
    activeTab?.kind === "diff" ? (
      <>
        <Button
          size="icon-sm"
          variant={diffLineWrap ? "secondary" : "ghost"}
          className="size-7 cursor-pointer"
          aria-label={diffLineWrap ? "Disable line wrap" : "Enable line wrap"}
          title={diffLineWrap ? "Disable line wrap" : "Enable line wrap"}
          onClick={() => setDiffLineWrap((value) => !value)}
        >
          <WrapTextIcon className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant={diffLayout === "inline" ? "secondary" : "ghost"}
          className="size-7 cursor-pointer"
          aria-label={
            diffLayout === "side-by-side"
              ? "Use inline diff layout"
              : "Use side-by-side diff layout"
          }
          title={
            diffLayout === "side-by-side"
              ? "Use inline diff layout"
              : "Use side-by-side diff layout"
          }
          onClick={() =>
            setDiffLayout((value) => (value === "side-by-side" ? "inline" : "side-by-side"))
          }
        >
          {diffLayout === "side-by-side" ? (
            <Rows3Icon className="size-3.5" />
          ) : (
            <Columns2Icon className="size-3.5" />
          )}
        </Button>
      </>
    ) : null;

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

      {diffControls}
      {saveButton}
    </div>
  );

  const desktopHeader = (
    <>
      <div className={`${PANE_HEADER_CLASS} items-stretch overflow-x-auto`}>
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
        {diffControls}
        {saveButton}
      </div>
    </>
  );

  const embeddedMobileBar = embedded && isMobileLayout && (
    <div className={`${PANE_HEADER_CLASS} ${PANE_HEADER_PADDING_CLASS} gap-1.5`}>
      <div className="flex min-w-0 flex-1 items-center">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {activeTab ? activeTab.path : "Select a file"}
        </span>
        {activeTabDirty && <span className="ml-1 text-xs text-muted-foreground">*</span>}
      </div>

      {diffControls}
      {saveButton}
    </div>
  );

  const showStandaloneToolbar = isMobileLayout && !embedded;

  return (
    <section
      ref={workbenchRef}
      className="flex h-full min-h-0 min-w-0 overflow-hidden bg-background text-foreground"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {showStandaloneToolbar && mobileToolbar}
        {embeddedMobileBar}
        {!isMobileLayout && desktopHeader}
        <div className="relative min-h-0 flex-1">
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
              diffLayout={diffLayout}
              id={activeTab.id}
              isMobileLayout={isMobileLayout}
              language={languageFor(activeTab.path) ?? "plaintext"}
              lineWrap={diffLineWrap}
              original={diffQueryOriginal ?? ""}
              modified={diffBuffers[activeTab.id] ?? diffQueryModified ?? ""}
              onModifiedChange={handleDiffModifiedChange}
              onSave={() => saveActiveRef.current()}
              path={activeTab.path}
              readOnly={activeTab.source !== "working-tree"}
              resolvedTheme={resolvedTheme === "dark" ? "dark" : "light"}
            />
          )}
        </div>
      </div>
    </section>
  );
}
