import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it, describe } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, PlatformError, Scope } from "effect";

import { GitCommandError } from "@t3tools/contracts";
import { ServerConfig } from "../config.ts";
import * as GitVcsDriver from "./GitVcsDriver.ts";

const ServerConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-git-vcs-driver-test-",
});
const TestLayer = GitVcsDriver.layer.pipe(
  Layer.provide(ServerConfigLayer),
  Layer.provideMerge(NodeServices.layer),
);

const makeTmpDir = (
  prefix = "git-vcs-driver-test-",
): Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem.makeTempDirectoryScoped({ prefix });
  });

const writeTextFile = (
  cwd: string,
  relativePath: string,
  contents: string,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const filePath = pathService.join(cwd, relativePath);
    yield* fileSystem.makeDirectory(pathService.dirname(filePath), { recursive: true });
    yield* fileSystem.writeFileString(filePath, contents);
  });

const git = (
  cwd: string,
  args: ReadonlyArray<string>,
  env?: NodeJS.ProcessEnv,
): Effect.Effect<string, GitCommandError, GitVcsDriver.GitVcsDriver> =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const result = yield* driver.execute({
      operation: "GitVcsDriver.test.git",
      cwd,
      args,
      ...(env ? { env } : {}),
      timeoutMs: 10_000,
    });
    return result.stdout.trim();
  });

const initRepoWithCommit = (
  cwd: string,
): Effect.Effect<
  { readonly initialBranch: string },
  GitCommandError | PlatformError.PlatformError,
  GitVcsDriver.GitVcsDriver | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    yield* driver.initRepo({ cwd });
    yield* git(cwd, ["config", "user.email", "test@test.com"]);
    yield* git(cwd, ["config", "user.name", "Test"]);
    yield* writeTextFile(cwd, "README.md", "# test\n");
    yield* git(cwd, ["add", "."]);
    yield* git(cwd, ["commit", "-m", "initial commit"]);
    const initialBranch = yield* git(cwd, ["branch", "--show-current"]);
    return { initialBranch };
  });

it.layer(TestLayer)("GitVcsDriver core integration", (it) => {
  describe("repository status", () => {
    it.effect("reports non-repository directories without failing", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const refs = yield* driver.listRefs({ cwd });
        assert.equal(refs.isRepo, false);
        assert.deepStrictEqual(refs.refs, []);
      }),
    );

    it.effect("reports refName and dirty state for a repository", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* writeTextFile(cwd, "feature.ts", "export const value = 1;\n");

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.isRepo, true);
        assert.equal(status.branch, initialBranch);
        assert.equal(status.hasWorkingTreeChanges, true);
        assert.include(
          status.workingTree.files.map((file) => file.path),
          "feature.ts",
        );
      }),
    );

    it.effect("counts text lines in untracked files as insertions", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        yield* writeTextFile(cwd, "src/new.ts", "one\ntwo\nthree");

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);
        const file = status.workingTree.files.find((entry) => entry.path === "src/new.ts");

        assert.equal(file?.untracked, true);
        assert.equal(file?.insertions, 3);
        assert.equal(file?.deletions, 0);
        assert.equal(status.workingTree.insertions, 3);
        assert.equal(status.workingTree.deletions, 0);
      }),
    );

    it.effect("reports default-branch delta separately from upstream delta", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["checkout", "-b", "feature/synced"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature commit"]);
        yield* git(cwd, ["push", "-u", "origin", "feature/synced"]);

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.hasUpstream, true);
        assert.equal(status.aheadCount, 0);
        assert.equal(status.behindCount, 0);
        assert.equal(status.aheadOfDefaultCount, 1);
      }),
    );

    it.effect("reuses the no-upstream fallback ahead count for default-branch delta", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["checkout", "-b", "feature/no-upstream"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature commit"]);

        const status = yield* (yield* GitVcsDriver.GitVcsDriver).statusDetails(cwd);

        assert.equal(status.hasUpstream, false);
        assert.equal(status.aheadCount, 1);
        assert.equal(status.behindCount, 0);
        assert.equal(status.aheadOfDefaultCount, 1);
      }),
    );
  });

  describe("working tree file operations", () => {
    it.effect("rejects file paths outside the repository root", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const error = yield* driver
          .fileDiff({ cwd, relativePath: "../outside.txt" })
          .pipe(Effect.flip);

        assert.ok(error.message.includes("must stay within the repository root"));
      }),
    );

    it.effect("removes untracked files when reverting them", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* writeTextFile(cwd, "scratch.txt", "temporary\n");
        yield* driver.revertFile({ cwd, relativePath: "scratch.txt" });

        const exists = yield* fileSystem.stat(path.join(cwd, "scratch.txt")).pipe(
          Effect.as(true),
          Effect.catch(() => Effect.succeed(false)),
        );
        assert.equal(exists, false);
      }),
    );

    it.effect("uses the old path as staged diff original content for renames", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* writeTextFile(cwd, "old.txt", "one\ntwo\nthree\n");
        yield* git(cwd, ["add", "old.txt"]);
        yield* git(cwd, ["commit", "-m", "add old file"]);

        yield* git(cwd, ["mv", "old.txt", "new.txt"]);
        yield* writeTextFile(cwd, "new.txt", "one\nTWO\nthree\n");
        yield* git(cwd, ["add", "new.txt"]);

        const status = yield* driver.statusDetails(cwd);
        const renamed = status.workingTree.files.find((file) => file.path === "new.txt");
        const diff = yield* driver.fileDiff({
          cwd,
          relativePath: "new.txt",
          source: "staged",
        });

        assert.equal(renamed?.oldPath, "old.txt");
        assert.equal(diff.original, "one\ntwo\nthree\n");
        assert.equal(diff.modified, "one\nTWO\nthree\n");
      }),
    );

    it.effect("stages and unstages multiple paths with one operation", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* writeTextFile(cwd, "first.txt", "first\n");
        yield* writeTextFile(cwd, "second.txt", "second\n");
        yield* driver.stageFiles({ cwd, relativePaths: ["first.txt", "second.txt"] });

        const staged = yield* driver.statusDetails(cwd);
        assert.deepStrictEqual(
          staged.workingTree.files.map((file) => [file.path, file.staged]),
          [
            ["first.txt", true],
            ["second.txt", true],
          ],
        );

        yield* driver.unstageFiles({ cwd, relativePaths: ["first.txt", "second.txt"] });

        const unstaged = yield* driver.statusDetails(cwd);
        assert.deepStrictEqual(
          unstaged.workingTree.files.map((file) => [file.path, file.untracked]),
          [
            ["first.txt", true],
            ["second.txt", true],
          ],
        );
      }),
    );

    it.effect("stages and unstages pathspecs through stdin without mangling special paths", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const specialPath = "dir/file with space\tand tab.txt";

        yield* writeTextFile(cwd, specialPath, "special\n");
        yield* driver.stageFiles({ cwd, relativePaths: [specialPath] });

        const staged = yield* driver.statusDetails(cwd);
        const stagedFile = staged.workingTree.files.find((file) => file.path === specialPath);
        assert.equal(stagedFile?.staged, true);

        yield* driver.unstageFiles({ cwd, relativePaths: [specialPath] });

        const unstaged = yield* driver.statusDetails(cwd);
        const unstagedFile = unstaged.workingTree.files.find((file) => file.path === specialPath);
        assert.equal(unstagedFile?.untracked, true);
      }),
    );

    it.effect("unstages files in an unborn repository", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* driver.initRepo({ cwd });
        yield* writeTextFile(cwd, "first.txt", "first\n");
        yield* driver.stageFiles({ cwd, relativePaths: ["first.txt"] });
        yield* driver.unstageFiles({ cwd, relativePaths: ["first.txt"] });

        const status = yield* driver.statusDetails(cwd);
        const file = status.workingTree.files.find((entry) => entry.path === "first.txt");
        assert.equal(file?.untracked, true);
        assert.equal(file?.staged, false);
      }),
    );

    it.effect("keeps staged and unstaged stats separate for partially staged files", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* writeTextFile(cwd, "partial.txt", "one\n");
        yield* driver.stageFiles({ cwd, relativePaths: ["partial.txt"] });
        yield* writeTextFile(cwd, "partial.txt", "one\ntwo\n");

        const status = yield* driver.statusDetails(cwd);
        const file = status.workingTree.files.find((entry) => entry.path === "partial.txt");
        assert.equal(file?.staged, true);
        assert.equal(file?.unstaged, true);
        assert.equal(file?.stagedInsertions, 1);
        assert.equal(file?.unstagedInsertions, 1);
        assert.equal(file?.insertions, 2);
      }),
    );
  });

  describe("refName operations", () => {
    it.effect("returns graph rows for recent commits", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* git(cwd, ["checkout", "-b", "feature/graph"]);
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* git(cwd, ["add", "feature.txt"]);
        yield* git(cwd, ["commit", "-m", "feature graph commit"]);
        yield* git(cwd, ["checkout", initialBranch]);
        yield* writeTextFile(cwd, "main.txt", "main\n");
        yield* git(cwd, ["add", "main.txt"]);
        yield* git(cwd, ["commit", "-m", "main graph commit"]);
        yield* git(cwd, ["merge", "--no-ff", "feature/graph", "-m", "merge graph branch"]);

        const graph = yield* driver.commitGraph({ cwd, limit: 20 });

        assert.equal(graph.isRepo, true);
        assert.equal(graph.truncated, false);
        assert.ok(graph.commits.length > 0);
        assert.include(
          graph.commits.map((commit) => commit.subject),
          "merge graph branch",
        );
        const mergeCommit = graph.commits.find((commit) => commit.subject === "merge graph branch");
        assert.equal(mergeCommit?.parents.length, 2);
      }),
    );

    it.effect("returns an empty graph for repositories without commits", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* driver.initRepo({ cwd });

        const graph = yield* driver.commitGraph({ cwd });

        assert.deepStrictEqual(graph, { commits: [], isRepo: true, truncated: false });
      }),
    );

    it.effect("omits remote topic branches that are not tracked by the current workspace", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-vcs-driver-remote-");
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* git(cwd, ["push", "-u", "origin", initialBranch]);
        yield* git(cwd, ["checkout", "-b", "remote/noise"]);
        yield* writeTextFile(cwd, "noise.txt", "noise\n");
        yield* git(cwd, ["add", "noise.txt"]);
        yield* git(cwd, ["commit", "-m", "remote-only graph noise"]);
        yield* git(cwd, ["push", "origin", "remote/noise"]);
        yield* git(cwd, ["checkout", initialBranch]);
        yield* git(cwd, ["branch", "-D", "remote/noise"]);
        yield* git(cwd, ["fetch", "origin"]);

        const graph = yield* driver.commitGraph({ cwd, limit: 20 });
        const subjects = graph.commits.map((commit) => commit.subject);

        assert.include(subjects, "initial commit");
        assert.notInclude(subjects, "remote-only graph noise");
      }),
    );

    it.effect("creates, checks out, renames, and lists refs", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* driver.createRef({ cwd, refName: "feature/original" });
        const switchRef = yield* driver.switchRef({ cwd, refName: "feature/original" });
        assert.equal(switchRef.refName, "feature/original");

        const renamed = yield* driver.renameBranch({
          cwd,
          oldBranch: "feature/original",
          newBranch: "feature/renamed",
        });
        assert.equal(renamed.branch, "feature/renamed");
        assert.equal(yield* git(cwd, ["branch", "--show-current"]), "feature/renamed");

        const refs = yield* driver.listRefs({ cwd });
        assert.equal(
          refs.refs.find((refName) => refName.name === "feature/renamed")?.current,
          true,
        );
      }),
    );

    it.effect("returns the existing refName when rename source and target match", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const current = yield* git(cwd, ["branch", "--show-current"]);
        const result = yield* driver.renameBranch({
          cwd,
          oldBranch: current,
          newBranch: current,
        });

        assert.equal(result.branch, current);
      }),
    );
  });

  describe("worktree operations", () => {
    it.effect("creates and removes a worktree for a new refName", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const { initialBranch } = yield* initRepoWithCommit(cwd);
        const pathService = yield* Path.Path;
        const worktreePath = pathService.join(
          yield* makeTmpDir("git-worktrees-"),
          "feature-worktree",
        );
        const driver = yield* GitVcsDriver.GitVcsDriver;

        const created = yield* driver.createWorktree({
          cwd,
          path: worktreePath,
          refName: initialBranch,
          newRefName: "feature/worktree",
        });

        assert.equal(created.worktree.path, worktreePath);
        assert.equal(created.worktree.refName, "feature/worktree");
        assert.equal(yield* git(worktreePath, ["branch", "--show-current"]), "feature/worktree");

        yield* driver.removeWorktree({ cwd, path: worktreePath });
        const fileSystem = yield* FileSystem.FileSystem;
        assert.equal(yield* fileSystem.exists(worktreePath), false);
      }),
    );
  });

  describe("commit context", () => {
    it.effect("stages selected files and commits only those files", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;

        yield* writeTextFile(cwd, "a.txt", "a\n");
        yield* writeTextFile(cwd, "b.txt", "b\n");

        const context = yield* driver.prepareCommitContext(cwd, ["a.txt"]);
        assert.include(context?.stagedSummary ?? "", "a.txt");
        assert.notInclude(context?.stagedSummary ?? "", "b.txt");

        const commit = yield* driver.commit(cwd, "Add a", "");
        assert.match(commit.commitSha, /^[a-f0-9]{40}$/);
        assert.equal(yield* git(cwd, ["log", "-1", "--pretty=%s"]), "Add a");

        const status = yield* git(cwd, ["status", "--porcelain"]);
        assert.include(status, "?? b.txt");
        assert.notInclude(status, "a.txt");
      }),
    );
  });

  describe("remote operations", () => {
    it.effect("pushes with upstream setup and skips when already up to date", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const remote = yield* makeTmpDir("git-remote-");
        yield* initRepoWithCommit(cwd);
        yield* git(remote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", remote]);
        yield* (yield* GitVcsDriver.GitVcsDriver).createRef({
          cwd,
          refName: "feature/push",
        });
        yield* (yield* GitVcsDriver.GitVcsDriver).switchRef({
          cwd,
          refName: "feature/push",
        });
        yield* writeTextFile(cwd, "feature.txt", "feature\n");
        yield* (yield* GitVcsDriver.GitVcsDriver).prepareCommitContext(cwd);
        yield* (yield* GitVcsDriver.GitVcsDriver).commit(cwd, "Add feature", "");

        const pushed = yield* (yield* GitVcsDriver.GitVcsDriver).pushCurrentBranch(cwd, null);
        assert.deepInclude(pushed, {
          status: "pushed",
          branch: "feature/push",
          setUpstream: true,
        });
        assert.equal(
          yield* git(cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"]),
          "origin/feature/push",
        );

        const skipped = yield* (yield* GitVcsDriver.GitVcsDriver).pushCurrentBranch(cwd, null);
        assert.deepInclude(skipped, {
          status: "skipped_up_to_date",
          branch: "feature/push",
        });
      }),
    );

    it.effect(
      "pushes upstream branches to the remote branch name, not the upstream shorthand",
      () =>
        Effect.gen(function* () {
          const cwd = yield* makeTmpDir();
          const remote = yield* makeTmpDir("git-remote-");
          yield* initRepoWithCommit(cwd);
          const driver = yield* GitVcsDriver.GitVcsDriver;
          yield* git(cwd, ["branch", "-M", "main"]);
          yield* git(remote, ["init", "--bare"]);
          yield* git(cwd, ["remote", "add", "origin", remote]);
          yield* git(cwd, ["push", "-u", "origin", "main"]);
          yield* writeTextFile(cwd, "upstream.txt", "upstream\n");
          yield* driver.prepareCommitContext(cwd);
          yield* driver.commit(cwd, "Add upstream update", "");

          const pushed = yield* driver.pushCurrentBranch(cwd, null);

          assert.deepInclude(pushed, {
            status: "pushed",
            branch: "main",
            upstreamBranch: "origin/main",
            setUpstream: false,
          });
          assert.equal(
            yield* git(remote, ["log", "-1", "--pretty=%s", "main"]),
            "Add upstream update",
          );
          const badBranch = yield* driver.execute({
            operation: "GitVcsDriver.test.showBadRemoteBranch",
            cwd: remote,
            args: ["show-ref", "--verify", "--quiet", "refs/heads/origin/main"],
            allowNonZeroExit: true,
            timeoutMs: 10_000,
          });
          assert.notEqual(badBranch.exitCode, 0);
        }),
    );

    it.effect("pushes to the requested remote instead of the primary remote", () =>
      Effect.gen(function* () {
        const cwd = yield* makeTmpDir();
        const originRemote = yield* makeTmpDir("git-origin-remote-");
        const publishRemote = yield* makeTmpDir("git-publish-remote-");
        yield* initRepoWithCommit(cwd);
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* git(cwd, ["branch", "-M", "main"]);
        yield* git(originRemote, ["init", "--bare"]);
        yield* git(publishRemote, ["init", "--bare"]);
        yield* git(cwd, ["remote", "add", "origin", originRemote]);
        yield* git(cwd, ["remote", "add", "origin-1", publishRemote]);

        const pushed = yield* driver.pushCurrentBranch(cwd, null, { remoteName: "origin-1" });

        assert.deepInclude(pushed, {
          status: "pushed",
          branch: "main",
          upstreamBranch: "origin-1/main",
          setUpstream: true,
        });
        assert.equal(
          yield* git(publishRemote, ["log", "-1", "--pretty=%s", "main"]),
          "initial commit",
        );
        const originMain = yield* driver.execute({
          operation: "GitVcsDriver.test.originMainMissing",
          cwd: originRemote,
          args: ["show-ref", "--verify", "--quiet", "refs/heads/main"],
          allowNonZeroExit: true,
          timeoutMs: 10_000,
        });
        assert.notEqual(originMain.exitCode, 0);
      }),
    );
  });
});
