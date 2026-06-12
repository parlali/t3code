import { remoteHttpClientLayer } from "@t3tools/client-runtime";
import { httpHeaderRedactionLayer } from "@t3tools/shared/httpObservability";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { FetchHttpClient } from "effect/unstable/http";

import {
  PrimaryEnvironmentHttpClient,
  primaryEnvironmentHttpClientLive,
} from "../environments/primary/httpClient";

export const remoteHttpRuntime = ManagedRuntime.make(remoteHttpClientLayer(globalThis.fetch));

const primaryHttpRuntime = ManagedRuntime.make(
  primaryEnvironmentHttpClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        remoteHttpClientLayer((input, init) => globalThis.fetch(input, init)),
        httpHeaderRedactionLayer,
        Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" }),
      ),
    ),
  ),
);

export type PrimaryHttpEffectRunner = <A, E>(
  effect: Effect.Effect<A, E, PrimaryEnvironmentHttpClient>,
) => Promise<A>;

const livePrimaryHttpRunner: PrimaryHttpEffectRunner = (effect) =>
  primaryHttpRuntime.runPromise(effect);

let primaryHttpRunner = livePrimaryHttpRunner;

export const runPrimaryHttp = <A, E>(effect: Effect.Effect<A, E, PrimaryEnvironmentHttpClient>) =>
  primaryHttpRunner(effect);

export function __setPrimaryHttpRunnerForTests(runner?: PrimaryHttpEffectRunner): void {
  primaryHttpRunner = runner ?? livePrimaryHttpRunner;
}
