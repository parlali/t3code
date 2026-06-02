import type { VcsStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { shouldShowPushAction } from "./sourceControlActions";

function status(overrides: Partial<VcsStatusResult> = {}): VcsStatusResult {
  return {
    isRepo: true,
    hasPrimaryRemote: true,
    isDefaultRef: false,
    refName: "feature/pushable",
    hasWorkingTreeChanges: false,
    workingTree: {
      files: [],
      insertions: 0,
      deletions: 0,
    },
    hasUpstream: true,
    aheadCount: 1,
    behindCount: 0,
    pr: null,
    ...overrides,
  };
}

describe("shouldShowPushAction", () => {
  it("shows push for an upstream branch with unpushed commits", () => {
    expect(shouldShowPushAction(status(), false)).toBe(true);
  });

  it("shows push for a branch with a primary remote before upstream is set", () => {
    expect(shouldShowPushAction(status({ hasUpstream: false }), false)).toBe(true);
  });

  it("hides push while status is refreshing", () => {
    expect(shouldShowPushAction(status(), true)).toBe(false);
  });

  it("hides push when a branch has no configured push target", () => {
    expect(
      shouldShowPushAction(status({ hasPrimaryRemote: false, hasUpstream: false }), false),
    ).toBe(false);
  });

  it("hides push when the branch is behind", () => {
    expect(shouldShowPushAction(status({ behindCount: 1 }), false)).toBe(false);
  });
});
