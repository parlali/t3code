import nodePath from "node:path";

import { Effect, Layer, PubSub, Stream, SynchronizedRef } from "effect";
import { watch, type FSWatcher } from "chokidar";

import type { ProjectEntriesStreamEvent } from "@t3tools/contracts";

import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import {
  WorkspaceWatcher,
  WorkspaceWatcherError,
  type WorkspaceWatcherShape,
} from "../Services/WorkspaceWatcher.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";
import { isPathIgnoredByWorkspaceWatcher } from "../ignoredPaths.ts";

const WORKSPACE_WATCH_DEBOUNCE_MS = 750;
const WORKSPACE_WATCH_CHANGED_PATH_LIMIT = 100;

const WORKSPACE_WATCH_EVENTS = new Set(["add", "addDir", "change", "unlink", "unlinkDir"]);

interface ActiveWorkspaceWatcher {
  readonly cwd: string;
  readonly pubsub: PubSub.PubSub<ProjectEntriesStreamEvent>;
  readonly watcher: FSWatcher;
  readonly close: Effect.Effect<void>;
  readonly subscriberCount: number;
}

function toPosixPath(input: string): string {
  return input.replaceAll("\\", "/");
}

function toRelativeWatchPath(cwd: string, candidatePath: string): string | null {
  const absolutePath = nodePath.isAbsolute(candidatePath)
    ? candidatePath
    : nodePath.join(cwd, candidatePath);
  const relativePath = toPosixPath(nodePath.relative(cwd, absolutePath));
  if (!relativePath || relativePath === "." || relativePath === "..") return null;
  if (relativePath.startsWith("../")) return null;
  return relativePath;
}

function isIgnoredWatchPath(cwd: string, candidatePath: string): boolean {
  const relativePath = toRelativeWatchPath(cwd, candidatePath);
  return relativePath !== null && isPathIgnoredByWorkspaceWatcher(relativePath);
}

function watcherError(cwd: string, operation: string, cause: unknown): WorkspaceWatcherError {
  return new WorkspaceWatcherError({
    cwd,
    operation,
    detail: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export const makeWorkspaceWatcher = Effect.gen(function* () {
  const workspaceEntries = yield* WorkspaceEntries;
  const workspacePaths = yield* WorkspacePaths;
  const activeWatchersRef = yield* SynchronizedRef.make(new Map<string, ActiveWorkspaceWatcher>());
  const runFork = Effect.runForkWith(yield* Effect.context<never>());

  const createActiveWatcher = Effect.fn("WorkspaceWatcher.createActiveWatcher")(function* (
    cwd: string,
    pubsub: PubSub.PubSub<ProjectEntriesStreamEvent>,
  ): Effect.fn.Return<ActiveWorkspaceWatcher, WorkspaceWatcherError> {
    return yield* Effect.tryPromise({
      try: () =>
        new Promise<ActiveWorkspaceWatcher>((resolve, reject) => {
          let ready = false;
          let closed = false;
          let settled = false;
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;
          const changedPaths = new Set<string>();

          const publishChange = () => {
            debounceTimer = null;
            if (closed) return;

            const paths = Array.from(changedPaths).slice(0, WORKSPACE_WATCH_CHANGED_PATH_LIMIT);
            changedPaths.clear();
            const event: ProjectEntriesStreamEvent = {
              type: "entries-changed",
              cwd,
              ...(paths.length > 0 ? { changedPaths: paths } : {}),
            };
            runFork(
              workspaceEntries
                .invalidate(cwd)
                .pipe(Effect.andThen(PubSub.publish(pubsub, event)), Effect.asVoid),
            );
          };

          const scheduleChange = (changedPath: string | undefined) => {
            if (!ready || closed) return;
            if (changedPath) {
              const relativePath = toRelativeWatchPath(cwd, changedPath);
              if (relativePath !== null && !isPathIgnoredByWorkspaceWatcher(relativePath)) {
                changedPaths.add(relativePath);
              }
            }
            if (debounceTimer !== null) {
              clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(publishChange, WORKSPACE_WATCH_DEBOUNCE_MS);
          };

          const watcher = watch(cwd, {
            atomic: true,
            ignoreInitial: true,
            ignored: (candidatePath) => isIgnoredWatchPath(cwd, candidatePath),
            persistent: true,
          });

          const close = Effect.gen(function* () {
            closed = true;
            if (debounceTimer !== null) {
              clearTimeout(debounceTimer);
              debounceTimer = null;
            }
            yield* Effect.promise(() => watcher.close()).pipe(Effect.ignore);
            yield* PubSub.shutdown(pubsub);
          });

          const active: ActiveWorkspaceWatcher = {
            cwd,
            pubsub,
            watcher,
            close,
            subscriberCount: 1,
          };

          watcher.on("all", (eventName, changedPath) => {
            if (WORKSPACE_WATCH_EVENTS.has(eventName)) {
              scheduleChange(changedPath);
            }
          });
          watcher.once("ready", () => {
            if (settled) return;
            ready = true;
            settled = true;
            resolve(active);
          });
          watcher.on("error", (cause) => {
            if (!settled) {
              settled = true;
              closed = true;
              if (debounceTimer !== null) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
              }
              void watcher.close();
              reject(cause);
              return;
            }

            runFork(
              Effect.logWarning("Workspace file watcher reported an error", {
                cwd,
                cause,
              }),
            );
          });
        }),
      catch: (cause) => watcherError(cwd, "WorkspaceWatcher.createActiveWatcher", cause),
    });
  });

  const normalizeWorkspaceRoot = Effect.fn("WorkspaceWatcher.normalizeWorkspaceRoot")(function* (
    cwd: string,
  ): Effect.fn.Return<string, WorkspaceWatcherError> {
    return yield* workspacePaths
      .normalizeWorkspaceRoot(cwd)
      .pipe(
        Effect.mapError((cause) =>
          watcherError(cwd, "WorkspaceWatcher.normalizeWorkspaceRoot", cause),
        ),
      );
  });

  const retainWatcher = Effect.fn("WorkspaceWatcher.retainWatcher")(function* (
    cwd: string,
  ): Effect.fn.Return<ActiveWorkspaceWatcher, WorkspaceWatcherError> {
    const normalizedCwd = yield* normalizeWorkspaceRoot(cwd);
    return yield* SynchronizedRef.modifyEffect(activeWatchersRef, (activeWatchers) => {
      const existing = activeWatchers.get(normalizedCwd);
      if (existing) {
        const nextWatchers = new Map(activeWatchers);
        const nextWatcher = {
          ...existing,
          subscriberCount: existing.subscriberCount + 1,
        };
        nextWatchers.set(normalizedCwd, nextWatcher);
        return Effect.succeed([nextWatcher, nextWatchers] as const);
      }

      return PubSub.unbounded<ProjectEntriesStreamEvent>().pipe(
        Effect.flatMap((pubsub) => createActiveWatcher(normalizedCwd, pubsub)),
        Effect.map((activeWatcher) => {
          const nextWatchers = new Map(activeWatchers);
          nextWatchers.set(normalizedCwd, activeWatcher);
          return [activeWatcher, nextWatchers] as const;
        }),
      );
    });
  });

  const releaseWatcher = Effect.fn("WorkspaceWatcher.releaseWatcher")(function* (cwd: string) {
    const watcherToClose = yield* SynchronizedRef.modify(activeWatchersRef, (activeWatchers) => {
      const existing = activeWatchers.get(cwd);
      if (!existing) {
        return [null, activeWatchers] as const;
      }

      if (existing.subscriberCount > 1) {
        const nextWatchers = new Map(activeWatchers);
        nextWatchers.set(cwd, {
          ...existing,
          subscriberCount: existing.subscriberCount - 1,
        });
        return [null, nextWatchers] as const;
      }

      const nextWatchers = new Map(activeWatchers);
      nextWatchers.delete(cwd);
      return [existing, nextWatchers] as const;
    });

    if (watcherToClose) {
      yield* watcherToClose.close.pipe(Effect.ignore);
    }
  });

  yield* Effect.addFinalizer(() =>
    SynchronizedRef.get(activeWatchersRef).pipe(
      Effect.flatMap((activeWatchers) =>
        Effect.forEach(activeWatchers.values(), (activeWatcher) => activeWatcher.close, {
          discard: true,
        }),
      ),
      Effect.ignore,
    ),
  );

  const streamEntries: WorkspaceWatcherShape["streamEntries"] = (input) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const activeWatcher = yield* retainWatcher(input.cwd);
        const subscription = yield* PubSub.subscribe(activeWatcher.pubsub);
        return Stream.concat(
          Stream.make({ type: "ready" as const, cwd: activeWatcher.cwd }),
          Stream.fromSubscription(subscription),
        ).pipe(Stream.ensuring(releaseWatcher(activeWatcher.cwd).pipe(Effect.ignore)));
      }),
    );

  return WorkspaceWatcher.of({
    streamEntries,
  });
});

export const WorkspaceWatcherLive = Layer.effect(WorkspaceWatcher, makeWorkspaceWatcher);
