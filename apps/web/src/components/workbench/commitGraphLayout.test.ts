import { describe, expect, it } from "vitest";

import type { VcsCommitGraphCommit } from "@t3tools/contracts";
import { buildCommitGraphLayout } from "./commitGraphLayout";

function makeCommit(
  sha: string,
  parents: readonly string[],
  partial: Partial<VcsCommitGraphCommit> = {},
): VcsCommitGraphCommit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    subject: partial.subject ?? `commit ${sha}`,
    authorName: partial.authorName ?? "tester",
    relativeTime: partial.relativeTime ?? "now",
    refs: partial.refs ?? [],
  };
}

describe("buildCommitGraphLayout", () => {
  it("returns an empty layout for no commits", () => {
    expect(buildCommitGraphLayout([])).toEqual([]);
  });

  it("places a linear history in a single column", () => {
    const rows = buildCommitGraphLayout([
      makeCommit("a", ["b"]),
      makeCommit("b", ["c"]),
      makeCommit("c", []),
    ]);
    expect(rows.map((r) => r.column)).toEqual([0, 0, 0]);
    expect(rows[1]!.inputSwimlanes.map((lane) => lane.id)).toEqual(["b"]);
    expect(rows[1]!.outputSwimlanes.map((lane) => lane.id)).toEqual(["c"]);
    expect(rows[2]!.inputSwimlanes.map((lane) => lane.id)).toEqual(["c"]);
    expect(rows[2]!.outputSwimlanes).toEqual([]);
  });

  it("connects linear commits with edges through every row", () => {
    const rows = buildCommitGraphLayout([
      makeCommit("a", ["b"]),
      makeCommit("b", ["c"]),
      makeCommit("c", ["d"]),
      makeCommit("d", []),
    ]);
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i]!.outputSwimlanes.length).toBeGreaterThan(0);
      expect(rows[i + 1]!.inputSwimlanes.length).toBeGreaterThan(0);
    }
  });

  it("branches a new lane for the second parent of a merge", () => {
    const rows = buildCommitGraphLayout([
      makeCommit("a", ["b"]),
      makeCommit("b", ["c", "d"]),
      makeCommit("c", ["e"]),
      makeCommit("d", ["e"]),
      makeCommit("e", []),
    ]);
    const merge = rows[1]!;
    expect(merge.column).toBe(0);
    expect(merge.isMerge).toBe(true);
    expect(merge.outputSwimlanes.map((lane) => lane.id)).toEqual(["c", "d"]);
    const convergence = rows[4]!;
    expect(convergence.inputSwimlanes.map((lane) => lane.id)).toContain("e");
  });

  it("inserts merge side parents next to the merge lane before trailing lanes", () => {
    const rows = buildCommitGraphLayout([
      makeCommit("a", ["b"]),
      makeCommit("x", ["y"]),
      makeCommit("b", ["c", "d"]),
      makeCommit("y", []),
      makeCommit("c", []),
      makeCommit("d", []),
    ]);
    const merge = rows[2]!;

    expect(merge.column).toBe(0);
    expect(merge.outputSwimlanes[1]?.id).toBe("d");
  });

  it("allocates a fresh column for a disconnected branch tip", () => {
    const rows = buildCommitGraphLayout([
      makeCommit("a", ["c"]),
      makeCommit("b", ["c"]),
      makeCommit("c", []),
    ]);
    expect(rows[0]!.column).toBe(0);
    expect(rows[1]!.column).toBe(1);
    expect(rows[2]!.column).toBe(0);
  });

  it("dedupes duplicate parents", () => {
    const rows = buildCommitGraphLayout([makeCommit("a", ["b", "b"]), makeCommit("b", [])]);
    expect(rows[0]!.outputSwimlanes.map((lane) => lane.id)).toEqual(["b"]);
  });

  it("handles orphan commits without crashing", () => {
    const rows = buildCommitGraphLayout([makeCommit("a", []), makeCommit("b", [])]);
    expect(rows.length).toBe(2);
    expect(rows[0]!.column).toBe(0);
    expect(rows[1]!.column).toBe(0);
  });
});
