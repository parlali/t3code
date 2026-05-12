import { describe, expect, it } from "vitest";

import { getVisibleCommitGraphRefs } from "./commitGraphRefs";

describe("getVisibleCommitGraphRefs", () => {
  it("prioritizes current refs and hides symbolic remote heads", () => {
    const refs = getVisibleCommitGraphRefs([
      "HEAD -> main",
      "origin/main",
      "origin/HEAD",
      "upstream/main",
      "tag: v1.0.0",
    ]);

    expect(refs.badges.map((ref) => ref.label)).toEqual(["HEAD", "main", "origin/main"]);
    expect(refs.allLabels).not.toContain("origin/HEAD");
  });

  it("collapses lower-priority remote refs when better labels exist", () => {
    const refs = getVisibleCommitGraphRefs([
      "origin/feature/very-long-branch-name",
      "upstream/cursor/generated-topic",
      "release",
    ]);

    expect(refs.badges.map((ref) => ref.label)).toEqual(["release", "+2"]);
    expect(refs.badges.at(-1)?.title).toBe(
      "origin/feature/very-long-branch-name, upstream/cursor/generated-topic",
    );
  });

  it("still shows one remote label when that is the only context", () => {
    const refs = getVisibleCommitGraphRefs(["upstream/cursor/generated-topic"]);

    expect(refs.badges.map((ref) => ref.label)).toEqual(["upstream/cursor/generated-topic"]);
  });
});
