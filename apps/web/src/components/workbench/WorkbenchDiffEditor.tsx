import { DiffEditor, type BeforeMount, type DiffOnMount } from "@monaco-editor/react";
import { memo, useCallback, useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import {
  configureWorkbenchMonaco,
  workbenchDiffEditorOptions,
  workbenchEditorTheme,
} from "./monacoWorkbench";

type Disposable = Monaco.IDisposable;

interface WorkbenchDiffEditorProps {
  readonly diffLayout: "side-by-side" | "inline";
  readonly id: string;
  readonly isMobileLayout: boolean;
  readonly language: string;
  readonly lineWrap: boolean;
  readonly modified: string;
  readonly original: string;
  readonly path: string;
  readonly readOnly: boolean;
  readonly resolvedTheme: "dark" | "light";
  readonly autoFocus?: boolean;
  readonly visible?: boolean;
  readonly onAutoFocused?: () => void;
  readonly onModifiedChange: (value: string) => void;
  readonly onSave: () => void;
}

export const WorkbenchDiffEditor = memo(function WorkbenchDiffEditor({
  diffLayout,
  id,
  isMobileLayout,
  language,
  lineWrap,
  modified,
  original,
  path,
  readOnly,
  resolvedTheme,
  autoFocus = false,
  visible = true,
  onAutoFocused,
  onModifiedChange,
  onSave,
}: WorkbenchDiffEditorProps) {
  const diffContentDisposableRef = useRef<Disposable | null>(null);
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const latestModifiedRef = useRef(modified);
  const onSaveRef = useRef(onSave);
  const inlineDiff = isMobileLayout || diffLayout === "inline";

  useEffect(() => {
    latestModifiedRef.current = modified;
  }, [modified]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    configureWorkbenchMonaco(monaco);
  }, []);

  const onDiffMount: DiffOnMount = useCallback(
    (editor, monaco) => {
      diffEditorRef.current = editor;
      const modifiedEditor = editor.getModifiedEditor();
      if (autoFocus) {
        modifiedEditor.focus();
        onAutoFocused?.();
      }
      diffContentDisposableRef.current?.dispose();
      if (readOnly) {
        diffContentDisposableRef.current = null;
        return;
      }
      editor.getOriginalEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
      modifiedEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
      diffContentDisposableRef.current = modifiedEditor.onDidChangeModelContent(() => {
        const nextValue = modifiedEditor.getValue();
        if (nextValue !== latestModifiedRef.current) onModifiedChange(nextValue);
      });
    },
    [autoFocus, onAutoFocused, onModifiedChange, readOnly],
  );

  useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const editor = diffEditorRef.current;
      if (!editor) return;
      editor.getModifiedEditor().focus();
      onAutoFocused?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, id, onAutoFocused]);

  useEffect(() => {
    return () => {
      diffContentDisposableRef.current?.dispose();
      diffContentDisposableRef.current = null;
      diffEditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      diffEditorRef.current?.layout();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [id, inlineDiff, visible]);

  return (
    <DiffEditor
      key={`${id}:${inlineDiff ? "inline" : "side-by-side"}`}
      beforeMount={beforeMount}
      className="t3-workbench-monaco t3-workbench-diff-editor"
      language={language}
      modified={modified}
      modifiedModelPath={`t3-diff-modified://${path}`}
      onMount={onDiffMount}
      options={{
        ...workbenchDiffEditorOptions(inlineDiff),
        readOnly,
        renderSideBySide: !inlineDiff,
        wordWrap: lineWrap ? "on" : "off",
      }}
      original={original}
      originalModelPath={`t3-diff-original://${path}`}
      theme={workbenchEditorTheme(resolvedTheme)}
    />
  );
});
