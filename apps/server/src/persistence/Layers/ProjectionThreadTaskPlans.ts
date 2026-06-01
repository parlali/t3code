import { Effect, Layer, Schema, Struct } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { OrchestrationTaskPlanStep } from "@t3tools/contracts";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionThreadTaskPlansInput,
  GetProjectionThreadTaskPlanInput,
  ListProjectionThreadTaskPlansInput,
  ProjectionThreadTaskPlan,
  ProjectionThreadTaskPlanRepository,
  type ProjectionThreadTaskPlanRepositoryShape,
} from "../Services/ProjectionThreadTaskPlans.ts";

const ProjectionThreadTaskPlanDbRow = ProjectionThreadTaskPlan.mapFields(
  Struct.assign({
    steps: Schema.fromJsonString(Schema.Array(OrchestrationTaskPlanStep)),
  }),
);

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeProjectionThreadTaskPlanRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionThreadTaskPlanRow = SqlSchema.void({
    Request: ProjectionThreadTaskPlan,
    execute: (row) => sql`
      INSERT INTO projection_thread_task_plans (
        thread_id,
        turn_id,
        status,
        explanation,
        steps_json,
        source_activity_id,
        created_at,
        updated_at,
        settled_at
      )
      VALUES (
        ${row.threadId},
        ${row.turnId},
        ${row.status},
        ${row.explanation},
        ${JSON.stringify(row.steps)},
        ${row.sourceActivityId},
        ${row.createdAt},
        ${row.updatedAt},
        ${row.settledAt}
      )
      ON CONFLICT (thread_id, turn_id)
      DO UPDATE SET
        status = excluded.status,
        explanation = excluded.explanation,
        steps_json = excluded.steps_json,
        source_activity_id = excluded.source_activity_id,
        updated_at = excluded.updated_at,
        settled_at = excluded.settled_at
    `,
  });

  const getProjectionThreadTaskPlanRow = SqlSchema.findOneOption({
    Request: GetProjectionThreadTaskPlanInput,
    Result: ProjectionThreadTaskPlanDbRow,
    execute: ({ threadId, turnId }) => sql`
      SELECT
        thread_id AS "threadId",
        turn_id AS "turnId",
        status,
        explanation,
        steps_json AS "steps",
        source_activity_id AS "sourceActivityId",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        settled_at AS "settledAt"
      FROM projection_thread_task_plans
      WHERE thread_id = ${threadId} AND turn_id = ${turnId}
    `,
  });

  const listProjectionThreadTaskPlanRows = SqlSchema.findAll({
    Request: ListProjectionThreadTaskPlansInput,
    Result: ProjectionThreadTaskPlanDbRow,
    execute: ({ threadId }) => sql`
      SELECT
        thread_id AS "threadId",
        turn_id AS "turnId",
        status,
        explanation,
        steps_json AS "steps",
        source_activity_id AS "sourceActivityId",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        settled_at AS "settledAt"
      FROM projection_thread_task_plans
      WHERE thread_id = ${threadId}
      ORDER BY updated_at ASC, turn_id ASC
    `,
  });

  const deleteProjectionThreadTaskPlanRows = SqlSchema.void({
    Request: DeleteProjectionThreadTaskPlansInput,
    execute: ({ threadId }) => sql`
      DELETE FROM projection_thread_task_plans
      WHERE thread_id = ${threadId}
    `,
  });

  const upsert: ProjectionThreadTaskPlanRepositoryShape["upsert"] = (row) =>
    upsertProjectionThreadTaskPlanRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionThreadTaskPlanRepository.upsert:query",
          "ProjectionThreadTaskPlanRepository.upsert:encodeRequest",
        ),
      ),
    );

  const getByTurnId: ProjectionThreadTaskPlanRepositoryShape["getByTurnId"] = (input) =>
    getProjectionThreadTaskPlanRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionThreadTaskPlanRepository.getByTurnId:query",
          "ProjectionThreadTaskPlanRepository.getByTurnId:decodeRows",
        ),
      ),
    );

  const listByThreadId: ProjectionThreadTaskPlanRepositoryShape["listByThreadId"] = (input) =>
    listProjectionThreadTaskPlanRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionThreadTaskPlanRepository.listByThreadId:query",
          "ProjectionThreadTaskPlanRepository.listByThreadId:decodeRows",
        ),
      ),
    );

  const deleteByThreadId: ProjectionThreadTaskPlanRepositoryShape["deleteByThreadId"] = (input) =>
    deleteProjectionThreadTaskPlanRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadTaskPlanRepository.deleteByThreadId:query"),
      ),
    );

  return {
    upsert,
    getByTurnId,
    listByThreadId,
    deleteByThreadId,
  } satisfies ProjectionThreadTaskPlanRepositoryShape;
});

export const ProjectionThreadTaskPlanRepositoryLive = Layer.effect(
  ProjectionThreadTaskPlanRepository,
  makeProjectionThreadTaskPlanRepository,
);
