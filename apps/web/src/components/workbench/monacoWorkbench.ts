import type * as Monaco from "monaco-editor";

export const WORKBENCH_MONACO_DARK_THEME = "t3-workbench-dark";
export const WORKBENCH_MONACO_LIGHT_THEME = "t3-workbench-light";

type MonacoApi = typeof Monaco;

interface TypeScriptDiagnosticsOptions {
  readonly noSemanticValidation?: boolean;
  readonly noSuggestionDiagnostics?: boolean;
  readonly noSyntaxValidation?: boolean;
}

interface TypeScriptDefaults {
  setDiagnosticsOptions(options: TypeScriptDiagnosticsOptions): void;
}

interface CssDefaults {
  setOptions(options: { readonly validate?: boolean }): void;
}

interface JsonDefaults {
  setDiagnosticsOptions(options: { readonly validate?: boolean }): void;
}

type MonacoWithLanguageDefaults = MonacoApi & {
  readonly languages: MonacoApi["languages"] & {
    readonly css: {
      readonly cssDefaults: CssDefaults;
      readonly lessDefaults: CssDefaults;
      readonly scssDefaults: CssDefaults;
    };
    readonly json: {
      readonly jsonDefaults: JsonDefaults;
    };
    readonly typescript: {
      readonly javascriptDefaults: TypeScriptDefaults;
      readonly typescriptDefaults: TypeScriptDefaults;
    };
  };
};

const hiddenScrollbars: Monaco.editor.IEditorScrollbarOptions = {
  alwaysConsumeMouseWheel: false,
  horizontalScrollbarSize: 8,
  verticalScrollbarSize: 8,
};

const commonEditorOptions = {
  automaticLayout: true,
  bracketPairColorization: { enabled: false },
  colorDecorators: false,
  contextmenu: true,
  cursorBlinking: "solid",
  folding: false,
  glyphMargin: false,
  guides: {
    bracketPairs: false,
    bracketPairsHorizontal: false,
    indentation: true,
  },
  hideCursorInOverviewRuler: true,
  lineDecorationsWidth: 8,
  lineHeight: 21,
  lineNumbersMinChars: 3,
  matchBrackets: "never",
  occurrencesHighlight: "off",
  overviewRulerBorder: false,
  overviewRulerLanes: 2,
  renderControlCharacters: false,
  renderLineHighlight: "none",
  renderValidationDecorations: "off",
  renderWhitespace: "none",
  scrollbar: hiddenScrollbars,
  selectionHighlight: false,
  smoothScrolling: true,
  stickyScroll: { enabled: false },
  wordWrap: "off",
} satisfies Monaco.editor.IStandaloneEditorConstructionOptions;

export function workbenchEditorTheme(resolvedTheme: "dark" | "light"): string {
  return resolvedTheme === "dark" ? WORKBENCH_MONACO_DARK_THEME : WORKBENCH_MONACO_LIGHT_THEME;
}

export function workbenchCodeEditorOptions(
  isMobileLayout: boolean,
): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    ...commonEditorOptions,
    fontSize: isMobileLayout ? 12 : 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
  };
}

export function workbenchDiffEditorOptions(
  isMobileLayout: boolean,
): Monaco.editor.IStandaloneDiffEditorConstructionOptions {
  return {
    ...commonEditorOptions,
    compactMode: isMobileLayout,
    diffAlgorithm: "advanced",
    diffCodeLens: false,
    enableSplitViewResizing: true,
    experimental: {
      showEmptyDecorations: true,
      showMoves: false,
    },
    fontSize: isMobileLayout ? 12 : 13,
    ignoreTrimWhitespace: false,
    minimap: { enabled: false },
    originalEditable: false,
    readOnly: false,
    renderGutterMenu: false,
    renderIndicators: true,
    renderMarginRevertIcon: false,
    renderOverviewRuler: true,
    renderSideBySide: !isMobileLayout,
    scrollBeyondLastLine: false,
    splitViewDefaultRatio: 0.5,
    useInlineViewWhenSpaceIsLimited: false,
  };
}

export function configureWorkbenchMonaco(monaco: MonacoApi): void {
  const languageDefaults = monaco as MonacoWithLanguageDefaults;

  languageDefaults.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
    noSyntaxValidation: true,
  });
  languageDefaults.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
    noSyntaxValidation: true,
  });
  languageDefaults.languages.css.cssDefaults.setOptions({ validate: false });
  languageDefaults.languages.css.scssDefaults.setOptions({ validate: false });
  languageDefaults.languages.css.lessDefaults.setOptions({ validate: false });
  languageDefaults.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false });

  monaco.editor.defineTheme(WORKBENCH_MONACO_DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "c9d1d9" },
      { token: "comment", foreground: "8b949e", fontStyle: "italic" },
      { token: "keyword", foreground: "ff7b72" },
      { token: "number", foreground: "79c0ff" },
      { token: "string", foreground: "a5d6ff" },
      { token: "type", foreground: "ffa657" },
    ],
    colors: {
      "diffEditor.insertedLineBackground": "#2ea04322",
      "diffEditor.insertedTextBackground": "#3fb95044",
      "diffEditor.removedLineBackground": "#f8514928",
      "diffEditor.removedTextBackground": "#ff7b7244",
      "editor.background": "#1f232a",
      "editor.foreground": "#c9d1d9",
      "editor.lineHighlightBackground": "#00000000",
      "editor.selectionBackground": "#264f78",
      "editorCursor.foreground": "#c9d1d9",
      "editorGutter.background": "#1f232a",
      "editorIndentGuide.activeBackground1": "#4b556366",
      "editorIndentGuide.background1": "#4b556333",
      "editorLineNumber.activeForeground": "#c9d1d9",
      "editorLineNumber.foreground": "#6e7681",
      "editorOverviewRuler.addedForeground": "#3fb950aa",
      "editorOverviewRuler.deletedForeground": "#f85149aa",
      "editorOverviewRuler.modifiedForeground": "#79c0ffaa",
      "editorWidget.background": "#1f232a",
      "scrollbar.shadow": "#00000000",
    },
  });

  monaco.editor.defineTheme(WORKBENCH_MONACO_LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: "24292f" },
      { token: "comment", foreground: "6e7781", fontStyle: "italic" },
      { token: "keyword", foreground: "cf222e" },
      { token: "number", foreground: "0550ae" },
      { token: "string", foreground: "0a3069" },
      { token: "type", foreground: "953800" },
    ],
    colors: {
      "diffEditor.insertedLineBackground": "#1a7f3720",
      "diffEditor.insertedTextBackground": "#2da44e40",
      "diffEditor.removedLineBackground": "#cf222e22",
      "diffEditor.removedTextBackground": "#cf222e3d",
      "editor.background": "#f6f8fa",
      "editor.foreground": "#24292f",
      "editor.lineHighlightBackground": "#00000000",
      "editor.selectionBackground": "#0969da30",
      "editorCursor.foreground": "#24292f",
      "editorGutter.background": "#f6f8fa",
      "editorIndentGuide.activeBackground1": "#8c959f66",
      "editorIndentGuide.background1": "#8c959f33",
      "editorLineNumber.activeForeground": "#24292f",
      "editorLineNumber.foreground": "#8c959f",
      "editorOverviewRuler.addedForeground": "#1a7f37aa",
      "editorOverviewRuler.deletedForeground": "#cf222eaa",
      "editorOverviewRuler.modifiedForeground": "#0969daaa",
      "editorWidget.background": "#f6f8fa",
      "scrollbar.shadow": "#00000000",
    },
  });
}
