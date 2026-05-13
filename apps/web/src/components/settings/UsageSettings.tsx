import { useQuery } from "@tanstack/react-query";
import type {
  ProviderUsageCredit,
  ProviderUsageProviderSnapshot,
  ProviderUsageWindow,
} from "@t3tools/contracts";
import {
  AlertTriangleIcon,
  ClockIcon,
  GaugeIcon,
  LoaderIcon,
  RefreshCwIcon,
  WalletCardsIcon,
} from "lucide-react";

import { providerUsageQueryOptions } from "../../lib/providerReactQuery";
import { cn } from "../../lib/utils";
import { formatRelativeTime } from "../../timestampFormat";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { getDriverOption } from "./providerDriverMeta";
import { SettingsRow, SettingsSection, useRelativeTimeTick } from "./settingsLayout";

function UsagePageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 sm:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">{children}</div>
    </div>
  );
}

function sourceLabel(source: ProviderUsageProviderSnapshot["source"]) {
  switch (source) {
    case "codex-app-server":
      return "Codex app-server";
    case "provider-runtime":
      return "Runtime event";
    case "provider-web":
      return "Provider web";
    case "provider-cli":
      return "Provider CLI";
    case "not-supported":
      return "Not wired";
  }
}

function statusBadgeVariant(status: ProviderUsageProviderSnapshot["status"]) {
  switch (status) {
    case "ready":
      return "success";
    case "disabled":
      return "outline";
    case "unsupported":
    case "unavailable":
      return "warning";
    case "error":
      return "error";
  }
}

function statusLabel(status: ProviderUsageProviderSnapshot["status"]) {
  switch (status) {
    case "ready":
      return "Ready";
    case "disabled":
      return "Disabled";
    case "unsupported":
      return "Unsupported";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Error";
  }
}

function formatUpdatedAt(value: string | undefined): string {
  if (!value) return "Not updated";
  const relative = formatRelativeTime(value);
  if (relative.suffix) return `${relative.value} ${relative.suffix}`;
  return relative.value;
}

function formatReset(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `Resets ${new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date)}`;
  }
  return `Resets ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date)}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function progressFillClass(usedPercent: number): string {
  if (usedPercent >= 90) return "bg-destructive";
  if (usedPercent >= 75) return "bg-warning";
  if (usedPercent >= 50) return "bg-info";
  return "bg-success";
}

function ProgressBar({ usedPercent }: { usedPercent: number }) {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  return (
    <div className="h-2 w-full min-w-32 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width]", progressFillClass(clamped))}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function UsageWindowRow({ window }: { window: ProviderUsageWindow }) {
  const resetLabel = window.resetLabel ?? formatReset(window.resetsAt);
  return (
    <div className="grid min-h-12 grid-cols-1 gap-2 border-t border-border/60 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,22rem)_5rem] sm:items-center">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground">{window.title}</div>
        {resetLabel ? (
          <div className="mt-0.5 text-xs text-muted-foreground/80">{resetLabel}</div>
        ) : null}
      </div>
      <ProgressBar usedPercent={window.usedPercent} />
      <div className="text-left text-xs font-medium tabular-nums text-muted-foreground sm:text-right">
        {formatPercent(window.usedPercent)} used
      </div>
    </div>
  );
}

function groupWindows(windows: readonly ProviderUsageWindow[]) {
  const groups = new Map<string, ProviderUsageWindow[]>();
  for (const window of windows) {
    const key = window.limitName ?? "Usage limits";
    const group = groups.get(key);
    if (group) {
      group.push(window);
    } else {
      groups.set(key, [window]);
    }
  }
  return [...groups.entries()];
}

function UsageWindows({ provider }: { provider: ProviderUsageProviderSnapshot }) {
  if (provider.windows.length === 0) {
    return (
      <div className="border-t border-border/60 py-4 text-xs text-muted-foreground">
        No usage windows reported.
      </div>
    );
  }

  const groups = groupWindows(provider.windows);
  return (
    <div className="border-t border-border/60">
      {groups.map(([title, windows], index) => (
        <div key={title} className={cn(index > 0 && "border-t border-border/60", "py-3")}>
          {groups.length > 1 || title !== "Usage limits" ? (
            <div className="pb-2 text-xs font-semibold text-muted-foreground/80">{title}</div>
          ) : null}
          {windows.map((window) => (
            <UsageWindowRow key={window.id} window={window} />
          ))}
        </div>
      ))}
    </div>
  );
}

function formatCreditValue(credit: ProviderUsageCredit): string {
  if (credit.balanceLabel) return credit.balanceLabel;
  if (credit.balance !== undefined) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(credit.balance);
  }
  if (credit.period === "Unlimited") return "Unlimited";
  return "Available";
}

function CreditRows({ credits }: { credits: readonly ProviderUsageCredit[] }) {
  if (credits.length === 0) return null;
  return (
    <div className="border-t border-border/60 py-3">
      <div className="pb-2 text-xs font-semibold text-muted-foreground/80">Credits</div>
      {credits.map((credit) => {
        const hasLimit =
          credit.used !== undefined && credit.limit !== undefined && credit.limit > 0;
        const usedPercent = hasLimit ? Math.min(100, (credit.used / credit.limit) * 100) : 0;
        return (
          <div
            key={credit.id}
            className="grid min-h-12 grid-cols-1 gap-2 border-t border-border/60 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,22rem)_5rem] sm:items-center"
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">{credit.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground/80">
                {credit.period ?? "Current balance"}
              </div>
            </div>
            {hasLimit ? <ProgressBar usedPercent={usedPercent} /> : <div />}
            <div className="text-left text-xs font-medium tabular-nums text-muted-foreground sm:text-right">
              {formatCreditValue(credit)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProviderUsageSection({ provider }: { provider: ProviderUsageProviderSnapshot }) {
  const driver = getDriverOption(provider.driver);
  const Icon = driver?.icon ?? GaugeIcon;
  return (
    <SettingsSection
      title={provider.displayName}
      icon={<Icon className="size-3.5" />}
      headerAction={
        <div className="flex items-center gap-2">
          {provider.plan ? (
            <Badge variant="outline" size="sm">
              {provider.plan}
            </Badge>
          ) : null}
          <Badge variant={statusBadgeVariant(provider.status)} size="sm">
            {statusLabel(provider.status)}
          </Badge>
        </div>
      }
    >
      <SettingsRow
        title="Provider usage"
        description={`${sourceLabel(provider.source)} - Updated ${formatUpdatedAt(provider.updatedAt)}`}
        status={provider.error}
      >
        {provider.status === "ready" ? (
          <>
            <UsageWindows provider={provider} />
            <CreditRows credits={provider.credits} />
          </>
        ) : (
          <div className="border-t border-border/60 py-4 text-xs text-muted-foreground">
            {provider.error ?? "Usage is not available for this provider."}
          </div>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}

function OverviewMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 border-t border-border/60 py-4 first:border-t-0 sm:border-l sm:border-t-0 sm:px-4 sm:first:border-l-0">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground/80">{detail}</div>
    </div>
  );
}

function nextResetLabel(windows: readonly ProviderUsageWindow[]): string {
  const resets = windows
    .map((window) => (window.resetsAt ? new Date(window.resetsAt) : null))
    .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()))
    .toSorted((left, right) => left.getTime() - right.getTime());
  if (!resets[0]) return "No reset reported";
  return formatReset(resets[0].toISOString()) ?? "No reset reported";
}

function UsageOverview({ providers }: { providers: readonly ProviderUsageProviderSnapshot[] }) {
  const readyProviders = providers.filter((provider) => provider.status === "ready");
  const windows = readyProviders.flatMap((provider) => provider.windows);
  const highestWindow = windows.reduce<ProviderUsageWindow | null>(
    (highest, window) =>
      highest === null || window.usedPercent > highest.usedPercent ? window : highest,
    null,
  );
  const creditCount = readyProviders.reduce((sum, provider) => sum + provider.credits.length, 0);

  return (
    <SettingsSection
      title="Overview"
      icon={<GaugeIcon className="size-3.5" />}
      headerAction={
        <Badge variant="outline" size="sm">
          {providers.length} providers
        </Badge>
      }
    >
      <div className="grid grid-cols-1 px-4 sm:grid-cols-4 sm:px-1">
        <OverviewMetric
          icon={<GaugeIcon className="size-3.5" />}
          label="Highest usage"
          value={highestWindow ? formatPercent(highestWindow.usedPercent) : "0%"}
          detail={highestWindow?.limitName ?? highestWindow?.title ?? "No usage reported"}
        />
        <OverviewMetric
          icon={<ClockIcon className="size-3.5" />}
          label="Next reset"
          value={windows.length > 0 ? nextResetLabel(windows).replace(/^Resets /, "") : "None"}
          detail={`${windows.length} usage windows`}
        />
        <OverviewMetric
          icon={<WalletCardsIcon className="size-3.5" />}
          label="Credits"
          value={`${creditCount}`}
          detail={creditCount === 1 ? "credit bucket" : "credit buckets"}
        />
        <OverviewMetric
          icon={<AlertTriangleIcon className="size-3.5" />}
          label="Attention"
          value={`${providers.filter((provider) => provider.status === "error").length}`}
          detail="provider errors"
        />
      </div>
    </SettingsSection>
  );
}

function UsageLoading() {
  return (
    <UsagePageContainer>
      <SettingsSection title="Overview" icon={<GaugeIcon className="size-3.5" />}>
        <div className="grid grid-cols-1 gap-px p-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-3 py-2 sm:px-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="Provider" icon={<GaugeIcon className="size-3.5" />}>
        <div className="space-y-4 p-5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-2/3" />
        </div>
      </SettingsSection>
    </UsagePageContainer>
  );
}

export function UsageSettings() {
  useRelativeTimeTick(30_000);
  const usageQuery = useQuery(providerUsageQueryOptions());
  const providers = usageQuery.data?.providers ?? [];
  const codexProviders = providers.filter((provider) => provider.driver === "codex");
  const otherProviders = providers.filter((provider) => provider.driver !== "codex");

  if (usageQuery.isLoading) {
    return <UsageLoading />;
  }

  return (
    <UsagePageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provider totals and provider-specific limits.
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="xs"
                variant="outline"
                className="w-fit"
                disabled={usageQuery.isFetching}
                onClick={() => void usageQuery.refetch()}
              >
                {usageQuery.isFetching ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-3.5" />
                )}
                Refresh
              </Button>
            }
          />
          <TooltipPopup side="bottom">Refresh provider usage</TooltipPopup>
        </Tooltip>
      </div>

      {usageQuery.isError ? (
        <SettingsSection title="Usage" icon={<AlertTriangleIcon className="size-3.5" />}>
          <SettingsRow
            title="Could not load usage"
            description={
              usageQuery.error instanceof Error
                ? usageQuery.error.message
                : "Provider usage is unavailable."
            }
          />
        </SettingsSection>
      ) : (
        <>
          <UsageOverview providers={providers} />
          {codexProviders.map((provider) => (
            <ProviderUsageSection key={provider.providerInstanceId} provider={provider} />
          ))}
          {otherProviders.length > 0 ? (
            <SettingsSection title="Other providers" icon={<GaugeIcon className="size-3.5" />}>
              {otherProviders.map((provider) => {
                const driver = getDriverOption(provider.driver);
                const Icon = driver?.icon ?? GaugeIcon;
                return (
                  <SettingsRow
                    key={provider.providerInstanceId}
                    title={
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{provider.displayName}</span>
                      </span>
                    }
                    description={sourceLabel(provider.source)}
                    status={provider.error}
                    control={
                      <Badge variant={statusBadgeVariant(provider.status)} size="sm">
                        {statusLabel(provider.status)}
                      </Badge>
                    }
                  />
                );
              })}
            </SettingsSection>
          ) : null}
        </>
      )}
    </UsagePageContainer>
  );
}
