import {
  AuthSessionId,
  ThreadAttentionError,
  type ThreadAttentionMarkSeenInput,
  type ThreadAttentionMarkUnseenInput,
  type ThreadAttentionMutationEvent,
  type ThreadAttentionSnapshot,
  type ThreadAttentionState,
  type ThreadAttentionStreamEvent,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { Context, Effect, Layer, Option, PubSub, Schema, Scope, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface ThreadAttentionRow {
  readonly threadId: string;
  readonly latestTurnId: string;
  readonly attentionKind: "completed";
  readonly attentionAt: string;
  readonly acknowledgedTurnId: string | null;
  readonly acknowledgedAt: string | null;
  readonly updatedAt: string;
  readonly revision: number;
}

interface LatestTerminalTurnRow {
  readonly threadId: string;
  readonly turnId: string;
  readonly attentionAt: string;
}

interface ViewerMutationEvent {
  readonly viewerId: AuthSessionId;
  readonly event: ThreadAttentionMutationEvent;
}

export interface ThreadAttentionShape {
  readonly getSnapshot: (
    viewerId: AuthSessionId,
  ) => Effect.Effect<ThreadAttentionSnapshot, ThreadAttentionError>;
  readonly markSeen: (
    viewerId: AuthSessionId,
    input: ThreadAttentionMarkSeenInput,
  ) => Effect.Effect<ThreadAttentionMutationEvent, ThreadAttentionError>;
  readonly markUnseen: (
    viewerId: AuthSessionId,
    input: ThreadAttentionMarkUnseenInput,
  ) => Effect.Effect<ThreadAttentionMutationEvent, ThreadAttentionError>;
  readonly streamWithSnapshot: (
    viewerId: AuthSessionId,
    domainEvents: Stream.Stream<OrchestrationEvent>,
  ) => Effect.Effect<Stream.Stream<ThreadAttentionStreamEvent>, ThreadAttentionError, Scope.Scope>;
}

export class ThreadAttention extends Context.Service<ThreadAttention, ThreadAttentionShape>()(
  "t3/threadAttention",
) {}

function attentionError(operation: string, cause: unknown): ThreadAttentionError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ThreadAttentionError({ operation, detail });
}

function mapThreadAttentionError(operation: string) {
  return (cause: unknown) =>
    Schema.is(ThreadAttentionError)(cause) ? cause : attentionError(operation, cause);
}

function toAttentionState(row: ThreadAttentionRow): ThreadAttentionState {
  return {
    threadId: ThreadId.make(row.threadId),
    kind: row.attentionKind,
    turnId: TurnId.make(row.latestTurnId),
    attentionAt: row.attentionAt,
    acknowledgedAt: row.acknowledgedAt,
    updatedAt: row.updatedAt,
    revision: row.revision,
  };
}

function isRelevantThreadAttentionEvent(event: OrchestrationEvent): event is Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.archived"
      | "thread.deleted"
      | "thread.message-sent"
      | "thread.reverted"
      | "thread.session-set"
      | "thread.turn-diff-completed"
      | "thread.turn-interrupt-requested";
  }
> {
  return (
    event.type === "thread.archived" ||
    event.type === "thread.deleted" ||
    event.type === "thread.message-sent" ||
    event.type === "thread.reverted" ||
    event.type === "thread.session-set" ||
    event.type === "thread.turn-diff-completed" ||
    event.type === "thread.turn-interrupt-requested"
  );
}

function shouldRefreshForRelevantEvent(
  event: Extract<
    OrchestrationEvent,
    {
      type:
        | "thread.archived"
        | "thread.deleted"
        | "thread.message-sent"
        | "thread.reverted"
        | "thread.session-set"
        | "thread.turn-diff-completed"
        | "thread.turn-interrupt-requested";
    }
  >,
): boolean {
  return event.type !== "thread.message-sent";
}

const makeThreadAttention = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const mutationPubSub = yield* PubSub.unbounded<ViewerMutationEvent>();
  yield* Effect.addFinalizer(() => PubSub.shutdown(mutationPubSub));

  const readLatestTerminalTurn = (threadId: ThreadId) =>
    sql<LatestTerminalTurnRow>`
      SELECT
        threads.thread_id AS "threadId",
        turns.turn_id AS "turnId",
        COALESCE(
          turns.completed_at,
          turns.started_at,
          turns.requested_at,
          threads.updated_at,
          threads.created_at
        ) AS "attentionAt"
      FROM projection_threads threads
      INNER JOIN projection_turns turns
        ON turns.thread_id = threads.thread_id
        AND turns.turn_id = threads.latest_turn_id
      WHERE threads.thread_id = ${threadId}
        AND threads.deleted_at IS NULL
        AND threads.archived_at IS NULL
        AND threads.latest_turn_id IS NOT NULL
        AND turns.turn_id IS NOT NULL
        AND turns.state IN ('completed', 'interrupted', 'error')
      LIMIT 1
    `.pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError((cause) => attentionError("ThreadAttention.readLatestTerminalTurn", cause)),
    );

  const readAttentionRow = (viewerId: AuthSessionId, threadId: ThreadId) =>
    sql<ThreadAttentionRow>`
      SELECT
        thread_id AS "threadId",
        latest_turn_id AS "latestTurnId",
        attention_kind AS "attentionKind",
        attention_at AS "attentionAt",
        acknowledged_turn_id AS "acknowledgedTurnId",
        acknowledged_at AS "acknowledgedAt",
        updated_at AS "updatedAt",
        revision
      FROM thread_attention_states
      WHERE viewer_id = ${viewerId}
        AND thread_id = ${threadId}
      LIMIT 1
    `.pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError((cause) => attentionError("ThreadAttention.readAttentionRow", cause)),
    );

  const upsertLatestTerminalAttention = (
    viewerId: AuthSessionId,
    latestTurn: LatestTerminalTurnRow,
    observedAt: string,
    options?: { readonly resetAcknowledgement?: boolean },
  ) => {
    const resetAcknowledgement = options?.resetAcknowledgement === true ? 1 : 0;
    return sql`
      INSERT INTO thread_attention_states (
        thread_id,
        viewer_id,
        latest_turn_id,
        attention_kind,
        attention_at,
        acknowledged_turn_id,
        acknowledged_at,
        updated_at,
        revision
      )
      VALUES (
        ${latestTurn.threadId},
        ${viewerId},
        ${latestTurn.turnId},
        'completed',
        ${latestTurn.attentionAt},
        NULL,
        NULL,
        ${observedAt},
        1
      )
      ON CONFLICT (thread_id, viewer_id)
      DO UPDATE SET
        latest_turn_id = excluded.latest_turn_id,
        attention_kind = excluded.attention_kind,
        attention_at = excluded.attention_at,
        acknowledged_turn_id = CASE
          WHEN ${resetAcknowledgement} = 0
            AND thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.acknowledged_turn_id
          ELSE NULL
        END,
        acknowledged_at = CASE
          WHEN ${resetAcknowledgement} = 0
            AND thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.acknowledged_at
          ELSE NULL
        END,
        updated_at = CASE
          WHEN ${resetAcknowledgement} = 0
            AND thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.updated_at
          ELSE excluded.updated_at
        END,
        revision = CASE
          WHEN ${resetAcknowledgement} = 0
            AND thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.revision
          ELSE thread_attention_states.revision + 1
        END
    `.pipe(
      Effect.mapError((cause) =>
        attentionError("ThreadAttention.upsertLatestTerminalAttention", cause),
      ),
    );
  };

  const syncAllLatestTerminalAttention = (viewerId: AuthSessionId, observedAt: string) =>
    sql`
      INSERT INTO thread_attention_states (
        thread_id,
        viewer_id,
        latest_turn_id,
        attention_kind,
        attention_at,
        acknowledged_turn_id,
        acknowledged_at,
        updated_at,
        revision
      )
      SELECT
        threads.thread_id,
        ${viewerId},
        turns.turn_id,
        'completed',
        COALESCE(
          turns.completed_at,
          turns.started_at,
          turns.requested_at,
          threads.updated_at,
          threads.created_at
        ),
        NULL,
        NULL,
        ${observedAt},
        1
      FROM projection_threads threads
      INNER JOIN projection_turns turns
        ON turns.thread_id = threads.thread_id
        AND turns.turn_id = threads.latest_turn_id
      WHERE threads.deleted_at IS NULL
        AND threads.archived_at IS NULL
        AND threads.latest_turn_id IS NOT NULL
        AND turns.turn_id IS NOT NULL
        AND turns.state IN ('completed', 'interrupted', 'error')
      ON CONFLICT (thread_id, viewer_id)
      DO UPDATE SET
        latest_turn_id = excluded.latest_turn_id,
        attention_kind = excluded.attention_kind,
        attention_at = excluded.attention_at,
        acknowledged_turn_id = CASE
          WHEN thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.acknowledged_turn_id
          ELSE NULL
        END,
        acknowledged_at = CASE
          WHEN thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.acknowledged_at
          ELSE NULL
        END,
        updated_at = CASE
          WHEN thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.updated_at
          ELSE excluded.updated_at
        END,
        revision = CASE
          WHEN thread_attention_states.latest_turn_id = excluded.latest_turn_id
            AND thread_attention_states.attention_at = excluded.attention_at
          THEN thread_attention_states.revision
          ELSE thread_attention_states.revision + 1
        END
    `.pipe(
      Effect.mapError((cause) =>
        attentionError("ThreadAttention.syncAllLatestTerminalAttention", cause),
      ),
    );

  const clearAttention = (
    viewerId: AuthSessionId,
    threadId: ThreadId,
    observedAt: string,
  ): Effect.Effect<ThreadAttentionMutationEvent, ThreadAttentionError> =>
    Effect.gen(function* () {
      const existing = yield* readAttentionRow(viewerId, threadId);
      const revision = existing ? existing.revision + 1 : 0;
      yield* sql`
        DELETE FROM thread_attention_states
        WHERE viewer_id = ${viewerId}
          AND thread_id = ${threadId}
      `.pipe(Effect.mapError((cause) => attentionError("ThreadAttention.clearAttention", cause)));
      return {
        type: "state-cleared" as const,
        threadId,
        updatedAt: observedAt,
        revision,
      };
    });

  const rowToMutationEvent = (
    row: ThreadAttentionRow,
    threadId: ThreadId,
  ): ThreadAttentionMutationEvent => {
    if (row.acknowledgedTurnId === row.latestTurnId) {
      return {
        type: "state-cleared",
        threadId,
        updatedAt: row.updatedAt,
        revision: row.revision,
      };
    }
    return {
      type: "state-updated",
      state: toAttentionState(row),
    };
  };

  const refreshThreadAttention = (
    viewerId: AuthSessionId,
    threadId: ThreadId,
    observedAt: string,
    options?: { readonly resetAcknowledgement?: boolean },
  ): Effect.Effect<ThreadAttentionMutationEvent, ThreadAttentionError> =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const latestTurn = yield* readLatestTerminalTurn(threadId);
          if (!latestTurn) {
            return yield* clearAttention(viewerId, threadId, observedAt);
          }

          yield* upsertLatestTerminalAttention(viewerId, latestTurn, observedAt, options);
          const row = yield* readAttentionRow(viewerId, threadId);
          if (!row) {
            return yield* clearAttention(viewerId, threadId, observedAt);
          }
          return rowToMutationEvent(row, threadId);
        }),
      )
      .pipe(Effect.mapError(mapThreadAttentionError("ThreadAttention.refreshThreadAttention")));

  const listUnseenAttentionRows = (viewerId: AuthSessionId) =>
    sql<ThreadAttentionRow>`
      SELECT
        attention.thread_id AS "threadId",
        attention.latest_turn_id AS "latestTurnId",
        attention.attention_kind AS "attentionKind",
        attention.attention_at AS "attentionAt",
        attention.acknowledged_turn_id AS "acknowledgedTurnId",
        attention.acknowledged_at AS "acknowledgedAt",
        attention.updated_at AS "updatedAt",
        attention.revision
      FROM thread_attention_states attention
      INNER JOIN projection_threads threads
        ON threads.thread_id = attention.thread_id
      INNER JOIN projection_turns turns
        ON turns.thread_id = threads.thread_id
        AND turns.turn_id = threads.latest_turn_id
        AND turns.turn_id = attention.latest_turn_id
      WHERE attention.viewer_id = ${viewerId}
        AND threads.deleted_at IS NULL
        AND threads.archived_at IS NULL
        AND threads.latest_turn_id IS NOT NULL
        AND turns.state IN ('completed', 'interrupted', 'error')
        AND (
          attention.acknowledged_turn_id IS NULL
          OR attention.acknowledged_turn_id <> attention.latest_turn_id
        )
      ORDER BY attention.attention_at ASC, attention.thread_id ASC
    `.pipe(
      Effect.mapError((cause) => attentionError("ThreadAttention.listUnseenAttentionRows", cause)),
    );

  const getSnapshot = (viewerId: AuthSessionId) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const observedAt = new Date().toISOString();
          yield* syncAllLatestTerminalAttention(viewerId, observedAt);
          const rows = yield* listUnseenAttentionRows(viewerId);
          return {
            states: rows.map(toAttentionState),
            updatedAt: observedAt,
          } satisfies ThreadAttentionSnapshot;
        }),
      )
      .pipe(Effect.mapError(mapThreadAttentionError("ThreadAttention.getSnapshot")));

  const publishMutation = (
    viewerId: AuthSessionId,
    event: ThreadAttentionMutationEvent,
  ): Effect.Effect<void> => PubSub.publish(mutationPubSub, { viewerId, event }).pipe(Effect.asVoid);

  const markSeen = (viewerId: AuthSessionId, input: ThreadAttentionMarkSeenInput) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const observedAt = input.observedAt ?? new Date().toISOString();
          const latestTurn = yield* readLatestTerminalTurn(input.threadId);
          if (!latestTurn) {
            const cleared = yield* clearAttention(viewerId, input.threadId, observedAt);
            yield* publishMutation(viewerId, cleared);
            return cleared;
          }

          yield* upsertLatestTerminalAttention(viewerId, latestTurn, observedAt);
          yield* sql`
          UPDATE thread_attention_states
          SET
            acknowledged_turn_id = latest_turn_id,
            acknowledged_at = ${observedAt},
            updated_at = ${observedAt},
            revision = revision + 1
          WHERE viewer_id = ${viewerId}
            AND thread_id = ${input.threadId}
        `.pipe(Effect.mapError((cause) => attentionError("ThreadAttention.markSeen", cause)));
          const row = yield* readAttentionRow(viewerId, input.threadId);
          const event = row
            ? rowToMutationEvent(row, input.threadId)
            : yield* clearAttention(viewerId, input.threadId, observedAt);
          yield* publishMutation(viewerId, event);
          return event;
        }),
      )
      .pipe(Effect.mapError(mapThreadAttentionError("ThreadAttention.markSeen")));

  const markUnseen = (viewerId: AuthSessionId, input: ThreadAttentionMarkUnseenInput) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const observedAt = input.observedAt ?? new Date().toISOString();
          const latestTurn = yield* readLatestTerminalTurn(input.threadId);
          if (!latestTurn) {
            const cleared = yield* clearAttention(viewerId, input.threadId, observedAt);
            yield* publishMutation(viewerId, cleared);
            return cleared;
          }

          yield* upsertLatestTerminalAttention(viewerId, latestTurn, observedAt);
          yield* sql`
          UPDATE thread_attention_states
          SET
            acknowledged_turn_id = NULL,
            acknowledged_at = NULL,
            updated_at = ${observedAt},
            revision = revision + 1
          WHERE viewer_id = ${viewerId}
            AND thread_id = ${input.threadId}
        `.pipe(Effect.mapError((cause) => attentionError("ThreadAttention.markUnseen", cause)));
          const row = yield* readAttentionRow(viewerId, input.threadId);
          const event = row
            ? rowToMutationEvent(row, input.threadId)
            : yield* clearAttention(viewerId, input.threadId, observedAt);
          yield* publishMutation(viewerId, event);
          return event;
        }),
      )
      .pipe(Effect.mapError(mapThreadAttentionError("ThreadAttention.markUnseen")));

  const eventToAttentionChange = (
    viewerId: AuthSessionId,
    event: OrchestrationEvent,
  ): Effect.Effect<Option.Option<ThreadAttentionMutationEvent>, ThreadAttentionError> => {
    if (!isRelevantThreadAttentionEvent(event) || !shouldRefreshForRelevantEvent(event)) {
      return Effect.succeed(Option.none());
    }
    const observedAt = event.occurredAt;
    return refreshThreadAttention(viewerId, event.payload.threadId, observedAt, {
      resetAcknowledgement: event.type === "thread.turn-diff-completed",
    }).pipe(Effect.map(Option.some));
  };

  return {
    getSnapshot,
    markSeen,
    markUnseen,
    streamWithSnapshot: (viewerId, domainEvents) =>
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(mutationPubSub);
        const snapshot = yield* getSnapshot(viewerId);
        const mutationStream = Stream.fromSubscription(subscription).pipe(
          Stream.filter((event) => event.viewerId === viewerId),
          Stream.map((event) => event.event),
        );
        const domainStream = domainEvents.pipe(
          Stream.mapEffect((event) =>
            eventToAttentionChange(viewerId, event).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("failed to derive thread attention change", {
                  cause,
                  viewerId,
                  eventType: event.type,
                  aggregateId: event.aggregateId,
                }).pipe(Effect.as(Option.none())),
              ),
            ),
          ),
          Stream.flatMap((event) =>
            Option.isSome(event) ? Stream.succeed(event.value) : Stream.empty,
          ),
        );
        return Stream.concat(
          Stream.make({
            type: "snapshot" as const,
            snapshot,
          }),
          Stream.merge(domainStream, mutationStream),
        );
      }).pipe(Effect.mapError(mapThreadAttentionError("ThreadAttention.streamWithSnapshot"))),
  } satisfies ThreadAttentionShape;
});

export const ThreadAttentionLive = Layer.effect(ThreadAttention, makeThreadAttention);
