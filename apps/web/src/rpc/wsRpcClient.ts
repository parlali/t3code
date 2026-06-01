import {
  type GitActionProgressEvent,
  type GitRunStackedActionInput,
  type GitRunStackedActionResult,
  type VcsStatusResult,
  type VcsStatusStreamEvent,
  type LocalApi,
  ORCHESTRATION_WS_METHODS,
  type ServerSettingsPatch,
  WS_METHODS,
} from "@t3tools/contracts";
import { applyGitStatusStreamEvent } from "@t3tools/shared/git";
import { Effect, Stream } from "effect";

import { type WsRpcProtocolClient } from "./protocol";
import { isRecoverableSubscriptionErrorMessage } from "./transportError";
import { resetWsReconnectBackoff } from "./wsConnectionState";
import { WsTransport } from "./wsTransport";

type RpcTag = keyof WsRpcProtocolClient & string;
type RpcMethod<TTag extends RpcTag> = WsRpcProtocolClient[TTag];
type RpcInput<TTag extends RpcTag> = Parameters<RpcMethod<TTag>>[0];

interface StreamSubscriptionOptions {
  readonly onResubscribe?: () => void;
}

type RpcUnaryMethod<TTag extends RpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Effect.Effect<infer TSuccess, any, any>
    ? (input: RpcInput<TTag>) => Promise<TSuccess>
    : never;

type RpcUnaryNoArgMethod<TTag extends RpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Effect.Effect<infer TSuccess, any, any>
    ? () => Promise<TSuccess>
    : never;

type RpcStreamMethod<TTag extends RpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Stream.Stream<infer TEvent, any, any>
    ? (listener: (event: TEvent) => void, options?: StreamSubscriptionOptions) => () => void
    : never;

type RpcInputStreamMethod<TTag extends RpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Stream.Stream<infer TEvent, any, any>
    ? (
        input: RpcInput<TTag>,
        listener: (event: TEvent) => void,
        options?: StreamSubscriptionOptions,
      ) => () => void
    : never;

interface GitRunStackedActionOptions {
  readonly onProgress?: (event: GitActionProgressEvent) => void;
}

type WsTransportProvider = WsTransport | (() => WsTransport);

interface WsRpcClientTransportOptions {
  readonly streamTransport?: WsTransport;
  readonly terminalTransport?: WsTransportProvider;
  readonly threadDetailTransport?: WsTransport;
}

export interface WsRpcClient {
  readonly dispose: () => Promise<void>;
  readonly isConnectionOpen: () => boolean;
  readonly reconnect: () => Promise<void>;
  readonly isHeartbeatFresh: () => boolean;
  readonly terminal: {
    readonly open: RpcUnaryMethod<typeof WS_METHODS.terminalOpen>;
    readonly write: RpcUnaryMethod<typeof WS_METHODS.terminalWrite>;
    readonly resize: RpcUnaryMethod<typeof WS_METHODS.terminalResize>;
    readonly clear: RpcUnaryMethod<typeof WS_METHODS.terminalClear>;
    readonly restart: RpcUnaryMethod<typeof WS_METHODS.terminalRestart>;
    readonly close: RpcUnaryMethod<typeof WS_METHODS.terminalClose>;
    readonly getStatusSnapshot: RpcUnaryMethod<typeof WS_METHODS.terminalGetStatusSnapshot>;
    readonly onEvent: RpcStreamMethod<typeof WS_METHODS.subscribeTerminalEvents>;
    readonly onSessionEvent: RpcInputStreamMethod<typeof WS_METHODS.subscribeTerminalEvents>;
  };
  readonly threadStatus: {
    readonly getSnapshot: RpcUnaryNoArgMethod<typeof WS_METHODS.threadStatusGetSnapshot>;
    readonly markRead: RpcUnaryMethod<typeof WS_METHODS.threadStatusMarkRead>;
    readonly markUnread: RpcUnaryMethod<typeof WS_METHODS.threadStatusMarkUnread>;
    readonly markViewed: RpcUnaryMethod<typeof WS_METHODS.threadStatusMarkViewed>;
    readonly setTerminalOpen: RpcUnaryMethod<typeof WS_METHODS.threadStatusSetTerminalOpen>;
    readonly subscribe: RpcStreamMethod<typeof WS_METHODS.subscribeThreadStatus>;
  };
  readonly threadWorkbench: {
    readonly getState: RpcUnaryMethod<typeof WS_METHODS.threadWorkbenchGetState>;
    readonly setState: RpcUnaryMethod<typeof WS_METHODS.threadWorkbenchSetState>;
  };
  readonly projects: {
    readonly searchEntries: RpcUnaryMethod<typeof WS_METHODS.projectsSearchEntries>;
    readonly listEntries: RpcUnaryMethod<typeof WS_METHODS.projectsListEntries>;
    readonly subscribeEntries: RpcInputStreamMethod<typeof WS_METHODS.projectsSubscribeEntries>;
    readonly createEntry: RpcUnaryMethod<typeof WS_METHODS.projectsCreateEntry>;
    readonly readFile: RpcUnaryMethod<typeof WS_METHODS.projectsReadFile>;
    readonly writeFile: RpcUnaryMethod<typeof WS_METHODS.projectsWriteFile>;
  };
  readonly filesystem: {
    readonly browse: RpcUnaryMethod<typeof WS_METHODS.filesystemBrowse>;
  };
  readonly sourceControl: {
    readonly lookupRepository: RpcUnaryMethod<typeof WS_METHODS.sourceControlLookupRepository>;
    readonly cloneRepository: RpcUnaryMethod<typeof WS_METHODS.sourceControlCloneRepository>;
    readonly publishRepository: RpcUnaryMethod<typeof WS_METHODS.sourceControlPublishRepository>;
  };
  readonly shell: {
    readonly openInEditor: (input: {
      readonly cwd: Parameters<LocalApi["shell"]["openInEditor"]>[0];
      readonly editor: Parameters<LocalApi["shell"]["openInEditor"]>[1];
    }) => ReturnType<LocalApi["shell"]["openInEditor"]>;
  };
  readonly vcs: {
    readonly diff: RpcUnaryMethod<typeof WS_METHODS.vcsDiff>;
    readonly fileDiff: RpcUnaryMethod<typeof WS_METHODS.vcsFileDiff>;
    readonly stageFile: RpcUnaryMethod<typeof WS_METHODS.vcsStageFile>;
    readonly stageFiles: RpcUnaryMethod<typeof WS_METHODS.vcsStageFiles>;
    readonly unstageFile: RpcUnaryMethod<typeof WS_METHODS.vcsUnstageFile>;
    readonly unstageFiles: RpcUnaryMethod<typeof WS_METHODS.vcsUnstageFiles>;
    readonly revertFile: RpcUnaryMethod<typeof WS_METHODS.vcsRevertFile>;
    readonly applyPatch: RpcUnaryMethod<typeof WS_METHODS.vcsApplyPatch>;
    readonly pull: RpcUnaryMethod<typeof WS_METHODS.vcsPull>;
    readonly refreshStatus: RpcUnaryMethod<typeof WS_METHODS.vcsRefreshStatus>;
    readonly commitGraph: RpcUnaryMethod<typeof WS_METHODS.vcsCommitGraph>;
    readonly onStatus: (
      input: RpcInput<typeof WS_METHODS.subscribeVcsStatus>,
      listener: (status: VcsStatusResult) => void,
      options?: StreamSubscriptionOptions,
    ) => () => void;
    readonly listRefs: RpcUnaryMethod<typeof WS_METHODS.vcsListRefs>;
    readonly createWorktree: RpcUnaryMethod<typeof WS_METHODS.vcsCreateWorktree>;
    readonly removeWorktree: RpcUnaryMethod<typeof WS_METHODS.vcsRemoveWorktree>;
    readonly createRef: RpcUnaryMethod<typeof WS_METHODS.vcsCreateRef>;
    readonly switchRef: RpcUnaryMethod<typeof WS_METHODS.vcsSwitchRef>;
    readonly init: RpcUnaryMethod<typeof WS_METHODS.vcsInit>;
  };
  /**
   * Git-specific workflows. Local repository mechanics live under `vcs`.
   */
  readonly git: {
    readonly generateCommitMessage: RpcUnaryMethod<typeof WS_METHODS.gitGenerateCommitMessage>;
    readonly commitStaged: RpcUnaryMethod<typeof WS_METHODS.gitCommitStaged>;
    readonly runStackedAction: (
      input: GitRunStackedActionInput,
      options?: GitRunStackedActionOptions,
    ) => Promise<GitRunStackedActionResult>;
    readonly resolvePullRequest: RpcUnaryMethod<typeof WS_METHODS.gitResolvePullRequest>;
    readonly preparePullRequestThread: RpcUnaryMethod<
      typeof WS_METHODS.gitPreparePullRequestThread
    >;
  };
  readonly server: {
    readonly getConfig: RpcUnaryNoArgMethod<typeof WS_METHODS.serverGetConfig>;
    /**
     * Refresh provider snapshots. Pass `{ instanceId }` to refresh a single
     * configured instance; pass no argument (or `{}`) to refresh all.
     */
    readonly refreshProviders: (
      input?: RpcInput<typeof WS_METHODS.serverRefreshProviders>,
    ) => ReturnType<RpcUnaryMethod<typeof WS_METHODS.serverRefreshProviders>>;
    readonly updateProvider: RpcUnaryMethod<typeof WS_METHODS.serverUpdateProvider>;
    readonly upsertKeybinding: RpcUnaryMethod<typeof WS_METHODS.serverUpsertKeybinding>;
    readonly getSettings: RpcUnaryNoArgMethod<typeof WS_METHODS.serverGetSettings>;
    readonly updateSettings: (
      patch: ServerSettingsPatch,
    ) => ReturnType<RpcUnaryMethod<typeof WS_METHODS.serverUpdateSettings>>;
    readonly getProviderUsage: (
      input?: RpcInput<typeof WS_METHODS.serverGetProviderUsage>,
    ) => ReturnType<RpcUnaryMethod<typeof WS_METHODS.serverGetProviderUsage>>;
    readonly discoverSourceControl: RpcUnaryNoArgMethod<
      typeof WS_METHODS.serverDiscoverSourceControl
    >;
    readonly getTraceDiagnostics: RpcUnaryNoArgMethod<typeof WS_METHODS.serverGetTraceDiagnostics>;
    readonly getProcessDiagnostics: RpcUnaryNoArgMethod<
      typeof WS_METHODS.serverGetProcessDiagnostics
    >;
    readonly getMachineProcesses: RpcUnaryNoArgMethod<typeof WS_METHODS.serverGetMachineProcesses>;
    readonly getProcessResourceHistory: RpcUnaryMethod<
      typeof WS_METHODS.serverGetProcessResourceHistory
    >;
    readonly signalProcess: RpcUnaryMethod<typeof WS_METHODS.serverSignalProcess>;
    readonly signalMachineProcess: RpcUnaryMethod<typeof WS_METHODS.serverSignalMachineProcess>;
    readonly subscribeConfig: RpcStreamMethod<typeof WS_METHODS.subscribeServerConfig>;
    readonly subscribeLifecycle: RpcStreamMethod<typeof WS_METHODS.subscribeServerLifecycle>;
    readonly subscribeAuthAccess: RpcStreamMethod<typeof WS_METHODS.subscribeAuthAccess>;
  };
  readonly orchestration: {
    readonly dispatchCommand: RpcUnaryMethod<typeof ORCHESTRATION_WS_METHODS.dispatchCommand>;
    readonly getTurnDiff: RpcUnaryMethod<typeof ORCHESTRATION_WS_METHODS.getTurnDiff>;
    readonly getFullThreadDiff: RpcUnaryMethod<typeof ORCHESTRATION_WS_METHODS.getFullThreadDiff>;
    readonly getCheckpointFileRestoreAvailability: RpcUnaryMethod<
      typeof ORCHESTRATION_WS_METHODS.getCheckpointFileRestoreAvailability
    >;
    readonly getArchivedShellSnapshot: RpcUnaryNoArgMethod<
      typeof ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot
    >;
    readonly subscribeShell: RpcStreamMethod<typeof ORCHESTRATION_WS_METHODS.subscribeShell>;
    readonly subscribeThread: RpcInputStreamMethod<typeof ORCHESTRATION_WS_METHODS.subscribeThread>;
  };
}

function uniqueTransports(transports: ReadonlyArray<WsTransport>): WsTransport[] {
  return [...new Set(transports)];
}

export function createWsRpcClient(
  transport: WsTransport,
  options?: WsRpcClientTransportOptions,
): WsRpcClient {
  const streamTransport = options?.streamTransport ?? transport;
  const configuredTerminalTransport = options?.terminalTransport ?? streamTransport;
  const initialTerminalTransport: WsTransport | null =
    typeof configuredTerminalTransport === "function" ? null : configuredTerminalTransport;
  const createTerminalTransport: (() => WsTransport) | null =
    typeof configuredTerminalTransport === "function" ? configuredTerminalTransport : null;
  let terminalTransport: WsTransport | null = initialTerminalTransport;
  const threadDetailTransport = options?.threadDetailTransport ?? streamTransport;
  const getTerminalTransport = (): WsTransport => {
    if (terminalTransport) {
      return terminalTransport;
    }
    if (!createTerminalTransport) {
      return streamTransport;
    }
    terminalTransport = createTerminalTransport();
    return terminalTransport;
  };
  const activeTransports = () =>
    uniqueTransports([
      transport,
      streamTransport,
      ...(terminalTransport ? [terminalTransport] : []),
      threadDetailTransport,
    ]);

  return {
    dispose: async () => {
      await Promise.all(activeTransports().map((transport) => transport.dispose()));
    },
    isConnectionOpen: () => activeTransports().every((transport) => transport.isConnectionOpen()),
    reconnect: async () => {
      resetWsReconnectBackoff();
      await Promise.all(activeTransports().map((transport) => transport.reconnect()));
    },
    isHeartbeatFresh: () => activeTransports().every((transport) => transport.isHeartbeatFresh()),
    terminal: {
      open: (input) => transport.request((client) => client[WS_METHODS.terminalOpen](input)),
      write: (input) => transport.request((client) => client[WS_METHODS.terminalWrite](input)),
      resize: (input) => transport.request((client) => client[WS_METHODS.terminalResize](input)),
      clear: (input) => transport.request((client) => client[WS_METHODS.terminalClear](input)),
      restart: (input) => transport.request((client) => client[WS_METHODS.terminalRestart](input)),
      close: (input) => transport.request((client) => client[WS_METHODS.terminalClose](input)),
      getStatusSnapshot: (input) =>
        transport.request((client) => client[WS_METHODS.terminalGetStatusSnapshot](input)),
      onEvent: (listener, options) =>
        streamTransport.subscribe(
          (client) => client[WS_METHODS.subscribeTerminalEvents]({ includeOutput: false }),
          listener,
          {
            ...options,
            tag: WS_METHODS.subscribeTerminalEvents,
          },
        ),
      onSessionEvent: (input, listener, options) =>
        getTerminalTransport().subscribe(
          (client) => client[WS_METHODS.subscribeTerminalEvents](input),
          listener,
          {
            ...options,
            tag: WS_METHODS.subscribeTerminalEvents,
          },
        ),
    },
    threadStatus: {
      getSnapshot: () =>
        transport.request((client) => client[WS_METHODS.threadStatusGetSnapshot]({})),
      markRead: (input) =>
        transport.request((client) => client[WS_METHODS.threadStatusMarkRead](input)),
      markUnread: (input) =>
        transport.request((client) => client[WS_METHODS.threadStatusMarkUnread](input)),
      markViewed: (input) =>
        transport.request((client) => client[WS_METHODS.threadStatusMarkViewed](input)),
      setTerminalOpen: (input) =>
        transport.request((client) => client[WS_METHODS.threadStatusSetTerminalOpen](input)),
      subscribe: (listener, options) =>
        streamTransport.subscribe(
          (client) => client[WS_METHODS.subscribeThreadStatus]({}),
          listener,
          {
            ...options,
            tag: WS_METHODS.subscribeThreadStatus,
          },
        ),
    },
    threadWorkbench: {
      getState: (input) =>
        transport.request((client) => client[WS_METHODS.threadWorkbenchGetState](input)),
      setState: (input) =>
        transport.request((client) => client[WS_METHODS.threadWorkbenchSetState](input)),
    },
    projects: {
      searchEntries: (input) =>
        transport.request((client) => client[WS_METHODS.projectsSearchEntries](input)),
      listEntries: (input) =>
        transport.request((client) => client[WS_METHODS.projectsListEntries](input)),
      subscribeEntries: (input, listener, options) =>
        streamTransport.subscribe(
          (client) => client[WS_METHODS.projectsSubscribeEntries](input),
          listener,
          {
            ...options,
            tag: WS_METHODS.projectsSubscribeEntries,
          },
        ),
      createEntry: (input) =>
        transport.request((client) => client[WS_METHODS.projectsCreateEntry](input)),
      readFile: (input) =>
        transport.request((client) => client[WS_METHODS.projectsReadFile](input)),
      writeFile: (input) =>
        transport.request((client) => client[WS_METHODS.projectsWriteFile](input)),
    },
    filesystem: {
      browse: (input) => transport.request((client) => client[WS_METHODS.filesystemBrowse](input)),
    },
    sourceControl: {
      lookupRepository: (input) =>
        transport.request((client) => client[WS_METHODS.sourceControlLookupRepository](input)),
      cloneRepository: (input) =>
        transport.request((client) => client[WS_METHODS.sourceControlCloneRepository](input)),
      publishRepository: (input) =>
        transport.request((client) => client[WS_METHODS.sourceControlPublishRepository](input)),
    },
    shell: {
      openInEditor: (input) =>
        transport.request((client) => client[WS_METHODS.shellOpenInEditor](input)),
    },
    vcs: {
      diff: (input) => transport.request((client) => client[WS_METHODS.vcsDiff](input)),
      fileDiff: (input) => transport.request((client) => client[WS_METHODS.vcsFileDiff](input)),
      stageFile: (input) => transport.request((client) => client[WS_METHODS.vcsStageFile](input)),
      stageFiles: (input) => transport.request((client) => client[WS_METHODS.vcsStageFiles](input)),
      unstageFile: (input) =>
        transport.request((client) => client[WS_METHODS.vcsUnstageFile](input)),
      unstageFiles: (input) =>
        transport.request((client) => client[WS_METHODS.vcsUnstageFiles](input)),
      revertFile: (input) => transport.request((client) => client[WS_METHODS.vcsRevertFile](input)),
      applyPatch: (input) => transport.request((client) => client[WS_METHODS.vcsApplyPatch](input)),
      pull: (input) => transport.request((client) => client[WS_METHODS.vcsPull](input)),
      refreshStatus: (input) =>
        transport.request((client) => client[WS_METHODS.vcsRefreshStatus](input)),
      commitGraph: (input) =>
        transport.request((client) => client[WS_METHODS.vcsCommitGraph](input)),
      onStatus: (input, listener, options) => {
        let current: VcsStatusResult | null = null;
        return streamTransport.subscribe(
          (client) => client[WS_METHODS.subscribeVcsStatus](input),
          (event: VcsStatusStreamEvent) => {
            current = applyGitStatusStreamEvent(current, event);
            listener(current);
          },
          { ...options, tag: WS_METHODS.subscribeVcsStatus },
        );
      },
      listRefs: (input) => transport.request((client) => client[WS_METHODS.vcsListRefs](input)),
      createWorktree: (input) =>
        transport.request((client) => client[WS_METHODS.vcsCreateWorktree](input)),
      removeWorktree: (input) =>
        transport.request((client) => client[WS_METHODS.vcsRemoveWorktree](input)),
      createRef: (input) => transport.request((client) => client[WS_METHODS.vcsCreateRef](input)),
      switchRef: (input) => transport.request((client) => client[WS_METHODS.vcsSwitchRef](input)),
      init: (input) => transport.request((client) => client[WS_METHODS.vcsInit](input)),
    },
    git: {
      generateCommitMessage: (input) =>
        transport.request((client) => client[WS_METHODS.gitGenerateCommitMessage](input)),
      commitStaged: (input) =>
        transport.request((client) => client[WS_METHODS.gitCommitStaged](input)),
      runStackedAction: async (input, options) => {
        let result: GitRunStackedActionResult | null = null;

        try {
          await streamTransport.requestStream(
            (client) => client[WS_METHODS.gitRunStackedAction](input),
            (event) => {
              options?.onProgress?.(event);
              if (event.kind === "action_finished") {
                result = event.result;
              }
            },
          );
        } catch (error) {
          if (
            result === null ||
            !isRecoverableSubscriptionErrorMessage(
              error instanceof Error ? error.message : String(error),
            )
          ) {
            throw error;
          }
        }

        if (result) {
          return result;
        }

        throw new Error("Git action stream completed without a final result.");
      },
      resolvePullRequest: (input) =>
        transport.request((client) => client[WS_METHODS.gitResolvePullRequest](input)),
      preparePullRequestThread: (input) =>
        transport.request((client) => client[WS_METHODS.gitPreparePullRequestThread](input)),
    },
    server: {
      getConfig: () => transport.request((client) => client[WS_METHODS.serverGetConfig]({})),
      refreshProviders: (input) =>
        transport.request((client) => client[WS_METHODS.serverRefreshProviders](input ?? {})),
      updateProvider: (input) =>
        transport.request((client) => client[WS_METHODS.serverUpdateProvider](input)),
      upsertKeybinding: (input) =>
        transport.request((client) => client[WS_METHODS.serverUpsertKeybinding](input)),
      getSettings: () => transport.request((client) => client[WS_METHODS.serverGetSettings]({})),
      updateSettings: (patch) =>
        transport.request((client) => client[WS_METHODS.serverUpdateSettings]({ patch })),
      getProviderUsage: (input) =>
        transport.request((client) => client[WS_METHODS.serverGetProviderUsage](input ?? {})),
      discoverSourceControl: () =>
        transport.request((client) => client[WS_METHODS.serverDiscoverSourceControl]({})),
      getTraceDiagnostics: () =>
        transport.request((client) => client[WS_METHODS.serverGetTraceDiagnostics]({})),
      getProcessDiagnostics: () =>
        transport.request((client) => client[WS_METHODS.serverGetProcessDiagnostics]({})),
      getMachineProcesses: () =>
        transport.request((client) => client[WS_METHODS.serverGetMachineProcesses]({})),
      getProcessResourceHistory: (input) =>
        transport.request((client) => client[WS_METHODS.serverGetProcessResourceHistory](input)),
      signalProcess: (input) =>
        transport.request((client) => client[WS_METHODS.serverSignalProcess](input)),
      signalMachineProcess: (input) =>
        transport.request((client) => client[WS_METHODS.serverSignalMachineProcess](input)),
      subscribeConfig: (listener, options) =>
        streamTransport.subscribe(
          (client) => client[WS_METHODS.subscribeServerConfig]({}),
          listener,
          {
            ...options,
            tag: WS_METHODS.subscribeServerConfig,
          },
        ),
      subscribeLifecycle: (listener, options) =>
        streamTransport.subscribe(
          (client) => client[WS_METHODS.subscribeServerLifecycle]({}),
          listener,
          {
            ...options,
            tag: WS_METHODS.subscribeServerLifecycle,
          },
        ),
      subscribeAuthAccess: (listener, options) =>
        streamTransport.subscribe(
          (client) => client[WS_METHODS.subscribeAuthAccess]({}),
          listener,
          {
            ...options,
            tag: WS_METHODS.subscribeAuthAccess,
          },
        ),
    },
    orchestration: {
      dispatchCommand: (input) =>
        transport.request((client) => client[ORCHESTRATION_WS_METHODS.dispatchCommand](input)),
      getTurnDiff: (input) =>
        transport.request((client) => client[ORCHESTRATION_WS_METHODS.getTurnDiff](input)),
      getFullThreadDiff: (input) =>
        transport.request((client) => client[ORCHESTRATION_WS_METHODS.getFullThreadDiff](input)),
      getCheckpointFileRestoreAvailability: (input) =>
        transport.request((client) =>
          client[ORCHESTRATION_WS_METHODS.getCheckpointFileRestoreAvailability](input),
        ),
      getArchivedShellSnapshot: () =>
        transport.request((client) =>
          client[ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot]({}),
        ),
      subscribeShell: (listener, options) =>
        streamTransport.subscribe(
          (client) => client[ORCHESTRATION_WS_METHODS.subscribeShell]({}),
          listener,
          { ...options, tag: ORCHESTRATION_WS_METHODS.subscribeShell },
        ),
      subscribeThread: (input, listener, options) =>
        threadDetailTransport.subscribe(
          (client) => client[ORCHESTRATION_WS_METHODS.subscribeThread](input),
          listener,
          { ...options, tag: ORCHESTRATION_WS_METHODS.subscribeThread },
        ),
    },
  };
}
