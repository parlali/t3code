import {
  ThreadId,
  ThreadWorkbenchStateError,
  type ThreadWorkbenchGetStateInput,
  type ThreadWorkbenchSelection,
  type ThreadWorkbenchSetStateInput,
  type ThreadWorkbenchState,
} from "@t3tools/contracts";
import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface ThreadWorkbenchStateRow {
  readonly threadId: string;
  readonly selectionSource: string | null;
  readonly relativePath: string | null;
  readonly updatedAt: string;
}

export interface ThreadWorkbenchStateShape {
  readonly getState: (
    input: ThreadWorkbenchGetStateInput,
  ) => Effect.Effect<ThreadWorkbenchState, ThreadWorkbenchStateError>;
  readonly setState: (
    input: ThreadWorkbenchSetStateInput,
  ) => Effect.Effect<ThreadWorkbenchState, ThreadWorkbenchStateError>;
}

export class ThreadWorkbenchStates extends Context.Service<
  ThreadWorkbenchStates,
  ThreadWorkbenchStateShape
>()("t3/threadWorkbenchStates") {}

function workbenchStateError(operation: string, cause: unknown): ThreadWorkbenchStateError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ThreadWorkbenchStateError({ operation, detail });
}

function toSelection(row: ThreadWorkbenchStateRow): ThreadWorkbenchSelection | null {
  if (row.selectionSource !== "files" && row.selectionSource !== "changes") {
    return null;
  }
  if (row.relativePath === null || row.relativePath.length === 0) {
    return null;
  }
  return {
    source: row.selectionSource,
    relativePath: row.relativePath,
  };
}

function toState(row: ThreadWorkbenchStateRow): ThreadWorkbenchState {
  return {
    threadId: ThreadId.make(row.threadId),
    selection: toSelection(row),
    updatedAt: row.updatedAt,
  };
}

const makeThreadWorkbenchStates = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const readState = (input: ThreadWorkbenchGetStateInput) =>
    sql<ThreadWorkbenchStateRow>`
      SELECT
        thread_id AS "threadId",
        selection_source AS "selectionSource",
        relative_path AS "relativePath",
        updated_at AS "updatedAt"
      FROM thread_workbench_state
      WHERE thread_id = ${input.threadId}
    `.pipe(
      Effect.map((rows): ThreadWorkbenchState => {
        const row = rows[0];
        if (row) return toState(row);
        return {
          threadId: input.threadId,
          selection: null,
          updatedAt: new Date().toISOString(),
        };
      }),
      Effect.mapError((cause) => workbenchStateError("ThreadWorkbenchStates.readState", cause)),
    );

  const getState: ThreadWorkbenchStateShape["getState"] = (input) => readState(input);

  const setState: ThreadWorkbenchStateShape["setState"] = (input) =>
    Effect.gen(function* () {
      const updatedAt = new Date().toISOString();
      yield* sql`
        INSERT INTO thread_workbench_state (
          thread_id,
          selection_source,
          relative_path,
          updated_at
        )
        VALUES (
          ${input.threadId},
          ${input.selection?.source ?? null},
          ${input.selection?.relativePath ?? null},
          ${updatedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          selection_source = excluded.selection_source,
          relative_path = excluded.relative_path,
          updated_at = excluded.updated_at
      `.pipe(
        Effect.mapError((cause) => workbenchStateError("ThreadWorkbenchStates.setState", cause)),
      );

      return yield* readState(input);
    }).pipe(
      Effect.mapError((cause) =>
        Schema.is(ThreadWorkbenchStateError)(cause)
          ? cause
          : workbenchStateError("ThreadWorkbenchStates.setState", cause),
      ),
    );

  return {
    getState,
    setState,
  } satisfies ThreadWorkbenchStateShape;
});

export const ThreadWorkbenchStatesLive = Layer.effect(
  ThreadWorkbenchStates,
  makeThreadWorkbenchStates,
);
