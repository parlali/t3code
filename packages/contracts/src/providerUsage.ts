import { Effect, Schema } from "effect";

import { IsoDateTime } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

export const ProviderUsageSource = Schema.Literals([
  "codex-app-server",
  "provider-runtime",
  "provider-web",
  "provider-cli",
  "not-supported",
]);
export type ProviderUsageSource = typeof ProviderUsageSource.Type;

export const ProviderUsageStatus = Schema.Literals([
  "ready",
  "disabled",
  "unsupported",
  "unavailable",
  "error",
]);
export type ProviderUsageStatus = typeof ProviderUsageStatus.Type;

export const ProviderUsageWindowKind = Schema.Literals([
  "session",
  "five-hour",
  "weekly",
  "monthly",
  "model",
  "custom",
]);
export type ProviderUsageWindowKind = typeof ProviderUsageWindowKind.Type;

export const ProviderUsageWindow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  kind: ProviderUsageWindowKind,
  usedPercent: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  remainingPercent: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(100))),
  windowMinutes: Schema.optionalKey(Schema.Number),
  resetsAt: Schema.optionalKey(IsoDateTime),
  resetLabel: Schema.optionalKey(Schema.String),
  limitId: Schema.optionalKey(Schema.String),
  limitName: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
});
export type ProviderUsageWindow = typeof ProviderUsageWindow.Type;

export const ProviderUsageCredit = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  balance: Schema.optionalKey(Schema.Number),
  balanceLabel: Schema.optionalKey(Schema.String),
  used: Schema.optionalKey(Schema.Number),
  limit: Schema.optionalKey(Schema.Number),
  currencyCode: Schema.optionalKey(Schema.String),
  period: Schema.optionalKey(Schema.String),
  resetsAt: Schema.optionalKey(IsoDateTime),
});
export type ProviderUsageCredit = typeof ProviderUsageCredit.Type;

export const ProviderUsageProviderSnapshot = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  displayName: Schema.String,
  status: ProviderUsageStatus,
  source: ProviderUsageSource,
  updatedAt: IsoDateTime,
  plan: Schema.optionalKey(Schema.String),
  windows: Schema.Array(ProviderUsageWindow).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  credits: Schema.Array(ProviderUsageCredit).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  error: Schema.optionalKey(Schema.String),
  providerSpecific: Schema.optionalKey(Schema.Unknown),
});
export type ProviderUsageProviderSnapshot = typeof ProviderUsageProviderSnapshot.Type;

export const ProviderUsageSnapshot = Schema.Struct({
  updatedAt: IsoDateTime,
  providers: Schema.Array(ProviderUsageProviderSnapshot),
});
export type ProviderUsageSnapshot = typeof ProviderUsageSnapshot.Type;

export const ProviderUsageInput = Schema.Struct({
  instanceId: Schema.optionalKey(ProviderInstanceId),
});
export type ProviderUsageInput = typeof ProviderUsageInput.Type;
