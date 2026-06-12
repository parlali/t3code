import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { Plus, SquareSplitHorizontal, TerminalSquare, Trash2, XIcon } from "lucide-react";
import {
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  type TerminalEvent,
  type ThreadId,
} from "@t3tools/contracts";
import { Terminal, type ITheme } from "@xterm/xterm";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import {
  startResizeInteraction,
  type ResizeInteractionHandle,
} from "~/components/ui/resize-interaction";
import { SNAPPY_TRANSITION_EASING_CLASS } from "~/components/ui/animation";
import { type TerminalContextSelection } from "~/lib/terminalContext";
import { cn } from "~/lib/utils";
import { restoreTerminalSnapshot } from "~/terminalSnapshotRestore";
import { recordClientPerfEvent } from "~/observability/perfDiagnostics";
import { openInPreferredEditor } from "../editorPreferences";
import {
  collectWrappedTerminalLinkLine,
  extractTerminalLinks,
  isTerminalLinkActivation,
  resolvePathLinkTarget,
  resolveWrappedTerminalLinkRange,
  wrappedTerminalLinkRangeIntersectsBufferLine,
} from "../terminal-links";
import {
  isTerminalClearShortcut,
  isTerminalCloseShortcut,
  isTerminalNewShortcut,
  isTerminalSplitShortcut,
  isTerminalToggleShortcut,
  terminalDeleteShortcutData,
  terminalNavigationShortcutData,
} from "../keybindings";
import {
  DEFAULT_THREAD_TERMINAL_HEIGHT,
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  type ThreadTerminalGroup,
} from "../types";
import { readEnvironmentApi } from "~/environmentApi";
import { readLocalApi } from "~/localApi";

const MIN_DRAWER_HEIGHT = 180;
const MAX_DRAWER_HEIGHT_RATIO = 0.75;
const MULTI_CLICK_SELECTION_ACTION_DELAY_MS = 260;
const TERMINAL_INPUT_FLUSH_MAX_BYTES = 32_768;
const TERMINAL_INPUT_CHUNK_MAX_BYTES = 60_000;
const TERMINAL_OUTPUT_FLUSH_MAX_BYTES = 256_000;

function maxDrawerHeight(): number {
  if (typeof window === "undefined") return DEFAULT_THREAD_TERMINAL_HEIGHT;
  return Math.max(MIN_DRAWER_HEIGHT, Math.floor(window.innerHeight * MAX_DRAWER_HEIGHT_RATIO));
}

function clampDrawerHeight(height: number): number {
  const safeHeight = Number.isFinite(height) ? height : DEFAULT_THREAD_TERMINAL_HEIGHT;
  const maxHeight = maxDrawerHeight();
  return Math.min(Math.max(Math.round(safeHeight), MIN_DRAWER_HEIGHT), maxHeight);
}

function writeSystemMessage(terminal: Terminal, message: string): void {
  terminal.write(`\r\n[terminal] ${message}\r\n`);
}

export function selectTerminalEventEntriesAfterSnapshot(
  entries: ReadonlyArray<{ id: number; event: TerminalEvent }>,
  snapshotUpdatedAt: string,
): ReadonlyArray<{ id: number; event: TerminalEvent }> {
  return entries.filter((entry) => entry.event.createdAt > snapshotUpdatedAt);
}

export function selectPendingTerminalEventEntries(
  entries: ReadonlyArray<{ id: number; event: TerminalEvent }>,
  lastAppliedTerminalEventId: number,
): ReadonlyArray<{ id: number; event: TerminalEvent }> {
  return entries.filter((entry) => entry.id > lastAppliedTerminalEventId);
}

function normalizeComputedColor(value: string | null | undefined, fallback: string): string {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return fallback;
  }
  return value ?? fallback;
}

function terminalThemeFromApp(mountElement?: HTMLElement | null): ITheme {
  const isDark = document.documentElement.classList.contains("dark");
  const fallbackBackground = isDark ? "rgb(14, 18, 24)" : "rgb(255, 255, 255)";
  const fallbackForeground = isDark ? "rgb(237, 241, 247)" : "rgb(28, 33, 41)";
  const drawerSurface =
    mountElement?.closest(".thread-terminal-drawer") ??
    document.querySelector(".thread-terminal-drawer") ??
    document.body;
  const drawerStyles = getComputedStyle(drawerSurface);
  const bodyStyles = getComputedStyle(document.body);
  const background = normalizeComputedColor(
    drawerStyles.backgroundColor,
    normalizeComputedColor(bodyStyles.backgroundColor, fallbackBackground),
  );
  const foreground = normalizeComputedColor(
    drawerStyles.color,
    normalizeComputedColor(bodyStyles.color, fallbackForeground),
  );
  const ansiPalette = {
    black: "rgb(0, 0, 0)",
    red: "rgb(205, 49, 49)",
    green: "rgb(13, 188, 121)",
    yellow: "rgb(229, 229, 16)",
    blue: "rgb(36, 114, 200)",
    magenta: "rgb(188, 63, 188)",
    cyan: "rgb(17, 168, 205)",
    white: "rgb(229, 229, 229)",
    brightBlack: "rgb(102, 102, 102)",
    brightRed: "rgb(241, 76, 76)",
    brightGreen: "rgb(35, 209, 139)",
    brightYellow: "rgb(245, 245, 67)",
    brightBlue: "rgb(59, 142, 234)",
    brightMagenta: "rgb(214, 112, 214)",
    brightCyan: "rgb(41, 184, 219)",
    brightWhite: "rgb(255, 255, 255)",
  };

  if (isDark) {
    return {
      background,
      foreground,
      cursor: "rgb(180, 203, 255)",
      selectionBackground: "rgba(180, 203, 255, 0.25)",
      scrollbarSliderBackground: "rgba(255, 255, 255, 0.1)",
      scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.18)",
      scrollbarSliderActiveBackground: "rgba(255, 255, 255, 0.22)",
      ...ansiPalette,
    };
  }

  return {
    background,
    foreground,
    cursor: "rgb(38, 56, 78)",
    selectionBackground: "rgba(37, 63, 99, 0.2)",
    scrollbarSliderBackground: "rgba(0, 0, 0, 0.15)",
    scrollbarSliderHoverBackground: "rgba(0, 0, 0, 0.25)",
    scrollbarSliderActiveBackground: "rgba(0, 0, 0, 0.3)",
    ...ansiPalette,
  };
}

function getTerminalSelectionRect(mountElement: HTMLElement): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  const selectionRoot =
    commonAncestor instanceof Element ? commonAncestor : commonAncestor.parentElement;
  if (!(selectionRoot instanceof Element) || !mountElement.contains(selectionRoot)) {
    return null;
  }

  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  if (rects.length > 0) {
    return rects[rects.length - 1] ?? null;
  }

  const boundingRect = range.getBoundingClientRect();
  return boundingRect.width > 0 || boundingRect.height > 0 ? boundingRect : null;
}

export function resolveTerminalSelectionActionPosition(options: {
  bounds: { left: number; top: number; width: number; height: number };
  selectionRect: { right: number; bottom: number } | null;
  pointer: { x: number; y: number } | null;
  viewport?: { width: number; height: number } | null;
}): { x: number; y: number } {
  const { bounds, selectionRect, pointer, viewport } = options;
  const viewportWidth =
    viewport?.width ??
    (typeof window === "undefined" ? bounds.left + bounds.width + 8 : window.innerWidth);
  const viewportHeight =
    viewport?.height ??
    (typeof window === "undefined" ? bounds.top + bounds.height + 8 : window.innerHeight);
  const drawerLeft = Math.round(bounds.left);
  const drawerTop = Math.round(bounds.top);
  const drawerRight = Math.round(bounds.left + bounds.width);
  const drawerBottom = Math.round(bounds.top + bounds.height);
  const preferredX =
    selectionRect !== null
      ? Math.round(selectionRect.right)
      : pointer === null
        ? Math.round(bounds.left + bounds.width - 140)
        : Math.max(drawerLeft, Math.min(Math.round(pointer.x), drawerRight));
  const preferredY =
    selectionRect !== null
      ? Math.round(selectionRect.bottom + 4)
      : pointer === null
        ? Math.round(bounds.top + 12)
        : Math.max(drawerTop, Math.min(Math.round(pointer.y), drawerBottom));
  return {
    x: Math.max(8, Math.min(preferredX, Math.max(viewportWidth - 8, 8))),
    y: Math.max(8, Math.min(preferredY, Math.max(viewportHeight - 8, 8))),
  };
}

export function terminalSelectionActionDelayForClickCount(clickCount: number): number {
  return clickCount >= 2 ? MULTI_CLICK_SELECTION_ACTION_DELAY_MS : 0;
}

export function shouldHandleTerminalSelectionMouseUp(
  selectionGestureActive: boolean,
  button: number,
): boolean {
  return selectionGestureActive && button === 0;
}

interface TerminalViewportProps {
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  terminalId: string;
  terminalLabel: string;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  onSessionExited: () => void;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  focusRequestId: number;
  autoFocus: boolean;
  resizeEpoch: number;
  drawerHeight: number;
  keybindings: ResolvedKeybindingsConfig;
}

export function TerminalViewport({
  threadRef,
  threadId,
  terminalId,
  terminalLabel,
  cwd,
  worktreePath,
  runtimeEnv,
  onSessionExited,
  onAddTerminalContext,
  focusRequestId,
  autoFocus,
  resizeEpoch,
  drawerHeight,
  keybindings,
}: TerminalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const environmentId = threadRef.environmentId;
  const hasHandledExitRef = useRef(false);
  const selectionPointerRef = useRef<{ x: number; y: number } | null>(null);
  const selectionGestureActiveRef = useRef(false);
  const selectionActionRequestIdRef = useRef(0);
  const selectionActionOpenRef = useRef(false);
  const selectionActionTimerRef = useRef<number | null>(null);
  const keybindingsRef = useRef(keybindings);
  const lastAppliedSequenceRef = useRef(0);
  const attachRequestIdRef = useRef(0);
  const terminalSessionReadyRef = useRef(false);
  const firstOutputLoggedRef = useRef(false);
  const lastHandledFocusRequestIdRef = useRef(focusRequestId);
  const handleSessionExited = useEffectEvent(() => {
    onSessionExited();
  });
  const handleAddTerminalContext = useEffectEvent((selection: TerminalContextSelection) => {
    onAddTerminalContext(selection);
  });
  const readTerminalLabel = useEffectEvent(() => terminalLabel);

  useEffect(() => {
    keybindingsRef.current = keybindings;
  }, [keybindings]);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    let disposed = false;
    terminalSessionReadyRef.current = false;
    const api = readEnvironmentApi(environmentId);
    const localApi = readLocalApi();
    if (!api || !localApi) return;
    const terminalApi = api.terminal;

    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();
    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      lineHeight: 1.2,
      fontSize: 12,
      scrollback: 5_000,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      fontFamily:
        '"SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace',
      theme: terminalThemeFromApp(mount),
    });
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = "11";
    const mountedAtMs = performance.now();
    recordClientPerfEvent("terminal.viewport.mount.start", {
      threadId,
      terminalId,
      cwd,
    });
    terminal.open(mount);
    fitAddon.fit();
    recordClientPerfEvent("terminal.viewport.mount.finish", {
      threadId,
      terminalId,
      durationMs: Math.round(performance.now() - mountedAtMs),
      cols: terminal.cols,
      rows: terminal.rows,
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const clearSelectionAction = () => {
      selectionActionRequestIdRef.current += 1;
      if (selectionActionTimerRef.current !== null) {
        window.clearTimeout(selectionActionTimerRef.current);
        selectionActionTimerRef.current = null;
      }
    };

    const readSelectionAction = (): {
      position: { x: number; y: number };
      selection: TerminalContextSelection;
    } | null => {
      const activeTerminal = terminalRef.current;
      const mountElement = containerRef.current;
      if (!activeTerminal || !mountElement || !activeTerminal.hasSelection()) {
        return null;
      }
      const selectionText = activeTerminal.getSelection();
      const selectionPosition = activeTerminal.getSelectionPosition();
      const normalizedText = selectionText.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
      if (!selectionPosition || normalizedText.length === 0) {
        return null;
      }
      const lineStart = selectionPosition.start.y + 1;
      const lineCount = normalizedText.split("\n").length;
      const lineEnd = Math.max(lineStart, lineStart + lineCount - 1);
      const bounds = mountElement.getBoundingClientRect();
      const selectionRect = getTerminalSelectionRect(mountElement);
      const position = resolveTerminalSelectionActionPosition({
        bounds,
        selectionRect:
          selectionRect === null
            ? null
            : { right: selectionRect.right, bottom: selectionRect.bottom },
        pointer: selectionPointerRef.current,
      });
      return {
        position,
        selection: {
          terminalId,
          terminalLabel: readTerminalLabel(),
          lineStart,
          lineEnd,
          text: normalizedText,
        },
      };
    };

    const showSelectionAction = async () => {
      if (selectionActionOpenRef.current) {
        return;
      }
      const nextAction = readSelectionAction();
      if (!nextAction) {
        clearSelectionAction();
        return;
      }
      const requestId = ++selectionActionRequestIdRef.current;
      selectionActionOpenRef.current = true;
      try {
        const clicked = await localApi.contextMenu.show(
          [{ id: "add-to-chat", label: "Add to chat" }],
          nextAction.position,
        );
        if (requestId !== selectionActionRequestIdRef.current || clicked !== "add-to-chat") {
          return;
        }
        handleAddTerminalContext(nextAction.selection);
        terminalRef.current?.clearSelection();
        terminalRef.current?.focus();
      } finally {
        selectionActionOpenRef.current = false;
      }
    };

    let pendingInput = "";
    let inputFlushQueued = false;
    let nextPerfInputId = 0;
    const isInputPerfTraceEnabled =
      typeof window !== "undefined" &&
      (window as unknown as { __T3_TERMINAL_PERF_TRACE__?: boolean }).__T3_TERMINAL_PERF_TRACE__ ===
        true;

    const flushTerminalInput = () => {
      inputFlushQueued = false;
      if (disposed) {
        pendingInput = "";
        return;
      }
      const data = pendingInput;
      pendingInput = "";
      if (data.length === 0) return;

      for (let index = 0; index < data.length; index += TERMINAL_INPUT_CHUNK_MAX_BYTES) {
        const chunk = data.slice(index, index + TERMINAL_INPUT_CHUNK_MAX_BYTES);
        const perfFields = isInputPerfTraceEnabled
          ? { perfInputId: ++nextPerfInputId, perfClientSentAtMs: Date.now() }
          : null;
        const writePromise = terminalApi.write({
          threadId,
          terminalId,
          data: chunk,
          ...(perfFields ?? {}),
        });
        if (perfFields !== null) {
          const { perfInputId, perfClientSentAtMs } = perfFields;
          const bytes = chunk.length;
          writePromise.then(
            () => {
              recordClientPerfEvent("terminal.perf.write.ack", {
                threadId,
                terminalId,
                perfInputId,
                bytes,
                clientSentAtMs: perfClientSentAtMs,
                clientAckAtMs: Date.now(),
                clientWriteAckMs: Date.now() - perfClientSentAtMs,
              });
            },
            (err) => {
              if (disposed) return;
              writeSystemMessage(
                terminal,
                err instanceof Error ? err.message : "Terminal write failed",
              );
            },
          );
        } else {
          writePromise.catch((err) => {
            if (disposed) return;
            writeSystemMessage(
              terminal,
              err instanceof Error ? err.message : "Terminal write failed",
            );
          });
        }
      }
    };

    const queueTerminalInput = (data: string) => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) return;
      pendingInput += data;
      if (pendingInput.length >= TERMINAL_INPUT_FLUSH_MAX_BYTES) {
        flushTerminalInput();
        return;
      }
      if (inputFlushQueued) return;
      inputFlushQueued = true;
      window.queueMicrotask(flushTerminalInput);
    };

    terminal.attachCustomKeyEventHandler((event) => {
      const currentKeybindings = keybindingsRef.current;
      const options = { context: { terminalFocus: true, terminalOpen: true } };
      if (
        isTerminalToggleShortcut(event, currentKeybindings, options) ||
        isTerminalSplitShortcut(event, currentKeybindings, options) ||
        isTerminalNewShortcut(event, currentKeybindings, options) ||
        isTerminalCloseShortcut(event, currentKeybindings, options)
      ) {
        return false;
      }

      const navigationData = terminalNavigationShortcutData(event);
      if (navigationData !== null) {
        event.preventDefault();
        event.stopPropagation();
        queueTerminalInput(navigationData);
        return false;
      }

      const deleteData = terminalDeleteShortcutData(event);
      if (deleteData !== null) {
        event.preventDefault();
        event.stopPropagation();
        queueTerminalInput(deleteData);
        return false;
      }

      if (!isTerminalClearShortcut(event)) return true;
      event.preventDefault();
      event.stopPropagation();
      queueTerminalInput("\u000c");
      return false;
    });

    const terminalLinksDisposable = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) {
          callback(undefined);
          return;
        }

        const wrappedLine = collectWrappedTerminalLinkLine(bufferLineNumber, (bufferLineIndex) =>
          activeTerminal.buffer.active.getLine(bufferLineIndex),
        );
        if (!wrappedLine) {
          callback(undefined);
          return;
        }

        const links = extractTerminalLinks(wrappedLine.text)
          .map((match) => ({
            match,
            range: resolveWrappedTerminalLinkRange(wrappedLine, match),
          }))
          .filter(({ range }) =>
            wrappedTerminalLinkRangeIntersectsBufferLine(range, bufferLineNumber),
          );
        if (links.length === 0) {
          callback(undefined);
          return;
        }

        callback(
          links.map(({ match, range }) => ({
            text: match.text,
            range,
            activate: (event: MouseEvent) => {
              if (!isTerminalLinkActivation(event)) return;

              const latestTerminal = terminalRef.current;
              if (!latestTerminal) return;

              if (match.kind === "url") {
                void localApi.shell.openExternal(match.text).catch((error: unknown) => {
                  writeSystemMessage(
                    latestTerminal,
                    error instanceof Error ? error.message : "Unable to open link",
                  );
                });
                return;
              }

              const target = resolvePathLinkTarget(match.text, cwd);
              void openInPreferredEditor(localApi, target).catch((error) => {
                writeSystemMessage(
                  latestTerminal,
                  error instanceof Error ? error.message : "Unable to open path",
                );
              });
            },
          })),
        );
      },
    });

    const inputDisposable = terminal.onData(queueTerminalInput);

    const selectionDisposable = terminal.onSelectionChange(() => {
      if (terminalRef.current?.hasSelection()) {
        return;
      }
      clearSelectionAction();
    });

    const handleMouseUp = (event: MouseEvent) => {
      const shouldHandle = shouldHandleTerminalSelectionMouseUp(
        selectionGestureActiveRef.current,
        event.button,
      );
      selectionGestureActiveRef.current = false;
      if (!shouldHandle) {
        return;
      }
      selectionPointerRef.current = { x: event.clientX, y: event.clientY };
      const delay = terminalSelectionActionDelayForClickCount(event.detail);
      selectionActionTimerRef.current = window.setTimeout(() => {
        selectionActionTimerRef.current = null;
        window.requestAnimationFrame(() => {
          void showSelectionAction();
        });
      }, delay);
    };
    const handlePointerDown = (event: PointerEvent) => {
      clearSelectionAction();
      selectionGestureActiveRef.current = event.button === 0;
    };
    window.addEventListener("mouseup", handleMouseUp);
    mount.addEventListener("pointerdown", handlePointerDown);

    const themeObserver = new MutationObserver(() => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) return;
      activeTerminal.options.theme = terminalThemeFromApp(containerRef.current);
      activeTerminal.refresh(0, activeTerminal.rows - 1);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    let pendingOutput = "";
    let outputFlushFrame: number | null = null;
    interface PendingPerfEntry {
      sequence: number;
      bytes: number;
      receivedAtMs: number;
      serverDrainedAtMs: number;
      serverPublishedAtMs: number;
      replayWriteMs: number;
      historyAppendMs: number;
    }
    let pendingPerfEntries: PendingPerfEntry[] = [];

    const flushTerminalOutput = () => {
      outputFlushFrame = null;
      if (pendingOutput.length === 0) {
        return;
      }
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) {
        pendingOutput = "";
        pendingPerfEntries = [];
        return;
      }
      const data = pendingOutput;
      pendingOutput = "";
      const flushedPerfEntries = pendingPerfEntries;
      pendingPerfEntries = [];
      const writeStartedAtMs = flushedPerfEntries.length > 0 ? Date.now() : 0;
      const handleWritten = () => {
        if (flushedPerfEntries.length === 0) {
          return;
        }
        const wroteAtMs = Date.now();
        for (const entry of flushedPerfEntries) {
          recordClientPerfEvent("terminal.perf.client", {
            threadId,
            terminalId,
            sequence: entry.sequence,
            bytes: entry.bytes,
            serverDrainedAtMs: entry.serverDrainedAtMs,
            serverPublishedAtMs: entry.serverPublishedAtMs,
            replayWriteMs: entry.replayWriteMs,
            historyAppendMs: entry.historyAppendMs,
            receivedAtMs: entry.receivedAtMs,
            writeStartedAtMs,
            wroteAtMs,
            transportLatencyMs: entry.receivedAtMs - entry.serverPublishedAtMs,
            clientQueueMs: writeStartedAtMs - entry.receivedAtMs,
            xtermWriteMs: wroteAtMs - writeStartedAtMs,
            endToEndMs: wroteAtMs - entry.serverDrainedAtMs,
            batchSize: flushedPerfEntries.length,
            batchBytes: data.length,
          });
        }
      };
      if (flushedPerfEntries.length > 0) {
        activeTerminal.write(data, handleWritten);
      } else {
        activeTerminal.write(data);
      }
      clearSelectionAction();
    };

    const scheduleTerminalOutputFlush = () => {
      if (outputFlushFrame !== null) {
        return;
      }
      outputFlushFrame = window.requestAnimationFrame(flushTerminalOutput);
    };

    const queueTerminalOutput = (data: string, perf?: PendingPerfEntry) => {
      pendingOutput += data;
      if (perf) {
        pendingPerfEntries.push(perf);
      }
      if (pendingOutput.length >= TERMINAL_OUTPUT_FLUSH_MAX_BYTES) {
        if (outputFlushFrame !== null) {
          window.cancelAnimationFrame(outputFlushFrame);
        }
        flushTerminalOutput();
        return;
      }
      scheduleTerminalOutputFlush();
    };

    const flushPendingTerminalOutput = () => {
      if (pendingOutput.length === 0) {
        return;
      }
      if (outputFlushFrame !== null) {
        window.cancelAnimationFrame(outputFlushFrame);
      }
      flushTerminalOutput();
    };

    const applyTerminalEvent = (event: TerminalEvent) => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) {
        return;
      }

      if (event.type === "activity") {
        return;
      }

      if (event.type === "output") {
        if (!firstOutputLoggedRef.current) {
          firstOutputLoggedRef.current = true;
          recordClientPerfEvent("terminal.event.first_output", {
            threadId,
            terminalId,
            sequence: event.sequence,
            bytes: event.data.length,
          });
        }
        const perfTimings = event.perfTimings;
        const sequence = event.sequence;
        if (perfTimings !== undefined && typeof sequence === "number") {
          queueTerminalOutput(event.data, {
            sequence,
            bytes: perfTimings.bytes,
            receivedAtMs: Date.now(),
            serverDrainedAtMs: perfTimings.drainedAtMs,
            serverPublishedAtMs: perfTimings.publishedAtMs,
            replayWriteMs: perfTimings.replayWriteMs,
            historyAppendMs: perfTimings.historyAppendMs,
          });
        } else {
          queueTerminalOutput(event.data);
        }
        return;
      }

      flushPendingTerminalOutput();

      if (event.type === "started" || event.type === "restarted") {
        recordClientPerfEvent("terminal.event.started", {
          threadId,
          terminalId,
          type: event.type,
          sequence: event.sequence,
          snapshotSequence: event.snapshot.sequence,
          historyBytes: event.snapshot.history.length,
          screenBytes: event.snapshot.screen?.data.length ?? 0,
        });
        hasHandledExitRef.current = false;
        clearSelectionAction();
        restoreTerminalSnapshot(activeTerminal, event.snapshot);
        return;
      }

      if (event.type === "cleared") {
        clearSelectionAction();
        activeTerminal.clear();
        activeTerminal.write("\u001bc");
        return;
      }

      if (event.type === "error") {
        writeSystemMessage(activeTerminal, event.message);
        return;
      }

      const details = [
        typeof event.exitCode === "number" ? `code ${event.exitCode}` : null,
        typeof event.exitSignal === "number" ? `signal ${event.exitSignal}` : null,
      ]
        .filter((value): value is string => value !== null)
        .join(", ");
      writeSystemMessage(
        activeTerminal,
        details.length > 0 ? `Process exited (${details})` : "Process exited",
      );
      if (hasHandledExitRef.current) {
        return;
      }
      hasHandledExitRef.current = true;
      window.setTimeout(() => {
        if (!hasHandledExitRef.current) {
          return;
        }
        handleSessionExited();
      }, 0);
    };
    let unsubscribeTerminalEvents: () => void = () => undefined;
    let attachPromise: Promise<void> | null = null;

    function applySequencedTerminalEvent(event: TerminalEvent) {
      const sequence = typeof event.sequence === "number" ? event.sequence : null;
      if (sequence !== null) {
        const lastSequence = lastAppliedSequenceRef.current;
        if (sequence <= lastSequence) {
          return;
        }
        if (sequence > lastSequence + 1) {
          void attachTerminal();
          return;
        }
        lastAppliedSequenceRef.current = sequence;
      }
      applyTerminalEvent(event);
    }

    async function attachTerminal() {
      if (attachPromise) {
        return attachPromise;
      }

      const requestId = ++attachRequestIdRef.current;
      attachPromise = (async () => {
        unsubscribeTerminalEvents();
        unsubscribeTerminalEvents = () => undefined;
        try {
          const activeTerminal = terminalRef.current;
          const activeFitAddon = fitAddonRef.current;
          if (!activeTerminal || !activeFitAddon) return;
          activeFitAddon.fit();
          const openStartedAtMs = performance.now();
          recordClientPerfEvent("terminal.attach.open.start", {
            threadId,
            terminalId,
            cwd,
            cols: activeTerminal.cols,
            rows: activeTerminal.rows,
          });
          const snapshot = await terminalApi.open({
            threadId,
            terminalId,
            cwd,
            ...(worktreePath !== undefined ? { worktreePath } : {}),
            cols: activeTerminal.cols,
            rows: activeTerminal.rows,
            ...(runtimeEnv ? { env: runtimeEnv } : {}),
          });
          if (disposed || requestId !== attachRequestIdRef.current) return;
          recordClientPerfEvent("terminal.attach.open.finish", {
            threadId,
            terminalId,
            durationMs: Math.round(performance.now() - openStartedAtMs),
            status: snapshot.status,
            pid: snapshot.pid,
            sequence: snapshot.sequence,
            historyBytes: snapshot.history.length,
            screenBytes: snapshot.screen?.data.length ?? 0,
          });
          terminalSessionReadyRef.current = true;
          firstOutputLoggedRef.current = false;
          lastSentSize = { cols: activeTerminal.cols, rows: activeTerminal.rows };
          restoreTerminalSnapshot(activeTerminal, snapshot);
          lastAppliedSequenceRef.current = snapshot.sequence ?? 0;
          unsubscribeTerminalEvents = terminalApi.onSessionEvent(
            {
              threadId,
              terminalId,
              afterSequence: lastAppliedSequenceRef.current,
            },
            applySequencedTerminalEvent,
          );
        } catch (err) {
          if (disposed || requestId !== attachRequestIdRef.current) return;
          writeSystemMessage(
            terminal,
            err instanceof Error ? err.message : "Failed to open terminal",
          );
        } finally {
          if (requestId === attachRequestIdRef.current) {
            attachPromise = null;
          }
        }
      })();
      return attachPromise;
    }

    let resizeFrame: number | null = null;
    let lastSentSize = { cols: terminal.cols, rows: terminal.rows };
    const fitAndResize = () => {
      resizeFrame = null;
      const activeTerminal = terminalRef.current;
      const activeFitAddon = fitAddonRef.current;
      if (!activeTerminal || !activeFitAddon) return;
      const wasAtBottom =
        activeTerminal.buffer.active.viewportY >= activeTerminal.buffer.active.baseY;
      activeFitAddon.fit();
      if (wasAtBottom) {
        activeTerminal.scrollToBottom();
      }
      if (!terminalSessionReadyRef.current) {
        return;
      }
      if (activeTerminal.cols === lastSentSize.cols && activeTerminal.rows === lastSentSize.rows) {
        return;
      }
      lastSentSize = { cols: activeTerminal.cols, rows: activeTerminal.rows };
      void terminalApi
        .resize({
          threadId,
          terminalId,
          cols: activeTerminal.cols,
          rows: activeTerminal.rows,
        })
        .catch(() => undefined);
    };
    const scheduleFitAndResize = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = window.requestAnimationFrame(fitAndResize);
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFitAndResize);
    resizeObserver?.observe(mount);
    scheduleFitAndResize();
    void attachTerminal();

    return () => {
      disposed = true;
      attachRequestIdRef.current += 1;
      terminalSessionReadyRef.current = false;
      lastAppliedSequenceRef.current = 0;
      unsubscribeTerminalEvents();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (outputFlushFrame !== null) {
        window.cancelAnimationFrame(outputFlushFrame);
      }
      resizeObserver?.disconnect();
      pendingInput = "";
      inputFlushQueued = false;
      inputDisposable.dispose();
      selectionDisposable.dispose();
      terminalLinksDisposable.dispose();
      if (selectionActionTimerRef.current !== null) {
        window.clearTimeout(selectionActionTimerRef.current);
      }
      window.removeEventListener("mouseup", handleMouseUp);
      mount.removeEventListener("pointerdown", handlePointerDown);
      themeObserver.disconnect();
      terminalRef.current = null;
      fitAddonRef.current = null;
      terminal.dispose();
    };
    // autoFocus is intentionally omitted;
    // it is only read at mount time and must not trigger terminal teardown/recreation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, environmentId, runtimeEnv, terminalId, threadId]);

  useEffect(() => {
    if (lastHandledFocusRequestIdRef.current === focusRequestId) {
      return;
    }
    lastHandledFocusRequestIdRef.current = focusRequestId;
    if (!autoFocus) return;
    const terminal = terminalRef.current;
    if (!terminal) return;
    const frame = window.requestAnimationFrame(() => {
      terminal.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocus, focusRequestId]);

  useEffect(() => {
    const api = readEnvironmentApi(environmentId);
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!api || !terminal || !fitAddon || !terminalSessionReadyRef.current) return;
    const wasAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY;
    const frame = window.requestAnimationFrame(() => {
      fitAddon.fit();
      if (wasAtBottom) {
        terminal.scrollToBottom();
      }
      void api.terminal
        .resize({
          threadId,
          terminalId,
          cols: terminal.cols,
          rows: terminal.rows,
        })
        .catch(() => undefined);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [drawerHeight, environmentId, resizeEpoch, terminalId, threadId]);
  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background" />
  );
}

interface ThreadTerminalDrawerProps {
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  visible?: boolean;
  open?: boolean;
  height: number;
  terminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
  activeTerminalGroupId: string;
  focusRequestId: number;
  onSplitTerminal: () => void;
  onNewTerminal: () => void;
  splitShortcutLabel?: string | undefined;
  newShortcutLabel?: string | undefined;
  closeShortcutLabel?: string | undefined;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onHeightChange: (height: number) => void;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  keybindings: ResolvedKeybindingsConfig;
}

interface TerminalActionButtonProps {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}

function TerminalActionButton({ label, className, onClick, children }: TerminalActionButtonProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            className={cn("cursor-pointer", className)}
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup
        tooltipStyle
        side="bottom"
        sideOffset={6}
        align="center"
        className="pointer-events-none select-none"
      >
        {label}
      </PopoverPopup>
    </Popover>
  );
}

interface TerminalActionControlsProps {
  hasReachedSplitLimit: boolean;
  splitTerminalActionLabel: string;
  newTerminalActionLabel: string;
  closeTerminalActionLabel: string;
  onSplitTerminalAction: () => void;
  onNewTerminalAction: () => void;
  onCloseActiveTerminal: () => void;
  className?: string;
  buttonClassName?: string;
  separatorClassName?: string;
  hoverClassName?: string;
}

function TerminalActionControls({
  hasReachedSplitLimit,
  splitTerminalActionLabel,
  newTerminalActionLabel,
  closeTerminalActionLabel,
  onSplitTerminalAction,
  onNewTerminalAction,
  onCloseActiveTerminal,
  className = "inline-flex h-full items-stretch",
  buttonClassName = "inline-flex h-full items-center px-1",
  separatorClassName = "border-l border-border/70",
  hoverClassName = "hover:bg-accent/70",
}: TerminalActionControlsProps) {
  const baseButtonClassName = "text-foreground/90 transition-colors";
  const splitButtonStateClassName = hasReachedSplitLimit
    ? "cursor-not-allowed opacity-45 hover:bg-transparent"
    : hoverClassName;

  return (
    <div className={className}>
      <TerminalActionButton
        className={cn(buttonClassName, baseButtonClassName, splitButtonStateClassName)}
        onClick={onSplitTerminalAction}
        label={splitTerminalActionLabel}
      >
        <SquareSplitHorizontal className="size-3.25" />
      </TerminalActionButton>
      <TerminalActionButton
        className={cn(buttonClassName, separatorClassName, baseButtonClassName, hoverClassName)}
        onClick={onNewTerminalAction}
        label={newTerminalActionLabel}
      >
        <Plus className="size-3.25" />
      </TerminalActionButton>
      <TerminalActionButton
        className={cn(buttonClassName, separatorClassName, baseButtonClassName, hoverClassName)}
        onClick={onCloseActiveTerminal}
        label={closeTerminalActionLabel}
      >
        <Trash2 className="size-3.25" />
      </TerminalActionButton>
    </div>
  );
}

export default function ThreadTerminalDrawer({
  threadRef,
  threadId,
  cwd,
  worktreePath,
  runtimeEnv,
  visible = true,
  open = visible,
  height,
  terminalIds,
  activeTerminalId,
  terminalGroups,
  activeTerminalGroupId,
  focusRequestId,
  onSplitTerminal,
  onNewTerminal,
  splitShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
  onActiveTerminalChange,
  onCloseTerminal,
  onHeightChange,
  onAddTerminalContext,
  keybindings,
}: ThreadTerminalDrawerProps) {
  const [drawerHeight, setDrawerHeight] = useState(() => clampDrawerHeight(height));
  const [resizeEpoch, setResizeEpoch] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const drawerHeightRef = useRef(drawerHeight);
  const lastSyncedHeightRef = useRef(clampDrawerHeight(height));
  const onHeightChangeRef = useRef(onHeightChange);
  const resizeStateRef = useRef<{
    interaction: ResizeInteractionHandle;
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const didResizeDuringDragRef = useRef(false);

  const normalizedTerminalIds = useMemo(() => {
    const cleaned = [...new Set(terminalIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    return cleaned.length > 0 ? cleaned : [DEFAULT_THREAD_TERMINAL_ID];
  }, [terminalIds]);

  const resolvedActiveTerminalId = normalizedTerminalIds.includes(activeTerminalId)
    ? activeTerminalId
    : (normalizedTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID);

  const resolvedTerminalGroups = useMemo(() => {
    const validTerminalIdSet = new Set(normalizedTerminalIds);
    const assignedTerminalIds = new Set<string>();
    const usedGroupIds = new Set<string>();
    const nextGroups: ThreadTerminalGroup[] = [];

    const assignUniqueGroupId = (groupId: string): string => {
      if (!usedGroupIds.has(groupId)) {
        usedGroupIds.add(groupId);
        return groupId;
      }
      let suffix = 2;
      while (usedGroupIds.has(`${groupId}-${suffix}`)) {
        suffix += 1;
      }
      const uniqueGroupId = `${groupId}-${suffix}`;
      usedGroupIds.add(uniqueGroupId);
      return uniqueGroupId;
    };

    for (const terminalGroup of terminalGroups) {
      const nextTerminalIds = [
        ...new Set(terminalGroup.terminalIds.map((id) => id.trim()).filter((id) => id.length > 0)),
      ].filter((terminalId) => {
        if (!validTerminalIdSet.has(terminalId)) return false;
        if (assignedTerminalIds.has(terminalId)) return false;
        return true;
      });
      if (nextTerminalIds.length === 0) continue;

      for (const terminalId of nextTerminalIds) {
        assignedTerminalIds.add(terminalId);
      }

      const baseGroupId =
        terminalGroup.id.trim().length > 0
          ? terminalGroup.id.trim()
          : `group-${nextTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID}`;
      nextGroups.push({
        id: assignUniqueGroupId(baseGroupId),
        terminalIds: nextTerminalIds,
      });
    }

    for (const terminalId of normalizedTerminalIds) {
      if (assignedTerminalIds.has(terminalId)) continue;
      nextGroups.push({
        id: assignUniqueGroupId(`group-${terminalId}`),
        terminalIds: [terminalId],
      });
    }

    if (nextGroups.length > 0) {
      return nextGroups;
    }

    return [
      {
        id: `group-${resolvedActiveTerminalId}`,
        terminalIds: [resolvedActiveTerminalId],
      },
    ];
  }, [normalizedTerminalIds, resolvedActiveTerminalId, terminalGroups]);

  const resolvedActiveGroupIndex = useMemo(() => {
    const indexById = resolvedTerminalGroups.findIndex(
      (terminalGroup) => terminalGroup.id === activeTerminalGroupId,
    );
    if (indexById >= 0) return indexById;
    const indexByTerminal = resolvedTerminalGroups.findIndex((terminalGroup) =>
      terminalGroup.terminalIds.includes(resolvedActiveTerminalId),
    );
    return indexByTerminal >= 0 ? indexByTerminal : 0;
  }, [activeTerminalGroupId, resolvedActiveTerminalId, resolvedTerminalGroups]);

  const visibleTerminalIds = resolvedTerminalGroups[resolvedActiveGroupIndex]?.terminalIds ?? [
    resolvedActiveTerminalId,
  ];
  const hasTerminalSidebar = normalizedTerminalIds.length > 1;
  const isSplitView = visibleTerminalIds.length > 1;
  const showGroupHeaders =
    resolvedTerminalGroups.length > 1 ||
    resolvedTerminalGroups.some((terminalGroup) => terminalGroup.terminalIds.length > 1);
  const hasReachedSplitLimit = visibleTerminalIds.length >= MAX_TERMINALS_PER_GROUP;
  const terminalLabelById = useMemo(
    () =>
      new Map(
        normalizedTerminalIds.map((terminalId, index) => [terminalId, `Terminal ${index + 1}`]),
      ),
    [normalizedTerminalIds],
  );
  const splitTerminalActionLabel = hasReachedSplitLimit
    ? `Split Terminal (max ${MAX_TERMINALS_PER_GROUP} per group)`
    : splitShortcutLabel
      ? `Split Terminal (${splitShortcutLabel})`
      : "Split Terminal";
  const newTerminalActionLabel = newShortcutLabel
    ? `New Terminal (${newShortcutLabel})`
    : "New Terminal";
  const closeTerminalActionLabel = closeShortcutLabel
    ? `Close Terminal (${closeShortcutLabel})`
    : "Close Terminal";
  const onSplitTerminalAction = useCallback(() => {
    if (hasReachedSplitLimit) return;
    onSplitTerminal();
  }, [hasReachedSplitLimit, onSplitTerminal]);
  const onNewTerminalAction = useCallback(() => {
    onNewTerminal();
  }, [onNewTerminal]);
  const onCloseActiveTerminal = useCallback(() => {
    onCloseTerminal(resolvedActiveTerminalId);
  }, [onCloseTerminal, resolvedActiveTerminalId]);

  useEffect(() => {
    onHeightChangeRef.current = onHeightChange;
  }, [onHeightChange]);

  useEffect(() => {
    drawerHeightRef.current = drawerHeight;
  }, [drawerHeight]);

  const syncHeight = useCallback((nextHeight: number) => {
    const clampedHeight = clampDrawerHeight(nextHeight);
    if (lastSyncedHeightRef.current === clampedHeight) return;
    lastSyncedHeightRef.current = clampedHeight;
    onHeightChangeRef.current(clampedHeight);
  }, []);

  useEffect(() => {
    const clampedHeight = clampDrawerHeight(height);
    setDrawerHeight(clampedHeight);
    drawerHeightRef.current = clampedHeight;
    lastSyncedHeightRef.current = clampedHeight;
  }, [height, threadId]);

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    resizeStateRef.current?.interaction.release();
    const interaction = startResizeInteraction(event, { cursor: "row-resize" });
    didResizeDuringDragRef.current = false;
    setIsResizing(true);
    resizeStateRef.current = {
      interaction,
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: drawerHeightRef.current,
    };
  }, []);

  const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const clampedHeight = clampDrawerHeight(
      resizeState.startHeight + (resizeState.startY - event.clientY),
    );
    if (clampedHeight === drawerHeightRef.current) {
      return;
    }
    didResizeDuringDragRef.current = true;
    drawerHeightRef.current = clampedHeight;
    setDrawerHeight(clampedHeight);
  }, []);

  const handleResizePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      resizeStateRef.current = null;
      resizeState.interaction.release();
      setIsResizing(false);
      if (!didResizeDuringDragRef.current) {
        return;
      }
      syncHeight(drawerHeightRef.current);
      setResizeEpoch((value) => value + 1);
    },
    [syncHeight],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onWindowResize = () => {
      const clampedHeight = clampDrawerHeight(drawerHeightRef.current);
      const changed = clampedHeight !== drawerHeightRef.current;
      if (changed) {
        setDrawerHeight(clampedHeight);
        drawerHeightRef.current = clampedHeight;
      }
      if (!resizeStateRef.current) {
        syncHeight(clampedHeight);
      }
      setResizeEpoch((value) => value + 1);
    };
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
    };
  }, [syncHeight, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setResizeEpoch((value) => value + 1);
  }, [visible]);

  useEffect(() => {
    return () => {
      resizeStateRef.current?.interaction.release();
      resizeStateRef.current = null;
      syncHeight(drawerHeightRef.current);
    };
  }, [syncHeight]);

  return (
    <aside
      className={cn(
        "thread-terminal-drawer relative flex min-w-0 shrink-0 flex-col overflow-hidden border-t border-border/80 bg-background",
        !isResizing &&
          `transition-[height,opacity,transform] duration-[150ms] ${SNAPPY_TRANSITION_EASING_CLASS} motion-reduce:transition-none`,
        open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
      style={{ height: `${open ? drawerHeight : 0}px` }}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-x-0 top-0 z-20 h-1.5 touch-none select-none cursor-row-resize"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerEnd}
        onPointerCancel={handleResizePointerEnd}
      />

      {!hasTerminalSidebar && (
        <div className="flex h-7 shrink-0 items-center justify-end border-b border-border/70 bg-background px-2">
          <TerminalActionControls
            hasReachedSplitLimit={hasReachedSplitLimit}
            splitTerminalActionLabel={splitTerminalActionLabel}
            newTerminalActionLabel={newTerminalActionLabel}
            closeTerminalActionLabel={closeTerminalActionLabel}
            onSplitTerminalAction={onSplitTerminalAction}
            onNewTerminalAction={onNewTerminalAction}
            onCloseActiveTerminal={onCloseActiveTerminal}
            className="inline-flex h-[22px] items-stretch overflow-hidden rounded-md border border-border/80 bg-background"
          />
        </div>
      )}

      <div className="min-h-0 w-full flex-1">
        <div className={`flex h-full min-h-0 ${hasTerminalSidebar ? "gap-1.5" : ""}`}>
          <div className="min-w-0 flex-1">
            {isSplitView ? (
              <div
                className="grid h-full w-full min-w-0 gap-0 overflow-hidden"
                style={{
                  gridTemplateColumns: `repeat(${visibleTerminalIds.length}, minmax(0, 1fr))`,
                }}
              >
                {visibleTerminalIds.map((terminalId) => (
                  <div
                    key={terminalId}
                    className={`min-h-0 min-w-0 border-l first:border-l-0 ${
                      terminalId === resolvedActiveTerminalId ? "border-border" : "border-border/70"
                    }`}
                    onMouseDown={() => {
                      if (terminalId !== resolvedActiveTerminalId) {
                        onActiveTerminalChange(terminalId);
                      }
                    }}
                  >
                    <div className="h-full">
                      <TerminalViewport
                        threadRef={threadRef}
                        threadId={threadId}
                        terminalId={terminalId}
                        terminalLabel={terminalLabelById.get(terminalId) ?? "Terminal"}
                        cwd={cwd}
                        {...(worktreePath !== undefined ? { worktreePath } : {})}
                        {...(runtimeEnv ? { runtimeEnv } : {})}
                        onSessionExited={() => onCloseTerminal(terminalId)}
                        onAddTerminalContext={onAddTerminalContext}
                        focusRequestId={focusRequestId}
                        autoFocus={terminalId === resolvedActiveTerminalId}
                        resizeEpoch={resizeEpoch}
                        drawerHeight={drawerHeight}
                        keybindings={keybindings}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full">
                <TerminalViewport
                  key={resolvedActiveTerminalId}
                  threadRef={threadRef}
                  threadId={threadId}
                  terminalId={resolvedActiveTerminalId}
                  terminalLabel={terminalLabelById.get(resolvedActiveTerminalId) ?? "Terminal"}
                  cwd={cwd}
                  {...(worktreePath !== undefined ? { worktreePath } : {})}
                  {...(runtimeEnv ? { runtimeEnv } : {})}
                  onSessionExited={() => onCloseTerminal(resolvedActiveTerminalId)}
                  onAddTerminalContext={onAddTerminalContext}
                  focusRequestId={focusRequestId}
                  autoFocus
                  resizeEpoch={resizeEpoch}
                  drawerHeight={drawerHeight}
                  keybindings={keybindings}
                />
              </div>
            )}
          </div>

          {hasTerminalSidebar && (
            <aside className="flex w-36 min-w-36 flex-col border border-border/70 bg-muted/10">
              <div className="flex h-[22px] items-stretch justify-end border-b border-border/70">
                <TerminalActionControls
                  hasReachedSplitLimit={hasReachedSplitLimit}
                  splitTerminalActionLabel={splitTerminalActionLabel}
                  newTerminalActionLabel={newTerminalActionLabel}
                  closeTerminalActionLabel={closeTerminalActionLabel}
                  onSplitTerminalAction={onSplitTerminalAction}
                  onNewTerminalAction={onNewTerminalAction}
                  onCloseActiveTerminal={onCloseActiveTerminal}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
                {resolvedTerminalGroups.map((terminalGroup, groupIndex) => {
                  const isGroupActive =
                    terminalGroup.terminalIds.includes(resolvedActiveTerminalId);
                  const groupActiveTerminalId = isGroupActive
                    ? resolvedActiveTerminalId
                    : (terminalGroup.terminalIds[0] ?? resolvedActiveTerminalId);

                  return (
                    <div key={terminalGroup.id} className="pb-0.5">
                      {showGroupHeaders && (
                        <button
                          type="button"
                          className={`flex w-full cursor-pointer items-center rounded px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                            isGroupActive
                              ? "bg-accent/70 text-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          }`}
                          onClick={() => onActiveTerminalChange(groupActiveTerminalId)}
                        >
                          {terminalGroup.terminalIds.length > 1
                            ? `Split ${groupIndex + 1}`
                            : `Terminal ${groupIndex + 1}`}
                        </button>
                      )}

                      <div
                        className={showGroupHeaders ? "ml-1 border-l border-border/60 pl-1.5" : ""}
                      >
                        {terminalGroup.terminalIds.map((terminalId) => {
                          const isActive = terminalId === resolvedActiveTerminalId;
                          const closeTerminalLabel = `Close ${
                            terminalLabelById.get(terminalId) ?? "terminal"
                          }${isActive && closeShortcutLabel ? ` (${closeShortcutLabel})` : ""}`;
                          return (
                            <div
                              key={terminalId}
                              className={`group flex items-center gap-1 rounded px-1 py-0.5 text-[11px] ${
                                isActive
                                  ? "bg-accent text-foreground"
                                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                              }`}
                            >
                              {showGroupHeaders && (
                                <span className="text-[10px] text-muted-foreground/80">└</span>
                              )}
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
                                onClick={() => onActiveTerminalChange(terminalId)}
                              >
                                <TerminalSquare className="size-3 shrink-0" />
                                <span className="truncate">
                                  {terminalLabelById.get(terminalId) ?? "Terminal"}
                                </span>
                              </button>
                              {normalizedTerminalIds.length > 1 && (
                                <Popover>
                                  <PopoverTrigger
                                    openOnHover
                                    render={
                                      <button
                                        type="button"
                                        className="inline-flex size-3.5 cursor-pointer items-center justify-center rounded text-xs font-medium leading-none text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                                        onClick={() => onCloseTerminal(terminalId)}
                                        aria-label={closeTerminalLabel}
                                      />
                                    }
                                  >
                                    <XIcon className="size-2.5" />
                                  </PopoverTrigger>
                                  <PopoverPopup
                                    tooltipStyle
                                    side="bottom"
                                    sideOffset={6}
                                    align="center"
                                    className="pointer-events-none select-none"
                                  >
                                    {closeTerminalLabel}
                                  </PopoverPopup>
                                </Popover>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      </div>
    </aside>
  );
}
