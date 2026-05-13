# Upstream Sync Ledger

This fork may manually port upstream work without creating merge ancestry. GitHub's ahead/behind count is therefore not the source of truth for upstream review status. Use this ledger to decide where the next upstream comparison should begin.

## Current Baseline

- Last reviewed upstream: `7e20b23e` (`upstream/main`, tag `v0.0.24-nightly.20260513.273` on prior commit `b83e9c95`)
- Review date: 2026-05-13
- Local branch at review: `main` at `bc53e668` with manual sync worktree changes
- Merge strategy: manual integration, no synthetic merge marker
- Next comparison should start at: `7e20b23e..upstream/main`

## How To Continue

1. Run `git fetch upstream --prune`.
2. Read this file before comparing code.
3. List new upstream work with `git log --oneline 7e20b23e..upstream/main`.
4. Inspect only relevant upstream changes with targeted `git show` and `git diff` commands.
5. After porting or intentionally skipping new upstream work, rewrite this file with the new last reviewed upstream SHA and a fresh summary.

## Reviewed Upstream Work

The upstream range through `447236d5` was reviewed after this fork had diverged too far for a clean merge. Electron app and marketing app changes were intentionally deprioritized because this build does not use them.

The upstream range `447236d5..7e20b23e` was reviewed on 2026-05-13. Useful source changes from that range were manually ported where they apply to this fork's current architecture.

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

Pending alignment work:

- Upstream commit `b83e9c95` (`Refactor composer refs and context providers`) should be treated as pending alignment work, not irrelevant. It is broad React/compiler cleanup: pins React/React DOM to `19.2.6`, updates `@types/react`, bumps `babel-plugin-react-compiler`, converts context consumers/providers to React 19 `use(...)` / `<Context>` style, removes `forwardRef` from composer paths, renames `rpc/atomRegistry.tsx` to `.ts`, and churns a large `ChatComposer` file. Port as its own dedicated web cleanup pass.

Intentionally skipped or not relevant:

- Electron app changes.
- Marketing app changes.
- Upstream commit `b793401a` (`chore(release): prepare v0.0.23`) only bumped package versions from `0.0.22` to `0.0.23` in `apps/desktop`, `apps/server`, `apps/web`, and `packages/contracts`; skip until this fork performs its own intentional release bookkeeping.
- Upstream commit `e64c19f1` is mostly hosted Vercel release routing and public-domain aliasing. This fork currently keeps `apps/web/vercel.json` and self-hosted central-server direction, so defer unless the hosted channel/router release flow is revived.
- Upstream commit `16c69ba7` only removes outline styling from a git success toast action. It is safe but cosmetic; port opportunistically if touching `GitActionsControl`.
- Upstream commit `5165b8c3` optimized the older checkpoint/full-thread patch diff path. The active workspace diff UI now uses the Monaco/VS Code-style workbench and `vcs.fileDiff`, so this is not a priority manual merge. Reconsider only if the legacy `orchestration.getTurnDiff` / `getFullThreadDiff` RPCs become user-facing again or backend checkpoint diff latency shows up independently.
- Upstream ancestry merge marker. The fork is still ancestry-behind upstream by design.

## Known Divergences

- This fork is used as a self-hosted central agent surface with browser clients connecting to a persistent server instance.
- Local changes may prefer central-server reliability, predictable reconnect behavior, and maintainability over matching upstream desktop-oriented flows exactly.
- GitHub may report the branch as behind upstream even when the useful upstream work in the reviewed range has been manually handled.

## Verification For Latest Manual Sync

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
