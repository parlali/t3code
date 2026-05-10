import {
  DiffEditor,
  Editor,
  type BeforeMount,
  type DiffOnMount,
  type OnMount,
} from "@monaco-editor/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import {
  configureWorkbenchMonaco,
  workbenchCodeEditorOptions,
  workbenchDiffEditorOptions,
  workbenchEditorTheme,
} from "./monacoWorkbench";
import { parseChangedLineRanges } from "./workbenchUtils";

type CodeEditor = Monaco.editor.IStandaloneCodeEditor;
type DecorationsCollection = Monaco.editor.IEditorDecorationsCollection;
type Disposable = Monaco.IDisposable;

interface WorkbenchDiffEditorProps {
  readonly diff: string;
  readonly id: string;
  readonly isMobileLayout: boolean;
  readonly language: string;
  readonly modified: string;
  readonly original: string;
  readonly path: string;
  readonly resolvedTheme: "dark" | "light";
  readonly onModifiedChange: (value: string) => void;
  readonly onSave: () => void;
}

export const WorkbenchDiffEditor = memo(function WorkbenchDiffEditor({
  diff,
  id,
  isMobileLayout,
  language,
  modified,
  original,
  path,
  resolvedTheme,
  onModifiedChange,
  onSave,
}: WorkbenchDiffEditorProps) {
  const monacoRef = useRef<typeof Monaco | null>(null);
  const originalEditorRef = useRef<CodeEditor | null>(null);
  const modifiedEditorRef = useRef<CodeEditor | null>(null);
  const originalDecorationsRef = useRef<DecorationsCollection | null>(null);
  const modifiedDecorationsRef = useRef<DecorationsCollection | null>(null);
  const diffContentDisposableRef = useRef<Disposable | null>(null);
  const scrollDisposablesRef = useRef<Disposable[]>([]);
  const latestModifiedRef = useRef(modified);
  const onSaveRef = useRef(onSave);
  const [mobileMountVersion, setMobileMountVersion] = useState(0);

  useEffect(() => {
    latestModifiedRef.current = modified;
  }, [modified]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco;
    configureWorkbenchMonaco(monaco);
  }, []);

  const syncMobileEditors = useCallback(() => {
    for (const disposable of scrollDisposablesRef.current) disposable.dispose();
    scrollDisposablesRef.current = [];

    const originalEditor = originalEditorRef.current;
    const modifiedEditor = modifiedEditorRef.current;
    if (!originalEditor || !modifiedEditor) return;

    let syncing = false;
    const syncScroll = (source: CodeEditor, target: CodeEditor) => {
      if (syncing) return;
      const sourceRange = Math.max(1, source.getScrollHeight() - source.getLayoutInfo().height);
      const targetRange = Math.max(1, target.getScrollHeight() - target.getLayoutInfo().height);
      syncing = true;
      target.setScrollTop((source.getScrollTop() / sourceRange) * targetRange);
      requestAnimationFrame(() => {
        syncing = false;
      });
    };

    scrollDisposablesRef.current = [
      originalEditor.onDidScrollChange(() => syncScroll(originalEditor, modifiedEditor)),
      modifiedEditor.onDidScrollChange(() => syncScroll(modifiedEditor, originalEditor)),
    ];
  }, []);

  const onOriginalMount: OnMount = useCallback(
    (editor, monaco) => {
      monacoRef.current = monaco;
      originalEditorRef.current = editor;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
      syncMobileEditors();
      setMobileMountVersion((version) => version + 1);
    },
    [syncMobileEditors],
  );

  const onModifiedMount: OnMount = useCallback(
    (editor, monaco) => {
      monacoRef.current = monaco;
      modifiedEditorRef.current = editor;
      editor.focus();
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
      syncMobileEditors();
      setMobileMountVersion((version) => version + 1);
    },
    [syncMobileEditors],
  );

  const onDiffMount: DiffOnMount = useCallback(
    (editor, monaco) => {
      const modifiedEditor = editor.getModifiedEditor();
      modifiedEditor.focus();
      editor.getOriginalEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
      modifiedEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
      diffContentDisposableRef.current?.dispose();
      diffContentDisposableRef.current = modifiedEditor.onDidChangeModelContent(() => {
        const nextValue = modifiedEditor.getValue();
        if (nextValue !== latestModifiedRef.current) onModifiedChange(nextValue);
      });
    },
    [onModifiedChange],
  );

  useEffect(() => {
    if (!isMobileLayout) return;
    const monaco = monacoRef.current;
    const originalEditor = originalEditorRef.current;
    const modifiedEditor = modifiedEditorRef.current;
    if (!monaco || !originalEditor || !modifiedEditor) return;

    const ranges = parseChangedLineRanges(diff);
    originalDecorationsRef.current ??= originalEditor.createDecorationsCollection();
    modifiedDecorationsRef.current ??= modifiedEditor.createDecorationsCollection();
    originalDecorationsRef.current.set(
      ranges.original.map((range) => ({
        range: new monaco.Range(range.startLineNumber, 1, range.endLineNumber, 1),
        options: {
          className: "t3-workbench-diff-removed-line",
          isWholeLine: true,
          minimap: { color: "#f85149", position: monaco.editor.MinimapPosition.Inline },
          overviewRuler: {
            color: "#f85149",
            position: monaco.editor.OverviewRulerLane.Right,
          },
        },
      })),
    );
    modifiedDecorationsRef.current.set(
      ranges.modified.map((range) => ({
        range: new monaco.Range(range.startLineNumber, 1, range.endLineNumber, 1),
        options: {
          className: "t3-workbench-diff-inserted-line",
          isWholeLine: true,
          minimap: { color: "#3fb950", position: monaco.editor.MinimapPosition.Inline },
          overviewRuler: {
            color: "#3fb950",
            position: monaco.editor.OverviewRulerLane.Right,
          },
        },
      })),
    );
  }, [diff, isMobileLayout, mobileMountVersion]);

  useEffect(() => {
    return () => {
      for (const disposable of scrollDisposablesRef.current) disposable.dispose();
      scrollDisposablesRef.current = [];
      originalDecorationsRef.current?.clear();
      modifiedDecorationsRef.current?.clear();
      diffContentDisposableRef.current?.dispose();
      diffContentDisposableRef.current = null;
    };
  }, []);

  if (isMobileLayout) {
    const options = workbenchCodeEditorOptions(true);
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <MobileDiffPaneHeader label="Original" path={path} />
        <div className="min-h-0 flex-1 border-b border-border">
          <Editor
            key={`${id}:original`}
            beforeMount={beforeMount}
            className="t3-workbench-monaco"
            language={language}
            onMount={onOriginalMount}
            options={{ ...options, readOnly: true }}
            path={`t3-diff-original://${path}`}
            theme={workbenchEditorTheme(resolvedTheme)}
            value={original}
          />
        </div>
        <MobileDiffPaneHeader label="Working tree" path={path} />
        <div className="min-h-0 flex-1">
          <Editor
            key={`${id}:modified`}
            beforeMount={beforeMount}
            className="t3-workbench-monaco"
            language={language}
            onChange={(value) => {
              const nextValue = value ?? "";
              if (nextValue !== latestModifiedRef.current) onModifiedChange(nextValue);
            }}
            onMount={onModifiedMount}
            options={{ ...options, readOnly: false }}
            path={`t3-diff-modified://${path}`}
            theme={workbenchEditorTheme(resolvedTheme)}
            value={modified}
          />
        </div>
      </div>
    );
  }

  return (
    <DiffEditor
      key={id}
      beforeMount={beforeMount}
      className="t3-workbench-monaco t3-workbench-diff-editor"
      language={language}
      modified={modified}
      modifiedModelPath={`t3-diff-modified://${path}`}
      onMount={onDiffMount}
      options={workbenchDiffEditorOptions(false)}
      original={original}
      originalModelPath={`t3-diff-original://${path}`}
      theme={workbenchEditorTheme(resolvedTheme)}
    />
  );
});

function MobileDiffPaneHeader(props: { readonly label: string; readonly path: string }) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3 text-[11px] text-muted-foreground">
      <span className="font-medium uppercase tracking-wide">{props.label}</span>
      <span className="min-w-0 truncate">{props.path}</span>
    </div>
  );
}
