export type CommitGraphRefVariant = "head" | "branch" | "remote" | "tag" | "more";

export interface CommitGraphRefBadge {
  readonly label: string;
  readonly variant: CommitGraphRefVariant;
  readonly title?: string;
}

export interface CommitGraphVisibleRefs {
  readonly badges: readonly CommitGraphRefBadge[];
  readonly allLabels: readonly string[];
}

interface ParsedRef {
  readonly label: string;
  readonly variant: Exclude<CommitGraphRefVariant, "more">;
  readonly priority: number;
  readonly index: number;
}

const MAX_VISIBLE_REFS = 3;
const DEFAULT_BRANCH_NAMES = new Set(["main", "master", "trunk", "develop"]);

function remoteBranchName(ref: string): string | null {
  const separatorIndex = ref.indexOf("/");
  if (separatorIndex === -1) return null;
  const branchName = ref.slice(separatorIndex + 1).trim();
  return branchName.length > 0 ? branchName : null;
}

function refPriority(label: string, variant: ParsedRef["variant"]): number {
  if (variant === "head") return 0;
  if (variant === "branch") return 1;
  const branchName = remoteBranchName(label);
  if (variant === "remote" && branchName && DEFAULT_BRANCH_NAMES.has(branchName)) return 2;
  if (variant === "tag") return 3;
  return 8;
}

function parseSingleRef(ref: string, index: number): readonly ParsedRef[] {
  if (ref.length === 0) return [];
  if (ref.includes("refs/t3/checkpoints/")) return [];
  if (ref.endsWith("/HEAD")) return [];

  if (ref.startsWith("HEAD -> ")) {
    const target = ref.slice("HEAD -> ".length).trim();
    const targetVariant = target.includes("/") ? "remote" : "branch";
    return [
      { label: "HEAD", variant: "head", priority: 0, index },
      {
        label: target,
        variant: targetVariant,
        priority: refPriority(target, targetVariant),
        index: index + 0.1,
      },
    ];
  }

  if (ref === "HEAD") {
    return [{ label: "HEAD", variant: "head", priority: 0, index }];
  }

  if (ref.startsWith("tag: ")) {
    const label = ref.slice("tag: ".length).trim();
    return label.length > 0 ? [{ label, variant: "tag", priority: 2, index }] : [];
  }

  const variant = ref.includes("/") ? "remote" : "branch";
  return [{ label: ref, variant, priority: refPriority(ref, variant), index }];
}

export function getVisibleCommitGraphRefs(refs: readonly string[]): CommitGraphVisibleRefs {
  const parsed = refs.flatMap((raw, index) => parseSingleRef(raw.trim(), index));
  const deduped = parsed.filter(
    (ref, index) => parsed.findIndex((candidate) => candidate.label === ref.label) === index,
  );
  const sorted = deduped.toSorted((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.index - right.index;
  });
  const preferred = sorted.filter((ref) => ref.priority < 8).slice(0, MAX_VISIBLE_REFS);
  const visible = preferred.length > 0 ? preferred : sorted.slice(0, 1);
  const visibleLabels = new Set(visible.map((ref) => ref.label));
  const hidden = sorted.filter((ref) => !visibleLabels.has(ref.label));

  return {
    badges: [
      ...visible.map((ref) => ({
        label: ref.label,
        variant: ref.variant,
      })),
      ...(hidden.length > 0 && visible.length < MAX_VISIBLE_REFS
        ? [
            {
              label: `+${hidden.length}`,
              variant: "more" as const,
              title: hidden.map((ref) => ref.label).join(", "),
            },
          ]
        : []),
    ],
    allLabels: sorted.map((ref) => ref.label),
  };
}
