import type {
  OrchestrationProjectShell,
  OrchestrationThread,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { Effect, Layer, Option } from "effect";

import {
  checkpointRefForThreadTurn,
  resolveThreadWorkspaceCwd,
} from "../../checkpointing/Utils.ts";
import { CheckpointStore } from "../../checkpointing/Services/CheckpointStore.ts";
import { isGitRepository } from "../../git/Utils.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import {
  CheckpointRevertPlanner,
  type CheckpointFileRestorePlan,
  type CheckpointRevertPlannerShape,
} from "../Services/CheckpointRevertPlanner.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const unavailable = (input: {
  readonly threadId: ThreadId;
  readonly turnCount: number;
  readonly thread: OrchestrationThread | null;
  readonly currentTurnCount: number;
  readonly checkpointCwd?: string | null;
  readonly checkpointRef?: CheckpointFileRestorePlan["checkpointRef"];
  readonly reason: string;
}): CheckpointFileRestorePlan => ({
  threadId: input.threadId,
  turnCount: input.turnCount,
  thread: input.thread,
  currentTurnCount: input.currentTurnCount,
  checkpointCwd: input.checkpointCwd ?? null,
  checkpointRef: input.checkpointRef ?? null,
  canRestoreFiles: false,
  reason: input.reason,
});

const make = Effect.gen(function* () {
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const providerService = yield* ProviderService;
  const checkpointStore = yield* CheckpointStore;

  const resolveSessionRuntimeForThread = Effect.fn("resolveSessionRuntimeForThread")(function* (
    threadId: ThreadId,
  ): Effect.fn.Return<Option.Option<{ readonly threadId: ThreadId; readonly cwd: string }>> {
    const sessions = yield* providerService.listSessions();
    const session = sessions.find((entry) => entry.threadId === threadId);
    return session?.cwd
      ? Option.some({ threadId: session.threadId, cwd: session.cwd })
      : Option.none();
  });

  const resolveThreadDetail = Effect.fn("resolveThreadDetail")(function* (threadId: ThreadId) {
    return yield* projectionSnapshotQuery.getThreadDetailById(threadId).pipe(
      Effect.map(Option.getOrUndefined),
      Effect.catch((error) =>
        Effect.logWarning("checkpoint revert planning could not read thread detail", {
          threadId,
          detail: error.message,
        }).pipe(Effect.as(undefined)),
      ),
    );
  });

  const resolveThreadProjects = Effect.fn("resolveThreadProjects")(function* (
    projectId: ProjectId,
  ): Effect.fn.Return<ReadonlyArray<OrchestrationProjectShell>> {
    const project = yield* projectionSnapshotQuery.getProjectShellById(projectId).pipe(
      Effect.map(Option.getOrUndefined),
      Effect.catch((error) =>
        Effect.logWarning("checkpoint revert planning could not read project shell", {
          projectId,
          detail: error.message,
        }).pipe(Effect.as(undefined)),
      ),
    );
    return project ? [project] : [];
  });

  const resolveCheckpointCwd = Effect.fn("resolveCheckpointCwd")(function* (input: {
    readonly threadId: ThreadId;
    readonly thread: { readonly projectId: ProjectId; readonly worktreePath: string | null };
    readonly projects: ReadonlyArray<{ readonly id: ProjectId; readonly workspaceRoot: string }>;
    readonly preferSessionRuntime: boolean;
  }): Effect.fn.Return<string | undefined> {
    const fromSession = yield* resolveSessionRuntimeForThread(input.threadId);
    const fromThread = resolveThreadWorkspaceCwd({
      thread: input.thread,
      projects: input.projects,
    });

    const cwd = input.preferSessionRuntime
      ? (Option.match(fromSession, {
          onNone: () => undefined,
          onSome: (runtime) => runtime.cwd,
        }) ?? fromThread)
      : (fromThread ??
        Option.match(fromSession, {
          onNone: () => undefined,
          onSome: (runtime) => runtime.cwd,
        }));

    if (!cwd) {
      return undefined;
    }
    return isGitRepository(cwd) ? cwd : undefined;
  });

  const describeMissingCheckpointCwd = Effect.fn("describeMissingCheckpointCwd")(function* (input: {
    readonly threadId: ThreadId;
    readonly thread: { readonly projectId: ProjectId; readonly worktreePath: string | null };
    readonly projects: ReadonlyArray<{ readonly id: ProjectId; readonly workspaceRoot: string }>;
  }) {
    const fromSession = yield* resolveSessionRuntimeForThread(input.threadId);
    const fromThread = resolveThreadWorkspaceCwd({
      thread: input.thread,
      projects: input.projects,
    });
    const hasSessionCwd = Option.match(fromSession, {
      onNone: () => false,
      onSome: () => true,
    });
    const hasAnyCwd = fromThread !== undefined || hasSessionCwd;
    if (!hasAnyCwd) {
      return "No workspace cwd is available for checkpoint file restore.";
    }
    return "Checkpoint file restore is unavailable because this project is not a git repository.";
  });

  const resolveFileRestorePlan: CheckpointRevertPlannerShape["resolveFileRestorePlan"] = Effect.fn(
    "resolveFileRestorePlan",
  )(function* (input) {
    const thread = yield* resolveThreadDetail(input.threadId);
    if (!thread) {
      return unavailable({
        threadId: input.threadId,
        turnCount: input.turnCount,
        thread: null,
        currentTurnCount: 0,
        reason: "Thread was not found in read model.",
      });
    }

    const currentTurnCount = thread.checkpoints.reduce(
      (maxTurnCount, checkpoint) => Math.max(maxTurnCount, checkpoint.checkpointTurnCount),
      0,
    );
    if (input.turnCount > currentTurnCount) {
      return unavailable({
        threadId: input.threadId,
        turnCount: input.turnCount,
        thread,
        currentTurnCount,
        reason: `Checkpoint turn count ${input.turnCount} exceeds current turn count ${currentTurnCount}.`,
      });
    }

    const checkpointRef =
      input.turnCount === 0
        ? checkpointRefForThreadTurn(input.threadId, 0)
        : (thread.checkpoints.find(
            (checkpoint) => checkpoint.checkpointTurnCount === input.turnCount,
          )?.checkpointRef ?? null);
    if (!checkpointRef) {
      return unavailable({
        threadId: input.threadId,
        turnCount: input.turnCount,
        thread,
        currentTurnCount,
        reason: `Checkpoint ref for turn ${input.turnCount} is unavailable in read model.`,
      });
    }

    const projects = yield* resolveThreadProjects(thread.projectId);
    const checkpointCwd = yield* resolveCheckpointCwd({
      threadId: input.threadId,
      thread,
      projects,
      preferSessionRuntime: input.preferSessionRuntime,
    });
    if (!checkpointCwd) {
      return unavailable({
        threadId: input.threadId,
        turnCount: input.turnCount,
        thread,
        currentTurnCount,
        checkpointRef,
        reason: yield* describeMissingCheckpointCwd({
          threadId: input.threadId,
          thread,
          projects,
        }),
      });
    }

    const checkpointExists = yield* checkpointStore
      .hasCheckpointRef({
        cwd: checkpointCwd,
        checkpointRef,
      })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("checkpoint revert planning could not verify checkpoint ref", {
            threadId: input.threadId,
            turnCount: input.turnCount,
            checkpointRef,
            cwd: checkpointCwd,
            detail: error.message,
          }).pipe(Effect.as(false)),
        ),
      );
    if (!checkpointExists) {
      return unavailable({
        threadId: input.threadId,
        turnCount: input.turnCount,
        thread,
        currentTurnCount,
        checkpointCwd,
        checkpointRef,
        reason: `Filesystem checkpoint is unavailable for turn ${input.turnCount}.`,
      });
    }

    return {
      threadId: input.threadId,
      turnCount: input.turnCount,
      thread,
      currentTurnCount,
      checkpointCwd,
      checkpointRef,
      canRestoreFiles: true,
      reason: null,
    };
  });

  const getFileRestoreAvailability: CheckpointRevertPlannerShape["getFileRestoreAvailability"] =
    Effect.fn("getFileRestoreAvailability")(function* (input) {
      const plan = yield* resolveFileRestorePlan({
        ...input,
        preferSessionRuntime: true,
      });
      return {
        threadId: plan.threadId,
        turnCount: plan.turnCount,
        canRestoreFiles: plan.canRestoreFiles,
        checkpointRef: plan.checkpointRef,
        reason: plan.reason,
      };
    });

  return {
    resolveFileRestorePlan,
    getFileRestoreAvailability,
  } satisfies CheckpointRevertPlannerShape;
});

export const CheckpointRevertPlannerLive = Layer.effect(CheckpointRevertPlanner, make);
