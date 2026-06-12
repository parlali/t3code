import {
  AuthAdministrativeScopes,
  AuthStandardClientScopes,
  type AuthClientSession,
  type AuthEnvironmentScope,
  type AuthPairingLink,
  type AuthSessionId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import type * as Effect from "effect/Effect";

import type { IssuedBearerSession, IssuedPairingLink } from "../EnvironmentAuth.ts";

export const DEFAULT_SESSION_SUBJECT = "cli-issued-session";
export type SessionRole = "owner" | "client";

export class AuthControlPlaneError extends Data.TaggedError("AuthControlPlaneError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface AuthControlPlaneShape {
  readonly createPairingLink: (input?: {
    readonly ttl?: Duration.Duration;
    readonly label?: string;
    readonly role?: SessionRole;
    readonly subject?: string;
    readonly scopes?: ReadonlyArray<AuthEnvironmentScope>;
  }) => Effect.Effect<IssuedPairingLink, AuthControlPlaneError>;
  readonly listPairingLinks: (input?: {
    readonly role?: SessionRole;
    readonly excludeSubjects?: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<AuthPairingLink>, AuthControlPlaneError>;
  readonly revokePairingLink: (id: string) => Effect.Effect<boolean, AuthControlPlaneError>;
  readonly issueSession: (input?: {
    readonly ttl?: Duration.Duration;
    readonly subject?: string;
    readonly role?: SessionRole;
    readonly label?: string;
  }) => Effect.Effect<IssuedBearerSession, AuthControlPlaneError>;
  readonly listSessions: () => Effect.Effect<
    ReadonlyArray<AuthClientSession>,
    AuthControlPlaneError
  >;
  readonly revokeSession: (
    sessionId: AuthSessionId,
  ) => Effect.Effect<boolean, AuthControlPlaneError>;
  readonly revokeOtherSessionsExcept: (
    sessionId: AuthSessionId,
  ) => Effect.Effect<number, AuthControlPlaneError>;
}

export class AuthControlPlane extends Context.Service<AuthControlPlane, AuthControlPlaneShape>()(
  "t3/auth/Services/AuthControlPlane",
) {}

export function scopesForRole(role: SessionRole | undefined): ReadonlyArray<AuthEnvironmentScope> {
  return role === "client" ? AuthStandardClientScopes : AuthAdministrativeScopes;
}
