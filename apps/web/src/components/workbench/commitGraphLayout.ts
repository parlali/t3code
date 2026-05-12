import type { VcsCommitGraphCommit } from "@t3tools/contracts";

export type CommitGraphRowKind = "head" | "node";

export interface CommitGraphSwimlane {
  readonly id: string;
  readonly color: string;
}

export interface CommitGraphRowLayout {
  readonly commit: VcsCommitGraphCommit;
  readonly inputSwimlanes: readonly CommitGraphSwimlane[];
  readonly outputSwimlanes: readonly CommitGraphSwimlane[];
  readonly column: number;
  readonly color: string;
  readonly kind: CommitGraphRowKind;
  readonly isMerge: boolean;
  readonly isBranchPoint: boolean;
  readonly laneCount: number;
}

const GENERATED_LANE_COLORS = [
  "#ec4899",
  "#3b82f6",
  "#a855f7",
  "#facc15",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#22c55e",
  "#eab308",
  "#8b5cf6",
] as const;

const HEAD_REF_COLOR = "#ec4899";
const LOCAL_REF_COLOR = "#3b82f6";
const REMOTE_REF_COLOR = "#a855f7";
const BASE_REF_COLOR = "#f97316";
const TAG_REF_COLOR = "#facc15";
const DEFAULT_BRANCH_NAMES = new Set(["main", "master", "trunk", "develop"]);

function copySwimlane(lane: CommitGraphSwimlane): CommitGraphSwimlane {
  return {
    id: lane.id,
    color: lane.color,
  };
}

function uniqueValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function isHeadRef(ref: string): boolean {
  return ref === "HEAD" || ref.startsWith("HEAD -> ");
}

function refTarget(ref: string): string {
  return ref.startsWith("HEAD -> ") ? ref.slice("HEAD -> ".length).trim() : ref;
}

function remoteBranchName(ref: string): string | null {
  const target = refTarget(ref);
  const separatorIndex = target.indexOf("/");
  if (separatorIndex === -1) return null;
  const branchName = target.slice(separatorIndex + 1).trim();
  return branchName.length > 0 ? branchName : null;
}

function refColor(refs: readonly string[]): string | null {
  const filteredRefs = refs.filter(
    (ref) => ref.length > 0 && !ref.includes("refs/t3/checkpoints/"),
  );
  if (filteredRefs.some(isHeadRef)) {
    return HEAD_REF_COLOR;
  }
  if (filteredRefs.some((ref) => ref.startsWith("tag: "))) {
    return TAG_REF_COLOR;
  }
  if (filteredRefs.some((ref) => !refTarget(ref).includes("/"))) {
    return LOCAL_REF_COLOR;
  }
  if (
    filteredRefs.some((ref) => {
      const branchName = remoteBranchName(ref);
      return branchName !== null && DEFAULT_BRANCH_NAMES.has(branchName);
    })
  ) {
    return BASE_REF_COLOR;
  }
  if (filteredRefs.some((ref) => refTarget(ref).includes("/"))) {
    return REMOTE_REF_COLOR;
  }
  return null;
}

function compactSwimlanes(swimlanes: readonly CommitGraphSwimlane[]): CommitGraphSwimlane[] {
  const seen = new Set<string>();
  const compacted: CommitGraphSwimlane[] = [];
  for (const lane of swimlanes) {
    if (seen.has(lane.id)) continue;
    seen.add(lane.id);
    compacted.push(copySwimlane(lane));
  }
  return compacted;
}

function childCountsByCommit(commits: readonly VcsCommitGraphCommit[]): Map<string, number> {
  const childCounts = new Map<string, number>();
  for (const commit of commits) {
    for (const parentId of uniqueValues(commit.parents)) {
      childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
    }
  }
  return childCounts;
}

export function buildCommitGraphLayout(
  commits: readonly VcsCommitGraphCommit[],
): readonly CommitGraphRowLayout[] {
  let colorIndex = -1;
  const allocColor = () => {
    colorIndex = (colorIndex + 1) % GENERATED_LANE_COLORS.length;
    return GENERATED_LANE_COLORS[colorIndex] ?? GENERATED_LANE_COLORS[0];
  };
  const commitBySha = new Map(commits.map((commit) => [commit.sha, commit]));
  const childCounts = childCountsByCommit(commits);
  const rows: CommitGraphRowLayout[] = [];

  for (const commit of commits) {
    const parents = uniqueValues(commit.parents);
    const previousOutputSwimlanes = rows.at(-1)?.outputSwimlanes ?? [];
    const inputSwimlanes = compactSwimlanes(previousOutputSwimlanes);
    const outputSwimlanes: CommitGraphSwimlane[] = [];
    let firstParentAdded = false;

    if (parents.length > 0) {
      for (const lane of inputSwimlanes) {
        if (lane.id === commit.sha) {
          if (!firstParentAdded) {
            outputSwimlanes.push({
              id: parents[0]!,
              color: refColor(commit.refs) ?? lane.color,
            });
            firstParentAdded = true;
          }
          continue;
        }
        outputSwimlanes.push(copySwimlane(lane));
      }
    }

    for (let parentIndex = firstParentAdded ? 1 : 0; parentIndex < parents.length; parentIndex++) {
      const parentId = parents[parentIndex]!;
      const parentCommit = commitBySha.get(parentId);
      outputSwimlanes.push({
        id: parentId,
        color:
          parentIndex === 0
            ? (refColor(commit.refs) ?? allocColor())
            : (refColor(parentCommit?.refs ?? []) ?? allocColor()),
      });
    }

    const compactedOutputSwimlanes = compactSwimlanes(outputSwimlanes);
    const inputIndex = inputSwimlanes.findIndex((lane) => lane.id === commit.sha);
    const column = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
    const color =
      compactedOutputSwimlanes[column]?.color ??
      inputSwimlanes[column]?.color ??
      refColor(commit.refs) ??
      allocColor();

    rows.push({
      commit,
      inputSwimlanes,
      outputSwimlanes: compactedOutputSwimlanes,
      column,
      color,
      kind: commit.refs.some(isHeadRef) ? "head" : "node",
      isMerge: parents.length > 1,
      isBranchPoint: (childCounts.get(commit.sha) ?? 0) > 1,
      laneCount: Math.max(inputSwimlanes.length, compactedOutputSwimlanes.length, column + 1),
    });
  }

  return rows;
}
