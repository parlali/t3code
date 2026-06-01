import {
  EventId,
  IsoDateTime,
  OrchestrationTaskPlanStatus,
  OrchestrationTaskPlanStep,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "@t3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadTaskPlan = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  status: OrchestrationTaskPlanStatus,
  explanation: Schema.NullOr(TrimmedNonEmptyString),
  steps: Schema.Array(OrchestrationTaskPlanStep),
  sourceActivityId: EventId,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  settledAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionThreadTaskPlan = typeof ProjectionThreadTaskPlan.Type;

export const GetProjectionThreadTaskPlanInput = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
});
export type GetProjectionThreadTaskPlanInput = typeof GetProjectionThreadTaskPlanInput.Type;

export const ListProjectionThreadTaskPlansInput = Schema.Struct({
  threadId: ThreadId,
});
export type ListProjectionThreadTaskPlansInput = typeof ListProjectionThreadTaskPlansInput.Type;

export const DeleteProjectionThreadTaskPlansInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionThreadTaskPlansInput = typeof DeleteProjectionThreadTaskPlansInput.Type;

export interface ProjectionThreadTaskPlanRepositoryShape {
  readonly upsert: (
    plan: ProjectionThreadTaskPlan,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getByTurnId: (
    input: GetProjectionThreadTaskPlanInput,
  ) => Effect.Effect<Option.Option<ProjectionThreadTaskPlan>, ProjectionRepositoryError>;
  readonly listByThreadId: (
    input: ListProjectionThreadTaskPlansInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadTaskPlan>, ProjectionRepositoryError>;
  readonly deleteByThreadId: (
    input: DeleteProjectionThreadTaskPlansInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadTaskPlanRepository extends Context.Service<
  ProjectionThreadTaskPlanRepository,
  ProjectionThreadTaskPlanRepositoryShape
>()("t3/persistence/Services/ProjectionThreadTaskPlans/ProjectionThreadTaskPlanRepository") {}
