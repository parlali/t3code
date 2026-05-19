import { AlertTriangleIcon, RefreshCwIcon, SearchIcon, ServerIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ServerMachineProcessEntry,
  ServerMachineProcessPort,
  ServerMachineProcessSnapshot,
  ServerProcessSignal,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import { ensureLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import { formatBytes, formatCount, formatProcessName } from "../../lib/processFormatting";
import { formatRelativeTime } from "../../timestampFormat";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { stackedThreadToast, toastManager } from "../ui/toast";

const AUTO_REFRESH_MS = 5_000;
const PROCESS_TABLE_LIMIT = 400;
const SERVICE_TABLE_LIMIT = 400;

type ServerProcessDialogVariant = "rail" | "mobile";

type KillTarget =
  | {
      readonly kind: "process";
      readonly pid: number;
      readonly command: string;
      readonly signal: ServerProcessSignal;
    }
  | {
      readonly kind: "service";
      readonly pid: number;
      readonly command: string;
      readonly signal: ServerProcessSignal;
      readonly portLabel: string;
    };

function formatRelative(value: DateTime.Utc | null): string {
  if (!value) return "never";
  const relative = formatRelativeTime(DateTime.formatIso(value));
  return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
}

function portLabel(port: ServerMachineProcessPort): string {
  return `${port.protocol} ${port.localAddress}:${port.localPort}`;
}

function processSearchText(process: ServerMachineProcessEntry): string {
  return [
    process.pid,
    process.ppid,
    process.status,
    process.elapsed,
    process.command,
    ...process.ports.map(portLabel),
  ]
    .join(" ")
    .toLowerCase();
}

function serviceSearchText(port: ServerMachineProcessPort): string {
  return [port.pid, port.command, port.protocol, port.localAddress, port.localPort]
    .join(" ")
    .toLowerCase();
}

function matchesQuery(value: string, query: string): boolean {
  return query.length === 0 || value.includes(query);
}

function StatBlock({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 border-border/60 px-4 py-3">
      <div className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-lg font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function MachineSnapshotError({ message }: { readonly message: string }) {
  return (
    <div className="flex items-start gap-2 border-t border-border/60 px-4 py-3 text-xs text-destructive">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

function KillButton({
  canSignal,
  protectedReason,
  disabled,
  label,
  onClick,
}: {
  readonly canSignal: boolean;
  readonly protectedReason: string | null;
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  const button = (
    <Button
      aria-label={label}
      className="size-6 rounded-md text-muted-foreground hover:text-destructive disabled:hover:text-muted-foreground"
      disabled={!canSignal || disabled}
      onClick={onClick}
      size="icon-xs"
      variant="ghost"
    >
      <XIcon className="size-3.5" />
    </Button>
  );

  if (canSignal) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup side="top">{protectedReason ?? "Protected process"}</TooltipPopup>
    </Tooltip>
  );
}

function CommandCell({ command }: { readonly command: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block truncate">{command}</span>} />
      <TooltipPopup
        className="max-w-[min(520px,calc(100vw-2rem))] whitespace-normal break-words text-left font-mono text-[11px] leading-relaxed text-wrap"
        side="top"
      >
        {command}
      </TooltipPopup>
    </Tooltip>
  );
}

function ServicesTable({
  ports,
  killingPid,
  onKill,
}: {
  readonly ports: ReadonlyArray<ServerMachineProcessPort>;
  readonly killingPid: number | null;
  readonly onKill: (port: ServerMachineProcessPort) => void;
}) {
  return (
    <ScrollArea scrollFade hideScrollbars className="max-h-[18rem] rounded-none border-t">
      <table className="w-full min-w-[760px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[36%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 border-b bg-card text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
          <tr>
            <th className="px-4 py-2 font-semibold">Port</th>
            <th className="px-3 py-2 font-semibold">Protocol</th>
            <th className="px-3 py-2 font-semibold">Address</th>
            <th className="px-3 py-2 text-right font-semibold">PID</th>
            <th className="px-3 py-2 font-semibold">Command</th>
            <th className="p-2 text-right font-semibold">Kill</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {ports.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-xs text-muted-foreground" colSpan={6}>
                No listening services found.
              </td>
            </tr>
          ) : null}
          {ports.map((port) => (
            <tr
              className={cn("hover:bg-muted/20", !port.canSignal && "bg-amber-500/5")}
              key={`${port.protocol}:${port.localAddress}:${port.localPort}:${port.pid}`}
            >
              <td className="px-4 py-2 align-middle font-mono font-medium tabular-nums text-foreground">
                {port.localPort}
              </td>
              <td className="px-3 py-2 align-middle font-mono text-muted-foreground">
                {port.protocol}
              </td>
              <td className="truncate px-3 py-2 align-middle font-mono text-muted-foreground">
                {port.localAddress}
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums text-muted-foreground">
                {port.pid}
              </td>
              <td className="px-3 py-2 align-middle text-muted-foreground">
                <CommandCell command={port.command} />
              </td>
              <td className="p-2 text-right align-middle">
                <KillButton
                  canSignal={port.canSignal}
                  disabled={killingPid === port.pid}
                  label={`Kill process ${port.pid}`}
                  protectedReason={port.protectedReason}
                  onClick={() => onKill(port)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function ProcessesTable({
  processes,
  killingPid,
  onKill,
}: {
  readonly processes: ReadonlyArray<ServerMachineProcessEntry>;
  readonly killingPid: number | null;
  readonly onKill: (process: ServerMachineProcessEntry) => void;
}) {
  return (
    <ScrollArea scrollFade hideScrollbars className="max-h-[24rem] rounded-none border-t">
      <table className="w-full min-w-[980px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[36%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead className="sticky top-0 z-10 border-b bg-card text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
          <tr>
            <th className="px-4 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 text-right font-semibold">CPU</th>
            <th className="px-3 py-2 text-right font-semibold">Memory</th>
            <th className="px-3 py-2 font-semibold">Command</th>
            <th className="px-3 py-2 font-semibold">Ports</th>
            <th className="px-3 py-2 text-right font-semibold">PID</th>
            <th className="p-2 text-right font-semibold">Kill</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {processes.length === 0 ? (
            <tr>
              <td className="px-4 py-4 text-xs text-muted-foreground" colSpan={7}>
                No matching processes found.
              </td>
            </tr>
          ) : null}
          {processes.map((process) => (
            <tr
              className={cn("hover:bg-muted/20", !process.canSignal && "bg-amber-500/5")}
              key={process.pid}
            >
              <td className="px-4 py-2 align-middle">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      process.ports.length > 0 ? "bg-sky-500/90" : "bg-emerald-500/80",
                    )}
                  />
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
                <CommandCell command={process.command} />
              </td>
              <td className="px-3 py-2 align-middle text-muted-foreground">
                <span className="block truncate font-mono text-[11px]">
                  {process.ports.length > 0
                    ? process.ports.map((port) => port.localPort).join(", ")
                    : "none"}
                </span>
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono tabular-nums text-muted-foreground">
                {process.pid}
              </td>
              <td className="p-2 text-right align-middle">
                <KillButton
                  canSignal={process.canSignal}
                  disabled={killingPid === process.pid}
                  label={`Kill process ${process.pid}`}
                  protectedReason={process.protectedReason}
                  onClick={() => onKill(process)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

export function ServerProcessDialog({
  variant = "rail",
}: {
  readonly variant?: ServerProcessDialogVariant;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ServerMachineProcessSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [query, setQuery] = useState("");
  const [killTarget, setKillTarget] = useState<KillTarget | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsPending(true);
    void ensureLocalApi()
      .server.getMachineProcesses()
      .then((nextSnapshot) => {
        if (requestIdRef.current !== requestId) return;
        setSnapshot(nextSnapshot);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(cause instanceof Error ? cause.message : "Failed to load processes.");
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setIsPending(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const interval = window.setInterval(refresh, AUTO_REFRESH_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [open, refresh]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPorts = useMemo(() => {
    return (snapshot?.ports ?? [])
      .filter((port) => matchesQuery(serviceSearchText(port), normalizedQuery))
      .slice(0, SERVICE_TABLE_LIMIT);
  }, [normalizedQuery, snapshot?.ports]);
  const filteredProcesses = useMemo(() => {
    return (snapshot?.processes ?? [])
      .filter((process) => matchesQuery(processSearchText(process), normalizedQuery))
      .slice(0, PROCESS_TABLE_LIMIT);
  }, [normalizedQuery, snapshot?.processes]);
  const snapshotError = snapshot ? Option.getOrNull(snapshot.error) : null;
  const checkedAt = snapshot ? snapshot.readAt : null;

  const startKillPort = useCallback((port: ServerMachineProcessPort) => {
    setKillTarget({
      kind: "service",
      pid: port.pid,
      command: port.command,
      signal: "SIGTERM",
      portLabel: portLabel(port),
    });
  }, []);

  const startKillProcess = useCallback((process: ServerMachineProcessEntry) => {
    setKillTarget({
      kind: "process",
      pid: process.pid,
      command: process.command,
      signal: "SIGTERM",
    });
  }, []);

  const confirmKill = useCallback(() => {
    if (!killTarget) return;
    setKillingPid(killTarget.pid);
    void ensureLocalApi()
      .server.signalMachineProcess({ pid: killTarget.pid, signal: killTarget.signal })
      .then((result) => {
        setKillTarget(null);
        if (!result.signaled) {
          const message = Option.getOrUndefined(result.message);
          toastManager.add({
            type: "error",
            title: "Could not kill process",
            description: message ?? `Failed to send ${killTarget.signal}.`,
          });
          return;
        }
        toastManager.add({
          type: "success",
          title: "Process signaled",
          description: `Sent ${killTarget.signal} to process ${killTarget.pid}.`,
        });
        refresh();
      })
      .catch((cause: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not kill process",
            description: cause instanceof Error ? cause.message : "Failed to signal process.",
          }),
        );
      })
      .finally(() => {
        setKillingPid(null);
      });
  }, [killTarget, refresh]);

  const trigger =
    variant === "mobile" ? (
      <Button
        aria-label="Server"
        className="h-11 min-w-0 flex-1 flex-col gap-0.5 rounded-none px-1 text-[10px]"
        onClick={() => setOpen(true)}
        size="sm"
        variant="ghost"
      >
        <ServerIcon className="size-4" />
        <span className="max-w-full truncate">Server</span>
      </Button>
    ) : (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Server"
              className="size-9 rounded-md"
              onClick={() => setOpen(true)}
              size="icon-sm"
              variant="ghost"
            >
              <ServerIcon className="size-4" />
            </Button>
          }
        />
        <TooltipPopup side="right">Server</TooltipPopup>
      </Tooltip>
    );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger}
        <DialogPopup className="max-h-[88dvh] max-w-[min(92rem,calc(100vw-2rem))]">
          <DialogHeader>
            <div className="flex min-w-0 items-start justify-between gap-4 pr-7">
              <div className="min-w-0">
                <DialogTitle>Server</DialogTitle>
                <DialogDescription>
                  {snapshot
                    ? `${formatCount(snapshot.serviceCount)} services, ${formatCount(snapshot.processCount)} processes`
                    : "Loading process snapshot"}
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground/70 sm:inline">
                  {formatRelative(checkedAt)}
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Refresh server processes"
                        className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                        disabled={isPending}
                        onClick={refresh}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <RefreshCwIcon className={cn("size-3.5", isPending && "animate-spin")} />
                      </Button>
                    }
                  />
                  <TooltipPopup side="top">Refresh</TooltipPopup>
                </Tooltip>
              </div>
            </div>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid grid-cols-2 rounded-md border sm:grid-cols-4">
              <StatBlock
                label="Services"
                value={snapshot ? formatCount(snapshot.serviceCount) : "..."}
              />
              <StatBlock
                label="Processes"
                value={snapshot ? formatCount(snapshot.processCount) : "..."}
              />
              <StatBlock
                label="CPU"
                value={snapshot ? `${snapshot.totalCpuPercent.toFixed(1)}%` : "..."}
              />
              <StatBlock
                label="Memory"
                value={snapshot ? formatBytes(snapshot.totalRssBytes) : "..."}
              />
            </div>
            {snapshotError ? <MachineSnapshotError message={snapshotError.message} /> : null}
            {error ? <MachineSnapshotError message={error} /> : null}
            <div className="relative">
              <SearchIcon className="-translate-y-1/2 pointer-events-none absolute left-2.5 top-1/2 size-3.5 text-muted-foreground/70" />
              <Input
                aria-label="Filter processes"
                className="h-8 pl-8 text-sm"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by process, PID, or port"
                value={query}
              />
            </div>
            <section className="overflow-hidden rounded-md border bg-card">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <h3 className="truncate text-sm font-medium">Listening Services</h3>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatCount(filteredPorts.length)}
                </span>
              </div>
              <ServicesTable ports={filteredPorts} killingPid={killingPid} onKill={startKillPort} />
            </section>
            <section className="overflow-hidden rounded-md border bg-card">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <h3 className="truncate text-sm font-medium">Processes</h3>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatCount(filteredProcesses.length)}
                </span>
              </div>
              <ProcessesTable
                processes={filteredProcesses}
                killingPid={killingPid}
                onKill={startKillProcess}
              />
            </section>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={killTarget !== null}
        onOpenChange={(nextOpen) => !nextOpen && setKillTarget(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Kill process?</AlertDialogTitle>
            <AlertDialogDescription>
              {killTarget
                ? killTarget.kind === "service"
                  ? `Send ${killTarget.signal} to process ${killTarget.pid} for ${killTarget.portLabel}?`
                  : `Send ${killTarget.signal} to process ${killTarget.pid}?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {killTarget ? (
            <div className="mx-6 mb-2 min-w-0 rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
              <div className="truncate">{killTarget.command}</div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              disabled={killTarget !== null && killingPid === killTarget.pid}
              onClick={confirmKill}
              variant="destructive"
            >
              Kill
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
