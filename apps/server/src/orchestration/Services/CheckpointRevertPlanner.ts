/**
 * CheckpointRevertPlanner - Shared planning for checkpoint revert UX and side effects.
 *
 * Separates chat rollback eligibility from optional filesystem restore
 * availability so callers do not infer "revertability" from projection rows
 * alone.
 *
 * @module CheckpointRevertPlanner
 */
import type {
  CheckpointRef,
  OrchestrationCheckpointFileRestoreAvailability,
  OrchestrationThread,
  ThreadId,
} from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface CheckpointFileRestorePlan extends OrchestrationCheckpointFileRestoreAvailability {
  readonly thread: OrchestrationThread | null;
  readonly currentTurnCount: number;
  readonly checkpointCwd: string | null;
  readonly checkpointRef: CheckpointRef | null;
}

export interface ResolveCheckpointFileRestorePlanInput {
  readonly threadId: ThreadId;
  readonly turnCount: number;
  readonly preferSessionRuntime: boolean;
}

export interface CheckpointRevertPlannerShape {
  /**
   * Resolve a full plan for a revert target, including read-model context and
   * whether the matching filesystem checkpoint ref currently exists.
   */
  readonly resolveFileRestorePlan: (
    input: ResolveCheckpointFileRestorePlanInput,
  ) => Effect.Effect<CheckpointFileRestorePlan, never>;

  /**
   * Public read-only shape used by the client to decide whether the warning
   * dialog may offer filesystem restore.
   */
  readonly getFileRestoreAvailability: (
    input: Omit<ResolveCheckpointFileRestorePlanInput, "preferSessionRuntime">,
  ) => Effect.Effect<OrchestrationCheckpointFileRestoreAvailability, never>;
}

export class CheckpointRevertPlanner extends Context.Service<
  CheckpointRevertPlanner,
  CheckpointRevertPlannerShape
>()("t3/orchestration/Services/CheckpointRevertPlanner") {}
