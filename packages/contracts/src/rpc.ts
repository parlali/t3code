import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { ExternalLauncherError, LaunchEditorInput } from "./editor.ts";
import { AuthAccessStreamEvent } from "./auth.ts";
import {
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  FilesystemBrowseError,
} from "./filesystem.ts";
import {
  GitActionProgressEvent,
  GitCommitStagedInput,
  GitCommitStagedResult,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
  GitCommandError,
  VcsCreateRefInput,
  VcsCreateRefResult,
  VcsCreateWorktreeInput,
  VcsCreateWorktreeResult,
  VcsCommitGraphInput,
  VcsCommitGraphResult,
  VcsInitInput,
  VcsListRefsInput,
  VcsListRefsResult,
  GitManagerServiceError,
  GitGenerateCommitMessageInput,
  GitGenerateCommitMessageResult,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  VcsDiffInput,
  VcsDiffResult,
  VcsFileDiffInput,
  VcsFileDiffResult,
  VcsFileInput,
  VcsPathsInput,
  VcsApplyPatchInput,
  VcsPullInput,
  GitPullRequestRefInput,
  VcsPullResult,
  VcsRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  VcsStatusInput,
  VcsStatusResult,
  VcsStatusStreamEvent,
} from "./git.ts";
import { KeybindingsConfigError } from "./keybindings.ts";
import {
  ClientOrchestrationCommand,
  ORCHESTRATION_WS_METHODS,
  OrchestrationDispatchCommandError,
  OrchestrationGetCheckpointFileRestoreAvailabilityError,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetSnapshotError,
  OrchestrationGetTurnDiffError,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsError,
  OrchestrationReplayEventsInput,
  OrchestrationRpcSchemas,
} from "./orchestration.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import { ProviderUsageInput, ProviderUsageSnapshot } from "./providerUsage.ts";
import {
  ProjectSearchEntriesError,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectListEntriesError,
  ProjectListEntriesInput,
  ProjectListEntriesResult,
  ProjectEntriesSubscribeError,
  ProjectEntriesSubscribeInput,
  ProjectEntriesStreamEvent,
  ProjectCreateEntryError,
  ProjectCreateEntryInput,
  ProjectCreateEntryResult,
  ProjectReadFileError,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileError,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project.ts";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalError,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalRuntimeStatusSnapshot,
  TerminalSessionSnapshot,
  TerminalStatusSnapshotInput,
  TerminalSubscribeInput,
  TerminalWriteInput,
} from "./terminal.ts";
import {
  ThreadReadReceipt,
  ThreadReadReceiptError,
  ThreadReadReceiptMarkUnreadInput,
  ThreadReadReceiptMarkVisitedInput,
  ThreadReadReceiptSnapshot,
  ThreadReadReceiptStreamEvent,
} from "./threadReadReceipts.ts";
import {
  ThreadWorkbenchGetStateInput,
  ThreadWorkbenchSetStateInput,
  ThreadWorkbenchState,
  ThreadWorkbenchStateError,
} from "./threadWorkbenchState.ts";
import {
  ServerConfigStreamEvent,
  ServerConfig,
  ServerProcessDiagnosticsResult,
  ServerProcessResourceHistoryInput,
  ServerProcessResourceHistoryResult,
  ServerProviderUpdateError,
  ServerProviderUpdateInput,
  ServerLifecycleStreamEvent,
  ServerProviderUpdatedPayload,
  ServerSignalProcessInput,
  ServerSignalProcessResult,
  ServerTraceDiagnosticsResult,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
} from "./server.ts";
import { ServerSettings, ServerSettingsError, ServerSettingsPatch } from "./settings.ts";
import {
  SourceControlCloneRepositoryInput,
  SourceControlCloneRepositoryResult,
  SourceControlDiscoveryResult,
  SourceControlPublishRepositoryInput,
  SourceControlPublishRepositoryResult,
  SourceControlRepositoryError,
  SourceControlRepositoryInfo,
  SourceControlRepositoryLookupInput,
} from "./sourceControl.ts";
import { VcsError } from "./vcs.ts";

export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsSearchEntries: "projects.searchEntries",
  projectsListEntries: "projects.listEntries",
  projectsSubscribeEntries: "projects.subscribeEntries",
  projectsCreateEntry: "projects.createEntry",
  projectsReadFile: "projects.readFile",
  projectsWriteFile: "projects.writeFile",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Filesystem methods
  filesystemBrowse: "filesystem.browse",

  // VCS methods
  vcsDiff: "vcs.diff",
  vcsFileDiff: "vcs.fileDiff",
  vcsStageFile: "vcs.stageFile",
  vcsStageFiles: "vcs.stageFiles",
  vcsUnstageFile: "vcs.unstageFile",
  vcsUnstageFiles: "vcs.unstageFiles",
  vcsRevertFile: "vcs.revertFile",
  vcsApplyPatch: "vcs.applyPatch",
  vcsPull: "vcs.pull",
  vcsRefreshStatus: "vcs.refreshStatus",
  vcsCommitGraph: "vcs.commitGraph",
  vcsListRefs: "vcs.listRefs",
  vcsCreateWorktree: "vcs.createWorktree",
  vcsRemoveWorktree: "vcs.removeWorktree",
  vcsCreateRef: "vcs.createRef",
  vcsSwitchRef: "vcs.switchRef",
  vcsInit: "vcs.init",

  // Git workflow methods
  gitGenerateCommitMessage: "git.generateCommitMessage",
  gitCommitStaged: "git.commitStaged",
  gitRunStackedAction: "git.runStackedAction",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",
  terminalGetStatusSnapshot: "terminal.getStatusSnapshot",

  // Thread read receipt methods
  threadReadGetSnapshot: "threadRead.getSnapshot",
  threadReadMarkVisited: "threadRead.markVisited",
  threadReadMarkUnread: "threadRead.markUnread",

  // Thread workbench state methods
  threadWorkbenchGetState: "threadWorkbench.getState",
  threadWorkbenchSetState: "threadWorkbench.setState",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverRefreshProviders: "server.refreshProviders",
  serverUpdateProvider: "server.updateProvider",
  serverUpsertKeybinding: "server.upsertKeybinding",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
  serverGetProviderUsage: "server.getProviderUsage",
  serverDiscoverSourceControl: "server.discoverSourceControl",
  serverGetTraceDiagnostics: "server.getTraceDiagnostics",
  serverGetProcessDiagnostics: "server.getProcessDiagnostics",
  serverGetProcessResourceHistory: "server.getProcessResourceHistory",
  serverSignalProcess: "server.signalProcess",

  // Source control methods
  sourceControlLookupRepository: "sourceControl.lookupRepository",
  sourceControlCloneRepository: "sourceControl.cloneRepository",
  sourceControlPublishRepository: "sourceControl.publishRepository",

  // Streaming subscriptions
  subscribeVcsStatus: "subscribeVcsStatus",
  subscribeTerminalEvents: "subscribeTerminalEvents",
  subscribeThreadReadReceipts: "subscribeThreadReadReceipts",
  subscribeServerConfig: "subscribeServerConfig",
  subscribeServerLifecycle: "subscribeServerLifecycle",
  subscribeAuthAccess: "subscribeAuthAccess",
} as const;

export const WsServerUpsertKeybindingRpc = Rpc.make(WS_METHODS.serverUpsertKeybinding, {
  payload: ServerUpsertKeybindingInput,
  success: ServerUpsertKeybindingResult,
  error: KeybindingsConfigError,
});

export const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
});

export const WsServerRefreshProvidersRpc = Rpc.make(WS_METHODS.serverRefreshProviders, {
  payload: Schema.Struct({
    /**
     * When supplied, only refresh this specific provider instance. When
     * omitted, refresh all configured instances — the legacy `refresh()`
     * behaviour retained for transports that still dispatch untargeted
     * refreshes.
     */
    instanceId: Schema.optional(ProviderInstanceId),
  }),
  success: ServerProviderUpdatedPayload,
});

export const WsServerUpdateProviderRpc = Rpc.make(WS_METHODS.serverUpdateProvider, {
  payload: ServerProviderUpdateInput,
  success: ServerProviderUpdatedPayload,
  error: ServerProviderUpdateError,
});

export const WsServerGetSettingsRpc = Rpc.make(WS_METHODS.serverGetSettings, {
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsServerUpdateSettingsRpc = Rpc.make(WS_METHODS.serverUpdateSettings, {
  payload: Schema.Struct({ patch: ServerSettingsPatch }),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsServerGetProviderUsageRpc = Rpc.make(WS_METHODS.serverGetProviderUsage, {
  payload: ProviderUsageInput,
  success: ProviderUsageSnapshot,
  error: ServerSettingsError,
});

export const WsServerDiscoverSourceControlRpc = Rpc.make(WS_METHODS.serverDiscoverSourceControl, {
  payload: Schema.Struct({}),
  success: SourceControlDiscoveryResult,
});

export const WsServerGetTraceDiagnosticsRpc = Rpc.make(WS_METHODS.serverGetTraceDiagnostics, {
  payload: Schema.Struct({}),
  success: ServerTraceDiagnosticsResult,
});

export const WsServerGetProcessDiagnosticsRpc = Rpc.make(WS_METHODS.serverGetProcessDiagnostics, {
  payload: Schema.Struct({}),
  success: ServerProcessDiagnosticsResult,
});

export const WsServerGetProcessResourceHistoryRpc = Rpc.make(
  WS_METHODS.serverGetProcessResourceHistory,
  {
    payload: ServerProcessResourceHistoryInput,
    success: ServerProcessResourceHistoryResult,
  },
);

export const WsServerSignalProcessRpc = Rpc.make(WS_METHODS.serverSignalProcess, {
  payload: ServerSignalProcessInput,
  success: ServerSignalProcessResult,
});

export const WsSourceControlLookupRepositoryRpc = Rpc.make(
  WS_METHODS.sourceControlLookupRepository,
  {
    payload: SourceControlRepositoryLookupInput,
    success: SourceControlRepositoryInfo,
    error: SourceControlRepositoryError,
  },
);

export const WsSourceControlCloneRepositoryRpc = Rpc.make(WS_METHODS.sourceControlCloneRepository, {
  payload: SourceControlCloneRepositoryInput,
  success: SourceControlCloneRepositoryResult,
  error: SourceControlRepositoryError,
});

export const WsSourceControlPublishRepositoryRpc = Rpc.make(
  WS_METHODS.sourceControlPublishRepository,
  {
    payload: SourceControlPublishRepositoryInput,
    success: SourceControlPublishRepositoryResult,
    error: SourceControlRepositoryError,
  },
);

export const WsProjectsSearchEntriesRpc = Rpc.make(WS_METHODS.projectsSearchEntries, {
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: ProjectSearchEntriesError,
});

export const WsProjectsListEntriesRpc = Rpc.make(WS_METHODS.projectsListEntries, {
  payload: ProjectListEntriesInput,
  success: ProjectListEntriesResult,
  error: ProjectListEntriesError,
});

export const WsProjectsSubscribeEntriesRpc = Rpc.make(WS_METHODS.projectsSubscribeEntries, {
  payload: ProjectEntriesSubscribeInput,
  success: ProjectEntriesStreamEvent,
  error: ProjectEntriesSubscribeError,
  stream: true,
});

export const WsProjectsCreateEntryRpc = Rpc.make(WS_METHODS.projectsCreateEntry, {
  payload: ProjectCreateEntryInput,
  success: ProjectCreateEntryResult,
  error: ProjectCreateEntryError,
});

export const WsProjectsReadFileRpc = Rpc.make(WS_METHODS.projectsReadFile, {
  payload: ProjectReadFileInput,
  success: ProjectReadFileResult,
  error: ProjectReadFileError,
});

export const WsProjectsWriteFileRpc = Rpc.make(WS_METHODS.projectsWriteFile, {
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: ProjectWriteFileError,
});

export const WsShellOpenInEditorRpc = Rpc.make(WS_METHODS.shellOpenInEditor, {
  payload: LaunchEditorInput,
  error: ExternalLauncherError,
});

export const WsFilesystemBrowseRpc = Rpc.make(WS_METHODS.filesystemBrowse, {
  payload: FilesystemBrowseInput,
  success: FilesystemBrowseResult,
  error: FilesystemBrowseError,
});

export const WsSubscribeVcsStatusRpc = Rpc.make(WS_METHODS.subscribeVcsStatus, {
  payload: VcsStatusInput,
  success: VcsStatusStreamEvent,
  error: GitManagerServiceError,
  stream: true,
});

export const WsVcsPullRpc = Rpc.make(WS_METHODS.vcsPull, {
  payload: VcsPullInput,
  success: VcsPullResult,
  error: GitCommandError,
});

export const WsVcsDiffRpc = Rpc.make(WS_METHODS.vcsDiff, {
  payload: VcsDiffInput,
  success: VcsDiffResult,
  error: GitCommandError,
});

export const WsVcsFileDiffRpc = Rpc.make(WS_METHODS.vcsFileDiff, {
  payload: VcsFileDiffInput,
  success: VcsFileDiffResult,
  error: GitCommandError,
});

export const WsVcsStageFileRpc = Rpc.make(WS_METHODS.vcsStageFile, {
  payload: VcsFileInput,
  error: GitCommandError,
});

export const WsVcsStageFilesRpc = Rpc.make(WS_METHODS.vcsStageFiles, {
  payload: VcsPathsInput,
  error: GitCommandError,
});

export const WsVcsUnstageFileRpc = Rpc.make(WS_METHODS.vcsUnstageFile, {
  payload: VcsFileInput,
  error: GitCommandError,
});

export const WsVcsUnstageFilesRpc = Rpc.make(WS_METHODS.vcsUnstageFiles, {
  payload: VcsPathsInput,
  error: GitCommandError,
});

export const WsVcsRevertFileRpc = Rpc.make(WS_METHODS.vcsRevertFile, {
  payload: VcsFileInput,
  error: GitCommandError,
});

export const WsVcsApplyPatchRpc = Rpc.make(WS_METHODS.vcsApplyPatch, {
  payload: VcsApplyPatchInput,
  error: GitCommandError,
});

export const WsVcsRefreshStatusRpc = Rpc.make(WS_METHODS.vcsRefreshStatus, {
  payload: VcsStatusInput,
  success: VcsStatusResult,
  error: GitManagerServiceError,
});

export const WsVcsCommitGraphRpc = Rpc.make(WS_METHODS.vcsCommitGraph, {
  payload: VcsCommitGraphInput,
  success: VcsCommitGraphResult,
  error: GitCommandError,
});

export const WsGitRunStackedActionRpc = Rpc.make(WS_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: GitActionProgressEvent,
  error: GitManagerServiceError,
  stream: true,
});

export const WsGitGenerateCommitMessageRpc = Rpc.make(WS_METHODS.gitGenerateCommitMessage, {
  payload: GitGenerateCommitMessageInput,
  success: GitGenerateCommitMessageResult,
  error: GitManagerServiceError,
});

export const WsGitCommitStagedRpc = Rpc.make(WS_METHODS.gitCommitStaged, {
  payload: GitCommitStagedInput,
  success: GitCommitStagedResult,
  error: GitManagerServiceError,
});

export const WsGitResolvePullRequestRpc = Rpc.make(WS_METHODS.gitResolvePullRequest, {
  payload: GitPullRequestRefInput,
  success: GitResolvePullRequestResult,
  error: GitManagerServiceError,
});

export const WsGitPreparePullRequestThreadRpc = Rpc.make(WS_METHODS.gitPreparePullRequestThread, {
  payload: GitPreparePullRequestThreadInput,
  success: GitPreparePullRequestThreadResult,
  error: GitManagerServiceError,
});

export const WsVcsListRefsRpc = Rpc.make(WS_METHODS.vcsListRefs, {
  payload: VcsListRefsInput,
  success: VcsListRefsResult,
  error: GitCommandError,
});

export const WsVcsCreateWorktreeRpc = Rpc.make(WS_METHODS.vcsCreateWorktree, {
  payload: VcsCreateWorktreeInput,
  success: VcsCreateWorktreeResult,
  error: GitCommandError,
});

export const WsVcsRemoveWorktreeRpc = Rpc.make(WS_METHODS.vcsRemoveWorktree, {
  payload: VcsRemoveWorktreeInput,
  error: GitCommandError,
});

export const WsVcsCreateRefRpc = Rpc.make(WS_METHODS.vcsCreateRef, {
  payload: VcsCreateRefInput,
  success: VcsCreateRefResult,
  error: GitCommandError,
});

export const WsVcsSwitchRefRpc = Rpc.make(WS_METHODS.vcsSwitchRef, {
  payload: VcsSwitchRefInput,
  success: VcsSwitchRefResult,
  error: GitCommandError,
});

export const WsVcsInitRpc = Rpc.make(WS_METHODS.vcsInit, {
  payload: VcsInitInput,
  error: VcsError,
});

export const WsTerminalOpenRpc = Rpc.make(WS_METHODS.terminalOpen, {
  payload: TerminalOpenInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalWriteRpc = Rpc.make(WS_METHODS.terminalWrite, {
  payload: TerminalWriteInput,
  error: TerminalError,
});

export const WsTerminalResizeRpc = Rpc.make(WS_METHODS.terminalResize, {
  payload: TerminalResizeInput,
  error: TerminalError,
});

export const WsTerminalClearRpc = Rpc.make(WS_METHODS.terminalClear, {
  payload: TerminalClearInput,
  error: TerminalError,
});

export const WsTerminalRestartRpc = Rpc.make(WS_METHODS.terminalRestart, {
  payload: TerminalRestartInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalCloseRpc = Rpc.make(WS_METHODS.terminalClose, {
  payload: TerminalCloseInput,
  error: TerminalError,
});

export const WsTerminalGetStatusSnapshotRpc = Rpc.make(WS_METHODS.terminalGetStatusSnapshot, {
  payload: TerminalStatusSnapshotInput,
  success: TerminalRuntimeStatusSnapshot,
});

export const WsThreadReadGetSnapshotRpc = Rpc.make(WS_METHODS.threadReadGetSnapshot, {
  payload: Schema.Struct({}),
  success: ThreadReadReceiptSnapshot,
  error: ThreadReadReceiptError,
});

export const WsThreadReadMarkVisitedRpc = Rpc.make(WS_METHODS.threadReadMarkVisited, {
  payload: ThreadReadReceiptMarkVisitedInput,
  success: ThreadReadReceipt,
  error: ThreadReadReceiptError,
});

export const WsThreadReadMarkUnreadRpc = Rpc.make(WS_METHODS.threadReadMarkUnread, {
  payload: ThreadReadReceiptMarkUnreadInput,
  success: ThreadReadReceipt,
  error: ThreadReadReceiptError,
});

export const WsThreadWorkbenchGetStateRpc = Rpc.make(WS_METHODS.threadWorkbenchGetState, {
  payload: ThreadWorkbenchGetStateInput,
  success: ThreadWorkbenchState,
  error: ThreadWorkbenchStateError,
});

export const WsThreadWorkbenchSetStateRpc = Rpc.make(WS_METHODS.threadWorkbenchSetState, {
  payload: ThreadWorkbenchSetStateInput,
  success: ThreadWorkbenchState,
  error: ThreadWorkbenchStateError,
});

export const WsOrchestrationDispatchCommandRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.dispatchCommand,
  {
    payload: ClientOrchestrationCommand,
    success: OrchestrationRpcSchemas.dispatchCommand.output,
    error: OrchestrationDispatchCommandError,
  },
);

export const WsOrchestrationGetTurnDiffRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getTurnDiff, {
  payload: OrchestrationGetTurnDiffInput,
  success: OrchestrationRpcSchemas.getTurnDiff.output,
  error: OrchestrationGetTurnDiffError,
});

export const WsOrchestrationGetFullThreadDiffRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getFullThreadDiff,
  {
    payload: OrchestrationGetFullThreadDiffInput,
    success: OrchestrationRpcSchemas.getFullThreadDiff.output,
    error: OrchestrationGetFullThreadDiffError,
  },
);

export const WsOrchestrationGetCheckpointFileRestoreAvailabilityRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getCheckpointFileRestoreAvailability,
  {
    payload: OrchestrationRpcSchemas.getCheckpointFileRestoreAvailability.input,
    success: OrchestrationRpcSchemas.getCheckpointFileRestoreAvailability.output,
    error: OrchestrationGetCheckpointFileRestoreAvailabilityError,
  },
);

export const WsOrchestrationReplayEventsRpc = Rpc.make(ORCHESTRATION_WS_METHODS.replayEvents, {
  payload: OrchestrationReplayEventsInput,
  success: OrchestrationRpcSchemas.replayEvents.output,
  error: OrchestrationReplayEventsError,
});

export const WsOrchestrationGetArchivedShellSnapshotRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot,
  {
    payload: OrchestrationRpcSchemas.getArchivedShellSnapshot.input,
    success: OrchestrationRpcSchemas.getArchivedShellSnapshot.output,
    error: OrchestrationGetSnapshotError,
  },
);

export const WsOrchestrationSubscribeShellRpc = Rpc.make(ORCHESTRATION_WS_METHODS.subscribeShell, {
  payload: OrchestrationRpcSchemas.subscribeShell.input,
  success: OrchestrationRpcSchemas.subscribeShell.output,
  error: OrchestrationGetSnapshotError,
  stream: true,
});

export const WsOrchestrationSubscribeThreadRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.subscribeThread,
  {
    payload: OrchestrationRpcSchemas.subscribeThread.input,
    success: OrchestrationRpcSchemas.subscribeThread.output,
    error: OrchestrationGetSnapshotError,
    stream: true,
  },
);

export const WsSubscribeTerminalEventsRpc = Rpc.make(WS_METHODS.subscribeTerminalEvents, {
  payload: TerminalSubscribeInput,
  success: TerminalEvent,
  stream: true,
});

export const WsSubscribeThreadReadReceiptsRpc = Rpc.make(WS_METHODS.subscribeThreadReadReceipts, {
  payload: Schema.Struct({}),
  success: ThreadReadReceiptStreamEvent,
  error: ThreadReadReceiptError,
  stream: true,
});

export const WsSubscribeServerConfigRpc = Rpc.make(WS_METHODS.subscribeServerConfig, {
  payload: Schema.Struct({}),
  success: ServerConfigStreamEvent,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
  stream: true,
});

export const WsSubscribeServerLifecycleRpc = Rpc.make(WS_METHODS.subscribeServerLifecycle, {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  stream: true,
});

export const WsSubscribeAuthAccessRpc = Rpc.make(WS_METHODS.subscribeAuthAccess, {
  payload: Schema.Struct({}),
  success: AuthAccessStreamEvent,
  stream: true,
});

export const WsRpcGroup = RpcGroup.make(
  WsServerGetConfigRpc,
  WsServerRefreshProvidersRpc,
  WsServerUpdateProviderRpc,
  WsServerUpsertKeybindingRpc,
  WsServerGetSettingsRpc,
  WsServerUpdateSettingsRpc,
  WsServerGetProviderUsageRpc,
  WsServerDiscoverSourceControlRpc,
  WsServerGetTraceDiagnosticsRpc,
  WsServerGetProcessDiagnosticsRpc,
  WsServerGetProcessResourceHistoryRpc,
  WsServerSignalProcessRpc,
  WsSourceControlLookupRepositoryRpc,
  WsSourceControlCloneRepositoryRpc,
  WsSourceControlPublishRepositoryRpc,
  WsProjectsSearchEntriesRpc,
  WsProjectsListEntriesRpc,
  WsProjectsSubscribeEntriesRpc,
  WsProjectsCreateEntryRpc,
  WsProjectsReadFileRpc,
  WsProjectsWriteFileRpc,
  WsShellOpenInEditorRpc,
  WsFilesystemBrowseRpc,
  WsSubscribeVcsStatusRpc,
  WsVcsDiffRpc,
  WsVcsFileDiffRpc,
  WsVcsStageFileRpc,
  WsVcsStageFilesRpc,
  WsVcsUnstageFileRpc,
  WsVcsUnstageFilesRpc,
  WsVcsRevertFileRpc,
  WsVcsApplyPatchRpc,
  WsVcsPullRpc,
  WsVcsRefreshStatusRpc,
  WsVcsCommitGraphRpc,
  WsGitGenerateCommitMessageRpc,
  WsGitCommitStagedRpc,
  WsGitRunStackedActionRpc,
  WsGitResolvePullRequestRpc,
  WsGitPreparePullRequestThreadRpc,
  WsVcsListRefsRpc,
  WsVcsCreateWorktreeRpc,
  WsVcsRemoveWorktreeRpc,
  WsVcsCreateRefRpc,
  WsVcsSwitchRefRpc,
  WsVcsInitRpc,
  WsTerminalOpenRpc,
  WsTerminalWriteRpc,
  WsTerminalResizeRpc,
  WsTerminalClearRpc,
  WsTerminalRestartRpc,
  WsTerminalCloseRpc,
  WsTerminalGetStatusSnapshotRpc,
  WsThreadReadGetSnapshotRpc,
  WsThreadReadMarkVisitedRpc,
  WsThreadReadMarkUnreadRpc,
  WsThreadWorkbenchGetStateRpc,
  WsThreadWorkbenchSetStateRpc,
  WsSubscribeTerminalEventsRpc,
  WsSubscribeThreadReadReceiptsRpc,
  WsSubscribeServerConfigRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeAuthAccessRpc,
  WsOrchestrationDispatchCommandRpc,
  WsOrchestrationGetTurnDiffRpc,
  WsOrchestrationGetFullThreadDiffRpc,
  WsOrchestrationGetCheckpointFileRestoreAvailabilityRpc,
  WsOrchestrationReplayEventsRpc,
  WsOrchestrationGetArchivedShellSnapshotRpc,
  WsOrchestrationSubscribeShellRpc,
  WsOrchestrationSubscribeThreadRpc,
);
