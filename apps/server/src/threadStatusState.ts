import {
  ThreadId,
  ThreadStatusError,
  type OrchestrationEvent,
  type ThreadStatusMarkReadInput,
  type ThreadStatusMarkUnreadInput,
  type ThreadStatusMarkViewedInput,
  type ThreadStatusMutationEvent,
  type ThreadStatusPrimaryStatus,
  type ThreadStatusSnapshot,
  type ThreadStatusState,
  type ThreadStatusStreamEvent,
  TurnId,
} from "@t3tools/contracts";
import { Context, Effect, Layer, Option, PubSub, Schema, Scope, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const VIEWED_DWELL_MS = 1_000;

interface ThreadStatusRow {
  readonly threadId: string;
  readonly pendingApproval: number;
  readonly awaitingInput: number;
  readonly working: number;
  readonly completed: number;
  readonly connecting: number;
  readonly planReady: number;
  readonly terminal: number;
  readonly latestTurnId: string | null;
  readonly completedAt: string | null;
  readonly readAt: string | null;
  readonly manuallyMarkedUnreadAt: string | null;
  readonly updatedAt: string;
  readonly revision: number;
}

export interface ThreadStatusStatesShape {
  readonly getSnapshot: () => Effect.Effect<ThreadStatusSnapshot, ThreadStatusError>;
  readonly markRead: (
    input: ThreadStatusMarkReadInput,
  ) => Effect.Effect<ThreadStatusMutationEvent, ThreadStatusError>;
  readonly markUnread: (
    input: ThreadStatusMarkUnreadInput,
  ) => Effect.Effect<ThreadStatusMutationEvent, ThreadStatusError>;
  readonly markViewed: (
    input: ThreadStatusMarkViewedInput,
  ) => Effect.Effect<ThreadStatusMutationEvent, ThreadStatusError>;
  readonly applyOrchestrationEvent: (
    event: OrchestrationEvent,
  ) => Effect.Effect<Option.Option<ThreadStatusMutationEvent>, ThreadStatusError>;
  readonly setTerminalOpen: (
    threadId: ThreadId,
    terminal: boolean,
    observedAt: string,
  ) => Effect.Effect<ThreadStatusMutationEvent, ThreadStatusError>;
  readonly reconcile: (observedAt: string) => Effect.Effect<void, ThreadStatusError>;
  readonly streamWithSnapshot: () => Effect.Effect<
    Stream.Stream<ThreadStatusStreamEvent>,
    ThreadStatusError,
    Scope.Scope
  >;
}

export class ThreadStatusStates extends Context.Service<
  ThreadStatusStates,
  ThreadStatusStatesShape
>()("t3/threadStatusStates") {}

function threadStatusError(operation: string, cause: unknown): ThreadStatusError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ThreadStatusError({ operation, detail });
}

function mapThreadStatusError(operation: string) {
  return (cause: unknown) =>
    Schema.is(ThreadStatusError)(cause) ? cause : threadStatusError(operation, cause);
}

function resolvePrimaryStatus(row: ThreadStatusRow): ThreadStatusPrimaryStatus | null {
  if (row.pendingApproval === 1) return "pendingApproval";
  if (row.awaitingInput === 1) return "awaitingInput";
  if (row.working === 1) return "working";
  if (row.completed === 1) return "completed";
  if (row.connecting === 1) return "connecting";
  if (row.planReady === 1) return "planReady";
  return null;
}

function toState(row: ThreadStatusRow): ThreadStatusState {
  return {
    threadId: ThreadId.make(row.threadId),
    primaryStatus: resolvePrimaryStatus(row),
    pendingApproval: row.pendingApproval === 1,
    awaitingInput: row.awaitingInput === 1,
    working: row.working === 1,
    completed: row.completed === 1,
    connecting: row.connecting === 1,
    planReady: row.planReady === 1,
    terminal: row.terminal === 1,
    latestTurnId: row.latestTurnId === null ? null : TurnId.make(row.latestTurnId),
    completedAt: row.completedAt,
    readAt: row.readAt,
    manuallyMarkedUnreadAt: row.manuallyMarkedUnreadAt,
    updatedAt: row.updatedAt,
    revision: row.revision,
  };
}

function rowToUpdatedEvent(row: ThreadStatusRow): ThreadStatusMutationEvent {
  return {
    type: "state-updated",
    state: toState(row),
  };
}

function parseTime(value: string): number {
  return Date.parse(value);
}

function hasViewedLongEnough(viewStartedAt: string, observedAt: string): boolean {
  const startedMs = parseTime(viewStartedAt);
  const observedMs = parseTime(observedAt);
  return (
    Number.isFinite(startedMs) &&
    Number.isFinite(observedMs) &&
    observedMs - startedMs >= VIEWED_DWELL_MS
  );
}

function viewStartedAfterManualUnread(row: ThreadStatusRow, viewStartedAt: string): boolean {
  if (row.manuallyMarkedUnreadAt === null) {
    return true;
  }
  return viewStartedAt > row.manuallyMarkedUnreadAt;
}

function isRelevantOrchestrationEvent(event: OrchestrationEvent): event is Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.archived"
      | "thread.activity-appended"
      | "thread.approval-response-requested"
      | "thread.created"
      | "thread.deleted"
      | "thread.interaction-mode-set"
      | "thread.proposed-plan-upserted"
      | "thread.reverted"
      | "thread.session-set"
      | "thread.turn-diff-completed"
      | "thread.unarchived"
      | "thread.user-input-response-requested";
  }
> {
  return (
    event.type === "thread.archived" ||
    event.type === "thread.activity-appended" ||
    event.type === "thread.approval-response-requested" ||
    event.type === "thread.created" ||
    event.type === "thread.deleted" ||
    event.type === "thread.interaction-mode-set" ||
    event.type === "thread.proposed-plan-upserted" ||
    event.type === "thread.reverted" ||
    event.type === "thread.session-set" ||
    event.type === "thread.turn-diff-completed" ||
    event.type === "thread.unarchived" ||
    event.type === "thread.user-input-response-requested"
  );
}

const makeThreadStatusStates = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const mutationPubSub = yield* PubSub.unbounded<ThreadStatusMutationEvent>();
  yield* Effect.addFinalizer(() => PubSub.shutdown(mutationPubSub));

  const readRow = (threadId: ThreadId) =>
    sql<ThreadStatusRow>`
      SELECT
        thread_id AS "threadId",
        pending_approval AS "pendingApproval",
        awaiting_input AS "awaitingInput",
        working,
        completed,
        connecting,
        plan_ready AS "planReady",
        terminal,
        latest_turn_id AS "latestTurnId",
        completed_at AS "completedAt",
        read_at AS "readAt",
        manually_marked_unread_at AS "manuallyMarkedUnreadAt",
        updated_at AS "updatedAt",
        revision
      FROM thread_status_states
      WHERE thread_id = ${threadId}
      LIMIT 1
    `.pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError((cause) => threadStatusError("ThreadStatusStates.readRow", cause)),
    );

  const publishMutation = (event: ThreadStatusMutationEvent): Effect.Effect<void> =>
    PubSub.publish(mutationPubSub, event).pipe(Effect.asVoid);

  const clearThread = (
    threadId: ThreadId,
    observedAt: string,
  ): Effect.Effect<ThreadStatusMutationEvent, ThreadStatusError> =>
    Effect.gen(function* () {
      const existing = yield* readRow(threadId);
      const revision = existing ? existing.revision + 1 : 0;
      yield* sql`
        DELETE FROM thread_status_states
        WHERE thread_id = ${threadId}
      `.pipe(
        Effect.mapError((cause) => threadStatusError("ThreadStatusStates.clearThread", cause)),
      );
      return {
        type: "state-cleared" as const,
        threadId,
        updatedAt: observedAt,
        revision,
      };
    });

  const ensureThreadRow = (threadId: ThreadId, observedAt: string) =>
    sql`
      INSERT OR IGNORE INTO thread_status_states (
        thread_id,
        pending_approval,
        awaiting_input,
        working,
        completed,
        connecting,
        plan_ready,
        terminal,
        terminal_observed_at,
        latest_turn_id,
        completed_at,
        read_at,
        manually_marked_unread_at,
        updated_at,
        revision
      )
      SELECT
        threads.thread_id,
        CASE WHEN threads.pending_approval_count > 0 THEN 1 ELSE 0 END,
        CASE WHEN threads.pending_user_input_count > 0 THEN 1 ELSE 0 END,
        CASE
          WHEN sessions.status = 'running' AND sessions.active_turn_id IS NOT NULL THEN 1
          ELSE 0
        END,
        0,
        CASE WHEN sessions.status = 'starting' THEN 1 ELSE 0 END,
        CASE
          WHEN threads.pending_user_input_count = 0
            AND threads.interaction_mode = 'plan'
            AND threads.has_actionable_proposed_plan > 0
            AND turns.started_at IS NOT NULL
            AND turns.completed_at IS NOT NULL
            AND COALESCE(sessions.status NOT IN ('running', 'starting'), 1)
          THEN 1
          ELSE 0
        END,
        0,
        NULL,
        threads.latest_turn_id,
        NULL,
        NULL,
        NULL,
        ${observedAt},
        1
      FROM projection_threads threads
      LEFT JOIN projection_thread_sessions sessions
        ON sessions.thread_id = threads.thread_id
      LEFT JOIN projection_turns turns
        ON turns.thread_id = threads.thread_id
        AND turns.turn_id = threads.latest_turn_id
      WHERE threads.thread_id = ${threadId}
        AND threads.deleted_at IS NULL
    `.pipe(
      Effect.mapError((cause) => threadStatusError("ThreadStatusStates.ensureThreadRow", cause)),
    );

  const readMutationForThread = (
    threadId: ThreadId,
    observedAt: string,
  ): Effect.Effect<ThreadStatusMutationEvent, ThreadStatusError> =>
    Effect.gen(function* () {
      const row = yield* readRow(threadId);
      if (row) {
        return rowToUpdatedEvent(row);
      }
      return yield* clearThread(threadId, observedAt);
    });

  const listRows = () =>
    sql<ThreadStatusRow>`
      SELECT
        states.thread_id AS "threadId",
        states.pending_approval AS "pendingApproval",
        states.awaiting_input AS "awaitingInput",
        states.working,
        states.completed,
        states.connecting,
        states.plan_ready AS "planReady",
        states.terminal,
        states.latest_turn_id AS "latestTurnId",
        states.completed_at AS "completedAt",
        states.read_at AS "readAt",
        states.manually_marked_unread_at AS "manuallyMarkedUnreadAt",
        states.updated_at AS "updatedAt",
        states.revision
      FROM thread_status_states states
      INNER JOIN projection_threads threads
        ON threads.thread_id = states.thread_id
      WHERE threads.deleted_at IS NULL
      ORDER BY states.updated_at ASC, states.thread_id ASC
    `.pipe(Effect.mapError((cause) => threadStatusError("ThreadStatusStates.listRows", cause)));

  const refreshProjectionStatusForThread = (threadId: ThreadId, observedAt: string) =>
    sql`
      UPDATE thread_status_states
      SET
        pending_approval = COALESCE(
          (
            SELECT CASE WHEN threads.pending_approval_count > 0 THEN 1 ELSE 0 END
            FROM projection_threads threads
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          pending_approval
        ),
        awaiting_input = COALESCE(
          (
            SELECT CASE WHEN threads.pending_user_input_count > 0 THEN 1 ELSE 0 END
            FROM projection_threads threads
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          awaiting_input
        ),
        plan_ready = COALESCE(
          (
            SELECT CASE
              WHEN threads.pending_user_input_count = 0
                AND threads.interaction_mode = 'plan'
                AND threads.has_actionable_proposed_plan > 0
                AND latest_turns.started_at IS NOT NULL
                AND latest_turns.completed_at IS NOT NULL
                AND COALESCE(sessions.status NOT IN ('running', 'starting'), 1)
              THEN 1
              ELSE 0
            END
            FROM projection_threads threads
            LEFT JOIN projection_thread_sessions sessions
              ON sessions.thread_id = threads.thread_id
            LEFT JOIN projection_turns latest_turns
              ON latest_turns.thread_id = threads.thread_id
              AND latest_turns.turn_id = threads.latest_turn_id
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          plan_ready
        ),
        latest_turn_id = COALESCE(
          (
            SELECT threads.latest_turn_id
            FROM projection_threads threads
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          latest_turn_id
        ),
        updated_at = ${observedAt},
        revision = revision + 1
      WHERE thread_id = ${threadId}
        AND EXISTS (
          SELECT 1
          FROM projection_threads threads
          WHERE threads.thread_id = thread_status_states.thread_id
            AND threads.deleted_at IS NULL
        )
    `.pipe(
      Effect.mapError((cause) =>
        threadStatusError("ThreadStatusStates.refreshProjectionStatusForThread", cause),
      ),
    );

  const refreshProjectionStatuses = (observedAt: string) =>
    sql`
      UPDATE thread_status_states
      SET
        pending_approval = COALESCE(
          (
            SELECT CASE WHEN threads.pending_approval_count > 0 THEN 1 ELSE 0 END
            FROM projection_threads threads
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          pending_approval
        ),
        awaiting_input = COALESCE(
          (
            SELECT CASE WHEN threads.pending_user_input_count > 0 THEN 1 ELSE 0 END
            FROM projection_threads threads
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          awaiting_input
        ),
        working = COALESCE(
          (
            SELECT CASE
              WHEN sessions.status = 'running' AND sessions.active_turn_id IS NOT NULL THEN 1
              ELSE 0
            END
            FROM projection_threads threads
            LEFT JOIN projection_thread_sessions sessions
              ON sessions.thread_id = threads.thread_id
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          working
        ),
        connecting = COALESCE(
          (
            SELECT CASE WHEN sessions.status = 'starting' THEN 1 ELSE 0 END
            FROM projection_threads threads
            LEFT JOIN projection_thread_sessions sessions
              ON sessions.thread_id = threads.thread_id
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          connecting
        ),
        plan_ready = COALESCE(
          (
            SELECT CASE
              WHEN threads.pending_user_input_count = 0
                AND threads.interaction_mode = 'plan'
                AND threads.has_actionable_proposed_plan > 0
                AND latest_turns.started_at IS NOT NULL
                AND latest_turns.completed_at IS NOT NULL
                AND COALESCE(sessions.status NOT IN ('running', 'starting'), 1)
              THEN 1
              ELSE 0
            END
            FROM projection_threads threads
            LEFT JOIN projection_thread_sessions sessions
              ON sessions.thread_id = threads.thread_id
            LEFT JOIN projection_turns latest_turns
              ON latest_turns.thread_id = threads.thread_id
              AND latest_turns.turn_id = threads.latest_turn_id
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          plan_ready
        ),
        latest_turn_id = COALESCE(
          (
            SELECT threads.latest_turn_id
            FROM projection_threads threads
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
            LIMIT 1
          ),
          latest_turn_id
        ),
        updated_at = ${observedAt},
        revision = revision + 1
      WHERE EXISTS (
        SELECT 1
        FROM projection_threads threads
        WHERE threads.thread_id = thread_status_states.thread_id
          AND threads.deleted_at IS NULL
      )
        AND (
          pending_approval <> COALESCE(
            (
              SELECT CASE WHEN threads.pending_approval_count > 0 THEN 1 ELSE 0 END
              FROM projection_threads threads
              WHERE threads.thread_id = thread_status_states.thread_id
                AND threads.deleted_at IS NULL
              LIMIT 1
            ),
            pending_approval
          )
          OR awaiting_input <> COALESCE(
            (
              SELECT CASE WHEN threads.pending_user_input_count > 0 THEN 1 ELSE 0 END
              FROM projection_threads threads
              WHERE threads.thread_id = thread_status_states.thread_id
                AND threads.deleted_at IS NULL
              LIMIT 1
            ),
            awaiting_input
          )
          OR working <> COALESCE(
            (
              SELECT CASE
                WHEN sessions.status = 'running' AND sessions.active_turn_id IS NOT NULL THEN 1
                ELSE 0
              END
              FROM projection_threads threads
              LEFT JOIN projection_thread_sessions sessions
                ON sessions.thread_id = threads.thread_id
              WHERE threads.thread_id = thread_status_states.thread_id
                AND threads.deleted_at IS NULL
              LIMIT 1
            ),
            working
          )
          OR connecting <> COALESCE(
            (
              SELECT CASE WHEN sessions.status = 'starting' THEN 1 ELSE 0 END
              FROM projection_threads threads
              LEFT JOIN projection_thread_sessions sessions
                ON sessions.thread_id = threads.thread_id
              WHERE threads.thread_id = thread_status_states.thread_id
                AND threads.deleted_at IS NULL
              LIMIT 1
            ),
            connecting
          )
          OR plan_ready <> COALESCE(
            (
              SELECT CASE
                WHEN threads.pending_user_input_count = 0
                  AND threads.interaction_mode = 'plan'
                  AND threads.has_actionable_proposed_plan > 0
                  AND latest_turns.started_at IS NOT NULL
                  AND latest_turns.completed_at IS NOT NULL
                  AND COALESCE(sessions.status NOT IN ('running', 'starting'), 1)
                THEN 1
                ELSE 0
              END
              FROM projection_threads threads
              LEFT JOIN projection_thread_sessions sessions
                ON sessions.thread_id = threads.thread_id
              LEFT JOIN projection_turns latest_turns
                ON latest_turns.thread_id = threads.thread_id
                AND latest_turns.turn_id = threads.latest_turn_id
              WHERE threads.thread_id = thread_status_states.thread_id
                AND threads.deleted_at IS NULL
              LIMIT 1
            ),
            plan_ready
          )
          OR COALESCE(latest_turn_id, '') <> COALESCE(
            (
              SELECT threads.latest_turn_id
              FROM projection_threads threads
              WHERE threads.thread_id = thread_status_states.thread_id
                AND threads.deleted_at IS NULL
              LIMIT 1
            ),
            latest_turn_id,
            ''
          )
        )
    `.pipe(
      Effect.mapError((cause) =>
        threadStatusError("ThreadStatusStates.refreshProjectionStatuses", cause),
      ),
    );

  const reconcile = (observedAt: string) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`
            INSERT OR IGNORE INTO thread_status_states (
              thread_id,
              pending_approval,
              awaiting_input,
              working,
              completed,
              connecting,
              plan_ready,
              terminal,
              terminal_observed_at,
              latest_turn_id,
              completed_at,
              read_at,
              manually_marked_unread_at,
              updated_at,
              revision
            )
            SELECT
              threads.thread_id,
              CASE WHEN threads.pending_approval_count > 0 THEN 1 ELSE 0 END,
              CASE WHEN threads.pending_user_input_count > 0 THEN 1 ELSE 0 END,
              CASE
                WHEN sessions.status = 'running' AND sessions.active_turn_id IS NOT NULL THEN 1
                  ELSE 0
                END,
              0,
              CASE WHEN sessions.status = 'starting' THEN 1 ELSE 0 END,
              CASE
                WHEN threads.pending_user_input_count = 0
                  AND threads.interaction_mode = 'plan'
                  AND threads.has_actionable_proposed_plan > 0
                  AND latest_turns.started_at IS NOT NULL
                  AND latest_turns.completed_at IS NOT NULL
                  AND COALESCE(sessions.status NOT IN ('running', 'starting'), 1)
                THEN 1
                ELSE 0
              END,
              0,
              NULL,
              threads.latest_turn_id,
              NULL,
              NULL,
              NULL,
              ${observedAt},
              1
            FROM projection_threads threads
            LEFT JOIN projection_thread_sessions sessions
              ON sessions.thread_id = threads.thread_id
            LEFT JOIN projection_turns latest_turns
              ON latest_turns.thread_id = threads.thread_id
              AND latest_turns.turn_id = threads.latest_turn_id
            WHERE threads.deleted_at IS NULL
        `.pipe(
            Effect.mapError((cause) =>
              threadStatusError("ThreadStatusStates.reconcile:insert", cause),
            ),
          );

          yield* sql`
            UPDATE thread_status_states
            SET
              working = COALESCE(
                (
                  SELECT CASE
                    WHEN sessions.status = 'running' AND sessions.active_turn_id IS NOT NULL THEN 1
                    ELSE 0
                  END
                  FROM projection_thread_sessions sessions
                  INNER JOIN projection_threads threads
                    ON sessions.thread_id = threads.thread_id
                  WHERE threads.thread_id = thread_status_states.thread_id
                    AND threads.deleted_at IS NULL
                  LIMIT 1
                ),
                working
              ),
              latest_turn_id = COALESCE(
                (
                  SELECT threads.latest_turn_id
                  FROM projection_threads threads
                  WHERE threads.thread_id = thread_status_states.thread_id
                    AND threads.deleted_at IS NULL
                  LIMIT 1
                ),
                latest_turn_id
              ),
              updated_at = ${observedAt},
              revision = revision + 1
            WHERE EXISTS (
              SELECT 1
              FROM projection_threads threads
              WHERE threads.thread_id = thread_status_states.thread_id
                AND threads.deleted_at IS NULL
            )
              AND (
                working <> COALESCE(
                  (
                    SELECT CASE
                      WHEN sessions.status = 'running' AND sessions.active_turn_id IS NOT NULL THEN 1
                      ELSE 0
                    END
                    FROM projection_thread_sessions sessions
                    INNER JOIN projection_threads threads
                      ON sessions.thread_id = threads.thread_id
                    WHERE threads.thread_id = thread_status_states.thread_id
                      AND threads.deleted_at IS NULL
                    LIMIT 1
                  ),
                  working
                )
                OR COALESCE(latest_turn_id, '') <> COALESCE(
                  (
                    SELECT threads.latest_turn_id
                    FROM projection_threads threads
                    WHERE threads.thread_id = thread_status_states.thread_id
                      AND threads.deleted_at IS NULL
                    LIMIT 1
                  ),
                  latest_turn_id,
                  ''
                )
              )
        `.pipe(
            Effect.mapError((cause) =>
              threadStatusError("ThreadStatusStates.reconcile:working", cause),
            ),
          );

          yield* refreshProjectionStatuses(observedAt);

          yield* sql`
          DELETE FROM thread_status_states
          WHERE NOT EXISTS (
            SELECT 1
            FROM projection_threads threads
            WHERE threads.thread_id = thread_status_states.thread_id
              AND threads.deleted_at IS NULL
          )
        `.pipe(
            Effect.mapError((cause) =>
              threadStatusError("ThreadStatusStates.reconcile:delete", cause),
            ),
          );
        }),
      )
      .pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.reconcile")));

  const getSnapshot = () =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const observedAt = new Date().toISOString();
          yield* reconcile(observedAt);
          const rows = yield* listRows();
          return {
            states: rows.map(toState),
            updatedAt: observedAt,
          } satisfies ThreadStatusSnapshot;
        }),
      )
      .pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.getSnapshot")));

  const updateWorking = (
    threadId: ThreadId,
    working: boolean,
    connecting: boolean,
    activeTurnId: TurnId | null,
    observedAt: string,
    markCompletedOnSettledTurn: boolean,
  ) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* ensureThreadRow(threadId, observedAt);
          const existing = yield* readRow(threadId);
          const shouldClearPreviousCompletion = connecting || (working && activeTurnId !== null);
          const shouldMarkCompleted =
            markCompletedOnSettledTurn &&
            !working &&
            existing?.working === 1 &&
            existing.latestTurnId !== null;
          yield* sql`
            UPDATE thread_status_states
            SET
              working = ${working ? 1 : 0},
              connecting = ${connecting ? 1 : 0},
              completed = CASE
                WHEN ${shouldClearPreviousCompletion ? 1 : 0} = 1 THEN 0
                WHEN ${shouldMarkCompleted ? 1 : 0} = 1 THEN 1
                ELSE completed
              END,
              latest_turn_id = CASE
                WHEN ${activeTurnId} IS NULL THEN latest_turn_id
                ELSE ${activeTurnId}
              END,
              completed_at = CASE
                WHEN ${shouldClearPreviousCompletion ? 1 : 0} = 1 THEN NULL
                WHEN ${shouldMarkCompleted ? 1 : 0} = 1 THEN ${observedAt}
                ELSE completed_at
              END,
              read_at = CASE
                WHEN ${shouldMarkCompleted ? 1 : 0} = 1 THEN NULL
                ELSE read_at
              END,
              manually_marked_unread_at = CASE
                WHEN ${shouldClearPreviousCompletion ? 1 : 0} = 1
                  OR ${shouldMarkCompleted ? 1 : 0} = 1
                THEN NULL
                ELSE manually_marked_unread_at
              END,
              updated_at = ${observedAt},
              revision = revision + 1
            WHERE thread_id = ${threadId}
          `.pipe(
            Effect.mapError((cause) =>
              threadStatusError("ThreadStatusStates.updateWorking", cause),
            ),
          );
          yield* refreshProjectionStatusForThread(threadId, observedAt);
          const event = yield* readMutationForThread(threadId, observedAt);
          yield* publishMutation(event);
          return event;
        }),
      )
      .pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.updateWorking")));

  const markRead: ThreadStatusStatesShape["markRead"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const observedAt = input.observedAt ?? new Date().toISOString();
          yield* ensureThreadRow(input.threadId, observedAt);
          yield* sql`
            UPDATE thread_status_states
            SET
              completed = 0,
              read_at = ${observedAt},
              manually_marked_unread_at = NULL,
              updated_at = ${observedAt},
              revision = revision + 1
            WHERE thread_id = ${input.threadId}
          `.pipe(
            Effect.mapError((cause) => threadStatusError("ThreadStatusStates.markRead", cause)),
          );
          const event = yield* readMutationForThread(input.threadId, observedAt);
          yield* publishMutation(event);
          return event;
        }),
      )
      .pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.markRead")));

  const markUnread: ThreadStatusStatesShape["markUnread"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const observedAt = input.observedAt ?? new Date().toISOString();
          yield* ensureThreadRow(input.threadId, observedAt);
          yield* sql`
            UPDATE thread_status_states
            SET
              completed = 1,
              completed_at = COALESCE(completed_at, ${observedAt}),
              manually_marked_unread_at = ${observedAt},
              updated_at = ${observedAt},
              revision = revision + 1
            WHERE thread_id = ${input.threadId}
          `.pipe(
            Effect.mapError((cause) => threadStatusError("ThreadStatusStates.markUnread", cause)),
          );
          const event = yield* readMutationForThread(input.threadId, observedAt);
          yield* publishMutation(event);
          return event;
        }),
      )
      .pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.markUnread")));

  const markViewed: ThreadStatusStatesShape["markViewed"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const observedAt = input.observedAt ?? new Date().toISOString();
          yield* ensureThreadRow(input.threadId, observedAt);
          const row = yield* readRow(input.threadId);
          if (!row) {
            return yield* clearThread(input.threadId, observedAt);
          }
          if (
            row.completed !== 1 ||
            !hasViewedLongEnough(input.viewStartedAt, observedAt) ||
            !viewStartedAfterManualUnread(row, input.viewStartedAt)
          ) {
            return rowToUpdatedEvent(row);
          }

          yield* sql`
            UPDATE thread_status_states
            SET
              completed = 0,
              read_at = ${observedAt},
              manually_marked_unread_at = NULL,
              updated_at = ${observedAt},
              revision = revision + 1
            WHERE thread_id = ${input.threadId}
          `.pipe(
            Effect.mapError((cause) => threadStatusError("ThreadStatusStates.markViewed", cause)),
          );
          const event = yield* readMutationForThread(input.threadId, observedAt);
          yield* publishMutation(event);
          return event;
        }),
      )
      .pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.markViewed")));

  const setTerminalOpen: ThreadStatusStatesShape["setTerminalOpen"] = (
    threadId,
    terminal,
    observedAt,
  ) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* ensureThreadRow(threadId, observedAt);
          yield* sql`
            UPDATE thread_status_states
            SET
              terminal = ${terminal ? 1 : 0},
              terminal_observed_at = ${observedAt},
              updated_at = ${observedAt},
              revision = revision + 1
            WHERE thread_id = ${threadId}
              AND (
                terminal_observed_at IS NULL
                OR terminal_observed_at <= ${observedAt}
              )
          `.pipe(
            Effect.mapError((cause) =>
              threadStatusError("ThreadStatusStates.setTerminalOpen", cause),
            ),
          );
          const event = yield* readMutationForThread(threadId, observedAt);
          yield* publishMutation(event);
          return event;
        }),
      )
      .pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.setTerminalOpen")));

  const applyOrchestrationEvent: ThreadStatusStatesShape["applyOrchestrationEvent"] = (event) => {
    if (!isRelevantOrchestrationEvent(event)) {
      return Effect.succeed(Option.none());
    }

    return Effect.gen(function* () {
      switch (event.type) {
        case "thread.created":
        case "thread.unarchived": {
          yield* ensureThreadRow(event.payload.threadId, event.occurredAt);
          yield* refreshProjectionStatusForThread(event.payload.threadId, event.occurredAt);
          const mutation = yield* readMutationForThread(event.payload.threadId, event.occurredAt);
          yield* publishMutation(mutation);
          return Option.some(mutation);
        }

        case "thread.archived": {
          const mutation = yield* updateWorking(
            event.payload.threadId,
            false,
            false,
            null,
            event.occurredAt,
            false,
          );
          return Option.some(mutation);
        }

        case "thread.deleted": {
          const mutation = yield* clearThread(event.payload.threadId, event.occurredAt);
          yield* publishMutation(mutation);
          return Option.some(mutation);
        }

        case "thread.session-set": {
          const working =
            event.payload.session.status === "running" &&
            event.payload.session.activeTurnId !== null;
          const connecting = event.payload.session.status === "starting";
          const mutation = yield* updateWorking(
            event.payload.threadId,
            working,
            connecting,
            event.payload.session.activeTurnId,
            event.occurredAt,
            event.payload.session.status !== "idle" && event.payload.session.status !== "stopped",
          );
          return Option.some(mutation);
        }

        case "thread.activity-appended":
        case "thread.approval-response-requested":
        case "thread.interaction-mode-set":
        case "thread.proposed-plan-upserted":
        case "thread.reverted":
        case "thread.turn-diff-completed":
        case "thread.user-input-response-requested": {
          yield* ensureThreadRow(event.payload.threadId, event.occurredAt);
          yield* refreshProjectionStatusForThread(event.payload.threadId, event.occurredAt);
          const mutation = yield* readMutationForThread(event.payload.threadId, event.occurredAt);
          yield* publishMutation(mutation);
          return Option.some(mutation);
        }
      }
    }).pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.applyOrchestrationEvent")));
  };

  return {
    getSnapshot,
    markRead,
    markUnread,
    markViewed,
    applyOrchestrationEvent,
    setTerminalOpen,
    reconcile,
    streamWithSnapshot: () =>
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(mutationPubSub);
        const snapshot = yield* getSnapshot();
        const mutationStream = Stream.fromSubscription(subscription);
        return Stream.concat(
          Stream.make({
            type: "snapshot" as const,
            snapshot,
          }),
          mutationStream,
        );
      }).pipe(Effect.mapError(mapThreadStatusError("ThreadStatusStates.streamWithSnapshot"))),
  } satisfies ThreadStatusStatesShape;
});

export const ThreadStatusStatesLive = Layer.effect(ThreadStatusStates, makeThreadStatusStates);
