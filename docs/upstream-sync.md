# Upstream Sync Ledger

This fork may manually port upstream work without creating merge ancestry. GitHub's ahead/behind count is therefore not the source of truth for upstream review status. Use this ledger to decide where the next upstream comparison should begin.

## Current Baseline

- Last reviewed upstream: `3c32bc8f` (`upstream/main`, tag `v0.0.23-nightly.20260509.240`)
- Review date: 2026-05-09
- Local branch at review: `main`
- Merge strategy: manual integration, no synthetic merge marker
- Next comparison should start at: `3c32bc8f..upstream/main`

## How To Continue

1. Run `git fetch upstream --prune`.
2. Read this file before comparing code.
3. List new upstream work with `git log --oneline 3c32bc8f..upstream/main`.
4. Inspect only relevant upstream changes with targeted `git show` and `git diff` commands.
5. After porting or intentionally skipping new upstream work, rewrite this file with the new last reviewed upstream SHA and a fresh summary.

## Reviewed Upstream Work

The upstream range through `3c32bc8f` was reviewed after this fork had diverged too far for a clean merge. Electron app and marketing app changes were intentionally deprioritized because this build does not use them.

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

Intentionally skipped or not relevant:

- Electron app changes.
- Marketing app changes.
- Upstream ancestry merge marker. The fork is still ancestry-behind upstream by design.

## Known Divergences

- This fork is used as a self-hosted central agent surface with browser clients connecting to a persistent server instance.
- Local changes may prefer central-server reliability, predictable reconnect behavior, and maintainability over matching upstream desktop-oriented flows exactly.
- GitHub may report the branch as behind upstream even when the useful upstream work in the reviewed range has been manually handled.

## Verification For Latest Manual Sync

Completed on 2026-05-09:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- `bun run test src/protocol.test.ts` in `packages/effect-codex-app-server`
- `bun run test src/provider/Layers/CodexAdapter.test.ts src/provider/Layers/ProviderRegistry.test.ts src/orchestration/Layers/ProjectionSnapshotQuery.test.ts src/server.test.ts` in `apps/server`
- `bun run test src/components/ChatView.logic.test.ts` in `apps/web`

`bun lint` passed with pre-existing warnings unrelated to the upstream sync.
