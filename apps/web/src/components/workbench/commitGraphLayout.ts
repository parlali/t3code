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
}

const GENERATED_LANE_COLORS = ["#ffb000", "#dc267f", "#994f00", "#40b0a6", "#b66dff"] as const;

const HEAD_REF_COLOR = "#ec4899";
const LOCAL_REF_COLOR = "#3794ff";
const REMOTE_REF_COLOR = "#b180d7";
const BASE_REF_COLOR = "#ea5c00";
const TAG_REF_COLOR = "#cca700";
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

export function buildCommitGraphLayout(
  commits: readonly VcsCommitGraphCommit[],
): readonly CommitGraphRowLayout[] {
  let colorIndex = -1;
  const allocColor = () => {
    colorIndex = (colorIndex + 1) % GENERATED_LANE_COLORS.length;
    return GENERATED_LANE_COLORS[colorIndex] ?? GENERATED_LANE_COLORS[0];
  };
  const commitBySha = new Map(commits.map((commit) => [commit.sha, commit]));
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
    });
  }

  return rows;
}
