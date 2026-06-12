import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as EnvironmentAuth from "../EnvironmentAuth.ts";
import { AuthError, ServerAuth } from "../Services/ServerAuth.ts";
import type { ServerAuthShape } from "../Services/ServerAuth.ts";

const toAuthError =
  (message: string, status?: 400 | 401 | 403 | 500) =>
  (cause: unknown): AuthError =>
    new AuthError({ message, ...(status ? { status } : {}), cause });

export const makeServerAuth = Effect.gen(function* () {
  const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;

  return {
    getDescriptor: environmentAuth.getDescriptor,
    getSessionState: (request) =>
      environmentAuth
        .getSessionState(request)
        .pipe(Effect.catch(() => Effect.die(new Error("unreachable")))),
    listPairingLinks: () =>
      environmentAuth
        .listPairingLinks()
        .pipe(Effect.mapError(toAuthError("Failed to load pairing links."))),
    revokePairingLink: (id) =>
      environmentAuth
        .revokePairingLink(id)
        .pipe(Effect.mapError(toAuthError("Failed to revoke pairing link."))),
    issuePairingCredential: (input) =>
      environmentAuth
        .issuePairingCredential(input)
        .pipe(Effect.mapError(toAuthError("Failed to issue pairing credential."))),
    listClientSessions: (currentSessionId) =>
      environmentAuth
        .listClientSessions(currentSessionId)
        .pipe(Effect.mapError(toAuthError("Failed to load paired clients."))),
    revokeClientSession: (currentSessionId, targetSessionId) =>
      environmentAuth.revokeClientSession(currentSessionId, targetSessionId).pipe(
        Effect.mapError((cause) =>
          cause._tag === "ServerAuthForbiddenOperationError"
            ? new AuthError({
                message: "Use revoke other clients to keep the current session active.",
                status: 403,
                cause,
              })
            : new AuthError({ message: "Failed to revoke client session.", cause }),
        ),
      ),
    revokeOtherClientSessions: (currentSessionId) =>
      environmentAuth
        .revokeOtherClientSessions(currentSessionId)
        .pipe(Effect.mapError(toAuthError("Failed to revoke other client sessions."))),
    authenticateHttpRequest: (request) =>
      environmentAuth
        .authenticateHttpRequest(request)
        .pipe(
          Effect.mapError((cause) =>
            cause._tag === "ServerAuthInvalidCredentialError"
              ? new AuthError({ message: "Authentication required.", status: 401, cause })
              : new AuthError({ message: "Authentication failed.", status: 500, cause }),
          ),
        ),
    authenticateWebSocketUpgrade: (request) =>
      environmentAuth
        .authenticateWebSocketUpgrade(request)
        .pipe(
          Effect.mapError((cause) =>
            cause._tag === "ServerAuthInvalidCredentialError"
              ? new AuthError({ message: "Authentication required.", status: 401, cause })
              : new AuthError({ message: "Authentication failed.", status: 500, cause }),
          ),
        ),
    issueWebSocketToken: (session) =>
      environmentAuth
        .issueWebSocketTicket(session)
        .pipe(Effect.mapError(toAuthError("Failed to issue websocket token."))),
    issueStartupPairingUrl: (baseUrl) =>
      environmentAuth
        .issueStartupPairingUrl(baseUrl)
        .pipe(Effect.mapError(toAuthError("Failed to issue startup pairing URL."))),
  } satisfies ServerAuthShape;
});

export const ServerAuthLive = Layer.effect(ServerAuth, makeServerAuth).pipe(
  Layer.provideMerge(EnvironmentAuth.runtimeLayer),
);
