import type { ContextMenuItem, VcsCommitGraphCommit } from "@t3tools/contracts";
import { GitGraphIcon } from "lucide-react";
import { memo, useCallback, useMemo, type CSSProperties, type MouseEvent } from "react";

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
const CIRCLE_STROKE_WIDTH = 1.75;
const LABEL_GAP = 4;
const GRAPH_BACKGROUND = "hsl(var(--background))";
const GRAPH_ROW_STYLE = {
  height: ROW_HEIGHT,
  contentVisibility: "auto",
  containIntrinsicSize: `${ROW_HEIGHT}px`,
} satisfies CSSProperties;
const GRAPH_ROW_INNER_STYLE = { height: ROW_HEIGHT } satisfies CSSProperties;
const GRAPH_ROW_TEXT_STYLE = {
  height: ROW_HEIGHT,
  marginLeft: LABEL_GAP,
} satisfies CSSProperties;

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

function laneShiftPath(fromX: number, toX: number): string {
  if (fromX === toX) return verticalPath(fromX, 0, ROW_HEIGHT);

  const curveStartY = ROW_HEIGHT / 2 - SWIMLANE_CURVE_RADIUS;
  const curveEndY = ROW_HEIGHT / 2 + SWIMLANE_CURVE_RADIUS;
  return [
    `M ${fromX} 0`,
    `V ${curveStartY}`,
    `C ${fromX} ${ROW_HEIGHT / 2} ${toX} ${ROW_HEIGHT / 2} ${toX} ${curveEndY}`,
    `V ${ROW_HEIGHT}`,
  ].join(" ");
}

function laneToNodePath(fromX: number, nodeX: number): string {
  if (fromX === nodeX) return verticalPath(fromX, 0, ROW_HEIGHT / 2);

  const curveStartY = ROW_HEIGHT / 2 - SWIMLANE_CURVE_RADIUS;
  return [
    `M ${fromX} 0`,
    `V ${curveStartY}`,
    `C ${fromX} ${ROW_HEIGHT / 2} ${nodeX} ${ROW_HEIGHT / 2} ${nodeX} ${ROW_HEIGHT / 2}`,
  ].join(" ");
}

function nodeToLanePath(nodeX: number, laneXValue: number): string {
  if (nodeX === laneXValue) return verticalPath(nodeX, ROW_HEIGHT / 2, ROW_HEIGHT);

  const direction = Math.sign(laneXValue - nodeX) || 1;
  const controlDistance = Math.max(SWIMLANE_WIDTH * 0.75, Math.abs(laneXValue - nodeX) / 2);
  const firstControlX = nodeX + direction * controlDistance;
  return [
    `M ${nodeX} ${ROW_HEIGHT / 2}`,
    `C ${firstControlX} ${ROW_HEIGHT / 2} ${laneXValue} ${
      ROW_HEIGHT / 2 + SWIMLANE_CURVE_RADIUS
    } ${laneXValue} ${ROW_HEIGHT}`,
  ].join(" ");
}

function graphWidthForRow(row: CommitGraphRowLayout): number {
  return SWIMLANE_WIDTH * (Math.max(row.inputSwimlanes.length, row.outputSwimlanes.length, 1) + 1);
}

function buildGraphPaths(row: CommitGraphRowLayout): readonly GraphPath[] {
  const paths: GraphPath[] = [];
  const { commit, inputSwimlanes, outputSwimlanes } = row;
  const parents = uniqueParents(commit);
  const inputIndex = inputSwimlanes.findIndex((lane) => lane.id === commit.sha);
  const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;

  const outputIndexById = new Map<string, number>();
  for (let i = 0; i < outputSwimlanes.length; i++) {
    const id = outputSwimlanes[i]!.id;
    if (!outputIndexById.has(id)) {
      outputIndexById.set(id, i);
    }
  }

  for (let index = 0; index < inputSwimlanes.length; index++) {
    const lane = inputSwimlanes[index]!;

    if (lane.id === commit.sha) {
      if (index !== circleIndex) {
        paths.push({
          id: `current:${lane.id}:${index}:${circleIndex}`,
          color: lane.color,
          d: laneToNodePath(laneX(index), laneX(circleIndex)),
        });
      }
      continue;
    }

    const outputIdx = outputIndexById.get(lane.id);
    if (outputIdx === undefined) continue;

    if (index === outputIdx) {
      paths.push({
        id: `vertical:${lane.id}:${index}`,
        color: lane.color,
        d: verticalPath(laneX(index), 0, ROW_HEIGHT),
      });
    } else {
      paths.push({
        id: `shift:${lane.id}:${index}:${outputIdx}`,
        color: lane.color,
        d: laneShiftPath(laneX(index), laneX(outputIdx)),
      });
    }
  }

  for (let parentIndex = 1; parentIndex < parents.length; parentIndex++) {
    const parentId = parents[parentIndex]!;
    const parentOutputIndex = findLastLaneIndex(outputSwimlanes, parentId);
    if (parentOutputIndex === -1) continue;

    paths.push({
      id: `merge-parent:${commit.sha}:${parentId}:${parentOutputIndex}`,
      color: outputSwimlanes[parentOutputIndex]!.color,
      d: nodeToLanePath(laneX(circleIndex), laneX(parentOutputIndex)),
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
    const firstParentOutputIdx = outputIndexById.get(parents[0]!);
    const useCurve = firstParentOutputIdx !== undefined && firstParentOutputIdx !== circleIndex;
    paths.push({
      id: `from-node:${commit.sha}`,
      color: row.color,
      d: useCurve
        ? nodeToLanePath(laneX(circleIndex), laneX(firstParentOutputIdx))
        : verticalPath(laneX(circleIndex), ROW_HEIGHT / 2, ROW_HEIGHT),
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

function NodeCircle({
  cx,
  cy,
  radius,
  fill,
  stroke = GRAPH_BACKGROUND,
  strokeWidth = CIRCLE_STROKE_WIDTH,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly fill: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
}) {
  return (
    <circle cx={cx} cy={cy} r={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
  );
}

function RowGraph({ row }: { readonly row: CommitGraphRowLayout }) {
  const paths = buildGraphPaths(row);
  const cx = laneX(row.column);
  const cy = ROW_HEIGHT / 2;
  const width = graphWidthForRow(row);

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      className="block shrink-0 overflow-hidden"
      aria-hidden
    >
      {paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth={path.strokeWidth ?? 1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {row.kind === "head" ? (
        <>
          <NodeCircle cx={cx} cy={cy} radius={CIRCLE_RADIUS + 3} fill={row.color} />
          <NodeCircle
            cx={cx}
            cy={cy}
            radius={CIRCLE_STROKE_WIDTH}
            fill={GRAPH_BACKGROUND}
            stroke={GRAPH_BACKGROUND}
            strokeWidth={CIRCLE_RADIUS}
          />
        </>
      ) : row.isMerge ? (
        <>
          <NodeCircle
            cx={cx}
            cy={cy}
            radius={CIRCLE_RADIUS + 0.75}
            fill={GRAPH_BACKGROUND}
            stroke={row.color}
            strokeWidth={1.75}
          />
          <NodeCircle
            cx={cx}
            cy={cy}
            radius={1.35}
            fill={row.color}
            stroke={row.color}
            strokeWidth={0}
          />
        </>
      ) : (
        <NodeCircle
          cx={cx}
          cy={cy}
          radius={CIRCLE_RADIUS + 0.5}
          fill={row.color}
          strokeWidth={1.5}
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

interface CommitGraphRowProps {
  readonly row: CommitGraphRowLayout;
  readonly onCommitClick: (commit: VcsCommitGraphCommit, event: MouseEvent<HTMLElement>) => void;
  readonly onCommitContextMenu: (
    commit: VcsCommitGraphCommit,
    event: MouseEvent<HTMLElement>,
  ) => void;
}

const CommitGraphRow = memo(function CommitGraphRow({
  row,
  onCommitClick,
  onCommitContextMenu,
}: CommitGraphRowProps) {
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
      type="button"
      title={rowTitle}
      aria-label={`Commit ${row.commit.shortSha}: ${subject}`}
      className="flex w-full min-w-0 cursor-pointer items-center pl-2 pr-3 text-left hover:bg-accent/35 focus-visible:bg-accent/40 focus-visible:outline-none"
      style={GRAPH_ROW_STYLE}
      onClick={(event) => onCommitClick(row.commit, event)}
      onContextMenu={(event) => onCommitContextMenu(row.commit, event)}
    >
      <div className="flex shrink-0" style={GRAPH_ROW_INNER_STYLE}>
        <RowGraph row={row} />
      </div>
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
        style={GRAPH_ROW_TEXT_STYLE}
      >
        {refs.badges.map((item) => (
          <RefBadge key={`${item.variant}:${item.label}`} item={item} />
        ))}
        <span className="min-w-0 shrink truncate text-[12px] font-normal leading-[18px] text-foreground/90">
          {subject}
        </span>
        {row.commit.authorName.trim().length > 0 && (
          <span className="max-w-[5rem] shrink truncate text-[10px] leading-[18px] text-muted-foreground/50">
            {row.commit.authorName}
          </span>
        )}
      </div>
    </button>
  );
});

export const WorkbenchCommitGraph = memo(function WorkbenchCommitGraph({
  commits,
  error,
  isLoading = false,
  truncated = false,
}: WorkbenchCommitGraphProps) {
  const rows = useMemo(() => buildCommitGraphLayout(commits), [commits]);
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
        return (
          <CommitGraphRow
            key={row.commit.sha}
            row={row}
            onCommitClick={handleCommitClick}
            onCommitContextMenu={handleCommitContextMenu}
          />
        );
      })}
    </div>
  );
});
