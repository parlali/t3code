import {
  ClaudeSettings,
  CodexSettings,
  CursorSettings,
  OpenCodeSettings,
  type ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceConfigMap,
  ProviderInstanceId,
  type ProviderUsageCredit,
  type ProviderUsageInput,
  type ProviderUsageProviderSnapshot,
  type ProviderUsageSnapshot,
  type ProviderUsageWindow,
  type ProviderUsageWindowKind,
  type ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";
import { Duration, Effect, FileSystem, Layer, Option, Path, Result, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexSchema from "effect-codex-app-server/schema";

import { mergeProviderInstanceEnvironment } from "./ProviderInstanceEnvironment.ts";
import { materializeCodexShadowHome, resolveCodexHomeLayout } from "./Drivers/CodexHomeLayout.ts";
import { buildCodexInitializeParams } from "./Layers/CodexProvider.ts";
import { deriveProviderInstanceConfigMap } from "./Layers/ProviderInstanceRegistryHydration.ts";
import { AUTH_PROBE_TIMEOUT_MS } from "./providerSnapshot.ts";

const DRIVER_USAGE_ORDER = ["codex", "claudeAgent", "cursor", "opencode"] as const;

const DRIVER_DISPLAY_NAMES: Record<string, string> = {
  claudeAgent: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
};

const CODEX_PLAN_LABELS: Record<CodexSchema.V2GetAccountRateLimitsResponse__PlanType, string> = {
  free: "Free",
  go: "Go",
  plus: "Plus",
  pro: "Pro",
  prolite: "Pro Lite",
  team: "Team",
  self_serve_business_usage_based: "Business usage-based",
  business: "Business",
  enterprise_cbp_usage_based: "Enterprise usage-based",
  enterprise: "Enterprise",
  edu: "Edu",
  unknown: "Unknown",
};

type CodexRateLimitSnapshot = CodexSchema.V2GetAccountRateLimitsResponse["rateLimits"];
type CodexRateLimitWindow = CodexSchema.V2GetAccountRateLimitsResponse__RateLimitWindow;

export interface ProviderUsageSnapshotInput {
  readonly settings: ServerSettings;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly cwd: string;
  readonly input?: ProviderUsageInput;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dateFromCodexReset(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const millis = value < 10_000_000_000 ? value * 1_000 : value;
  return new Date(millis).toISOString();
}

function kindForWindow(window: CodexRateLimitWindow): ProviderUsageWindowKind {
  switch (window.windowDurationMins) {
    case 300:
      return "five-hour";
    case 10_080:
      return "weekly";
    case 43_200:
    case 43_800:
    case 44_640:
      return "monthly";
    default:
      return "custom";
  }
}

function titleForWindow(window: CodexRateLimitWindow, fallback: "primary" | "secondary"): string {
  switch (window.windowDurationMins) {
    case 300:
      return "5 hour usage limit";
    case 10_080:
      return "Weekly usage limit";
    case 43_200:
    case 43_800:
    case 44_640:
      return "Monthly usage limit";
    default:
      return fallback === "primary" ? "Primary usage limit" : "Secondary usage limit";
  }
}

function humanizeLimitId(limitId: string | null | undefined): string {
  if (!limitId) return "General usage limits";
  if (limitId === "codex") return "Codex usage limits";
  return `${limitId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")} usage limits`;
}

function mapCodexWindow(input: {
  readonly limitId: string;
  readonly limitName?: string;
  readonly slot: "primary" | "secondary";
  readonly window: CodexRateLimitWindow;
}): ProviderUsageWindow {
  const usedPercent = clampPercent(input.window.usedPercent);
  const remainingPercent = clampPercent(100 - usedPercent);
  const resetsAt = dateFromCodexReset(input.window.resetsAt);
  return {
    id: `${input.limitId}:${input.slot}`,
    title: titleForWindow(input.window, input.slot),
    kind: kindForWindow(input.window),
    usedPercent,
    remainingPercent,
    ...(input.window.windowDurationMins ? { windowMinutes: input.window.windowDurationMins } : {}),
    ...(resetsAt ? { resetsAt } : {}),
    limitId: input.limitId,
    ...(input.limitName ? { limitName: input.limitName } : {}),
  };
}

function mapCodexCredits(limitId: string, snapshot: CodexRateLimitSnapshot): ProviderUsageCredit[] {
  const credits = snapshot.credits;
  if (!credits || (!credits.hasCredits && !credits.balance && !credits.unlimited)) {
    return [];
  }

  const balance =
    credits.balance === null || credits.balance === undefined ? undefined : Number(credits.balance);
  return [
    {
      id: `${limitId}:credits`,
      title: "Credit balance",
      ...(typeof balance === "number" && Number.isFinite(balance) ? { balance } : {}),
      ...(credits.balance ? { balanceLabel: credits.balance } : {}),
      ...(credits.unlimited ? { period: "Unlimited" } : {}),
    },
  ];
}

function mapCodexRateLimitSnapshot(
  limitId: string,
  snapshot: CodexRateLimitSnapshot,
): {
  readonly windows: ProviderUsageWindow[];
  readonly credits: ProviderUsageCredit[];
  readonly plan: string | undefined;
} {
  const normalizedLimitId = snapshot.limitId ?? limitId;
  const limitName = snapshot.limitName ?? humanizeLimitId(normalizedLimitId);
  const windows: ProviderUsageWindow[] = [];

  if (snapshot.primary) {
    windows.push(
      mapCodexWindow({
        limitId: normalizedLimitId,
        limitName,
        slot: "primary",
        window: snapshot.primary,
      }),
    );
  }
  if (snapshot.secondary) {
    windows.push(
      mapCodexWindow({
        limitId: normalizedLimitId,
        limitName,
        slot: "secondary",
        window: snapshot.secondary,
      }),
    );
  }

  return {
    windows,
    credits: mapCodexCredits(normalizedLimitId, snapshot),
    plan: snapshot.planType ? CODEX_PLAN_LABELS[snapshot.planType] : undefined,
  };
}

function mapCodexRateLimitsResponse(input: {
  readonly providerInstanceId: ProviderInstanceId;
  readonly driver: ProviderDriverKind;
  readonly displayName: string;
  readonly updatedAt: string;
  readonly response: CodexSchema.V2GetAccountRateLimitsResponse;
}): ProviderUsageProviderSnapshot {
  const snapshots = input.response.rateLimitsByLimitId
    ? Object.entries(input.response.rateLimitsByLimitId)
    : [["general", input.response.rateLimits] as const];
  const mapped = snapshots.map(([limitId, snapshot]) =>
    mapCodexRateLimitSnapshot(limitId, snapshot),
  );
  const plan = mapped.find((entry) => entry.plan)?.plan;

  return {
    providerInstanceId: input.providerInstanceId,
    driver: input.driver,
    displayName: input.displayName,
    status: "ready",
    source: "codex-app-server",
    updatedAt: input.updatedAt,
    ...(plan ? { plan } : {}),
    windows: mapped.flatMap((entry) => entry.windows),
    credits: mapped.flatMap((entry) => entry.credits),
    providerSpecific: input.response,
  };
}

const decodeEnabled = Effect.fn("decodeProviderUsageEnabled")(function* (
  instance: ProviderInstanceConfig,
) {
  if (instance.enabled !== undefined) {
    return instance.enabled;
  }

  switch (instance.driver) {
    case "codex":
      return yield* Schema.decodeUnknownEffect(CodexSettings)(instance.config ?? {}).pipe(
        Effect.map((settings) => settings.enabled),
        Effect.orElseSucceed(() => true),
      );
    case "claudeAgent":
      return yield* Schema.decodeUnknownEffect(ClaudeSettings)(instance.config ?? {}).pipe(
        Effect.map((settings) => settings.enabled),
        Effect.orElseSucceed(() => true),
      );
    case "cursor":
      return yield* Schema.decodeUnknownEffect(CursorSettings)(instance.config ?? {}).pipe(
        Effect.map((settings) => settings.enabled),
        Effect.orElseSucceed(() => true),
      );
    case "opencode":
      return yield* Schema.decodeUnknownEffect(OpenCodeSettings)(instance.config ?? {}).pipe(
        Effect.map((settings) => settings.enabled),
        Effect.orElseSucceed(() => true),
      );
    default:
      return true;
  }
});

const fetchCodexRateLimits = Effect.fn("fetchCodexRateLimits")(function* (input: {
  readonly settings: CodexSettings;
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
}) {
  const homeLayout = yield* resolveCodexHomeLayout(input.settings);
  yield* materializeCodexShadowHome(homeLayout);

  const clientContext = yield* Layer.build(
    CodexClient.layerCommand({
      command: input.settings.binaryPath,
      args: ["app-server"],
      cwd: input.cwd,
      env: {
        ...(input.environment ?? process.env),
        ...(homeLayout.effectiveHomePath ? { CODEX_HOME: homeLayout.effectiveHomePath } : {}),
      },
    }),
  );
  const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
    Effect.provide(clientContext),
  );

  yield* client.request("initialize", buildCodexInitializeParams());
  yield* client.notify("initialized", undefined);
  return yield* client.request("account/rateLimits/read", undefined);
});

function usageErrorSnapshot(input: {
  readonly providerInstanceId: ProviderInstanceId;
  readonly driver: ProviderDriverKind;
  readonly displayName: string;
  readonly status: ProviderUsageProviderSnapshot["status"];
  readonly source: ProviderUsageProviderSnapshot["source"];
  readonly updatedAt: string;
  readonly error?: string;
}): ProviderUsageProviderSnapshot {
  return {
    providerInstanceId: input.providerInstanceId,
    driver: input.driver,
    displayName: input.displayName,
    status: input.status,
    source: input.source,
    updatedAt: input.updatedAt,
    windows: [],
    credits: [],
    ...(input.error ? { error: input.error } : {}),
  };
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message;
  if (typeof cause === "string" && cause.trim().length > 0) return cause;
  return fallback;
}

const fetchCodexProviderUsage = Effect.fn("fetchCodexProviderUsage")(function* (input: {
  readonly providerInstanceId: ProviderInstanceId;
  readonly entry: ProviderInstanceConfig;
  readonly displayName: string;
  readonly cwd: string;
  readonly updatedAt: string;
}) {
  const codexSettings = yield* Schema.decodeUnknownEffect(CodexSettings)(input.entry.config ?? {});
  const enabled = input.entry.enabled ?? codexSettings.enabled;
  if (!enabled) {
    return usageErrorSnapshot({
      providerInstanceId: input.providerInstanceId,
      driver: input.entry.driver,
      displayName: input.displayName,
      status: "disabled",
      source: "codex-app-server",
      updatedAt: input.updatedAt,
      error: "Codex is disabled in settings.",
    });
  }

  const responseResult = yield* fetchCodexRateLimits({
    settings: codexSettings,
    cwd: input.cwd,
    environment: mergeProviderInstanceEnvironment(input.entry.environment),
  }).pipe(
    Effect.scoped,
    Effect.timeoutOption(Duration.millis(AUTH_PROBE_TIMEOUT_MS)),
    Effect.result,
  );

  if (Result.isFailure(responseResult)) {
    return usageErrorSnapshot({
      providerInstanceId: input.providerInstanceId,
      driver: input.entry.driver,
      displayName: input.displayName,
      status: "error",
      source: "codex-app-server",
      updatedAt: input.updatedAt,
      error: errorMessage(responseResult.failure, "Failed to load Codex usage."),
    });
  }

  if (Option.isNone(responseResult.success)) {
    return usageErrorSnapshot({
      providerInstanceId: input.providerInstanceId,
      driver: input.entry.driver,
      displayName: input.displayName,
      status: "error",
      source: "codex-app-server",
      updatedAt: input.updatedAt,
      error: "Timed out while loading Codex usage.",
    });
  }

  return mapCodexRateLimitsResponse({
    providerInstanceId: input.providerInstanceId,
    driver: input.entry.driver,
    displayName: input.displayName,
    updatedAt: input.updatedAt,
    response: responseResult.success.value,
  });
});

function providerDisplayName(
  providerInstanceId: ProviderInstanceId,
  entry: ProviderInstanceConfig,
  provider: ServerProvider | undefined,
): string {
  return (
    provider?.displayName ??
    entry.displayName ??
    DRIVER_DISPLAY_NAMES[entry.driver] ??
    DRIVER_DISPLAY_NAMES[provider?.driver ?? ""] ??
    providerInstanceId
  );
}

const loadProviderUsage = Effect.fn("loadProviderUsage")(function* (input: {
  readonly providerInstanceId: ProviderInstanceId;
  readonly entry: ProviderInstanceConfig;
  readonly provider: ServerProvider | undefined;
  readonly cwd: string;
  readonly updatedAt: string;
}) {
  const displayName = providerDisplayName(input.providerInstanceId, input.entry, input.provider);
  const enabled = yield* decodeEnabled(input.entry);

  if (!enabled) {
    return usageErrorSnapshot({
      providerInstanceId: input.providerInstanceId,
      driver: input.entry.driver,
      displayName,
      status: "disabled",
      source: "not-supported",
      updatedAt: input.updatedAt,
      error: `${displayName} is disabled in settings.`,
    });
  }

  if (input.provider?.availability === "unavailable") {
    return usageErrorSnapshot({
      providerInstanceId: input.providerInstanceId,
      driver: input.entry.driver,
      displayName,
      status: "unavailable",
      source: "not-supported",
      updatedAt: input.updatedAt,
      error: input.provider.unavailableReason ?? "Provider driver is unavailable.",
    });
  }

  if (input.entry.driver === "codex") {
    return yield* fetchCodexProviderUsage({
      providerInstanceId: input.providerInstanceId,
      entry: input.entry,
      displayName,
      cwd: input.cwd,
      updatedAt: input.updatedAt,
    }).pipe(
      Effect.catch((cause) =>
        Effect.succeed(
          usageErrorSnapshot({
            providerInstanceId: input.providerInstanceId,
            driver: input.entry.driver,
            displayName,
            status: "error",
            source: "codex-app-server",
            updatedAt: input.updatedAt,
            error: errorMessage(cause, "Failed to load Codex usage."),
          }),
        ),
      ),
    );
  }

  return usageErrorSnapshot({
    providerInstanceId: input.providerInstanceId,
    driver: input.entry.driver,
    displayName,
    status: "unsupported",
    source: "not-supported",
    updatedAt: input.updatedAt,
    error: `${displayName} usage is not wired yet.`,
  });
});

function usageSortKey([instanceId, entry]: readonly [ProviderInstanceId, ProviderInstanceConfig]) {
  const index = DRIVER_USAGE_ORDER.indexOf(entry.driver as (typeof DRIVER_USAGE_ORDER)[number]);
  return `${index === -1 ? 99 : index}:${entry.displayName ?? DRIVER_DISPLAY_NAMES[entry.driver] ?? instanceId}`;
}

function sortedEntries(
  configMap: ProviderInstanceConfigMap,
): ReadonlyArray<readonly [ProviderInstanceId, ProviderInstanceConfig]> {
  return Object.entries(configMap)
    .map(([instanceId, entry]) => [ProviderInstanceId.make(instanceId), entry] as const)
    .toSorted((left, right) => usageSortKey(left).localeCompare(usageSortKey(right)));
}

export const loadProviderUsageSnapshot = Effect.fn("loadProviderUsageSnapshot")(function* (
  input: ProviderUsageSnapshotInput,
): Effect.fn.Return<
  ProviderUsageSnapshot,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> {
  const updatedAt = nowIso();
  const configMap = deriveProviderInstanceConfigMap(input.settings);
  const providerByInstanceId = new Map(
    input.providers.map((provider) => [provider.instanceId, provider]),
  );
  const entries = sortedEntries(configMap).filter(([instanceId]) =>
    input.input?.instanceId === undefined ? true : instanceId === input.input.instanceId,
  );

  const providers = yield* Effect.all(
    entries.map(([providerInstanceId, entry]) =>
      loadProviderUsage({
        providerInstanceId,
        entry,
        provider: providerByInstanceId.get(providerInstanceId),
        cwd: input.cwd,
        updatedAt,
      }),
    ),
    { concurrency: 4 },
  );

  return {
    updatedAt,
    providers,
  };
});
