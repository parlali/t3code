import { QueryClient } from "@tanstack/react-query";
import { EnvironmentId, type VcsStatusResult } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppAtomRegistryForTests } from "../rpc/atomRegistry";
import { getGitStatusSnapshot, resetGitStatusStateForTests } from "./gitStatusState";
import {
  buildVcsChangeSections,
  runVcsWorktreeAction,
  sourceStatForSection,
} from "./vcsWorktreeState";

const apiHarness = vi.hoisted(() => ({
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  revertFile: vi.fn(),
}));

vi.mock("../environmentApi", () => ({
  ensureEnvironmentApi: () => ({
    vcs: {
      stageFiles: apiHarness.stageFiles,
      unstageFiles: apiHarness.unstageFiles,
      revertFile: apiHarness.revertFile,
    },
  }),
}));

const ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const CWD = "/repo";
const BASE_STATUS: VcsStatusResult = {
  isRepo: true,
  hasPrimaryRemote: true,
  isDefaultRef: false,
  refName: "feature/worktree",
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
};

afterEach(() => {
  vi.clearAllMocks();
  resetGitStatusStateForTests();
  resetAppAtomRegistryForTests();
});

describe("vcsWorktreeState", () => {
  it("applies mutation result status as the authoritative snapshot", async () => {
    const queryClient = new QueryClient();
    const stagedStatus: VcsStatusResult = {
      ...BASE_STATUS,
      hasWorkingTreeChanges: true,
      workingTree: {
        files: [
          {
            path: "src/App.tsx",
            insertions: 1,
            deletions: 0,
            staged: true,
            unstaged: false,
          },
        ],
        insertions: 1,
        deletions: 0,
      },
    };
    apiHarness.stageFiles.mockResolvedValue(stagedStatus);

    const result = await runVcsWorktreeAction({
      environmentId: ENVIRONMENT_ID,
      cwd: CWD,
      queryClient,
      kind: "stage",
      paths: ["src/App.tsx", "src/App.tsx", ""],
    });

    expect(apiHarness.stageFiles).toHaveBeenCalledWith({
      cwd: CWD,
      relativePaths: ["src/App.tsx"],
    });
    expect(result).toBe(stagedStatus);
    expect(getGitStatusSnapshot({ environmentId: ENVIRONMENT_ID, cwd: CWD }).data).toBe(
      stagedStatus,
    );
  });

  it("queues rapid actions for the same worktree instead of dropping the later one", async () => {
    const queryClient = new QueryClient();
    const stagedStatus: VcsStatusResult = {
      ...BASE_STATUS,
      hasWorkingTreeChanges: true,
      workingTree: {
        files: [{ path: "src/App.tsx", insertions: 1, deletions: 0, staged: true }],
        insertions: 1,
        deletions: 0,
      },
    };
    const unstagedStatus: VcsStatusResult = {
      ...BASE_STATUS,
      hasWorkingTreeChanges: true,
      workingTree: {
        files: [{ path: "src/App.tsx", insertions: 1, deletions: 0, unstaged: true }],
        insertions: 1,
        deletions: 0,
      },
    };
    const revertedStatus: VcsStatusResult = BASE_STATUS;
    let resolveStage!: (status: VcsStatusResult) => void;
    let resolveUnstage!: (status: VcsStatusResult) => void;
    apiHarness.stageFiles.mockReturnValue(
      new Promise<VcsStatusResult>((resolve) => {
        resolveStage = resolve;
      }),
    );
    apiHarness.unstageFiles.mockReturnValue(
      new Promise<VcsStatusResult>((resolve) => {
        resolveUnstage = resolve;
      }),
    );
    apiHarness.revertFile.mockResolvedValue(revertedStatus);

    const first = runVcsWorktreeAction({
      environmentId: ENVIRONMENT_ID,
      cwd: CWD,
      queryClient,
      kind: "stage",
      paths: ["src/App.tsx"],
    });
    const second = runVcsWorktreeAction({
      environmentId: ENVIRONMENT_ID,
      cwd: CWD,
      queryClient,
      kind: "unstage",
      paths: ["src/App.tsx"],
    });

    expect(apiHarness.stageFiles).toHaveBeenCalledTimes(1);
    expect(apiHarness.unstageFiles).not.toHaveBeenCalled();
    resolveStage(stagedStatus);

    await expect(first).resolves.toBe(stagedStatus);
    expect(apiHarness.unstageFiles).toHaveBeenCalledTimes(1);
    const third = runVcsWorktreeAction({
      environmentId: ENVIRONMENT_ID,
      cwd: CWD,
      queryClient,
      kind: "revert",
      paths: ["src/App.tsx"],
    });
    expect(apiHarness.revertFile).not.toHaveBeenCalled();

    resolveUnstage(unstagedStatus);
    await expect(second).resolves.toBe(unstagedStatus);
    await expect(third).resolves.toBe(revertedStatus);
    expect(apiHarness.unstageFiles).toHaveBeenCalledWith({
      cwd: CWD,
      relativePaths: ["src/App.tsx"],
    });
    expect(apiHarness.revertFile).toHaveBeenCalledWith({
      cwd: CWD,
      relativePath: "src/App.tsx",
    });
    expect(getGitStatusSnapshot({ environmentId: ENVIRONMENT_ID, cwd: CWD }).data).toBe(
      revertedStatus,
    );
  });

  it("uses source-specific stats for files that are both staged and unstaged", () => {
    const sections = buildVcsChangeSections([
      {
        path: "partial.ts",
        insertions: 5,
        deletions: 1,
        staged: true,
        unstaged: true,
        stagedInsertions: 2,
        stagedDeletions: 0,
        unstagedInsertions: 3,
        unstagedDeletions: 1,
      },
    ]);

    const staged = sections.find((section) => section.id === "staged");
    const changes = sections.find((section) => section.id === "changes");

    expect(staged?.files).toHaveLength(1);
    expect(changes?.files).toHaveLength(1);
    expect(sourceStatForSection(staged!.files[0]!, "staged")).toEqual({
      insertions: 2,
      deletions: 0,
    });
    expect(sourceStatForSection(changes!.files[0]!, "changes")).toEqual({
      insertions: 3,
      deletions: 1,
    });
  });
});
