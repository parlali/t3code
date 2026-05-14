import { AlertTriangleIcon, FolderOpenIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type {
  ServerProcessDiagnosticsEntry,
  ServerProcessResourceHistorySummary,
  ServerProcessSignal,
  ServerTraceDiagnosticsResult,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import { resolveAndPersistPreferredEditor } from "../../editorPreferences";
import { ensureLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import {
  useProcessDiagnostics,
  useProcessResourceHistory,
} from "../../lib/processDiagnosticsState";
import { useTraceDiagnostics } from "../../lib/traceDiagnosticsState";
import { useServerAvailableEditors, useServerObservability } from "../../rpc/serverState";
import { formatRelativeTime } from "../../timestampFormat";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsPageContainer, SettingsSection, useRelativeTimeTick } from "./settingsLayout";

const NUMBER_FORMAT = new Intl.NumberFormat();

const RESOURCE_HISTORY_WINDOWS = [
  { label: "5m", windowMs: 5 * 60_000, bucketMs: 30_000 },
  { label: "15m", windowMs: 15 * 60_000, bucketMs: 60_000 },
  { label: "30m", windowMs: 30 * 60_000, bucketMs: 2 * 60_000 },
  { label: "1h", windowMs: 60 * 60_000, bucketMs: 5 * 60_000 },
] as const;

function formatCount(value: number): string {
  return NUMBER_FORMAT.format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"] as const;
  let unitIndex = -1;
  let next = value;
  do {
    next /= 1024;
    unitIndex += 1;
  } while (next >= 1024 && unitIndex < units.length - 1);
  return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDuration(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} s`;
}

function formatCpuTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(minutes >= 10 ? 1 : 2)}m`;
  return `${(minutes / 60).toFixed(2)}h`;
}

function formatRelative(value: DateTime.Utc | null): string {
  if (!value) return "never";
  const relative = formatRelativeTime(DateTime.formatIso(value));
  return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
}

function formatRelativeNoWrap(value: DateTime.Utc | null): string {
  return formatRelative(value).replaceAll(" ", "\u00a0");
}

function formatProcessName(command: string): string {
  const firstToken = command.trim().split(/\s+/)[0];
  if (!firstToken) return command;
  const normalized = firstToken.replace(/^['"]|['"]$/g, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function isStaleProcessSignalMessage(message: string | undefined): boolean {
  return message?.includes("not a live descendant") ?? false;
}

function StatBlock({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="min-w-0 border-border/60 px-4 py-3 sm:px-5">
      <div className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-lg font-semibold tabular-nums text-foreground",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid grid-cols-2 sm:grid-cols-4">
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/60" />
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/60 sm:hidden" />
      <span className="pointer-events-none absolute inset-y-0 left-1/4 hidden w-px bg-border/60 sm:block" />
      <span className="pointer-events-none absolute inset-y-0 left-3/4 hidden w-px bg-border/60 sm:block" />
      {children}
    </div>
  );
}

function EmptyRows({ label }: { label: string }) {
  return <div className="px-4 py-4 text-xs text-muted-foreground sm:px-5">{label}</div>;
}

function DiagnosticsError({ message, warning = false }: { message: string; warning?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-t border-border/60 px-4 py-3 text-xs sm:px-5",
        warning ? "text-amber-600 dark:text-amber-400" : "text-destructive",
      )}
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

function LastChecked({ checkedAt }: { checkedAt: DateTime.Utc | null }) {
  useRelativeTimeTick();
  return (
    <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground/70 sm:inline">
      {formatRelativeNoWrap(checkedAt)}
    </span>
  );
}

function RefreshButton({
  label,
  isPending,
  onClick,
}: {
  label: string;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            disabled={isPending}
            onClick={onClick}
            aria-label={label}
          >
            <RefreshCwIcon className={cn("size-3", isPending && "animate-spin")} />
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

function ProcessType({ process }: { process: ServerProcessDiagnosticsEntry }) {
  if (process.depth > 0) return <>Subprocess</>;
  if (/\b(codex|claude|opencode|cursor)\b/i.test(process.command)) return <>Agent</>;
  return <>Process</>;
}

function ProcessTable({
  processes,
  signalingPid,
  onSignal,
  emptyLabel,
}: {
  processes: ReadonlyArray<ServerProcessDiagnosticsEntry>;
  signalingPid: number | null;
  onSignal: (pid: number, signal: ServerProcessSignal) => void;
  emptyLabel: string;
}) {
  return (
    <ScrollArea
      scrollFade
      hideScrollbars
      className="max-h-[min(64vh,44rem)] w-full max-w-full rounded-none border-t border-border/60"
    >
      <table className="w-full min-w-[960px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[36%]" />
          <col className="w-[8%]" />
          <col className="w-[9%]" />
          <col className="w-[6%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 border-b border-border/60 bg-card text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
          <tr>
            <th className="px-4 py-2 font-semibold sm:pl-5">Name</th>
            <th className="px-3 py-2 text-right font-semibold">CPU</th>
            <th className="px-3 py-2 text-right font-semibold">Memory</th>
            <th className="px-3 py-2 font-semibold">Command</th>
            <th className="px-3 py-2 text-right font-semibold">PID</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="p-2 text-right font-semibold sm:pr-4">Kill</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {processes.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyRows label={emptyLabel} />
              </td>
            </tr>
          ) : null}
          {processes.map((process) => (
            <tr key={process.pid} className="hover:bg-muted/20">
              <td className="px-4 py-2 align-middle sm:pl-5">
                <div
                  className="flex min-w-0 items-center gap-2"
                  style={{ paddingLeft: `${Math.min(process.depth, 6) * 10}px` }}
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-500/80" />
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {formatProcessName(process.command)}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                {process.cpuPercent.toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                {formatBytes(process.rssBytes)}
              </td>
              <td className="px-3 py-2 align-middle text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger
                    render={<span className="block truncate">{process.command}</span>}
                  />
                  <TooltipPopup
                    side="top"
                    className="max-w-[min(440px,calc(100vw-2rem))] whitespace-normal break-words text-left font-mono text-[11px] leading-relaxed text-wrap"
                  >
                    {process.command}
                  </TooltipPopup>
                </Tooltip>
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums text-muted-foreground">
                {process.pid}
              </td>
              <td className="truncate px-3 py-2 align-middle text-muted-foreground">
                <ProcessType process={process} />
              </td>
              <td className="p-2 align-middle sm:pr-4">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={signalingPid === process.pid}
                    className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => onSignal(process.pid, "SIGINT")}
                  >
                    INT
                  </button>
                  <button
                    type="button"
                    disabled={signalingPid === process.pid}
                    className="text-[11px] font-medium text-destructive underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => onSignal(process.pid, "SIGKILL")}
                  >
                    KILL
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function ResourceWindowSelector({
  selectedWindowMs,
  onSelect,
}: {
  selectedWindowMs: number;
  onSelect: (windowMs: number) => void;
}) {
  return (
    <div className="flex items-center rounded-sm border border-border/70 p-0.5">
      {RESOURCE_HISTORY_WINDOWS.map((option) => (
        <button
          key={option.windowMs}
          type="button"
          className={cn(
            "min-w-8 rounded-[3px] px-2 py-0.5 text-[11px] font-medium",
            selectedWindowMs === option.windowMs
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onSelect(option.windowMs)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ResourceChart({
  buckets,
}: {
  buckets: ReadonlyArray<{ readonly startedAt: DateTime.Utc; readonly maxCpuPercent: number }>;
}) {
  const maxCpuPercent = Math.max(1, ...buckets.map((bucket) => bucket.maxCpuPercent));
  return (
    <div className="border-t border-border/60 px-4 py-3 sm:px-5">
      <div className="flex h-28 items-end gap-1 overflow-hidden rounded-sm bg-muted/10 p-2">
        {buckets.length === 0 ? (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            Collecting samples...
          </div>
        ) : null}
        {buckets.map((bucket) => {
          const peakHeight = Math.max(2, (bucket.maxCpuPercent / maxCpuPercent) * 100);
          return (
            <Tooltip key={DateTime.formatIso(bucket.startedAt)}>
              <TooltipTrigger
                render={
                  <div className="flex h-full min-w-1 flex-1 items-end">
                    <div
                      className="w-full rounded-t-sm bg-emerald-500/75"
                      style={{ height: `${peakHeight}%` }}
                    />
                  </div>
                }
              />
              <TooltipPopup side="top">
                {bucket.maxCpuPercent.toFixed(1)}% peak at {formatRelativeNoWrap(bucket.startedAt)}
              </TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function ResourceProcessTable({
  processes,
  emptyLabel,
}: {
  processes: ReadonlyArray<ServerProcessResourceHistorySummary>;
  emptyLabel: string;
}) {
  return (
    <ScrollArea
      scrollFade
      hideScrollbars
      className="max-h-[24rem] w-full max-w-full rounded-none border-t border-border/60"
    >
      <table className="w-full min-w-[820px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[12%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 border-b border-border/60 bg-card text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
          <tr>
            <th className="px-4 py-2 font-semibold sm:pl-5">Process</th>
            <th className="px-3 py-2 text-right font-semibold">CPU Time</th>
            <th className="px-3 py-2 text-right font-semibold">Avg CPU</th>
            <th className="px-3 py-2 text-right font-semibold">Peak CPU</th>
            <th className="px-3 py-2 text-right font-semibold">Peak Mem</th>
            <th className="px-3 py-2 text-right font-semibold sm:pr-5">Samples</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {processes.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyRows label={emptyLabel} />
              </td>
            </tr>
          ) : null}
          {processes.map((process) => (
            <tr key={process.processKey} className="hover:bg-muted/20">
              <td className="px-4 py-2 align-middle sm:pl-5">
                <div
                  className="flex min-w-0 items-center gap-2"
                  style={{ paddingLeft: `${Math.min(process.depth, 6) * 10}px` }}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      process.isServerRoot ? "bg-amber-500/90" : "bg-emerald-500/80",
                    )}
                  />
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {formatProcessName(process.command)}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                {formatCpuTime(process.cpuSecondsApprox)}
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                {process.avgCpuPercent.toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                {process.maxCpuPercent.toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums">
                {formatBytes(process.maxRssBytes)}
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums sm:pr-5">
                {formatCount(process.sampleCount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function SmallDiagnosticsTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: ReadonlyArray<string>;
  rows: ReactNode;
  emptyLabel: string;
}) {
  return (
    <ScrollArea scrollFade hideScrollbars className="w-full max-w-full">
      <table className="w-full min-w-[720px] table-fixed text-left text-xs">
        <thead className="border-b border-border/60 text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-2.5 font-semibold first:sm:pl-5 last:sm:pr-5">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">{rows}</tbody>
      </table>
      {rows === null ? <EmptyRows label={emptyLabel} /> : null}
    </ScrollArea>
  );
}

function TraceSections({
  data,
  isInitialLoading,
}: {
  data: ServerTraceDiagnosticsResult | null;
  isInitialLoading: boolean;
}) {
  return (
    <>
      <SettingsSection title="Latest Failures">
        <SmallDiagnosticsTable
          headers={["Span", "Cause", "Duration", "Ended"]}
          emptyLabel={isInitialLoading ? "Loading failures..." : "No failed spans found."}
          rows={
            data && data.latestFailures.length > 0
              ? data.latestFailures.map((failure) => (
                  <tr key={`${failure.traceId}:${failure.spanId}`}>
                    <td className="px-4 py-3 align-top font-medium text-foreground first:sm:pl-5">
                      {failure.name}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <div className="line-clamp-3 break-words">{failure.cause}</div>
                    </td>
                    <td className="px-4 py-3 align-top font-mono tabular-nums">
                      {formatDuration(failure.durationMs)}
                    </td>
                    <td className="px-4 py-3 align-top font-mono tabular-nums text-muted-foreground last:sm:pr-5">
                      {formatRelativeNoWrap(failure.endedAt)}
                    </td>
                  </tr>
                ))
              : null
          }
        />
      </SettingsSection>

      <SettingsSection title="Slowest Spans">
        <SmallDiagnosticsTable
          headers={["Span", "Duration", "Ended", "Trace"]}
          emptyLabel={isInitialLoading ? "Loading slow spans..." : "No spans found."}
          rows={
            data && data.slowestSpans.length > 0
              ? data.slowestSpans.map((span) => (
                  <tr key={`${span.traceId}:${span.spanId}`}>
                    <td className="px-4 py-3 align-top font-medium text-foreground first:sm:pl-5">
                      {span.name}
                    </td>
                    <td className="px-4 py-3 align-top font-mono tabular-nums">
                      {formatDuration(span.durationMs)}
                    </td>
                    <td className="px-4 py-3 align-top font-mono tabular-nums text-muted-foreground">
                      {formatRelativeNoWrap(span.endedAt)}
                    </td>
                    <td className="truncate px-4 py-3 align-top font-mono text-[11px] text-muted-foreground last:sm:pr-5">
                      {span.traceId}
                    </td>
                  </tr>
                ))
              : null
          }
        />
      </SettingsSection>

      <SettingsSection title="Span Logs">
        <SmallDiagnosticsTable
          headers={["Level", "Span", "Message", "Seen"]}
          emptyLabel={isInitialLoading ? "Loading recent logs..." : "No warnings or errors found."}
          rows={
            data && data.latestWarningAndErrorLogs.length > 0
              ? data.latestWarningAndErrorLogs.map((event) => (
                  <tr key={`${event.traceId}:${event.spanId}:${DateTime.formatIso(event.seenAt)}`}>
                    <td className="px-4 py-3 align-top first:sm:pl-5">
                      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase text-foreground/80">
                        {event.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top font-medium text-foreground">
                      {event.spanName}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <div className="line-clamp-3 break-words">{event.message}</div>
                    </td>
                    <td className="px-4 py-3 align-top font-mono tabular-nums text-muted-foreground last:sm:pr-5">
                      {formatRelativeNoWrap(event.seenAt)}
                    </td>
                  </tr>
                ))
              : null
          }
        />
      </SettingsSection>
    </>
  );
}

export function DiagnosticsSettings() {
  const observability = useServerObservability();
  const availableEditors = useServerAvailableEditors();
  const {
    data: traceData,
    error: traceError,
    isPending: isTracePending,
    refresh,
  } = useTraceDiagnostics();
  const {
    data: processData,
    error: processError,
    isPending: isProcessPending,
    refresh: refreshProcesses,
  } = useProcessDiagnostics();
  const [resourceWindowMs, setResourceWindowMs] = useState(RESOURCE_HISTORY_WINDOWS[1].windowMs);
  const selectedResourceWindow = useMemo(
    () =>
      RESOURCE_HISTORY_WINDOWS.find((option) => option.windowMs === resourceWindowMs) ??
      RESOURCE_HISTORY_WINDOWS[1],
    [resourceWindowMs],
  );
  const {
    data: resourceData,
    error: resourceError,
    isPending: isResourcePending,
    refresh: refreshResources,
  } = useProcessResourceHistory(selectedResourceWindow);
  const [signalingPid, setSignalingPid] = useState<number | null>(null);
  const [isOpeningLogsDirectory, setIsOpeningLogsDirectory] = useState(false);
  const [openLogsDirectoryError, setOpenLogsDirectoryError] = useState<string | null>(null);

  const openLogsDirectory = useCallback(() => {
    const logsDirectoryPath = observability?.logsDirectoryPath ?? null;
    if (!logsDirectoryPath) return;

    const editor = resolveAndPersistPreferredEditor(availableEditors ?? []);
    if (!editor) {
      setOpenLogsDirectoryError("No available editors found.");
      return;
    }

    setIsOpeningLogsDirectory(true);
    setOpenLogsDirectoryError(null);
    void ensureLocalApi()
      .shell.openInEditor(logsDirectoryPath, editor)
      .catch((error: unknown) => {
        setOpenLogsDirectoryError(
          error instanceof Error ? error.message : "Unable to open logs folder.",
        );
      })
      .finally(() => {
        setIsOpeningLogsDirectory(false);
      });
  }, [availableEditors, observability?.logsDirectoryPath]);

  const signalProcess = useCallback(
    (pid: number, signal: ServerProcessSignal) => {
      if (
        signal === "SIGKILL" &&
        !window.confirm(`Send SIGKILL to process ${pid}? This cannot be handled by the process.`)
      ) {
        return;
      }

      setSignalingPid(pid);
      void ensureLocalApi()
        .server.signalProcess({ pid, signal })
        .then((result) => {
          if (!result.signaled) {
            const message = Option.getOrUndefined(result.message);
            refreshProcesses();
            if (isStaleProcessSignalMessage(message)) {
              toastManager.add({
                type: "info",
                title: "Process already exited",
                description:
                  "The process is not a child of the T3 server. It might already have exited.",
              });
              return;
            }

            toastManager.add({
              type: "error",
              title: `Could not send ${signal}`,
              description: message ?? `Failed to send ${signal}.`,
            });
            return;
          }
          refreshProcesses();
        })
        .catch((error: unknown) => {
          toastManager.add({
            type: "error",
            title: `Could not send ${signal}`,
            description: error instanceof Error ? error.message : `Failed to send ${signal}.`,
          });
        })
        .finally(() => {
          setSignalingPid(null);
        });
    },
    [refreshProcesses],
  );

  const isTraceInitialLoading = isTracePending && traceData === null;
  const isProcessInitialLoading = isProcessPending && processData === null;
  const traceDiagnosticsError = traceData ? Option.getOrNull(traceData.error) : null;
  const processDiagnosticsError = processData ? Option.getOrNull(processData.error) : null;
  const processResourceError = resourceData ? Option.getOrNull(resourceData.error) : null;
  const traceDiagnosticsPartialFailure = traceData
    ? Option.getOrElse(traceData.partialFailure, () => false)
    : false;

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Live Processes"
        headerAction={
          <div className="flex items-center gap-1.5">
            <LastChecked checkedAt={processData?.readAt ?? null} />
            <RefreshButton
              isPending={isProcessPending}
              label="Refresh process diagnostics"
              onClick={refreshProcesses}
            />
          </div>
        }
      >
        <StatsGrid>
          <StatBlock
            label="Child Processes"
            value={processData ? formatCount(processData.processCount) : "..."}
          />
          <StatBlock
            label="CPU"
            value={processData ? `${processData.totalCpuPercent.toFixed(1)}%` : "..."}
          />
          <StatBlock
            label="Memory"
            value={processData ? formatBytes(processData.totalRssBytes) : "..."}
          />
          <StatBlock
            label="Server PID"
            value={processData ? String(processData.serverPid) : "..."}
          />
        </StatsGrid>
        {processDiagnosticsError ? (
          <DiagnosticsError message={processDiagnosticsError.message} />
        ) : null}
        {processError ? <DiagnosticsError message={processError} /> : null}
        <ProcessTable
          processes={processData?.processes ?? []}
          signalingPid={signalingPid}
          onSignal={signalProcess}
          emptyLabel={
            isProcessInitialLoading
              ? "Loading live processes..."
              : "No live descendant processes found."
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Resource History"
        headerAction={
          <div className="flex items-center gap-1.5">
            <ResourceWindowSelector
              selectedWindowMs={resourceWindowMs}
              onSelect={setResourceWindowMs}
            />
            <LastChecked checkedAt={resourceData?.readAt ?? null} />
            <RefreshButton
              isPending={isResourcePending}
              label="Refresh resource history"
              onClick={refreshResources}
            />
          </div>
        }
      >
        <StatsGrid>
          <StatBlock
            label="CPU Time"
            value={resourceData ? formatCpuTime(resourceData.totalCpuSecondsApprox) : "..."}
          />
          <StatBlock
            label="Samples"
            value={resourceData ? formatCount(resourceData.retainedSampleCount) : "..."}
          />
          <StatBlock
            label="Interval"
            value={resourceData ? formatDuration(resourceData.sampleIntervalMs) : "..."}
          />
          <StatBlock
            label="Processes"
            value={resourceData ? formatCount(resourceData.topProcesses.length) : "..."}
          />
        </StatsGrid>
        {processResourceError ? <DiagnosticsError message={processResourceError.message} /> : null}
        {resourceError ? <DiagnosticsError message={resourceError} /> : null}
        <ResourceChart buckets={resourceData?.buckets ?? []} />
        <ResourceProcessTable
          processes={resourceData?.topProcesses ?? []}
          emptyLabel={
            isResourcePending && resourceData === null
              ? "Collecting process resource samples..."
              : "No process resource samples found for this window."
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Trace Diagnostics"
        headerAction={
          <div className="flex items-center gap-1.5">
            <LastChecked checkedAt={traceData?.readAt ?? null} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                    disabled={!observability?.logsDirectoryPath || isOpeningLogsDirectory}
                    onClick={openLogsDirectory}
                    aria-label="Open logs folder"
                  >
                    <FolderOpenIcon className="size-3" />
                  </Button>
                }
              />
              <TooltipPopup side="top">Open logs folder</TooltipPopup>
            </Tooltip>
            <RefreshButton
              isPending={isTracePending}
              label="Refresh trace diagnostics"
              onClick={refresh}
            />
          </div>
        }
      >
        <StatsGrid>
          <StatBlock label="Spans" value={traceData ? formatCount(traceData.recordCount) : "..."} />
          <StatBlock
            label="Failures"
            value={traceData ? formatCount(traceData.failureCount) : "..."}
            tone={traceData && traceData.failureCount > 0 ? "danger" : "default"}
          />
          <StatBlock
            label="Slow Spans"
            value={traceData ? formatCount(traceData.slowSpanCount) : "..."}
            tone={traceData && traceData.slowSpanCount > 0 ? "warning" : "default"}
          />
          <StatBlock
            label="Parse Errors"
            value={traceData ? formatCount(traceData.parseErrorCount) : "..."}
            tone={traceData && traceData.parseErrorCount > 0 ? "warning" : "default"}
          />
        </StatsGrid>
        {openLogsDirectoryError ? <DiagnosticsError message={openLogsDirectoryError} /> : null}
        {traceDiagnosticsError ? (
          <DiagnosticsError
            warning={traceDiagnosticsPartialFailure}
            message={
              traceDiagnosticsPartialFailure
                ? `Some trace files could not be read, so diagnostics may be incomplete. ${traceDiagnosticsError.message}`
                : traceDiagnosticsError.message
            }
          />
        ) : null}
        {traceError ? <DiagnosticsError message={traceError} /> : null}
        {traceData && traceData.failureCount > 0 ? (
          <div className="flex items-start gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:px-5">
            <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <span>
              Latest failed spans and warnings are listed below from{" "}
              <span className="font-mono">{traceData.scannedFilePaths.length}</span> trace files.
            </span>
          </div>
        ) : null}
      </SettingsSection>

      <TraceSections data={traceData} isInitialLoading={isTraceInitialLoading} />
    </SettingsPageContainer>
  );
}
