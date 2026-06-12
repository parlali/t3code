#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { Data, Effect, FileSystem, Logger, Option, Path } from "effect";
import { promisify } from "node:util";
import { Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  DEVELOPMENT_ICON_OVERRIDES,
  PUBLISH_ICON_OVERRIDES,
} from "../../../scripts/lib/brand-assets.ts";
import { resolveCatalogDependencies } from "../../../scripts/lib/resolve-catalog.ts";
import rootPackageJson from "../../../package.json" with { type: "json" };
import serverPackageJson from "../package.json" with { type: "json" };

interface PackageJson {
  name: string;
  repository: {
    type: string;
    url: string;
    directory: string;
  };
  bin: Record<string, string>;
  type: string;
  version: string;
  engines: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
  overrides: Record<string, string>;
}

class CliError extends Data.TaggedError("CliError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);
const PRECOMPRESS_MIN_BYTES = 1024;
const PRECOMPRESS_BROTLI_QUALITY = 7;
const PRECOMPRESS_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".wasm",
]);

const RepoRoot = Effect.service(Path.Path).pipe(
  Effect.flatMap((path) => path.fromFileUrl(new URL("../../..", import.meta.url))),
);

const runCommand = Effect.fn("runCommand")(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(command);
  const exitCode = yield* child.exitCode;

  if (exitCode !== 0) {
    return yield* new CliError({
      message: `Command exited with non-zero exit code (${exitCode})`,
    });
  }
});

interface PublishIconBackup {
  readonly targetPath: string;
  readonly backupPath: string;
}

const applyPublishIconOverrides = Effect.fn("applyPublishIconOverrides")(function* (
  repoRoot: string,
  serverDir: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const backups: PublishIconBackup[] = [];

  for (const override of PUBLISH_ICON_OVERRIDES) {
    const sourcePath = path.join(repoRoot, override.sourceRelativePath);
    const targetPath = path.join(serverDir, override.targetRelativePath);
    const backupPath = `${targetPath}.publish-bak`;

    if (!(yield* fs.exists(sourcePath))) {
      return yield* new CliError({
        message: `Missing publish icon source: ${sourcePath}`,
      });
    }
    if (!(yield* fs.exists(targetPath))) {
      return yield* new CliError({
        message: `Missing publish icon target: ${targetPath}. Run the build subcommand first.`,
      });
    }

    yield* fs.copyFile(targetPath, backupPath);
    yield* fs.copyFile(sourcePath, targetPath);
    backups.push({ targetPath, backupPath });
  }

  yield* Effect.log("[cli] Applied publish icon overrides to dist/client");
  return backups as ReadonlyArray<PublishIconBackup>;
});

const restorePublishIconOverrides = Effect.fn("restorePublishIconOverrides")(function* (
  backups: ReadonlyArray<PublishIconBackup>,
) {
  const fs = yield* FileSystem.FileSystem;
  for (const backup of backups) {
    if (!(yield* fs.exists(backup.backupPath))) {
      continue;
    }
    yield* fs.rename(backup.backupPath, backup.targetPath);
  }
});

const applyDevelopmentIconOverrides = Effect.fn("applyDevelopmentIconOverrides")(function* (
  repoRoot: string,
  serverDir: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  for (const override of DEVELOPMENT_ICON_OVERRIDES) {
    const sourcePath = path.join(repoRoot, override.sourceRelativePath);
    const targetPath = path.join(serverDir, override.targetRelativePath);

    if (!(yield* fs.exists(sourcePath))) {
      return yield* new CliError({
        message: `Missing development icon source: ${sourcePath}`,
      });
    }
    if (!(yield* fs.exists(targetPath))) {
      return yield* new CliError({
        message: `Missing development icon target: ${targetPath}. Build web first.`,
      });
    }

    yield* fs.copyFile(sourcePath, targetPath);
  }

  yield* Effect.log("[cli] Applied development icon overrides to dist/client");
});

const precompressClientAssets = Effect.fn("precompressClientAssets")(function* (
  clientTarget: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let compressedCount = 0;

  const visit = (dir: string): Effect.Effect<void, CliError> =>
    Effect.gen(function* () {
      const entries = yield* fs.readDirectory(dir).pipe(
        Effect.mapError(
          (cause) =>
            new CliError({
              message: `Failed to read client asset directory: ${dir}`,
              cause,
            }),
        ),
      );

      for (const entry of entries) {
        const entryPath = path.join(dir, entry);
        const info = yield* fs.stat(entryPath).pipe(
          Effect.mapError(
            (cause) =>
              new CliError({
                message: `Failed to stat client asset: ${entryPath}`,
                cause,
              }),
          ),
        );
        if (info.type === "Directory") {
          yield* visit(entryPath);
          continue;
        }
        if (info.type !== "File") {
          continue;
        }
        if (entryPath.endsWith(".br") || entryPath.endsWith(".gz")) {
          continue;
        }
        if (
          info.size < PRECOMPRESS_MIN_BYTES ||
          !PRECOMPRESS_EXTENSIONS.has(path.extname(entryPath))
        ) {
          continue;
        }

        const input = yield* fs.readFile(entryPath).pipe(
          Effect.mapError(
            (cause) =>
              new CliError({
                message: `Failed to read client asset: ${entryPath}`,
                cause,
              }),
          ),
        );
        const [br, gz] = yield* Effect.promise(() =>
          Promise.all([
            brotliCompressAsync(input, {
              params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: PRECOMPRESS_BROTLI_QUALITY,
              },
            }),
            gzipAsync(input, { level: zlibConstants.Z_BEST_COMPRESSION }),
          ]),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new CliError({
                message: `Failed to precompress client asset: ${entryPath}`,
                cause,
              }),
          ),
        );
        yield* fs.writeFile(`${entryPath}.br`, br).pipe(
          Effect.mapError(
            (cause) =>
              new CliError({
                message: `Failed to write Brotli client asset: ${entryPath}.br`,
                cause,
              }),
          ),
        );
        yield* fs.writeFile(`${entryPath}.gz`, gz).pipe(
          Effect.mapError(
            (cause) =>
              new CliError({
                message: `Failed to write gzip client asset: ${entryPath}.gz`,
                cause,
              }),
          ),
        );
        compressedCount += 1;
      }
    });

  yield* visit(clientTarget);
  yield* Effect.log(`[cli] Precompressed ${compressedCount} web client assets`);
});

// ---------------------------------------------------------------------------
// build subcommand
// ---------------------------------------------------------------------------

const buildCmd = Command.make(
  "build",
  {
    verbose: Flag.boolean("verbose").pipe(Flag.withDefault(false)),
  },
  (config) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const repoRoot = yield* RepoRoot;
      const serverDir = path.join(repoRoot, "apps/server");

      yield* Effect.log("[cli] Running tsdown...");
      yield* runCommand(
        ChildProcess.make(process.execPath, ["--run", "build:bundle"], {
          cwd: serverDir,
          stdout: config.verbose ? "inherit" : "ignore",
          stderr: "inherit",
        }),
      );

      const webDist = path.join(repoRoot, "apps/web/dist");
      const clientTarget = path.join(serverDir, "dist/client");

      if (yield* fs.exists(webDist)) {
        yield* fs.remove(clientTarget, { force: true, recursive: true });
        yield* fs.copy(webDist, clientTarget);
        yield* applyDevelopmentIconOverrides(repoRoot, serverDir);
        yield* precompressClientAssets(clientTarget);
        yield* Effect.log("[cli] Bundled web app into dist/client");
      } else {
        yield* Effect.logWarning("[cli] Web dist not found — skipping client bundle.");
      }
    }),
).pipe(Command.withDescription("Build the server package (tsdown + bundle web client)."));

// ---------------------------------------------------------------------------
// publish subcommand
// ---------------------------------------------------------------------------

const publishCmd = Command.make(
  "publish",
  {
    tag: Flag.string("tag").pipe(Flag.withDefault("latest")),
    access: Flag.string("access").pipe(Flag.withDefault("public")),
    appVersion: Flag.string("app-version").pipe(Flag.optional),
    provenance: Flag.boolean("provenance").pipe(Flag.withDefault(false)),
    dryRun: Flag.boolean("dry-run").pipe(Flag.withDefault(false)),
    verbose: Flag.boolean("verbose").pipe(Flag.withDefault(false)),
  },
  (config) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const repoRoot = yield* RepoRoot;
      const serverDir = path.join(repoRoot, "apps/server");
      const packageJsonPath = path.join(serverDir, "package.json");
      const backupPath = `${packageJsonPath}.bak`;

      // Assert build assets exist
      for (const relPath of ["dist/bin.mjs", "dist/client/index.html"]) {
        const abs = path.join(serverDir, relPath);
        if (!(yield* fs.exists(abs))) {
          return yield* new CliError({
            message: `Missing build asset: ${abs}. Run the build subcommand first.`,
          });
        }
      }

      yield* Effect.acquireUseRelease(
        // Acquire: backup package.json, resolve catalog dependencies, and strip devDependencies/scripts
        Effect.gen(function* () {
          const version = Option.getOrElse(config.appVersion, () => serverPackageJson.version);
          const pkg: PackageJson = {
            name: serverPackageJson.name,
            repository: serverPackageJson.repository,
            bin: serverPackageJson.bin,
            type: serverPackageJson.type,
            version,
            engines: serverPackageJson.engines,
            files: serverPackageJson.files,
            dependencies: resolveCatalogDependencies(
              serverPackageJson.dependencies,
              rootPackageJson.workspaces.catalog,
              "apps/server",
            ),
            overrides: resolveCatalogDependencies(
              rootPackageJson.overrides,
              rootPackageJson.workspaces.catalog,
              "apps/server",
            ),
          };

          const original = yield* fs.readFileString(packageJsonPath);
          yield* fs.writeFileString(backupPath, original);
          yield* fs.writeFileString(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
          yield* Effect.log("[cli] Prepared package.json for publish");

          const iconBackups = yield* applyPublishIconOverrides(repoRoot, serverDir);
          return { iconBackups };
        }),
        // Use: npm publish
        () =>
          Effect.gen(function* () {
            const args = ["publish", "--access", config.access, "--tag", config.tag];
            if (config.provenance) args.push("--provenance");
            if (config.dryRun) args.push("--dry-run");

            yield* Effect.log(`[cli] Running: npm ${args.join(" ")}`);
            yield* runCommand(
              ChildProcess.make("npm", [...args], {
                cwd: serverDir,
                stdout: config.verbose ? "inherit" : "ignore",
                stderr: "inherit",
                // Windows needs shell mode to resolve .cmd shims.
                shell: process.platform === "win32",
              }),
            );
          }),
        // Release: restore
        (resource: { readonly iconBackups: ReadonlyArray<PublishIconBackup> }) =>
          Effect.gen(function* () {
            yield* restorePublishIconOverrides(resource.iconBackups).pipe(
              Effect.catch((error) =>
                Effect.logError(`[cli] Failed to restore publish icon overrides: ${String(error)}`),
              ),
            );
            yield* fs.rename(backupPath, packageJsonPath);
            if (config.verbose) yield* Effect.log("[cli] Restored original package.json");
          }),
      );
    }),
).pipe(Command.withDescription("Publish the server package to npm."));

// ---------------------------------------------------------------------------
// root command
// ---------------------------------------------------------------------------

const cli = Command.make("cli").pipe(
  Command.withDescription("T3 server build & publish CLI."),
  Command.withSubcommands([buildCmd, publishCmd]),
);

Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.scoped,
  Effect.provide([Logger.layer([Logger.consolePretty()]), NodeServices.layer]),
  NodeRuntime.runMain,
);
