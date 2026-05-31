import { Editor, type BeforeMount, type OnMount } from "@monaco-editor/react";
import type {
  EnvironmentId,
  ProjectEntriesStreamEvent,
  ProjectEntry,
  ThreadWorkbenchSelection,
  ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { getWorkbenchMediaTypeByPath } from "@t3tools/shared/workbenchMedia";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Columns2Icon, MessageSquareIcon, Rows3Icon, SaveIcon, WrapTextIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { ensureEnvironmentApi } from "../environmentApi";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTheme } from "../hooks/useTheme";
import { gitFileDiffQueryOptions, gitQueryKeys } from "../lib/gitReactQuery";
import { useGitStatus } from "../lib/gitStatusState";
import {
  projectListEntriesQueryOptions,
  projectQueryKeys,
  projectReadFileQueryOptions,
} from "../lib/projectReactQuery";
import { refreshWorkspaceTarget, useProjectEntriesSubscription } from "../lib/workspaceRefresh";
import { useStore } from "../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../storeSelectors";
import {
  publishWorkbenchSelection,
  subscribeWorkbenchOpen,
  type WorkbenchActiveSelection,
} from "../workbenchEvents";
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
  WorkbenchDiffUnavailable,
  WorkbenchMediaViewer,
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
  resolveWorkbenchRelativePath,
} from "./workbench";

interface WorkbenchTabState {
  readonly tabs: readonly WorkbenchTab[];
  readonly activeTabId: string | null;
}

type WorkbenchEditor = Parameters<OnMount>[0];

interface PendingEditorReveal {
  readonly tabId: string;
  readonly line: number;
  readonly column: number;
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

function normalizeEditorPositionValue(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function activeSelectionForTab(tab: WorkbenchTab): WorkbenchActiveSelection {
  if (tab.kind === "file") {
    return { mode: "files", path: tab.path };
  }
  return { mode: "changes", path: tab.path, changeSource: tab.source };
}

export interface WorkspaceWorkbenchProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly embedded?: boolean;
  readonly onSwitchToChat?: () => void;
  readonly visible?: boolean;
}

export function WorkspaceWorkbench(props: WorkspaceWorkbenchProps) {
  const { embedded = false, onSwitchToChat, visible = true } = props;
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
  const [lineWrap, setLineWrap] = useState(false);
  const [diffLayout, setDiffLayout] = useState<"side-by-side" | "inline">("side-by-side");
  const workbenchRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<{ readonly tabId: string; readonly editor: WorkbenchEditor } | null>(
    null,
  );
  const fileBuffersRef = useRef(fileBuffers);
  const diffBuffersRef = useRef(diffBuffers);
  const saveActiveRef = useRef<() => void>(() => undefined);
  const workbenchSelectionVersionRef = useRef(0);
  const [pendingEditorReveal, setPendingEditorReveal] = useState<PendingEditorReveal | null>(null);
  const [editorMountVersion, setEditorMountVersion] = useState(0);

  const { tabs, activeTabId } = tabState;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTabRef = useRef<WorkbenchTab | null>(activeTab);
  activeTabRef.current = activeTab;
  const activePath = activeTab?.path ?? null;
  const activeKind = activeTab?.kind ?? null;
  const activePathMediaType = useMemo(
    () => (activePath ? getWorkbenchMediaTypeByPath(activePath) : null),
    [activePath],
  );
  const activeDiffIsMedia = activeKind === "diff" && activePathMediaType !== null;
  const activeDiffSource =
    activeTab?.kind === "diff" ? activeTab.source : ("working-tree" as const);
  const activeDiffBufferKey = activeTab?.kind === "diff" ? activeTab.id : null;
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
      enabled: !activeDiffIsMedia,
    }),
  );
  const treeEntries = listQuery.data?.entries ?? EMPTY_TREE_ENTRIES;
  const fileQueryContents = fileQuery.data?.contents;
  const activeFileMedia =
    activeKind === "file" && fileQuery.data?.contentKind === "media" ? fileQuery.data : null;
  const diffQueryOriginal = diffQuery.data?.original;
  const diffQueryModified = diffQuery.data?.modified;
  const activeTabReadOnly =
    (activeTab?.kind === "file" && activePathMediaType !== null) ||
    (activeTab?.kind === "diff" && activeDiffIsMedia) ||
    (activeTab?.kind === "diff" && activeTab.source !== "working-tree");
  const activeFileReady =
    activeKind === "file" &&
    activePath !== null &&
    (fileBuffers[activePath] !== undefined || fileQueryContents !== undefined);

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
  const publishActiveSelection = useCallback(
    (selection: WorkbenchActiveSelection | null) => {
      publishWorkbenchSelection({
        scope: {
          environmentId: props.environmentId,
          threadId: props.threadId,
        },
        selection,
      });
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
      publishActiveSelection(activeSelectionForTab(tab));
      if (options?.persist !== false) persistWorkbenchSelection(selectionForTab(tab));
    },
    [persistWorkbenchSelection, publishActiveSelection],
  );

  useEffect(() => {
    return subscribeWorkbenchOpen((request) => {
      if (request.path) {
        const relativePath = resolveWorkbenchRelativePath(request.path, cwd);
        if (!relativePath) return;

        if (request.mode === "files") {
          const tab = tabFor("file", relativePath);
          if (request.line !== undefined) {
            setPendingEditorReveal({
              tabId: tab.id,
              line: normalizeEditorPositionValue(request.line, 1),
              column: normalizeEditorPositionValue(request.column, 1),
            });
          } else {
            setPendingEditorReveal(null);
          }
          openTab(tab);
          return;
        }
        setPendingEditorReveal(null);
        openTab(
          tabFor(
            "diff",
            relativePath,
            request.source === undefined ? undefined : { source: request.source },
          ),
        );
      }
    });
  }, [cwd, openTab]);

  useEffect(() => {
    const pending = pendingEditorReveal;
    const mountedEditor = editorRef.current;
    if (
      !pending ||
      !mountedEditor ||
      mountedEditor.tabId !== pending.tabId ||
      activeTabId !== pending.tabId ||
      !activeFileReady
    ) {
      return;
    }

    const editor = mountedEditor.editor;
    const model = editor.getModel();
    const lineNumber = Math.min(pending.line, Math.max(1, model?.getLineCount() ?? pending.line));
    const column = Math.min(pending.column, Math.max(1, model?.getLineMaxColumn(lineNumber) ?? 1));
    const position = { lineNumber, column };
    editor.setPosition(position);
    editor.revealPositionInCenterIfOutsideViewport(position);
    editor.focus();
    setPendingEditorReveal(null);
  }, [activeFileReady, activeTabId, editorMountVersion, pendingEditorReveal]);

  useEffect(() => {
    if (
      fileQueryContents !== undefined &&
      activeKind === "file" &&
      activePath &&
      fileQuery.data?.contentKind !== "media" &&
      !activeTabDirty
    ) {
      setFileBuffers((current) => {
        const next = setBufferValue(current, activePath, fileQueryContents);
        fileBuffersRef.current = next;
        return next;
      });
    }
  }, [activeKind, activePath, activeTabDirty, fileQuery.data?.contentKind, fileQueryContents]);

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
        publishActiveSelection(nextActiveTab ? activeSelectionForTab(nextActiveTab) : null);
        persistWorkbenchSelection(nextActiveTab ? selectionForTab(nextActiveTab) : null);
      }
    },
    [activeTabId, persistWorkbenchSelection, publishActiveSelection, tabs],
  );

  const selectTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((tab) => tab.id === tabId);
      if (!tab) return;
      setTabState((current) =>
        current.activeTabId === tabId ? current : { ...current, activeTabId: tabId },
      );
      publishActiveSelection(activeSelectionForTab(tab));
      persistWorkbenchSelection(selectionForTab(tab));
    },
    [persistWorkbenchSelection, publishActiveSelection, tabs],
  );

  useEffect(() => {
    workbenchSelectionVersionRef.current += 1;
    const restoreVersion = workbenchSelectionVersionRef.current;
    setTabState({ tabs: [], activeTabId: null });
    publishActiveSelection(null);
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
  }, [cwd, openTab, props.environmentId, props.threadId, publishActiveSelection]);

  const refreshWorkspace = useCallback(
    () =>
      refreshWorkspaceTarget({
        environmentId: props.environmentId,
        cwd,
        queryClient,
      }),
    [cwd, props.environmentId, queryClient],
  );

  const handleEntriesChanged = useCallback(
    (event: ProjectEntriesStreamEvent) => {
      if (event.type === "entries-changed") {
        void refreshWorkspace();
      }
    },
    [refreshWorkspace],
  );
  const handleEntriesResubscribe = useCallback(() => void refreshWorkspace(), [refreshWorkspace]);
  useProjectEntriesSubscription(
    { environmentId: props.environmentId, cwd },
    handleEntriesChanged,
    handleEntriesResubscribe,
  );

  const saveActive = useCallback(async () => {
    if (!activeTab || !cwd) return;
    if (activeTab.kind === "file" && activePathMediaType !== null) return;
    if (activeTab.kind === "diff" && activeDiffIsMedia) return;
    if (activeTab.kind === "diff" && activeTab.source !== "working-tree") return;
    const contents =
      activeTab.kind === "file"
        ? fileBuffersRef.current[activeTab.path]
        : diffBuffersRef.current[activeTab.id];
    if (contents === undefined) return;
    const api = ensureEnvironmentApi(props.environmentId);
    const activeQueryKey =
      activeTab.kind === "file"
        ? projectQueryKeys.readFile(props.environmentId, cwd, activeTab.path)
        : gitQueryKeys.fileDiff(props.environmentId, cwd, activeTab.path, "working-tree");
    await queryClient.cancelQueries({ queryKey: activeQueryKey, exact: true });
    await api.projects.writeFile({ cwd, relativePath: activeTab.path, contents });
    if (activeTab.kind === "file") {
      queryClient.setQueryData(
        projectQueryKeys.readFile(props.environmentId, cwd, activeTab.path),
        { relativePath: activeTab.path, contents },
      );
    } else {
      queryClient.setQueryData(
        gitQueryKeys.fileDiff(props.environmentId, cwd, activeTab.path, "working-tree"),
        (current) => (current ? { ...current, modified: contents } : current),
      );
    }
    setDirtyTabs((current) => {
      const next = new Set(current);
      next.delete(activeTab.id);
      return next;
    });
    await refreshWorkspace();
  }, [
    activeDiffIsMedia,
    activePathMediaType,
    activeTab,
    cwd,
    props.environmentId,
    queryClient,
    refreshWorkspace,
  ]);

  useEffect(() => {
    saveActiveRef.current = () => {
      void saveActive();
    };
  }, [saveActive]);

  const beforeEditorMount: BeforeMount = useCallback((monaco) => {
    configureWorkbenchMonaco(monaco);
  }, []);

  const onEditorMount: OnMount = useCallback((editor, monaco) => {
    const tab = activeTabRef.current;
    if (tab) {
      editorRef.current = { tabId: tab.id, editor };
    }
    setEditorMountVersion((version) => version + 1);
    editor.focus();
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActiveRef.current();
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.editor.layout();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTabId, editorMountVersion, visible]);

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
      publishActiveSelection(null);
      persistWorkbenchSelection(null);
    },
    [persistWorkbenchSelection, publishActiveSelection],
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
  const showLineWrapControl =
    (activeTab?.kind === "file" && activePathMediaType === null) ||
    (activeTab?.kind === "diff" && !activeDiffIsMedia);
  const lineWrapControl = showLineWrapControl ? (
    <Button
      size="icon-sm"
      variant={lineWrap ? "secondary" : "ghost"}
      className="size-7 cursor-pointer"
      aria-label={lineWrap ? "Disable line wrap" : "Enable line wrap"}
      title={lineWrap ? "Disable line wrap" : "Enable line wrap"}
      onClick={() => setLineWrap((value) => !value)}
    >
      <WrapTextIcon className="size-3.5" />
    </Button>
  ) : null;
  const diffLayoutControl =
    activeTab?.kind === "diff" && !activeDiffIsMedia ? (
      <Button
        size="icon-sm"
        variant={diffLayout === "inline" ? "secondary" : "ghost"}
        className="size-7 cursor-pointer"
        aria-label={
          diffLayout === "side-by-side" ? "Use inline diff layout" : "Use side-by-side diff layout"
        }
        title={
          diffLayout === "side-by-side" ? "Use inline diff layout" : "Use side-by-side diff layout"
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

      {lineWrapControl}
      {diffLayoutControl}
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
        {lineWrapControl}
        {diffLayoutControl}
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

      {lineWrapControl}
      {diffLayoutControl}
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
          ) : activeTab.kind === "diff" && !activeDiffIsMedia && diffQuery.isError ? (
            <WorkbenchMessage>{getErrorMessage(diffQuery.error)}</WorkbenchMessage>
          ) : activeTab.kind === "file" && activeFileMedia ? (
            activeFileMedia.dataUrl && activeFileMedia.mediaKind && activeFileMedia.mediaType ? (
              <WorkbenchMediaViewer
                dataUrl={activeFileMedia.dataUrl}
                mediaKind={activeFileMedia.mediaKind}
                mediaType={activeFileMedia.mediaType}
                path={activeTab.path}
              />
            ) : (
              <WorkbenchMessage>Preview is unavailable.</WorkbenchMessage>
            )
          ) : activeTab.kind === "file" && activePathMediaType !== null && fileQuery.isPending ? (
            <WorkbenchMessage>Loading preview...</WorkbenchMessage>
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
              options={{
                ...workbenchCodeEditorOptions(isMobileLayout),
                wordWrap: lineWrap ? "on" : "off",
              }}
            />
          ) : activeTab.kind === "diff" && activeDiffIsMedia && activePathMediaType !== null ? (
            <WorkbenchDiffUnavailable mediaType={activePathMediaType.mimeType} />
          ) : activeTab.kind === "diff" ? (
            <WorkbenchDiffEditor
              diffLayout={diffLayout}
              id={activeTab.id}
              isMobileLayout={isMobileLayout}
              language={languageFor(activeTab.path) ?? "plaintext"}
              lineWrap={lineWrap}
              original={diffQueryOriginal ?? ""}
              modified={diffBuffers[activeTab.id] ?? diffQueryModified ?? ""}
              onModifiedChange={handleDiffModifiedChange}
              onSave={() => saveActiveRef.current()}
              path={activeTab.path}
              readOnly={activeTab.source !== "working-tree"}
              resolvedTheme={resolvedTheme === "dark" ? "dark" : "light"}
              visible={visible}
            />
          ) : (
            <WorkbenchMessage>Diff preview is unavailable.</WorkbenchMessage>
          )}
        </div>
      </div>
    </section>
  );
}
