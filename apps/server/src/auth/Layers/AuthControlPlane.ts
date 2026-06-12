import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as EnvironmentAuth from "../EnvironmentAuth.ts";
import {
  AuthControlPlane,
  AuthControlPlaneError,
  scopesForRole,
} from "../Services/AuthControlPlane.ts";
import type { AuthControlPlaneShape } from "../Services/AuthControlPlane.ts";

const toAuthControlPlaneError =
  (message: string) =>
  (cause: unknown): AuthControlPlaneError =>
    new AuthControlPlaneError({ message, cause });

export const makeAuthControlPlane = Effect.gen(function* () {
  const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;

  return {
    createPairingLink: (input) =>
      environmentAuth
        .createPairingLink({
          scopes: input?.scopes ?? scopesForRole(input?.role),
          subject: input?.subject ?? "one-time-token",
          ...(input?.ttl ? { ttl: input.ttl } : {}),
          ...(input?.label ? { label: input.label } : {}),
        })
        .pipe(Effect.mapError(toAuthControlPlaneError("Failed to create pairing link."))),
    listPairingLinks: (input) =>
      environmentAuth
        .listPairingLinks(
          input?.excludeSubjects ? { excludeSubjects: input.excludeSubjects } : undefined,
        )
        .pipe(Effect.mapError(toAuthControlPlaneError("Failed to list pairing links."))),
    revokePairingLink: (id) =>
      environmentAuth
        .revokePairingLink(id)
        .pipe(Effect.mapError(toAuthControlPlaneError("Failed to revoke pairing link."))),
    issueSession: (input) =>
      environmentAuth
        .issueSession({
          scopes: scopesForRole(input?.role),
          ...(input?.ttl ? { ttl: input.ttl } : {}),
          ...(input?.subject ? { subject: input.subject } : {}),
          ...(input?.label ? { label: input.label } : {}),
        })
        .pipe(Effect.mapError(toAuthControlPlaneError("Failed to issue session token."))),
    listSessions: () =>
      environmentAuth
        .listSessions()
        .pipe(Effect.mapError(toAuthControlPlaneError("Failed to list sessions."))),
    revokeSession: (sessionId) =>
      environmentAuth
        .revokeSession(sessionId)
        .pipe(Effect.mapError(toAuthControlPlaneError("Failed to revoke session."))),
    revokeOtherSessionsExcept: (sessionId) =>
      environmentAuth
        .revokeOtherSessionsExcept(sessionId)
        .pipe(Effect.mapError(toAuthControlPlaneError("Failed to revoke other sessions."))),
  } satisfies AuthControlPlaneShape;
});

export const AuthControlPlaneLive = Layer.effect(AuthControlPlane, makeAuthControlPlane);
export const AuthControlPlaneRuntimeLive = AuthControlPlaneLive.pipe(
  Layer.provideMerge(EnvironmentAuth.runtimeLayer),
);
