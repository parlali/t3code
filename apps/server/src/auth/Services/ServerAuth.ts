import type {
  AuthClientMetadata,
  AuthClientSession,
  AuthCreatePairingCredentialInput,
  AuthPairingLink,
  AuthSessionId,
  AuthSessionState,
  AuthWebSocketTicketResult,
  ServerAuthDescriptor,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";

import type { AuthenticatedSession } from "../EnvironmentAuth.ts";

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string;
  readonly status?: 400 | 401 | 403 | 500;
  readonly cause?: unknown;
}> {}

export interface ServerAuthShape {
  readonly getDescriptor: () => Effect.Effect<ServerAuthDescriptor>;
  readonly getSessionState: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<AuthSessionState, never>;
  readonly listPairingLinks: () => Effect.Effect<ReadonlyArray<AuthPairingLink>, AuthError>;
  readonly revokePairingLink: (id: string) => Effect.Effect<boolean, AuthError>;
  readonly issuePairingCredential: (input?: AuthCreatePairingCredentialInput) => Effect.Effect<
    {
      readonly id: string;
      readonly credential: string;
      readonly label?: string;
      readonly expiresAt: unknown;
    },
    AuthError
  >;
  readonly listClientSessions: (
    currentSessionId: AuthSessionId,
  ) => Effect.Effect<ReadonlyArray<AuthClientSession>, AuthError>;
  readonly revokeClientSession: (
    currentSessionId: AuthSessionId,
    targetSessionId: AuthSessionId,
  ) => Effect.Effect<boolean, AuthError>;
  readonly revokeOtherClientSessions: (
    currentSessionId: AuthSessionId,
  ) => Effect.Effect<number, AuthError>;
  readonly authenticateHttpRequest: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<AuthenticatedSession, AuthError>;
  readonly authenticateWebSocketUpgrade: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<AuthenticatedSession, AuthError>;
  readonly issueWebSocketToken: (
    session: Pick<AuthenticatedSession, "sessionId">,
  ) => Effect.Effect<AuthWebSocketTicketResult, AuthError>;
  readonly issueStartupPairingUrl: (baseUrl: string) => Effect.Effect<string, AuthError>;
}

export class ServerAuth extends Context.Service<ServerAuth, ServerAuthShape>()(
  "t3/auth/Services/ServerAuth",
) {}
