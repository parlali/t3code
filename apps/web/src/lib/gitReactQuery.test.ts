import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("../environmentApi", () => ({
  ensureEnvironmentApi: vi.fn(),
}));

vi.mock("../wsRpcClient", () => ({
  getWsRpcClient: vi.fn(),
  getWsRpcClientForEnvironment: vi.fn(),
}));

import type { InfiniteData } from "@tanstack/react-query";
import { EnvironmentId, type VcsListRefsResult } from "@t3tools/contracts";

import {
  gitBranchSearchInfiniteQueryOptions,
  gitCommitGraphQueryOptions,
  gitDiffQueryOptions,
  gitMutationKeys,
  gitPreparePullRequestThreadMutationOptions,
  gitPullMutationOptions,
  gitRunStackedActionMutationOptions,
  invalidateGitQueries,
} from "./gitReactQuery";

const BRANCH_QUERY_RESULT: VcsListRefsResult = {
  refs: [],
  isRepo: true,
  hasPrimaryRemote: true,
  nextCursor: null,
  totalCount: 0,
};

const BRANCH_SEARCH_RESULT: InfiniteData<VcsListRefsResult, number> = {
  pages: [BRANCH_QUERY_RESULT],
  pageParams: [0],
};
const ENVIRONMENT_A = EnvironmentId.make("environment-a");
const ENVIRONMENT_B = EnvironmentId.make("environment-b");

describe("gitMutationKeys", () => {
  it("scopes stacked action keys by cwd", () => {
    expect(gitMutationKeys.runStackedAction(ENVIRONMENT_A, "/repo/a")).not.toEqual(
      gitMutationKeys.runStackedAction(ENVIRONMENT_A, "/repo/b"),
    );
  });

  it("scopes pull keys by cwd", () => {
    expect(gitMutationKeys.pull(ENVIRONMENT_A, "/repo/a")).not.toEqual(
      gitMutationKeys.pull(ENVIRONMENT_A, "/repo/b"),
    );
  });

  it("scopes pull request thread preparation keys by cwd", () => {
    expect(gitMutationKeys.preparePullRequestThread(ENVIRONMENT_A, "/repo/a")).not.toEqual(
      gitMutationKeys.preparePullRequestThread(ENVIRONMENT_A, "/repo/b"),
    );
  });
});

describe("gitDiffQueryOptions", () => {
  it("forwards cwd and whitespace mode to the VCS API", async () => {
    const diff = vi.fn().mockResolvedValue({ diff: "patch" });
    const { ensureEnvironmentApi } = await import("../environmentApi");
    vi.mocked(ensureEnvironmentApi).mockReturnValue({
      vcs: {
        diff,
      },
    } as never);

    const queryClient = new QueryClient();
    await queryClient.fetchQuery(
      gitDiffQueryOptions({
        environmentId: ENVIRONMENT_A,
        cwd: "/repo/a",
        ignoreWhitespace: true,
      }),
    );

    expect(diff).toHaveBeenCalledWith({ cwd: "/repo/a", ignoreWhitespace: true });
  });
});

describe("gitCommitGraphQueryOptions", () => {
  it("forwards cwd and limit to the VCS API", async () => {
    const commitGraph = vi.fn().mockResolvedValue({ rows: [], isRepo: true, truncated: false });
    const { ensureEnvironmentApi } = await import("../environmentApi");
    vi.mocked(ensureEnvironmentApi).mockReturnValue({
      vcs: {
        commitGraph,
      },
    } as never);

    const queryClient = new QueryClient();
    await queryClient.fetchQuery(
      gitCommitGraphQueryOptions({
        environmentId: ENVIRONMENT_A,
        cwd: "/repo/a",
        limit: 50,
      }),
    );

    expect(commitGraph).toHaveBeenCalledWith({ cwd: "/repo/a", limit: 50 });
  });
});

describe("git mutation options", () => {
  const queryClient = new QueryClient();

  it("attaches cwd-scoped mutation key for runStackedAction", () => {
    const options = gitRunStackedActionMutationOptions({
      environmentId: ENVIRONMENT_A,
      cwd: "/repo/a",
      queryClient,
    });
    expect(options.mutationKey).toEqual(gitMutationKeys.runStackedAction(ENVIRONMENT_A, "/repo/a"));
  });

  it("attaches cwd-scoped mutation key for pull", () => {
    const options = gitPullMutationOptions({
      environmentId: ENVIRONMENT_A,
      cwd: "/repo/a",
      queryClient,
    });
    expect(options.mutationKey).toEqual(gitMutationKeys.pull(ENVIRONMENT_A, "/repo/a"));
  });

  it("attaches cwd-scoped mutation key for preparePullRequestThread", () => {
    const options = gitPreparePullRequestThreadMutationOptions({
      environmentId: ENVIRONMENT_A,
      cwd: "/repo/a",
      queryClient,
    });
    expect(options.mutationKey).toEqual(
      gitMutationKeys.preparePullRequestThread(ENVIRONMENT_A, "/repo/a"),
    );
  });
});

describe("invalidateGitQueries", () => {
  it("can invalidate a single cwd without blasting other git query scopes", async () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(
      gitBranchSearchInfiniteQueryOptions({
        environmentId: ENVIRONMENT_A,
        cwd: "/repo/a",
        query: "feature",
      }).queryKey,
      BRANCH_SEARCH_RESULT,
    );
    queryClient.setQueryData(
      gitBranchSearchInfiniteQueryOptions({
        environmentId: ENVIRONMENT_B,
        cwd: "/repo/b",
        query: "feature",
      }).queryKey,
      BRANCH_SEARCH_RESULT,
    );

    await invalidateGitQueries(queryClient, { environmentId: ENVIRONMENT_A, cwd: "/repo/a" });

    expect(
      queryClient.getQueryState(
        gitBranchSearchInfiniteQueryOptions({
          environmentId: ENVIRONMENT_A,
          cwd: "/repo/a",
          query: "feature",
        }).queryKey,
      )?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(
        gitBranchSearchInfiniteQueryOptions({
          environmentId: ENVIRONMENT_B,
          cwd: "/repo/b",
          query: "feature",
        }).queryKey,
      )?.isInvalidated,
    ).toBe(false);
  });
});
