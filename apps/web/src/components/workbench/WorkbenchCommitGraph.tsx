import type { ContextMenuItem, VcsCommitGraphCommit } from "@t3tools/contracts";
import { GitGraphIcon } from "lucide-react";
import { memo, useCallback, useMemo, type MouseEvent } from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import {
  buildCommitGraphLayout,
  type CommitGraphRowLayout,
  type CommitGraphSwimlane,
} from "./commitGraphLayout";
import { getVisibleCommitGraphRefs, type CommitGraphRefBadge } from "./commitGraphRefs";

const ROW_HEIGHT = 22;
const SWIMLANE_WIDTH = 11;
const SWIMLANE_CURVE_RADIUS = 5;
const CIRCLE_RADIUS = 4;
const CIRCLE_STROKE_WIDTH = 2;
const TEXT_GAP = 8;
const GRAPH_LEFT_OFFSET = 2;
const GRAPH_BACKGROUND = "hsl(var(--background))";

type CommitGraphAction = "copy-hash" | "copy-short-hash" | "open-github";

interface GraphPath {
  readonly id: string;
  readonly d: string;
  readonly color: string;
  readonly strokeWidth?: number;
}

function uniqueParents(commit: VcsCommitGraphCommit): readonly string[] {
  const seen = new Set<string>();
  const parents: string[] = [];
  for (const parent of commit.parents) {
    if (seen.has(parent)) continue;
    seen.add(parent);
    parents.push(parent);
  }
  return parents;
}

function findLastLaneIndex(lanes: readonly CommitGraphSwimlane[], id: string): number {
  for (let index = lanes.length - 1; index >= 0; index--) {
    if (lanes[index]?.id === id) {
      return index;
    }
  }
  return -1;
}

function laneX(index: number): number {
  return SWIMLANE_WIDTH * (index + 1);
}

function verticalPath(x: number, y1: number, y2: number): string {
  return `M ${x} ${y1} V ${y2}`;
}

function buildGraphPaths(row: CommitGraphRowLayout): readonly GraphPath[] {
  const paths: GraphPath[] = [];
  const { commit, inputSwimlanes, outputSwimlanes } = row;
  const parents = uniqueParents(commit);
  const inputIndex = inputSwimlanes.findIndex((lane) => lane.id === commit.sha);
  const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;
  let outputSwimlaneIndex = 0;

  for (let index = 0; index < inputSwimlanes.length; index++) {
    const lane = inputSwimlanes[index]!;

    if (lane.id === commit.sha) {
      if (index !== circleIndex) {
        paths.push({
          id: `current:${lane.id}:${index}:${circleIndex}`,
          color: lane.color,
          d: [
            `M ${laneX(index)} 0`,
            `A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * index} ${
              ROW_HEIGHT / 2
            }`,
            `H ${laneX(circleIndex)}`,
          ].join(" "),
        });
      } else {
        outputSwimlaneIndex++;
      }
      continue;
    }

    const outputLane = outputSwimlanes[outputSwimlaneIndex];
    if (!outputLane || lane.id !== outputLane.id) {
      continue;
    }

    if (index === outputSwimlaneIndex) {
      paths.push({
        id: `vertical:${lane.id}:${index}`,
        color: lane.color,
        d: verticalPath(laneX(index), 0, ROW_HEIGHT),
      });
    } else {
      paths.push({
        id: `shift:${lane.id}:${index}:${outputSwimlaneIndex}`,
        color: lane.color,
        d: [
          `M ${laneX(index)} 0`,
          "V 6",
          `A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 1 ${
            laneX(index) - SWIMLANE_CURVE_RADIUS
          } ${ROW_HEIGHT / 2}`,
          `H ${laneX(outputSwimlaneIndex) + SWIMLANE_CURVE_RADIUS}`,
          `A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${laneX(
            outputSwimlaneIndex,
          )} ${ROW_HEIGHT / 2 + SWIMLANE_CURVE_RADIUS}`,
          `V ${ROW_HEIGHT}`,
        ].join(" "),
      });
    }
    outputSwimlaneIndex++;
  }

  for (let parentIndex = 1; parentIndex < parents.length; parentIndex++) {
    const parentId = parents[parentIndex]!;
    const parentOutputIndex = findLastLaneIndex(outputSwimlanes, parentId);
    if (parentOutputIndex === -1) continue;

    paths.push({
      id: `merge-parent:${commit.sha}:${parentId}:${parentOutputIndex}`,
      color: outputSwimlanes[parentOutputIndex]!.color,
      d: [
        `M ${SWIMLANE_WIDTH * parentOutputIndex} ${ROW_HEIGHT / 2}`,
        `A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${laneX(parentOutputIndex)} ${ROW_HEIGHT}`,
        `M ${SWIMLANE_WIDTH * parentOutputIndex} ${ROW_HEIGHT / 2}`,
        `H ${laneX(circleIndex)}`,
      ].join(" "),
    });
  }

  if (inputIndex !== -1) {
    paths.push({
      id: `to-node:${commit.sha}`,
      color: inputSwimlanes[inputIndex]!.color,
      d: verticalPath(laneX(circleIndex), 0, ROW_HEIGHT / 2),
    });
  }

  if (parents.length > 0) {
    paths.push({
      id: `from-node:${commit.sha}`,
      color: row.color,
      d: verticalPath(laneX(circleIndex), ROW_HEIGHT / 2, ROW_HEIGHT),
    });
  }

  return paths;
}

function RefBadge({ item }: { readonly item: CommitGraphRefBadge }) {
  const variantClass =
    item.variant === "head"
      ? "border-pink-500/40 bg-pink-500/15 text-pink-700 dark:text-pink-300"
      : item.variant === "tag"
        ? "border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : item.variant === "remote"
          ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
          : item.variant === "branch"
            ? "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300"
            : "border-border bg-muted text-muted-foreground";
  return (
    <span
      title={item.title ?? item.label}
      className={cn(
        "inline-flex h-4 max-w-[6.5rem] shrink-0 items-center truncate rounded-[3px] border px-1 font-mono text-[10px] leading-none",
        variantClass,
      )}
    >
      {item.label}
    </span>
  );
}

interface RowGraphProps {
  readonly row: CommitGraphRowLayout;
  readonly width: number;
}

function BranchDiamond({
  color,
  cx,
  cy,
  size,
}: {
  readonly color: string;
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
}) {
  return (
    <path
      d={`M ${cx} ${cy - size} L ${cx + size} ${cy} L ${cx} ${cy + size} L ${cx - size} ${cy} Z`}
      fill={color}
      stroke={GRAPH_BACKGROUND}
      strokeWidth={1}
    />
  );
}

function RowGraph({ row, width }: RowGraphProps) {
  const paths = buildGraphPaths(row);
  const cx = laneX(row.column);
  const cy = ROW_HEIGHT / 2;

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      {paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth={path.strokeWidth ?? 1.45}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {row.kind === "head" ? (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_RADIUS + 3}
            fill={GRAPH_BACKGROUND}
            stroke={row.color}
            strokeWidth={CIRCLE_STROKE_WIDTH}
          />
          <circle cx={cx} cy={cy} r={CIRCLE_RADIUS - 1} fill={row.color} />
        </>
      ) : row.isMerge ? (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_RADIUS + 2}
            fill={GRAPH_BACKGROUND}
            stroke={row.color}
            strokeWidth={CIRCLE_STROKE_WIDTH}
          />
          {row.isBranchPoint ? (
            <BranchDiamond color={row.color} cx={cx} cy={cy} size={CIRCLE_RADIUS - 1} />
          ) : (
            <circle cx={cx} cy={cy} r={CIRCLE_RADIUS - 1} fill={row.color} />
          )}
        </>
      ) : row.isBranchPoint ? (
        <BranchDiamond color={row.color} cx={cx} cy={cy} size={CIRCLE_RADIUS + 1} />
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r={CIRCLE_RADIUS + 1}
          fill={row.color}
          stroke={row.color}
          strokeWidth={CIRCLE_STROKE_WIDTH}
        />
      )}
    </svg>
  );
}

interface WorkbenchCommitGraphProps {
  readonly commits: readonly VcsCommitGraphCommit[];
  readonly error: Error | null;
  readonly isLoading?: boolean;
  readonly truncated?: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
}

function commitActionItems(
  commit: VcsCommitGraphCommit,
): readonly ContextMenuItem<CommitGraphAction>[] {
  return [
    { id: "copy-hash", label: "Copy Commit Hash" },
    { id: "copy-short-hash", label: "Copy Short Hash" },
    {
      id: "open-github",
      label: "Open on GitHub",
      disabled: !commit.commitUrl,
    },
  ];
}

function menuPositionFromEvent(event: MouseEvent<HTMLElement>): {
  readonly x: number;
  readonly y: number;
} {
  if (event.clientX !== 0 || event.clientY !== 0) {
    return { x: event.clientX, y: event.clientY };
  }
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + 16, y: rect.top + rect.height / 2 };
}

export const WorkbenchCommitGraph = memo(function WorkbenchCommitGraph({
  commits,
  error,
  isLoading = false,
  truncated = false,
}: WorkbenchCommitGraphProps) {
  const rows = useMemo(() => buildCommitGraphLayout(commits), [commits]);
  const graphWidth = useMemo(
    () => SWIMLANE_WIDTH * (Math.max(1, ...rows.map((row) => row.laneCount)) + 1),
    [rows],
  );
  const textOffset = graphWidth + TEXT_GAP;
  const { copyToClipboard } = useCopyToClipboard<{ readonly action: CommitGraphAction }>();

  const showCommitActions = useCallback(
    async (commit: VcsCommitGraphCommit, position: { readonly x: number; readonly y: number }) => {
      const api = readLocalApi();
      const action = await api?.contextMenu.show(commitActionItems(commit), position);
      if (!action) return;

      if (action === "copy-hash") {
        copyToClipboard(commit.sha, { action });
        return;
      }

      if (action === "copy-short-hash") {
        copyToClipboard(commit.shortSha, { action });
        return;
      }

      if (action === "open-github" && commit.commitUrl) {
        try {
          await api?.shell.openExternal(commit.commitUrl);
        } catch (error) {
          console.error(error);
        }
      }
    },
    [copyToClipboard],
  );

  const handleCommitClick = useCallback(
    (commit: VcsCommitGraphCommit, event: MouseEvent<HTMLElement>) => {
      void showCommitActions(commit, menuPositionFromEvent(event));
    },
    [showCommitActions],
  );

  const handleCommitContextMenu = useCallback(
    (commit: VcsCommitGraphCommit, event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      void showCommitActions(commit, menuPositionFromEvent(event));
    },
    [showCommitActions],
  );

  if (error) {
    return (
      <div className="px-3 py-6 text-center text-xs text-destructive">{getErrorMessage(error)}</div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-3 py-6 text-center text-xs text-muted-foreground">
        <GitGraphIcon className="size-4 opacity-70" />
        {isLoading ? "Loading history..." : "No commits yet."}
      </div>
    );
  }

  return (
    <div className="min-w-0 py-1">
      {truncated && (
        <div className="px-3 pb-1 text-[11px] text-muted-foreground">
          Showing the most recent commits.
        </div>
      )}
      {rows.map((row) => {
        const refs = getVisibleCommitGraphRefs(row.commit.refs);
        const subject = row.commit.subject || row.commit.shortSha;
        const rowTitle = [
          row.commit.shortSha,
          subject,
          row.commit.authorName,
          row.commit.relativeTime,
          refs.allLabels.length > 0 ? refs.allLabels.join(", ") : null,
        ]
          .filter(Boolean)
          .join(" - ");

        return (
          <button
            key={row.commit.sha}
            type="button"
            title={rowTitle}
            aria-label={`Commit ${row.commit.shortSha}: ${subject}`}
            className="relative block w-full min-w-0 cursor-pointer px-2 pr-3 text-left hover:bg-accent/35 focus-visible:bg-accent/40 focus-visible:outline-none"
            style={{
              height: ROW_HEIGHT,
            }}
            onClick={(event) => handleCommitClick(row.commit, event)}
            onContextMenu={(event) => handleCommitContextMenu(row.commit, event)}
          >
            <div className="absolute top-0" style={{ left: GRAPH_LEFT_OFFSET }}>
              <RowGraph row={row} width={graphWidth} />
            </div>
            <div
              className="flex min-w-0 items-center gap-1.5 overflow-hidden"
              style={{ height: ROW_HEIGHT, marginLeft: textOffset }}
            >
              {refs.badges.map((item) => (
                <RefBadge key={`${item.variant}:${item.label}`} item={item} />
              ))}
              <span className="min-w-0 truncate text-xs font-medium text-foreground/90">
                {subject}
              </span>
              {row.commit.authorName.trim().length > 0 && (
                <span className="max-w-[36%] shrink-0 truncate text-[11px] text-muted-foreground/70">
                  {row.commit.authorName}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});
