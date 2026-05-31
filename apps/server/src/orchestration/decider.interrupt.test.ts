import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { Crypto, Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asCommandId = (value: string): CommandId => CommandId.make(value);
const asEventId = (value: string): EventId => EventId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asTurnId = (value: string): TurnId => TurnId.make(value);

describe("decideOrchestrationCommand turn interrupt", () => {
  it("fills omitted interrupt turn ids from the active thread session", async () => {
    const now = "2026-04-15T10:00:00.000Z";
    const initial = createEmptyReadModel(now);
    const withProject = await Effect.runPromise(
      projectEvent(initial, {
        sequence: 1,
        eventId: asEventId("evt-project-create"),
        aggregateKind: "project",
        aggregateId: asProjectId("project-interrupt"),
        type: "project.created",
        occurredAt: now,
        commandId: asCommandId("cmd-project-create"),
        causationEventId: null,
        correlationId: asCommandId("cmd-project-create"),
        metadata: {},
        payload: {
          projectId: asProjectId("project-interrupt"),
          title: "Project Interrupt",
          workspaceRoot: "/tmp/project-interrupt",
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    const withThread = await Effect.runPromise(
      projectEvent(withProject, {
        sequence: 2,
        eventId: asEventId("evt-thread-create"),
        aggregateKind: "thread",
        aggregateId: asThreadId("thread-interrupt"),
        type: "thread.created",
        occurredAt: now,
        commandId: asCommandId("cmd-thread-create"),
        causationEventId: null,
        correlationId: asCommandId("cmd-thread-create"),
        metadata: {},
        payload: {
          threadId: asThreadId("thread-interrupt"),
          projectId: asProjectId("project-interrupt"),
          title: "Thread Interrupt",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5-codex",
          },
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    const readModel = await Effect.runPromise(
      projectEvent(withThread, {
        sequence: 3,
        eventId: asEventId("evt-session-set"),
        aggregateKind: "thread",
        aggregateId: asThreadId("thread-interrupt"),
        type: "thread.session-set",
        occurredAt: now,
        commandId: asCommandId("cmd-session-set"),
        causationEventId: null,
        correlationId: asCommandId("cmd-session-set"),
        metadata: {},
        payload: {
          threadId: asThreadId("thread-interrupt"),
          session: {
            threadId: asThreadId("thread-interrupt"),
            status: "running",
            providerName: "codex",
            runtimeMode: "approval-required",
            activeTurnId: asTurnId("turn-active"),
            lastError: null,
            updatedAt: now,
          },
        },
      }),
    );

    const event = await Effect.runPromise(
      decideOrchestrationCommand({
        readModel,
        command: {
          type: "thread.turn.interrupt",
          commandId: asCommandId("cmd-interrupt"),
          threadId: asThreadId("thread-interrupt"),
          createdAt: "2026-04-15T10:00:01.000Z",
        },
      }).pipe(
        Effect.provideService(
          Crypto.Crypto,
          Crypto.make({
            randomBytes: (size) => new Uint8Array(size),
            digest: (_algorithm, data) => Effect.succeed(data),
          }),
        ),
      ),
    );

    if (Array.isArray(event)) {
      throw new Error("Expected a single interrupt event.");
    }
    const singleEvent = event as {
      readonly type: string;
      readonly payload: { readonly turnId?: TurnId };
    };
    expect(singleEvent.type).toBe("thread.turn-interrupt-requested");
    expect(singleEvent.payload.turnId).toBe("turn-active");
  });
});
