import { useAtomValue } from "@effect/atom-react";
import {
  type SourceControlDiscoveryTarget,
  type SourceControlDiscoveryState,
  createSourceControlDiscoveryManager,
  getSourceControlDiscoveryTargetKey,
  sourceControlDiscoveryStateAtom,
} from "@t3tools/client-runtime";
import { EnvironmentId, type SourceControlDiscoveryResult } from "@t3tools/contracts";
import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";

import { readPrimaryEnvironmentDescriptor } from "../environments/primary";
import { readEnvironmentConnection } from "../environments/runtime";
import { readLocalApi } from "../localApi";
import { appAtomRegistry } from "../rpc/atomRegistry";

const SOURCE_CONTROL_DISCOVERY_TARGET = { key: "primary" } as const;
const SOURCE_CONTROL_DISCOVERY_STALE_TIME_MS = 30_000;
const SOURCE_CONTROL_DISCOVERY_IDLE_TTL_MS = 5 * 60_000;
const SOURCE_CONTROL_DISCOVERY_REFRESH_DISABLED_PREFIX = "disabled:";

interface SourceControlDiscoveryTargetInput {
  readonly environmentId?: EnvironmentId | null;
}

interface UseSourceControlDiscoveryInput extends SourceControlDiscoveryTargetInput {
  readonly autoRefresh?: boolean;
}

function sourceControlDiscoveryTarget(
  input?: SourceControlDiscoveryTargetInput,
): SourceControlDiscoveryTarget {
  const environmentId = input?.environmentId ?? null;
  if (!environmentId) {
    return SOURCE_CONTROL_DISCOVERY_TARGET;
  }
  return readPrimaryEnvironmentDescriptor()?.environmentId === environmentId
    ? SOURCE_CONTROL_DISCOVERY_TARGET
    : { key: environmentId };
}

export const sourceControlDiscoveryManager = createSourceControlDiscoveryManager({
  getRegistry: () => appAtomRegistry,
  getClient: (key) => {
    if (key === SOURCE_CONTROL_DISCOVERY_TARGET.key) {
      const primaryEnvironmentId = readPrimaryEnvironmentDescriptor()?.environmentId ?? null;
      const primaryConnection = primaryEnvironmentId
        ? readEnvironmentConnection(primaryEnvironmentId)
        : null;
      if (primaryConnection) {
        return primaryConnection.client.server;
      }
      try {
        return readLocalApi()?.server ?? null;
      } catch {
        return null;
      }
    }
    const environmentId = EnvironmentId.make(key);
    const connection = readEnvironmentConnection(environmentId);
    if (connection) {
      return connection.client.server;
    }
    return null;
  },
});

const sourceControlDiscoveryAutoRefreshAtom = Atom.family((refreshKey: string) => {
  const autoRefresh = !refreshKey.startsWith(SOURCE_CONTROL_DISCOVERY_REFRESH_DISABLED_PREFIX);
  const targetKey = autoRefresh
    ? refreshKey
    : refreshKey.slice(SOURCE_CONTROL_DISCOVERY_REFRESH_DISABLED_PREFIX.length);

  return Atom.make(() =>
    autoRefresh
      ? Effect.promise(() => sourceControlDiscoveryManager.refresh({ key: targetKey }))
      : Effect.succeed(null),
  ).pipe(
    Atom.swr({
      staleTime: SOURCE_CONTROL_DISCOVERY_STALE_TIME_MS,
      revalidateOnMount: autoRefresh,
    }),
    Atom.setIdleTTL(SOURCE_CONTROL_DISCOVERY_IDLE_TTL_MS),
    Atom.withLabel(`source-control-discovery:auto-refresh:${refreshKey}`),
  );
});

export function refreshSourceControlDiscovery(
  input?: SourceControlDiscoveryTargetInput,
): Promise<SourceControlDiscoveryResult | null> {
  return sourceControlDiscoveryManager.refresh(sourceControlDiscoveryTarget(input));
}

export function getSourceControlDiscoverySnapshot(
  input?: SourceControlDiscoveryTargetInput,
): SourceControlDiscoveryState {
  return sourceControlDiscoveryManager.getSnapshot(sourceControlDiscoveryTarget(input));
}

export function resetSourceControlDiscoveryStateForTests(): void {
  sourceControlDiscoveryManager.reset();
}

export function useSourceControlDiscovery(
  input?: UseSourceControlDiscoveryInput,
): SourceControlDiscoveryState {
  const targetKey =
    getSourceControlDiscoveryTargetKey(sourceControlDiscoveryTarget(input)) ??
    SOURCE_CONTROL_DISCOVERY_TARGET.key;
  const autoRefresh = input?.autoRefresh ?? true;
  const refreshKey = autoRefresh
    ? targetKey
    : `${SOURCE_CONTROL_DISCOVERY_REFRESH_DISABLED_PREFIX}${targetKey}`;

  useAtomValue(sourceControlDiscoveryAutoRefreshAtom(refreshKey));

  return useAtomValue(sourceControlDiscoveryStateAtom(targetKey));
}
