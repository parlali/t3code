import type { EnvironmentId, ProjectEntriesStreamEvent } from "@t3tools/contracts";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ensureEnvironmentApi } from "../environmentApi";
import { refreshGitStatus } from "./gitStatusState";
import { invalidateProjectQueries } from "./projectReactQuery";

interface WorkspaceTarget {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
}

interface RefreshWorkspaceTargetInput extends WorkspaceTarget {
  readonly queryClient: QueryClient;
}

interface ProjectEntriesSubscriber {
  readonly listener: (event: ProjectEntriesStreamEvent) => void;
  readonly onResubscribe?: () => void;
}

interface WatchedProjectEntries {
  readonly subscribers: Set<ProjectEntriesSubscriber>;
  unsubscribe: () => void;
}

interface WorkspaceRefreshState {
  promise: Promise<void>;
  pending: boolean;
  started: boolean;
}

const NOOP: () => void = () => undefined;
const WORKSPACE_REFRESH_MIN_INTERVAL_MS = 2_500;
const workspaceRefreshStates = new Map<string, WorkspaceRefreshState>();
const workspaceRefreshLastStartedAt = new Map<string, number>();
const watchedProjectEntries = new Map<string, WatchedProjectEntries>();

function getWorkspaceTargetKey(target: WorkspaceTarget): string | null {
  if (target.environmentId === null || target.cwd === null) {
    return null;
  }

  return `${target.environmentId}:${target.cwd}`;
}

function dispatchProjectEntriesEvent(
  watched: WatchedProjectEntries,
  event: ProjectEntriesStreamEvent,
) {
  for (const subscriber of Array.from(watched.subscribers)) {
    subscriber.listener(event);
  }
}

function dispatchProjectEntriesResubscribe(watched: WatchedProjectEntries) {
  for (const subscriber of Array.from(watched.subscribers)) {
    subscriber.onResubscribe?.();
  }
}

function unwatchProjectEntries(targetKey: string, subscriber: ProjectEntriesSubscriber) {
  const watched = watchedProjectEntries.get(targetKey);
  if (!watched) return;

  watched.subscribers.delete(subscriber);
  if (watched.subscribers.size > 0) return;

  watchedProjectEntries.delete(targetKey);
  watched.unsubscribe();
}

export function subscribeProjectEntries(
  target: WorkspaceTarget,
  listener: (event: ProjectEntriesStreamEvent) => void,
  onResubscribe?: () => void,
): () => void {
  const targetKey = getWorkspaceTargetKey(target);
  if (targetKey === null || target.environmentId === null || target.cwd === null) {
    return NOOP;
  }

  const subscriber: ProjectEntriesSubscriber =
    onResubscribe === undefined ? { listener } : { listener, onResubscribe };
  const watched = watchedProjectEntries.get(targetKey);
  if (watched) {
    watched.subscribers.add(subscriber);
    return () => unwatchProjectEntries(targetKey, subscriber);
  }

  const nextWatched: WatchedProjectEntries = {
    subscribers: new Set([subscriber]),
    unsubscribe: NOOP,
  };

  const api = ensureEnvironmentApi(target.environmentId);
  nextWatched.unsubscribe = api.projects.subscribeEntries(
    { cwd: target.cwd },
    (event) => dispatchProjectEntriesEvent(nextWatched, event),
    {
      onResubscribe: () => dispatchProjectEntriesResubscribe(nextWatched),
    },
  );
  watchedProjectEntries.set(targetKey, nextWatched);

  return () => unwatchProjectEntries(targetKey, subscriber);
}

export function useProjectEntriesSubscription(
  target: WorkspaceTarget,
  listener: (event: ProjectEntriesStreamEvent) => void,
  onResubscribe?: () => void,
) {
  const { environmentId, cwd } = target;
  useEffect(
    () => subscribeProjectEntries({ environmentId, cwd }, listener, onResubscribe),
    [environmentId, cwd, listener, onResubscribe],
  );
}

export function refreshWorkspaceTarget(input: RefreshWorkspaceTargetInput): Promise<void> {
  const targetKey = getWorkspaceTargetKey(input);
  if (targetKey === null || input.environmentId === null || input.cwd === null) {
    return Promise.resolve();
  }

  const currentState = workspaceRefreshStates.get(targetKey);
  if (currentState) {
    if (currentState.started) {
      currentState.pending = true;
    }
    return currentState.promise;
  }

  const state: WorkspaceRefreshState = {
    pending: false,
    promise: Promise.resolve(),
    started: false,
  };
  const runRefresh = () =>
    Promise.all([
      invalidateProjectQueries(input.queryClient, {
        environmentId: input.environmentId,
        cwd: input.cwd,
      }),
      refreshGitStatus({ environmentId: input.environmentId, cwd: input.cwd }),
    ]).then(() => undefined);

  state.promise = Promise.resolve()
    .then(async () => {
      const lastStartedAt = workspaceRefreshLastStartedAt.get(targetKey) ?? 0;
      const waitMs = Math.max(0, WORKSPACE_REFRESH_MIN_INTERVAL_MS - (Date.now() - lastStartedAt));
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      state.started = true;
      do {
        state.pending = false;
        workspaceRefreshLastStartedAt.set(targetKey, Date.now());
        await runRefresh();
      } while (state.pending);
    })
    .finally(() => {
      if (workspaceRefreshStates.get(targetKey) === state) {
        workspaceRefreshStates.delete(targetKey);
      }
    });

  workspaceRefreshStates.set(targetKey, state);
  return state.promise;
}
