import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, VcsStatusResult } from "@t3tools/contracts";
import type { QueryClient } from "@tanstack/react-query";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useMemo } from "react";

import { ensureEnvironmentApi } from "../environmentApi";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { gitQueryKeys } from "./gitReactQuery";
import { applyGitStatusSnapshot, refreshGitStatus, useGitStatus } from "./gitStatusState";
import { invalidateProjectQueries } from "./projectReactQuery";

export type VcsWorktreeActionKind = "stage" | "unstage" | "revert";
export type VcsChangeSectionId = "conflicts" | "staged" | "changes" | "untracked";
export type VcsChangeFile = VcsStatusResult["workingTree"]["files"][number];

export interface VcsChangeSection {
  readonly id: VcsChangeSectionId;
  readonly label: string;
  readonly files: readonly VcsChangeFile[];
  readonly action?: "stage" | "unstage" | undefined;
}

export interface VcsWorktreeActionState {
  readonly kind: VcsWorktreeActionKind | null;
  readonly paths: readonly string[];
  readonly error: string | null;
}

interface VcsWorktreeTarget {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
}

interface RunVcsWorktreeActionInput extends VcsWorktreeTarget {
  readonly queryClient: QueryClient;
  readonly kind: VcsWorktreeActionKind;
  readonly paths: readonly string[];
}

const EMPTY_ACTION_STATE = Object.freeze<VcsWorktreeActionState>({
  kind: null,
  paths: Object.freeze([]),
  error: null,
});
const EMPTY_ACTION_STATE_ATOM = Atom.make(EMPTY_ACTION_STATE).pipe(
  Atom.keepAlive,
  Atom.withLabel("vcs-worktree:null"),
);
const EMPTY_FILES: readonly VcsChangeFile[] = Object.freeze([]);
const activeOperations = new Map<string, Promise<VcsStatusResult | null>>();

const vcsWorktreeActionStateAtom = Atom.family((key: string) =>
  Atom.make(EMPTY_ACTION_STATE).pipe(Atom.keepAlive, Atom.withLabel(`vcs-worktree:${key}`)),
);

function getTargetKey(target: VcsWorktreeTarget): string | null {
  if (target.environmentId === null || target.cwd === null) return null;
  return `${target.environmentId}:${target.cwd}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
}

function uniqueNonEmptyPaths(paths: readonly string[]): string[] {
  return Array.from(new Set(paths.filter((path) => path.length > 0)));
}

function setActionState(targetKey: string, state: VcsWorktreeActionState): void {
  appAtomRegistry.set(vcsWorktreeActionStateAtom(targetKey), state);
}

function invalidateWorktreeQueries(input: {
  readonly queryClient: QueryClient;
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly includeProjectEntries?: boolean | undefined;
}): void {
  void Promise.all([
    input.queryClient.invalidateQueries({
      queryKey: gitQueryKeys.diffScope(input.environmentId, input.cwd),
    }),
    input.queryClient.invalidateQueries({
      queryKey: gitQueryKeys.fileDiffScope(input.environmentId, input.cwd),
    }),
    ...(input.includeProjectEntries
      ? [
          invalidateProjectQueries(input.queryClient, {
            environmentId: input.environmentId,
            cwd: input.cwd,
          }),
        ]
      : []),
  ]).catch(() => undefined);
}

export function sectionFiles(
  files: readonly VcsChangeFile[],
  section: VcsChangeSectionId,
): readonly VcsChangeFile[] {
  if (section === "conflicts") return files.filter((file) => file.conflicted === true);
  if (section === "staged") {
    return files.filter((file) => file.staged === true && file.conflicted !== true);
  }
  if (section === "untracked") {
    return files.filter((file) => file.untracked === true && file.conflicted !== true);
  }
  return files.filter(
    (file) =>
      file.conflicted !== true &&
      file.untracked !== true &&
      (file.unstaged === true || file.staged !== true),
  );
}

export function buildVcsChangeSections(
  files: readonly VcsChangeFile[],
): readonly VcsChangeSection[] {
  const sections: readonly VcsChangeSection[] = [
    { id: "conflicts", label: "Merge Changes", files: sectionFiles(files, "conflicts") },
    {
      id: "staged",
      label: "Staged Changes",
      files: sectionFiles(files, "staged"),
      action: "unstage" as const,
    },
    {
      id: "changes",
      label: "Changes",
      files: sectionFiles(files, "changes"),
      action: "stage" as const,
    },
    {
      id: "untracked",
      label: "Untracked",
      files: sectionFiles(files, "untracked"),
      action: "stage" as const,
    },
  ];
  return sections.filter((section) => section.files.length > 0);
}

export function statusLabelForSection(file: VcsChangeFile, sectionId: VcsChangeSectionId): string {
  if (sectionId === "conflicts") return "U";
  if (sectionId === "untracked") return "A";
  if (sectionId === "staged") return file.indexStatus ?? file.status ?? "M";
  return file.worktreeStatus ?? file.status ?? "M";
}

export function sourceStatForSection(
  file: VcsChangeFile,
  sectionId: VcsChangeSectionId,
): { readonly insertions: number; readonly deletions: number } {
  if (sectionId === "staged") {
    return {
      insertions: file.stagedInsertions ?? file.insertions,
      deletions: file.stagedDeletions ?? file.deletions,
    };
  }
  if (sectionId === "changes" || sectionId === "untracked") {
    return {
      insertions: file.unstagedInsertions ?? file.insertions,
      deletions: file.unstagedDeletions ?? file.deletions,
    };
  }
  return { insertions: file.insertions, deletions: file.deletions };
}

export async function refreshVcsWorktree(input: {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
  readonly queryClient: QueryClient;
}): Promise<VcsStatusResult | null> {
  if (input.environmentId === null || input.cwd === null) return null;
  const targetKey = getTargetKey(input);
  invalidateWorktreeQueries({
    queryClient: input.queryClient,
    environmentId: input.environmentId,
    cwd: input.cwd,
  });
  const status = await refreshGitStatus(
    { environmentId: input.environmentId, cwd: input.cwd },
    { force: true },
  );
  if (targetKey !== null && status !== null) {
    setActionState(targetKey, EMPTY_ACTION_STATE);
  }
  return status;
}

export function runVcsWorktreeAction(
  input: RunVcsWorktreeActionInput,
): Promise<VcsStatusResult | null> {
  const targetKey = getTargetKey(input);
  if (targetKey === null || input.environmentId === null || input.cwd === null) {
    return Promise.resolve(null);
  }
  const environmentId = input.environmentId;
  const cwd = input.cwd;

  const existing = activeOperations.get(targetKey);
  const relativePaths = uniqueNonEmptyPaths(input.paths);
  if (relativePaths.length === 0) return Promise.resolve(null);

  const runOperation = async () => {
    setActionState(targetKey, { kind: input.kind, paths: relativePaths, error: null });
    try {
      const api = ensureEnvironmentApi(environmentId);
      let status: VcsStatusResult | null = null;
      if (input.kind === "stage") {
        status = await api.vcs.stageFiles({ cwd, relativePaths });
      } else if (input.kind === "unstage") {
        status = await api.vcs.unstageFiles({ cwd, relativePaths });
      } else {
        for (const relativePath of relativePaths) {
          status = await api.vcs.revertFile({ cwd, relativePath });
        }
      }

      if (status) {
        applyGitStatusSnapshot({ environmentId, cwd }, status);
      }
      invalidateWorktreeQueries({
        queryClient: input.queryClient,
        environmentId,
        cwd,
        includeProjectEntries: input.kind === "revert",
      });
      return status;
    } catch (error) {
      setActionState(targetKey, {
        kind: null,
        paths: relativePaths,
        error: getErrorMessage(error),
      });
      return null;
    } finally {
      const current = appAtomRegistry.get(vcsWorktreeActionStateAtom(targetKey));
      if (current.kind === input.kind) {
        setActionState(targetKey, EMPTY_ACTION_STATE);
      }
    }
  };

  let operation: Promise<VcsStatusResult | null>;
  operation = (existing ? existing.catch(() => null).then(runOperation) : runOperation()).finally(
    () => {
      if (activeOperations.get(targetKey) === operation) {
        activeOperations.delete(targetKey);
      }
    },
  );
  activeOperations.set(targetKey, operation);
  return operation;
}

export function useVcsWorktree(input: VcsWorktreeTarget & { readonly queryClient: QueryClient }) {
  const targetKey = getTargetKey(input);
  const gitStatus = useGitStatus({ environmentId: input.environmentId, cwd: input.cwd });
  const actionState = useAtomValue(
    targetKey !== null ? vcsWorktreeActionStateAtom(targetKey) : EMPTY_ACTION_STATE_ATOM,
  );
  const changedFiles = gitStatus.data?.workingTree.files ?? EMPTY_FILES;
  const sections = useMemo(() => buildVcsChangeSections(changedFiles), [changedFiles]);
  const refresh = useCallback(
    () =>
      refreshVcsWorktree({
        environmentId: input.environmentId,
        cwd: input.cwd,
        queryClient: input.queryClient,
      }),
    [input.cwd, input.environmentId, input.queryClient],
  );
  const stagePaths = useCallback(
    (paths: readonly string[]) =>
      runVcsWorktreeAction({
        environmentId: input.environmentId,
        cwd: input.cwd,
        queryClient: input.queryClient,
        kind: "stage",
        paths,
      }),
    [input.cwd, input.environmentId, input.queryClient],
  );
  const unstagePaths = useCallback(
    (paths: readonly string[]) =>
      runVcsWorktreeAction({
        environmentId: input.environmentId,
        cwd: input.cwd,
        queryClient: input.queryClient,
        kind: "unstage",
        paths,
      }),
    [input.cwd, input.environmentId, input.queryClient],
  );
  const revertPaths = useCallback(
    (paths: readonly string[]) =>
      runVcsWorktreeAction({
        environmentId: input.environmentId,
        cwd: input.cwd,
        queryClient: input.queryClient,
        kind: "revert",
        paths,
      }),
    [input.cwd, input.environmentId, input.queryClient],
  );

  return {
    status: gitStatus,
    changedFiles,
    sections,
    actionState,
    refresh,
    stagePaths,
    unstagePaths,
    revertPaths,
  };
}
