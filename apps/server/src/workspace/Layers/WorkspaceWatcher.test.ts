import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import {
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Schema,
  Stream,
} from "effect";

import type { ProjectEntriesStreamEvent } from "@t3tools/contracts";

import { ServerConfig } from "../../config.ts";
import * as VcsDriverRegistry from "../../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../../vcs/VcsProcess.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspaceWatcher } from "../Services/WorkspaceWatcher.ts";
import { isPathIgnoredByWorkspaceWatcher } from "../ignoredPaths.ts";
import { WorkspaceEntriesLive } from "./WorkspaceEntries.ts";
import { WorkspacePathsLive } from "./WorkspacePaths.ts";
import { WorkspaceWatcherLive } from "./WorkspaceWatcher.ts";

const WorkspaceEntriesLayer = WorkspaceEntriesLive.pipe(
  Layer.provide(WorkspacePathsLive),
  Layer.provideMerge(VcsDriverRegistry.layer.pipe(Layer.provide(VcsProcess.layer))),
);

const WorkspaceWatcherLayer = WorkspaceWatcherLive.pipe(
  Layer.provide(WorkspacePathsLive),
  Layer.provide(WorkspaceEntriesLayer),
);

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(WorkspaceEntriesLayer),
  Layer.provideMerge(WorkspaceWatcherLayer),
  Layer.provideMerge(WorkspacePathsLive),
  Layer.provideMerge(VcsProcess.layer),
  Layer.provideMerge(VcsDriverRegistry.layer.pipe(Layer.provide(VcsProcess.layer))),
  Layer.provide(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3-workspace-watcher-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

class WatcherEventTimeoutError extends Schema.TaggedErrorClass<WatcherEventTimeoutError>()(
  "WatcherEventTimeoutError",
  {
    message: Schema.String,
  },
) {}

const makeTempDir = Effect.fn(function* (opts?: { prefix?: string; git?: boolean }) {
  const fileSystem = yield* FileSystem.FileSystem;
  const dir = yield* fileSystem.makeTempDirectoryScoped({
    prefix: opts?.prefix ?? "t3code-workspace-watcher-",
  });
  if (opts?.git) {
    yield* git(dir, ["init"]);
  }
  return dir;
});

function writeTextFile(
  cwd: string,
  relativePath: string,
  contents = "",
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolutePath = path.join(cwd, relativePath);
    yield* fileSystem.makeDirectory(path.dirname(absolutePath), { recursive: true });
    yield* fileSystem.writeFileString(absolutePath, contents);
  });
}

const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const process = yield* VcsProcess.VcsProcess;
    const result = yield* process.run({
      operation: "WorkspaceWatcher.test.git",
      command: "git",
      cwd,
      args,
      timeoutMs: 10_000,
    });
    return result.stdout.trim();
  });

const waitForEvent = <A, E>(deferred: Deferred.Deferred<A, E>) =>
  Deferred.await(deferred).pipe(
    Effect.raceFirst(
      Effect.callback<never, WatcherEventTimeoutError>((resume) => {
        const timeout = setTimeout(() => {
          resume(
            Effect.fail(
              new WatcherEventTimeoutError({
                message: "Timed out waiting for workspace watcher event.",
              }),
            ),
          );
        }, 5_000);
        return Effect.sync(() => clearTimeout(timeout));
      }),
    ),
  );

const subscribeEntries = Effect.fn("WorkspaceWatcher.test.subscribeEntries")(function* (
  cwd: string,
) {
  const watcher = yield* WorkspaceWatcher;
  const ready = yield* Deferred.make<ProjectEntriesStreamEvent>();
  const changed = yield* Deferred.make<ProjectEntriesStreamEvent>();
  const fiber = yield* watcher.streamEntries({ cwd }).pipe(
    Stream.runForEach((event) =>
      event.type === "ready"
        ? Deferred.succeed(ready, event).pipe(Effect.ignore)
        : Deferred.succeed(changed, event).pipe(Effect.ignore),
    ),
    Effect.forkScoped,
  );

  return { ready, changed, fiber };
});

it.layer(TestLayer)("WorkspaceWatcherLive", (it) => {
  describe("streamEntries", () => {
    it.effect("emits changes for gitignored files that should still appear in the explorer", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTempDir({
          prefix: "t3code-workspace-watcher-env-",
          git: true,
        });
        yield* writeTextFile(cwd, ".gitignore", ".env\n");

        const subscription = yield* subscribeEntries(cwd);
        yield* waitForEvent(subscription.ready);

        yield* writeTextFile(cwd, ".env", "TOKEN=local\n");

        const event = yield* waitForEvent(subscription.changed);
        expect(event).toMatchObject({ type: "entries-changed", cwd });
        if (event.type !== "entries-changed") {
          throw new Error(`Expected entries-changed event, received ${event.type}`);
        }
        expect(event.changedPaths).toContain(".env");

        const workspaceEntries = yield* WorkspaceEntries;
        const listed = yield* workspaceEntries.list({ cwd, limit: 100 });
        expect(listed.entries.map((entry) => entry.path)).toContain(".env");

        yield* Fiber.interrupt(subscription.fiber);
      }),
    );

    it.effect("classifies noisy log file changes as ignored", () =>
      Effect.sync(() => {
        expect(isPathIgnoredByWorkspaceWatcher("tmp/issue90-logs/debug.log")).toBe(true);
        expect(isPathIgnoredByWorkspaceWatcher("logs/server.trace")).toBe(true);
        expect(isPathIgnoredByWorkspaceWatcher("src/log.ts")).toBe(false);
      }),
    );

    it.effect("invalidates the cached search index before publishing a change", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTempDir({ prefix: "t3code-workspace-watcher-cache-" });
        yield* writeTextFile(cwd, "src/existing.ts", "export {};\n");

        const workspaceEntries = yield* WorkspaceEntries;
        const before = yield* workspaceEntries.search({
          cwd,
          query: "created",
          limit: 10,
        });
        expect(before.entries).toEqual([]);

        const subscription = yield* subscribeEntries(cwd);
        yield* waitForEvent(subscription.ready);

        yield* writeTextFile(cwd, "src/created.ts", "export {};\n");
        yield* waitForEvent(subscription.changed);

        const after = yield* workspaceEntries.search({
          cwd,
          query: "created",
          limit: 10,
        });
        expect(after.entries.map((entry) => entry.path)).toContain("src/created.ts");

        yield* Fiber.interrupt(subscription.fiber);
      }),
    );
  });
});
