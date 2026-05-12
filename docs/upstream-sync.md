# Upstream Sync Ledger

This fork may manually port upstream work without creating merge ancestry. GitHub's ahead/behind count is therefore not the source of truth for upstream review status. Use this ledger to decide where the next upstream comparison should begin.

## Current Baseline

- Last reviewed upstream: `447236d5` (`upstream/main`, tag `v0.0.24-nightly.20260511.260`)
- Review date: 2026-05-11
- Local branch at review: `main` at `3c1f8b56` with local worktree changes
- Merge strategy: manual integration, no synthetic merge marker
- Next comparison should start at: `447236d5..upstream/main`

## How To Continue

1. Run `git fetch upstream --prune`.
2. Read this file before comparing code.
3. List new upstream work with `git log --oneline 447236d5..upstream/main`.
4. Inspect only relevant upstream changes with targeted `git show` and `git diff` commands.
5. After porting or intentionally skipping new upstream work, rewrite this file with the new last reviewed upstream SHA and a fresh summary.

## Reviewed Upstream Work

The upstream range through `447236d5` was reviewed after this fork had diverged too far for a clean merge. Electron app and marketing app changes were intentionally deprioritized because this build does not use them.

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
