# Upstream Sync Ledger

This fork may manually port upstream work without creating merge ancestry. GitHub's ahead/behind count is therefore not the source of truth for upstream review status. Use this ledger to decide where the next upstream comparison should begin.

## Current Baseline

- Last reviewed upstream: `57f6bf7ed` (`upstream/main`, `Fix turn fold proejctions (#3041)`)
- Review date: 2026-06-11
- Local branch at review: `main` at `cfa78520d` with upstream port edits pending; the worktree also contained existing local auth/environment refactor edits
- Merge strategy: manual integration, no synthetic merge marker
- Next comparison should start at: `57f6bf7ed..upstream/main`

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
3. List new upstream work with `git log --oneline 57f6bf7ed..upstream/main`.
4. Inspect all new commits enough to classify them, then use targeted `git show` and `git diff` commands for likely ports.
5. After porting or intentionally skipping new upstream work, rewrite this file with the new last reviewed upstream SHA and a fresh summary.

## Reviewed Upstream Work

The upstream range through `447236d5` was reviewed after this fork had diverged too far for a clean merge. Electron app and marketing app changes were intentionally deprioritized because this build does not use them.

The upstream range `447236d5..7e20b23e` was reviewed on 2026-05-13. Useful source changes from that range were manually ported where they apply to this fork's current architecture.

The upstream range `7e20b23e..ea20e800` was reviewed on 2026-05-14. Relevant technical work from that range was manually ported and adapted to this fork's current architecture.

The upstream range `ea20e800..d1e85c4e` was reviewed on 2026-05-16. It contained only release version bookkeeping; package versions were mirrored to `0.0.24` so this fork exposes the latest reviewed upstream release line.

The upstream range `d1e85c4e..4f0f24f0` was reviewed on 2026-05-22. It contained one composer state bug fix for multi-instance provider option persistence; the relevant work was manually ported.

The upstream range `4f0f24f0..cf07d063` was reviewed on 2026-05-29. It contained the Effect beta.73 upgrade, Claude Opus 4.8 support, TSGo migration, collection performance refactors, and web cleanup; relevant work was manually ported and adapted to this fork's server/web architecture.

The upstream range `cf07d063..e3f14058` was reviewed on 2026-06-02. It contained a desktop release workflow fix, the large T3 Code Mobile WIP, and vendored reference-repo sync tooling. The release workflow fix was manually ported; the remaining applicable technical work is classified below for a dedicated port.

The upstream range `e3f14058..3ea6adf17` was reviewed on 2026-06-07. It contained 57 commits spanning a major Environment HttpApi/authn/authz refactor, relay/cloud/mobile infrastructure, workspace/package-manager workflow migration, provider/runtime fixes, source-control fixes, composer mention handling, SSH/process-spawn reliability, docs/README churn, desktop release fixes, and relay diagnostics. Relevant runtime fixes were manually ported and adapted; broader product/infra changes were classified below.

The upstream range `3ea6adf17..57f6bf7ed` was reviewed on 2026-06-11. It contained 24 commits spanning Grok ACP support, model catalog updates, Codex app-server service tiers/protocol refresh, git polling/projection fixes, font and UI dependency updates, chat markdown/composer/model-picker polish, provider settings UI, and release version bookkeeping. All selected technical/runtime/web commits from this range were manually ported and adapted to the fork's central-server/browser-client architecture. Four non-selected commits were intentionally skipped: the superseded `v0.0.26` release bump, T3 Connect rebrand, Clerk browser-test mock, and a marketing-site icon fix.

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
- Composer provider option persistence from upstream commit `4f0f24f0`: composer traits state now reads and writes options by `ProviderInstanceId`, passes the selected instance into traits controls, and regression coverage asserts custom provider instances preserve reasoning selections.
- Effect beta.73 migration from upstream commit `e6330ead`: bumped Effect platform packages, refreshed the patch file and lockfile, adapted JSON/schema helpers, RPC protocol socket options, ACP/Codex app-server examples, and shared runtime utility tests for the new APIs.
- Claude Opus 4.8 support from upstream commit `83f0cc9e`: added the Claude Opus 4.8 model/capability definitions, Claude Code v2.1.154 gating and upgrade messaging, ultracode effort mapping, and provider/adapter regression coverage.
- TSGo migration from upstream commit `6b3050ee`: adopted `tsgo --noEmit` package typecheck scripts/configuration, preserved real TypeScript checks, and locally disabled legacy server Effect diagnostic categories that this fork has not fully migrated yet.
- Collection performance refactors from upstream commit `31268945`: ported targeted `Array`/`Result` collection updates across server, shared packages, and web state/composer flows.
- Web cleanup from upstream commit `cf07d063`: aligned active local web surfaces with the upstream cleanup where they still exist in this fork, including workbench/settings/protocol adjustments and context-window/LRU/thread-sort test coverage.
- Shared utility exports from the reviewed range: restored `@t3tools/shared` semver, observability, workbench media, and schema JSON helpers/tests needed by the upgraded packages and exports.
- Release workflow Electron runtime guard from upstream commit `e3accd6e`: release metadata now verifies Electron can be required after `bun install --frozen-lockfile`, reruns `apps/desktop/node_modules/electron/install.js` if runtime artifacts are missing, and fails early if Electron still cannot load.
- Cursor model discovery from upstream commit `d78e02cd0`: provider checks now prefer Cursor's `cursor/list_available_models` extension response and decode per-model config options, while retaining a fallback to session setup config options for older Cursor runtimes and current ACP fixtures.
- SSH command diagnostics and process-spawn hardening from upstream commits `f5849f7d7`, `300f7fd11`, and `a74dfd4f3`: failed SSH commands now surface redacted stdout when stderr is empty, SSH/Tailscale spawns avoid shell mode for system executables, and Bun/Node test child-process spawns use `process.execPath` instead of shell-based executable resolution.
- Composer quoted file mentions from upstream commit `53042f47f`: mention serialization moved to `@t3tools/shared/composerTrigger`, web composer/editor parsing now supports quoted paths with spaces and escaped quotes, and cursor mapping handles quoted mention lengths.
- Source-control provider fixes from upstream commit `49c1b6468`: self-hosted GitLab auth status, multi-account GitHub auth status, Azure DevOps web URL handling, provider discovery refinement, registry routing, and shared source-control URL parsing were ported with local test-style conflict resolution.
- Claude Agent SDK 0.3.x runtime event handling from upstream commits `e1ce9f850` and `75257d64e`: added `tool.denied` provider runtime events, ignored `thinking_tokens`, surfaced permission denial and mirror errors with typed events/errors, and made runtime warning activity rows use adapter-supplied warning summaries.
- Settings scrollbar-gutter layout stability from upstream commit `b0fa60a12`: added local `scrollbar-gutter-stable`/`scrollbar-gutter-both` utilities and applied them to settings layout and reusable scroll areas.
- Workspace browse permission handling from the server/web slice of upstream commit `b76f161d5`: denied directory reads (`EACCES`/`EPERM`) now return empty browse listings, and command-palette browse prefetch no longer walks highlighted child directories on arrow-key movement.
- Environment HttpApi/authn/authz refactor from upstream commit `a04c09a19`: ported the scoped `EnvironmentAuth`/policy/session/pairing/secret stores, auth persistence migration, environment HttpApi contracts and client runtime helpers, web primary-environment auth bootstrap over HttpApi, OAuth-style scoped bearer token exchange, websocket tickets, access-management streams, and scope-checked raw route/orchestration compatibility wrappers adapted to this fork's central server architecture.
- DPoP/header redaction and shared HTTP observability from upstream commit `0e4a43519`: ported the security-relevant header redaction into shared/server/web/client runtime layers without copying unrelated upstream infrastructure extraction that this fork already handles differently.
- Grok ACP provider support from upstream commits `38ea6d483` and `8e6f4229d`: added the Grok driver, provider/adapter layers, ACP support, xAI extension handling, text generation, provider registry integration, contracts, settings metadata, model-selection support, and local provider-registry test utilities. The model-change guard was adapted so Grok's new-thread requirement is enforced through this fork's orchestration flow.
- Claude Fable 5 and Claude model/catalog alignment from upstream commit `de58ec8e2`: added the new Claude model definitions/gating plus upstream adapter/runtime context handling while preserving this fork's existing Claude provider dispatch and event projection behavior.
- Release version tracking from upstream commit `04f7f32ac`: mirrored `apps/desktop`, `apps/server`, `apps/web`, and `packages/contracts` package versions to `0.0.27` as latest reviewed upstream release metadata.
- Bundled web fonts from upstream commit `aca14507f`: adopted local DM Sans and JetBrains Mono packages/imports so the web app no longer depends on Google-hosted fonts.
- UI primitive polish from upstream commits `b03bc4b52` and `238715fd6`: aligned active dialog, alert, button, command, combobox, select, popover, sheet, toggle, menu, and provider-banner surfaces with upstream focus/icon/spacing behavior.
- Chat markdown, file-chip, skill-chip, clipboard, and tooltip polish from upstream commit `7f741a56d`: ported rendered markdown copy fidelity, inline file chips, inline skill rendering, and active tooltip cleanup. Hunks for files absent in this fork were treated as non-applicable, not skipped product work.
- Virtualized model picker from upstream commit `31533466b`: ported the virtualized list, provider rail behavior, disabled-model reasons, scroll fades, and background scroll lock while keeping this fork's lazy model loading and provider instance state.
- Provider environment variable table and accent picker from upstream commit `e2db800f7`: added the provider settings table/accent components and route/layout integration for the active settings surface.
- Branch picker polish from upstream commit `c5f7cd40b`: adapted upstream's trigger, search, virtualized list, and scroll-fade changes to this fork's `RunContextBranchSelector` and existing React Query branch flow.
- Context menu and sidebar icon polish from upstream commit `3efabdcd3`: added header/icon context-menu metadata and aligned sidebar action/menu styling with local navigation behavior.
- Composer polish from upstream commit `a4757c265`: ported focus-ring, command-menu, send/stop/action, context-meter, pending-input, provider-status, and ultrathink visual updates across the active chat composer surfaces.
- Changed-files tree extraction from upstream commit `0b40ea62e`: added the reusable changed-files tree and compact diff-stat rendering used by the timeline.
- Chrome, plan sidebar, and empty-state polish from upstream commit `343061a05`: ported active plan/sidebar/empty/toggle updates. Diff/header/git-control hunks for upstream-only files were non-applicable in this fork.
- Message metadata, timestamps, and tool work-log rows from upstream commit `1916ac6d5`: aligned timeline metadata/timestamp rendering and preserved this fork's existing timestamp helper behavior where it diverged.
- Codex app-server protocol, service tiers, and startup reliability from upstream commit `ae7e88b0e`: regenerated protocol bindings, added service-tier options, updated Codex provider/text generation behavior, and ported startup/probe reliability tests and helpers.
- Git status polling churn reduction from upstream commit `0baf1986e`: ported the Git VCS driver/core, manager, and broadcaster polling changes to reduce redundant central-server work under load.
- Turn fold projection fixes from upstream commit `57f6bf7ed`: ported projector/pipeline/ingestion/cursor/opencode/claude/web store/session/timeline fixes so runtime events fold into thread projections correctly. The upstream `packages/client-runtime/src/threadDetailReducer.ts` hunk is non-applicable because this fork does not have that extracted client-runtime reducer.

Pending alignment work:

- Upstream commit `b3e8c033` (`T3 Code Mobile [WIP]`) needs a dedicated, staged port rather than a direct cherry-pick:
  - `packages/client-runtime`: upstream now extracts substantially more shared client logic, including WebSocket RPC protocol/transport/client code, environment connection bootstrapping, thread detail reducers, shell snapshot state, terminal session state, VCS/git action state, checkpoint/composer/archive state, and reconnect backoff. This fork only has the earlier advertised endpoint, known environment, scoped id, and source-control discovery helpers.
  - Terminal protocol/runtime: upstream adds `terminal.attach`, `subscribeTerminalMetadata`, terminal summary labels, closed events, explicit client-chosen `term-N` ids, and attach streams with initial snapshots. This fork already has a divergent terminal design with `terminal.getStatusSnapshot`, filtered `subscribeTerminalEvents`, `afterSequence`, `includeOutput`, runtime status snapshots, and existing `"default"` terminal id decoding. Reconcile the models before porting.
  - Review diff preview: upstream adds `packages/contracts/src/review.ts`, `review.getDiffPreview`, `ReviewService`, Git review diff preview helpers, untracked-file diff handling, and bounded workspace-root checks. This is useful for compact/mobile review surfaces and could also benefit web if adapted to local VCS/workspace constraints.
  - Shared helpers: evaluate porting `@t3tools/shared/remote`, `composerTrigger`, `orchestrationTiming`, and `terminalLabels`. `remote` currently lives in web-only code here; moving it to shared is likely useful for the central-server/mobile direction.
  - Source-control discovery: upstream adds invalidation, ref-counted `watch`, stale-time caching, client-change subscriptions, and in-flight replacement handling in `packages/client-runtime/src/sourceControlDiscoveryState.ts`. This likely applies to reconnect-heavy multi-environment flows.
  - Web adaptation: upstream deletes several web-only React Query/state modules in favor of client-runtime primitives and rewires `ThreadTerminalDrawer`, git controls, diff/review context, and environment runtime service. Port only after choosing the client-runtime and terminal protocol strategy.
  - Mobile app itself: `apps/mobile` adds 241 files and about 35k lines plus Expo/React Native dependencies, native modules, patches, lockfile churn, CI static analysis, and `bun lint:mobile`. Keep this as a product-level decision; do not pull it into this fork just to satisfy upstream alignment.
- Upstream commit `e3f14058` (`chore: add vendored reference repo subtree sync tooling`) is pending a repo-policy decision. It adds `scripts/sync-reference-repos.ts`, `scripts/lib/reference-repos.ts`, tests, `sync:repos`, `.repos/**` formatter/linter/editor exclusions, and a large `.repos/effect-smol` vendored subtree. The tooling is useful for agent reference material, but the subtree adds substantial repository weight and has no runtime effect.
- Upstream commit `5ae77c0d6` (`feat(relay): Add managed relay tunnels and APN service`) and follow-up relay diagnostics commits `a56496c7f` and `3ea6adf17` are pending a product/infra decision. They add managed relay tunnels, APN/live-activity delivery, DPoP/relay auth helpers, `infra/relay`, mobile/cloud UI, and relay observability. Port only if this fork intentionally adopts upstream's managed relay/cloud architecture.
- Upstream commit `9da430c82` (`Refactor recoverable Effect fallbacks to orElseSucceed`) was reviewed but not ported. It is mostly mechanical code-style cleanup plus upstream package/lockfile movement; the runtime-only patch no longer applies cleanly after this fork's source-control/workspace/terminal divergence.

Intentionally skipped or not relevant:

- Electron app changes.
- Marketing app changes.
- Upstream commit `34bb18c8` (`feat(marketing): Made marketing site less cringe`) is marketing-site content/assets and should stay skipped for this fork unless the marketing app becomes a maintained surface again.
- Upstream commit `b793401a` (`chore(release): prepare v0.0.23`) only bumped package versions from `0.0.22` to `0.0.23` and was superseded by the later `0.0.24` tracking version bump.
- Upstream commit `e64c19f1` is mostly hosted Vercel release routing and public-domain aliasing. This fork currently keeps `apps/web/vercel.json` and self-hosted central-server direction, so defer unless the hosted channel/router release flow is revived.
- Upstream-only workspace/package cleanup for surfaces not present in this fork remains skipped where applicable, including the removed `oxlint-plugin-t3code` workspace and web components already deleted locally (`DiffPanel`, `OpenInPicker`, and old keybinding settings logic).
- The mobile app from upstream `b3e8c033` is not relevant unless this fork chooses to ship or maintain a native mobile surface. Shared runtime/protocol work from that commit remains pending separately.
- Vendored `.repos/effect-smol` contents from upstream `e3f14058` are not runtime code. Skip unless this fork intentionally accepts vendored reference repositories and their repository-size impact.
- Upstream ancestry merge marker. The fork is still ancestry-behind upstream by design.
- Upstream commit `bd851c020` (`chore: add Alchemy reference repo subtree`) adds a large `.repos/alchemy-effect` vendored subtree. Skip under the same repo-weight policy as `.repos/effect-smol`.
- Upstream workspace/package-manager and test-runner migration commits `b440dd181`, `6e6163255`, `37bf0f0d1`, `f60def205`, `113b9d84c`, `e1cb19b55`, `b870a6e34`, and `a084fbbc0` are skipped for now because this fork's required workflow remains Bun-based (`bun fmt`, `bun lint`, `bun typecheck`, and `bun run test`).
- Upstream desktop/release/CI-only commits `f0116e44b`, `4956415f7`, `e4643eccc`, `30d36b8c4`, `1288909b6`, `dca93d0ee`, `6a1c4da52`, `4f3d00f06`, `4c262c4b4`, `80b40ce96`, `52ae8e88d`, `203f58e45`, `a6edad197`, `9fc485afa`, `dfdb5a46d`, and `602148f8f` were skipped because they target upstream desktop/mobile packaging, hosted release jobs, EAS, or Electron/Clerk IPC paths this fork does not maintain as primary surfaces.
- Upstream relay deploy/Alchemy follow-up commits `295b9db11`, `769bdd251`, `969e6d274`, `af3dfd229`, `357900511`, `eda163ca1`, and `94fc11756` were skipped because they depend on adopting the upstream relay infra stack.
- Upstream docs/README-only commits `ec18938bf`, `b5a62504d`, `c04d15d3b`, `5b26bd408`, `6f42bd9c8`, `8ab58a0b2`, `0d6e9e9ad`, and `92be60e7c` were skipped to avoid upstream docs reshuffle and vp/pnpm/mobile README churn in this fork.
- Upstream commit `348a9140e` (`fix(cli): bundle patched diff parser dependency`) was reviewed and found not applicable to this fork's active Bun package metadata in this pass.
- The desktop-specific parts of upstream commit `b76f161d5` were skipped; only the server workspace browse and web command-palette behavior were ported.
- Upstream commit `983a8c7fa` (`chore(release): prepare v0.0.26`) was skipped because it is superseded by the later `0.0.27` release tracking commit `04f7f32ac`, which was ported.
- Upstream commit `22f9f3058` (`[codex] Rebrand T3 Cloud as T3 Connect`) was skipped because it is cloud/Connect product naming and copy for upstream-hosted surfaces, not this fork's self-hosted central-agent direction.
- Upstream commit `a3422a9bb` (`Fix Clerk browser test mock`) was skipped because it only adjusts upstream Clerk browser-test mocking for cloud/Connect auth UI; this fork is not adopting that Clerk-backed feature tree in this pass.
- Upstream commit `cc9e81ac9` (`fix(marketing) : marketing showing wrong icons on linux`) was skipped because it only affects the marketing site.

## Known Divergences

- This fork is used as a self-hosted central agent surface with browser clients connecting to a persistent server instance.
- Local changes may prefer central-server reliability, predictable reconnect behavior, and maintainability over matching upstream desktop-oriented flows exactly.
- The upstream TSGo migration is adopted, but this fork currently suppresses legacy server Effect environmental diagnostics while keeping real TypeScript errors and stricter non-legacy diagnostics enforced.
- Local terminal streaming/status behavior diverges from upstream's new mobile-oriented attach/metadata streams. Preserve reconnect/replay correctness while evaluating the upstream terminal changes.
- Upstream T3 Connect/Clerk cloud-auth surfaces remain intentionally outside this fork's active feature tree unless the fork adopts upstream's hosted/cloud product direction.
- GitHub may report the branch as behind upstream even when the useful upstream work in the reviewed range has been manually handled.

## Verification History

Latest upstream review completed on 2026-06-11 after upstream fetch:

- Inspected `git log --oneline --reverse 3ea6adf17..upstream/main`.
- New upstream commits reviewed: `0e4a43519`, `38ea6d483`, `8e6f4229d`, `de58ec8e2`, `983a8c7fa`, `22f9f3058`, `a3422a9bb`, `04f7f32ac`, `aca14507f`, `b03bc4b52`, `238715fd6`, `cc9e81ac9`, `7f741a56d`, `31533466b`, `e2db800f7`, `c5f7cd40b`, `3efabdcd3`, `a4757c265`, `0b40ea62e`, `343061a05`, `1916ac6d5`, `ae7e88b0e`, `0baf1986e`, and `57f6bf7ed`.
- Manually ported selected technical/runtime/web commits `0e4a43519`, `38ea6d483`, `8e6f4229d`, `de58ec8e2`, `04f7f32ac`, `aca14507f`, `b03bc4b52`, `238715fd6`, `7f741a56d`, `31533466b`, `e2db800f7`, `c5f7cd40b`, `3efabdcd3`, `a4757c265`, `0b40ea62e`, `343061a05`, `1916ac6d5`, `ae7e88b0e`, `0baf1986e`, and `57f6bf7ed`.
- Intentionally skipped non-selected commits `983a8c7fa`, `22f9f3058`, `a3422a9bb`, and `cc9e81ac9` for the reasons recorded above.
- Structural sanity checks run: `git status --short`, `git ls-files -u` (no unresolved conflict entries), `git diff --check`, and `git diff --cached --check`.
- Full gates were not run by request for this code-only pass: `bun fmt`, `bun lint`, `bun typecheck`, and tests/build commands were intentionally not executed.

Latest upstream review completed on 2026-06-07 after upstream fetch:

- Inspected `git log --oneline --reverse e3f14058..upstream/main`.
- New upstream commits reviewed: `a04c09a19`, `bd851c020`, `f0116e44b`, `d78e02cd0`, `b440dd181`, `6e6163255`, `f5849f7d7`, `4956415f7`, `e4643eccc`, `30d36b8c4`, `1288909b6`, `dca93d0ee`, `6a1c4da52`, `37bf0f0d1`, `4f3d00f06`, `4c262c4b4`, `80b40ce96`, `52ae8e88d`, `203f58e45`, `a6edad197`, `9fc485afa`, `348a9140e`, `b0fa60a12`, `dfdb5a46d`, `49c1b6468`, `a74dfd4f3`, `6ce6f678b`, `53042f47f`, `300f7fd11`, `5ae77c0d6`, `ec18938bf`, `b5a62504d`, `295b9db11`, `769bdd251`, `969e6d274`, `af3dfd229`, `357900511`, `eda163ca1`, `f60def205`, `113b9d84c`, `94fc11756`, `e1cb19b55`, `b870a6e34`, `a084fbbc0`, `9da430c82`, `c04d15d3b`, `5b26bd408`, `6f42bd9c8`, `8ab58a0b2`, `0d6e9e9ad`, `92be60e7c`, `602148f8f`, `e1ce9f850`, `75257d64e`, `b76f161d5`, `a56496c7f`, and `3ea6adf17`.
- Manually ported relevant runtime fixes from upstream commits `d78e02cd0`, `f5849f7d7`, `49c1b6468`, `a74dfd4f3`, `53042f47f`, `300f7fd11`, `b0fa60a12`, `e1ce9f850`, `75257d64e`, and the applicable server/web slice of `b76f161d5`.
- Manually ported the large Environment HttpApi/authn/authz refactor from `a04c09a19` in a follow-up pass after the initial review, adapted to the fork's existing central-server runtime and legacy CLI/orchestration compatibility paths.
- Deferred managed relay/cloud/mobile work from `5ae77c0d6`/`a56496c7f`/`3ea6adf17`, and mechanical `orElseSucceed` cleanup from `9da430c82`.
- Skipped vendored reference subtree, docs/README churn, pnpm/vp/Vite+ workflow migration, relay deploy follow-ups, and desktop/mobile/release-only commits as classified above.
- Focused verification before full gates: `bun run test src/composer-editor-mentions.test.ts src/composer-logic.test.ts` in `apps/web`; `bun run test src/command.test.ts` in `packages/ssh`; `bun run test src/providerRuntime.test.ts` in `packages/contracts`; `bun run test src/sourceControl.test.ts src/composerTrigger.test.ts` in `packages/shared`; and `bun run test src/provider/acp/CursorAcpExtension.test.ts src/provider/Layers/CursorProvider.test.ts src/sourceControl/AzureDevOpsCli.test.ts src/sourceControl/GitHubSourceControlProvider.test.ts src/sourceControl/GitLabSourceControlProvider.test.ts src/sourceControl/SourceControlDiscovery.test.ts src/sourceControl/SourceControlProviderRegistry.test.ts src/workspace/Layers/WorkspaceEntries.test.ts` in `apps/server`.
- Full repo gate passed: `bun fmt`, `bun lint`, and `bun typecheck`.

Follow-up auth refactor verification on 2026-06-07:

- Focused typechecks passed in `apps/server`, `apps/web`, `packages/client-runtime`, `packages/contracts`, and `packages/shared`.
- Focused auth/client verification passed: `bun run test src/auth/EnvironmentAuth.test.ts src/auth/EnvironmentAuthAdmin.test.ts src/auth/EnvironmentAuthPolicy.test.ts src/auth/PairingGrantStore.test.ts src/auth/SessionStore.test.ts src/auth/ServerSecretStore.test.ts src/auth/utils.test.ts src/cliAuthFormat.test.ts` in `apps/server`; `bun run test src/authBootstrap.test.ts src/environments/primary/bootstrap.test.ts` in `apps/web`; `bun run test src/remote.test.ts` in `packages/client-runtime`; and `bun run test src/oauthScope.test.ts` in `packages/shared`.
- Full repo gate passed after the auth follow-up: `bun fmt`, `bun lint`, and `bun typecheck`.

Latest upstream review completed on 2026-06-02 after upstream fetch:

- Ran `git fetch upstream --prune`.
- Inspected `git log --oneline cf07d063..upstream/main`.
- New upstream commits reviewed: `e3accd6e`, `b3e8c033`, and `e3f14058`.
- Inspected targeted upstream patches with `git show` / `git diff`, including release workflow, mobile shared-runtime/server/protocol/web changes, and reference-repo sync tooling.
- Manually ported upstream commit `e3accd6e` into `.github/workflows/release.yml`.
- Remaining reviewed work was classified as pending dedicated alignment or skipped unless product/repo policy changes.
- Verification after ledger update: `bun fmt`, `bun lint`, and `bun typecheck`.

Latest upstream review completed on 2026-05-29 after upstream fetch:

- Ran `git fetch upstream --prune`.
- Inspected `git log --oneline 4f0f24f0..upstream/main`.
- New upstream commits reviewed: `e6330ead`, `83f0cc9e`, `6b3050ee`, `31268945`, and `cf07d063`.
- Inspected targeted upstream patches with `git show` / `git diff` and manually integrated the full reviewed range without creating merge ancestry.
- Ran `bun install` after workspace/package updates.
- Focused verification: `bun run test src/provider/Layers/ProviderRegistry.test.ts src/provider/Layers/ClaudeAdapter.test.ts` in `apps/server`; `bun run test src/lib/contextWindow.test.ts src/lib/lruCache.test.ts src/lib/threadSort.test.ts` in `apps/web`; and `bun run test src/schemaJson.test.ts src/observability.test.ts` in `packages/shared`.
- Full repo gate: `bun fmt`, `bun lint`, and `bun typecheck`.

Latest upstream review completed on 2026-05-22 after upstream fetch:

- Inspected `git log --oneline d1e85c4e..upstream/main`.
- New upstream commit reviewed: `4f0f24f0`.
- Inspected `git show --stat --patch 4f0f24f0`.
- Manually ported `4f0f24f0` so composer provider traits use provider instance IDs instead of provider driver kinds for option lookup and persistence.
- Focused verification: `bun run test src/composerDraftStore.test.ts` in `apps/web`.
- `bun typecheck` initially surfaced unrelated server Effect diagnostics; cleaned the narrow diagnostics and verified with `bun run test src/provider/Layers/CursorAdapter.test.ts src/provider/Layers/OpenCodeAdapter.test.ts src/sourceControl/SourceControlRepositoryService.test.ts src/terminal/Layers/Manager.test.ts src/workspace/Layers/WorkspaceWatcher.test.ts` in `apps/server`.
- Full repo gate: `bun fmt`, `bun lint`, and `bun typecheck`.

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
