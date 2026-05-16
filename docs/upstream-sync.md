# Upstream Sync Ledger

This fork may manually port upstream work without creating merge ancestry. GitHub's ahead/behind count is therefore not the source of truth for upstream review status. Use this ledger to decide where the next upstream comparison should begin.

## Current Baseline

- Last reviewed upstream: `d1e85c4e` (`upstream/main`, tag `v0.0.25-nightly.20260515.295`)
- Review date: 2026-05-16
- Local branch at review: `main` at `f9b03383` with clean worktree
- Merge strategy: manual integration, no synthetic merge marker
- Next comparison should start at: `d1e85c4e..upstream/main`

## Manual Alignment Policy

This fork has enough feature drift that a normal upstream merge is usually not viable, but keep both forks aligned as much as practical through manual ports.

- Review every new upstream commit enough to classify it. Do not skip a commit just because it is not immediately on this fork's critical path.
- Prefer porting upstream bug fixes, reliability fixes, performance work, protocol/schema updates, dependency maintenance, and new features that do not overlap this fork's own central-server direction.
- For release-only package version commits, mirror upstream package versions in `apps/desktop`, `apps/server`, `apps/web`, and `packages/contracts` as tracking metadata for the latest reviewed upstream release line. This does not by itself mean this fork has published an upstream release.
- Adapt upstream behavior to the local architecture instead of copying patches mechanically when package boundaries or UX flows have diverged.
- Defer broad or risky upstream work only when it needs its own dedicated pass, conflicts with local architecture, duplicates an existing local implementation, or targets apps/features this fork does not ship.
- Record every decision as `ported`, `pending dedicated pass`, `deferred with trigger`, or `intentionally skipped`, with enough rationale for the next sync reviewer to continue without re-litigating the same range.

## How To Continue

1. Run `git fetch upstream --prune`.
2. Read this file before comparing code.
3. List new upstream work with `git log --oneline d1e85c4e..upstream/main`.
4. Inspect all new commits enough to classify them, then use targeted `git show` and `git diff` commands for likely ports.
5. After porting or intentionally skipping new upstream work, rewrite this file with the new last reviewed upstream SHA and a fresh summary.

## Reviewed Upstream Work

The upstream range through `447236d5` was reviewed after this fork had diverged too far for a clean merge. Electron app and marketing app changes were intentionally deprioritized because this build does not use them.

The upstream range `447236d5..7e20b23e` was reviewed on 2026-05-13. Useful source changes from that range were manually ported where they apply to this fork's current architecture.

The upstream range `7e20b23e..ea20e800` was reviewed on 2026-05-14. Relevant technical work from that range was manually ported and adapted to this fork's current architecture.

The upstream range `ea20e800..d1e85c4e` was reviewed on 2026-05-16. It contained only release version bookkeeping; package versions were mirrored to `0.0.24` so this fork exposes the latest reviewed upstream release line.

Manually ported or aligned:

- Hosted static channel bootstrap and CORS hardening.
- Configurable automatic git fetch interval.
- OpenCode raw delta handling.
- Browser RPC timing map cleanup.
- Chat composer ref cleanup.
- Codex realtime started mapping and Amazon Bedrock auth labeling.
- Codex app-server protocol binding refresh from upstream commit `dd32f526`.
- Codex JSON wire encoding/decoding via Effect Schema.
- Archived shell snapshot support from upstream commit `63859aa0`.
- Active shell snapshots now exclude archived threads; archived threads load through a separate RPC/cache path.
- Archive/unarchive/delete UI actions refresh the archived snapshot cache.
- Projection indexes for active/archived thread shell reads.
- Codex provider probe reliability from upstream commits `6ab8f93a` and `8fc31793`: shared `AUTH_PROBE_TIMEOUT_MS`, scoped timeout cleanup, app-server `forceKillAfter`, and timeout scope regression coverage.
- Project grouping selector stability from upstream commit `447236d5`: shared `selectProjectGroupingSettings` and reuse across `ChatView`, `Sidebar`, `useHandleNewThread`, and the root event router.
- Chat timeline activity rerender reduction from upstream commit `a41f4895`: active-turn copy streaming state and completion summary are derived into timeline rows instead of invalidating the shared row context on activity changes.
- Effect child-process based external launcher from upstream commit `d15909af`: replaced the old `open` package/browser-editor launch service with `ExternalLauncher`, wired `ChildProcessSpawner` through server runtime and WebSocket RPC handling, and updated launcher coverage.
- Provider update advisories from upstream commit `9b604bca`: added server-side provider maintenance capability detection, provider version advisory schemas, one-click provider update RPC/state projection, update command coordination, provider snapshot/cache handling for volatile update state, and web advisory notification/card surfaces adapted to this fork's single General settings page.
- Provider update popover overflow fix from upstream commit `7e20b23e`: constrained the provider update popover to the viewport and wrapped long manual update commands in `ScrollArea`.
- React/composer cleanup from upstream commit `b83e9c95`: pinned React/React DOM and React type packages, updated the React compiler dependency, removed composer `forwardRef` plumbing in favor of explicit ref props, adopted upstream context-provider cleanup where it fits this fork's timeline architecture, and renamed `apps/web/src/rpc/atomRegistry.tsx` to `.ts`.
- Git success toast styling from upstream commit `16c69ba7`.
- VCS/checkpoint diff performance work from upstream commit `5165b8c3`: ported the Effect child-process runner integration, `VcsProcess`, Git VCS driver core updates, checkpoint diff query optimizations, VCS contracts/tests, and terminal manager/test adaptations while preserving this fork's terminal replay behavior.
- GitHub workflow permission hardening from upstream commit `556c4245`.
- Browser resume reconnect freshness from upstream commit `90eea047`: browser resume now skips reconnecting healthy environment WebSocket streams and only reconnects stale heartbeat streams.
- VCS remote refresh backoff from upstream commit `4120e945`: failing remote refresh loops back off exponentially up to 15 minutes while honoring larger configured intervals.
- Workspace build/dependency cleanup from upstream commit `f92e1e1b`: moved advertised endpoint helpers to `@t3tools/shared/advertisedEndpoint`, simplified workspace package scripts/dependencies, and adapted desktop imports to this fork's current file layout.
- Diagnostics prerequisite and resource-history work from upstream commits `a2ff50db` and `9e632f5c`: added process diagnostics, trace diagnostics, in-memory process resource sampling, diagnostics RPC/contracts, a Diagnostics settings route, and adapted tests. `a2ff50db` was not listed in the previous pending range, but `9e632f5c` depended on it and this pass corrected that prerequisite gap.
- Desktop runtime dependency staging fix from upstream commit `ea20e800`: bundled workspace packages and Electron are omitted from staged desktop runtime dependencies.
- Release version tracking from upstream commit `d1e85c4e`: mirrored `apps/desktop`, `apps/server`, `apps/web`, and `packages/contracts` package versions to `0.0.24` as upstream tracking metadata.

Pending alignment work:

- No technical alignment work is pending through upstream `d1e85c4e`.

Intentionally skipped or not relevant:

- Electron app changes.
- Marketing app changes.
- Upstream commit `34bb18c8` (`feat(marketing): Made marketing site less cringe`) is marketing-site content/assets and should stay skipped for this fork unless the marketing app becomes a maintained surface again.
- Upstream commit `b793401a` (`chore(release): prepare v0.0.23`) only bumped package versions from `0.0.22` to `0.0.23` and was superseded by the later `0.0.24` tracking version bump.
- Upstream commit `e64c19f1` is mostly hosted Vercel release routing and public-domain aliasing. This fork currently keeps `apps/web/vercel.json` and self-hosted central-server direction, so defer unless the hosted channel/router release flow is revived.
- Upstream ancestry merge marker. The fork is still ancestry-behind upstream by design.

## Known Divergences

- This fork is used as a self-hosted central agent surface with browser clients connecting to a persistent server instance.
- Local changes may prefer central-server reliability, predictable reconnect behavior, and maintainability over matching upstream desktop-oriented flows exactly.
- GitHub may report the branch as behind upstream even when the useful upstream work in the reviewed range has been manually handled.

## Verification History

Latest upstream review completed on 2026-05-16 after upstream fetch:

- Inspected `git log --oneline ea20e800..upstream/main`.
- New upstream commit reviewed: `d1e85c4e`.
- Inspected `git show --stat --patch d1e85c4e`.
- Mirrored `d1e85c4e` package version bookkeeping so `apps/desktop`, `apps/server`, `apps/web`, and `packages/contracts` report `0.0.24`, matching the latest reviewed upstream release line.
- Verification: `bun fmt`, `bun lint`, and `bun typecheck`.

Latest manual sync completed on 2026-05-14 after upstream fetch:

- Inspected `git log --oneline 7e20b23e..upstream/main`.
- New upstream commits reviewed: `556c4245`, `f92e1e1b`, `90eea047`, `34bb18c8`, `4120e945`, `9e632f5c`, and `ea20e800`.
- Also inspected and ported missing diagnostics prerequisite commit `a2ff50db` because `9e632f5c` depends on process and trace diagnostics added there.
- Manually ported technical alignment commits `b83e9c95`, `16c69ba7`, `5165b8c3`, `556c4245`, `f92e1e1b`, `90eea047`, `4120e945`, `a2ff50db`, `9e632f5c`, and `ea20e800`, adapted where this fork's settings, desktop, diagnostics, and terminal architectures diverged.
- Intentionally skipped `34bb18c8` marketing-site refresh.
- Focused verification: `bun run test src/diagnostics/ProcessDiagnostics.test.ts src/diagnostics/ProcessResourceMonitor.test.ts src/diagnostics/TraceDiagnostics.test.ts src/vcs/VcsStatusBroadcaster.test.ts src/vcs/VcsProcess.test.ts src/processRunner.test.ts src/checkpointing/Layers/CheckpointDiffQuery.test.ts` in `apps/server`; `bun run test src/server.test.ts` in `apps/server`; `bun run test src/localApi.test.ts src/environments/runtime/service.threadSubscriptions.test.ts` in `apps/web`; and `bun run test build-desktop-artifact.test.ts` in `scripts`.
- Full repo gate: `bun fmt`, `bun lint`, and `bun typecheck`.

Latest manual sync completed on 2026-05-13:

- Ran `git fetch upstream --prune`.
- Inspected `git log --oneline 447236d5..upstream/main`.
- Inspected targeted patches and stats for upstream commits `d15909af`, `a41f4895`, `b83e9c95`, and `7e20b23e`.
- Manually ported `a41f4895` and `d15909af`.
- Corrected the previous review miss for `9b604bca`: the ledger baseline had treated the upstream range through `447236d5` as reviewed, but this fork still lacked the provider-update advisory prerequisite. The earlier skip was a ledger/baseline mistake, not a technical reason to avoid the refactor.
- Manually ported `9b604bca` and then applied `7e20b23e` on top of the adapted provider update popover.
- Reclassified `b83e9c95` as pending alignment work rather than an intentional skip.
- Focused verification before the full repo gate: `bun run test src/process/externalLauncher.test.ts src/server.test.ts` in `apps/server`, `bun run test src/provider/providerMaintenance.test.ts src/stream/collectUint8StreamText.test.ts src/provider/makeManagedServerProvider.test.ts` in `apps/server`, `bun run test src/components/chat/MessagesTimeline.logic.test.ts src/localApi.test.ts` in `apps/web`, `bun run test src/server.test.ts` in `packages/contracts`, `bun run test src/shell.test.ts` in `packages/shared`, `bun run typecheck` in `apps/server`, `bun run typecheck` in `apps/web`, `bun run typecheck` in `packages/contracts`, and `bun run typecheck` in `packages/shared`.
- Full repo gate passed: `bun fmt`, `bun lint`, and `bun typecheck`. `bun lint` and `bun typecheck` reported only pre-existing warnings/Effect diagnostics.

Latest review completed on 2026-05-11:

- Inspected `git log --oneline b793401a..upstream/main`.
- Inspected targeted patches for upstream commits `6ab8f93a`, `8fc31793`, `5165b8c3`, `447236d5`, `e64c19f1`, and `16c69ba7`.
- Manually ported upstream commits `6ab8f93a`, `8fc31793`, and `447236d5`.
- Deferred `5165b8c3` because the active diff UI now uses the workbench `vcs.fileDiff` path.
- Verification: `bun fmt`, `bun lint`, `bun typecheck`, and `bun run test src/provider/Layers/ProviderRegistry.test.ts` in `apps/server`.

Previous review completed on 2026-05-10:

- Inspected `git log --oneline 3c32bc8f..upstream/main`.
- Inspected `git show --stat --patch b793401a`.
- No code changes were ported; no verification commands were required for the release-only skip.

Previous manual sync completed on 2026-05-09:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- `bun run test src/protocol.test.ts` in `packages/effect-codex-app-server`
- `bun run test src/provider/Layers/CodexAdapter.test.ts src/provider/Layers/ProviderRegistry.test.ts src/orchestration/Layers/ProjectionSnapshotQuery.test.ts src/server.test.ts` in `apps/server`
- `bun run test src/components/ChatView.logic.test.ts` in `apps/web`

`bun lint` passed with pre-existing warnings unrelated to the upstream sync.
