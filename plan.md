# Chrome Rewrite Plan

Completion note, 2026-05-16:

- Implemented without starting or modifying the local t3 service.
- Screenshot checklist items were reviewed against code and build output only; live browser captures were intentionally skipped to respect the "do not touch the t3 service" constraint.
- Items that called for additional tests were verified through existing focused suites and the full repository test suite, per the instruction not to add additional tests.

## Context

T3 Code currently has five overlapping control surfaces that ask users to remember where each global, thread, git, environment, and editor action happens:

- App sidebar: projects, threads, search, settings navigation, archive, sort.
- Chat header: sidebar trigger, project badge, mobile pane toggle, scripts, open-in editor, git actions, terminal toggle.
- Branch toolbar above the composer: environment, environment mode, branch, checkout PR.
- Workbench tab and breadcrumb header: open tabs, breadcrumbs, save, stage, revert.
- Workbench explorer header: files/changes mode, new file/folder, refresh, collapse.

This rewrite collapses those surfaces into a small, durable shell:

- Activity Rail: the only navigation rail. It switches the side panel between Threads, Explorer, Changes, Run, Search, and Settings.
- Side Panel: the only sidebar. It is resizable, persistent, and mode-based. Project switching is pinned at the top in every mode.
- Status Bar: the bottom global state/action strip. It owns project, branch, environment, connection, diagnostics, terminal, and high-level git/run state.
- Main content: chat and workbench become content panes with minimal local chrome.
- Composer Run Context Pill: a single compact control for where the next agent turn runs.
- Bottom Panel: the existing terminal drawer evolves into a general bottom panel.

The rewrite must prune aggressively. Do not preserve old surfaces as hidden parallel implementations unless a phase explicitly needs a temporary compatibility bridge. Prefer existing base components from `apps/web/src/components/ui`, existing logic modules, existing hooks, and existing stores before adding new abstractions.

## Ownership Rules

- Navigation belongs to Activity Rail and Side Panel.
- Cross-cutting state belongs to Status Bar.
- Project-level actions belong to Status Bar chip menus or the relevant Side Panel view.
- Git changes, commit, push, and pull request actions belong to Changes.
- Scripts and runnable project tasks belong to Run.
- Thread execution context belongs to the Composer Run Context Pill.
- Per-file actions belong to Explorer, Changes, the editor, or the diff surface.
- Editor document state belongs to tabs, breadcrumbs, dirty indicators, and transient save affordances.
- Chat header owns only thread identity and narrow mobile chat/files controls.

## Existing Components To Reuse Or Move

- `apps/web/src/components/AppSidebarLayout.tsx`: reshape into the app shell instead of layering another shell around it.
- `apps/web/src/components/Sidebar.tsx`: split into project switcher and `SidePanelThreads`.
- `apps/web/src/components/Sidebar.logic.ts`: keep thread/project sorting and selection logic; extract only when needed.
- `apps/web/src/components/chat/ChatHeader.tsx`: reduce to thread title and mobile-local controls.
- `apps/web/src/components/BranchToolbar.tsx` and related selectors: consume the logic in `RunContextPill`, then retire the toolbar row.
- `apps/web/src/components/BranchToolbar.logic.ts`: preserve and rename only if it becomes generic run-context logic.
- `apps/web/src/components/GitActionsControl.logic.ts`: preserve git workflow logic; move UI to Changes and Status Bar entry points.
- `apps/web/src/components/GitActionsControl.tsx`: retire as a header control once Changes owns the workflow.
- `apps/web/src/components/ProjectScriptsControl.tsx`: preserve script discovery/execution behavior; move UI to Run and Status Bar last-run chip.
- `apps/web/src/components/ThreadTerminalDrawer.tsx`: rename or wrap as `BottomPanel` and keep terminal behavior intact.
- `apps/web/src/components/workbench/WorkbenchExplorerPanel.tsx`: move into `SidePanelExplorer` and remove the workbench-local sidebar.
- `apps/web/src/components/workbench/WorkbenchCommitGraph.tsx`: use as part of Changes.
- `apps/web/src/components/workbench/WorkbenchToolbarActions.tsx`: delete after save/stage/revert have new homes.
- `apps/web/src/components/workbench/WorkbenchTabBar.tsx`: keep.
- `apps/web/src/components/workbench/WorkbenchBreadcrumbs.tsx`: keep, but remove broad action ownership.
- `apps/web/src/components/ui/sidebar.tsx` and `apps/web/src/components/ui/pane-chrome.tsx`: reuse as the base sidebar/resizer/toggle primitives where practical.

## New Components

- `ActivityRail.tsx`: desktop vertical rail and mobile bottom tab bar.
- `SidePanel.tsx`: shared shell, resize/persistence, mode registry, project switcher slot.
- `SidePanelThreads.tsx`: slimmed current sidebar content.
- `SidePanelExplorer.tsx`: file explorer view.
- `SidePanelChanges.tsx`: changed files, staged/unstaged state, commit graph, commit/push/PR actions.
- `SidePanelRun.tsx`: scripts, last-run state, runnable tasks, output entry points.
- `SidePanelSearch.tsx`: search entry point; can start as a placeholder only if phase-scoped.
- `SidePanelSettings.tsx`: settings navigation/content mounted as a side-panel mode.
- `StatusBar.tsx`: bottom bar shell.
- `StatusBarConnection.tsx`
- `StatusBarProject.tsx`
- `StatusBarBranch.tsx`
- `StatusBarDiagnostics.tsx`
- `StatusBarRunScript.tsx`
- `StatusBarTerminal.tsx`
- `RunContextPill.tsx`: compact composer-docked environment/mode/branch control.
- `BottomPanel.tsx`: general bottom drawer shell for terminal first, output/logs later.

## Design Constraints

- Keep the UI dense, predictable, and operational. This is a work surface, not a landing page.
- Use icon buttons for rail items and compact global chips in the status bar.
- Avoid nested cards and decorative page chrome.
- Keep text labels short and prevent layout shifts when state changes.
- Persist side panel active mode and per-mode width.
- Keep mobile as a first-class layout, not a squeezed desktop shell.
- Make each phase independently shippable.
- Do not introduce private hostnames, absolute user paths, auth material, generated plist files, or local logs.

## Shared Technical Requirements

- Introduce shared action ownership before duplicating UI entry points. Status bar chips, side panel controls, keyboard shortcuts, and future command palette entries should call the same action functions.
- Keep schema-only packages schema-only. Do not add runtime shell logic to `packages/contracts`.
- Prefer `packages/shared` for runtime helpers consumed by both server and web, using explicit subpath exports.
- Avoid local one-off logic when a shared module can cleanly own behavior.
- Remove retired components and dead props in the same phase that makes them unused.
- Add focused tests for extracted logic and behavioral contracts.
- After each phase, run:
  - [x] `bun fmt`
  - [x] `bun lint`
  - [x] `bun typecheck`
- Do not run `bun test`. Use `bun run test` only when tests are needed.

## Phase 0: Baseline And Shell Inventory

- [x] Record current screenshots for desktop and mobile states that will be affected: chat-only, chat plus workbench, sidebar open, workbench explorer open, git changes visible, terminal drawer open, settings.
- [x] Inventory current keyboard shortcuts and decide which ones remain shell-level shortcuts.
- [x] Inventory persisted UI state in local storage/settings related to sidebar, workbench, terminal, branch toolbar, and mobile pane selection.
- [x] Identify all current imports of `ChatHeader`, `BranchToolbar`, `GitActionsControl`, `ProjectScriptsControl`, `WorkbenchExplorerPanel`, `WorkbenchToolbarActions`, `ThreadTerminalDrawer`, and `AppSidebarLayout`.
- [x] Decide exact storage keys for active side panel mode, per-mode widths, rail collapse state, bottom panel state, and mobile sheet state.
- [x] Define acceptance screenshots for each later phase so regressions are obvious.
- [x] Run the required verification commands and note any pre-existing failures before implementation starts.

## Phase 1: Action Ownership And Read-Only Status Bar

- [x] Create a small web-side action ownership layer for shell commands without changing visible behavior.
- [x] Route existing terminal toggle, project switch, git quick action, script run, and workbench save actions through shared action functions where practical.
- [x] Add `StatusBar` with read-only connection, project, branch, environment, ahead/behind, diagnostics, and terminal state chips.
- [x] Keep existing header/sidebar controls during this phase; the status bar validates data wiring without removing old entry points.
- [x] Use existing git status state helpers from `apps/web/src/lib/gitStatusState.ts`.
- [x] Keep chip labels compact and define overflow behavior for narrow widths.
- [x] Add tests for status chip view-model logic, especially missing git repository, detached/no branch, disconnected, and loading states.
- [x] Verify desktop layout does not steal composer/editor vertical space unexpectedly.
- [x] Verify mobile status bar compression state exists, even if not final.
- [x] Prune any status-specific duplicated formatting introduced during the phase.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 2: App Shell, Activity Rail, And Threads Side Panel

- [x] Reshape `AppSidebarLayout` into an app shell that owns Activity Rail, Side Panel, main content, and Status Bar.
- [x] Add `ActivityRail` with Threads as the only enabled mode initially.
- [x] Add `SidePanel` shell using existing sidebar/resizable primitives where practical.
- [x] Extract project switcher/header behavior from `Sidebar` into a reusable top slot for every side panel mode.
- [x] Move current thread list behavior into `SidePanelThreads` with minimal behavior changes.
- [x] Preserve current project grouping, sorting, archive, new thread, search/filter, and settings access behavior until later phases relocate them.
- [x] Persist active side panel mode and Threads width.
- [x] Add `Cmd+B` or existing sidebar shortcut support for toggling the side panel.
- [x] Keep old settings route reachable while Settings mode is not complete.
- [x] Remove any duplicated sidebar trigger that becomes redundant after the rail is active.
- [x] Verify no second app sidebar is mounted.
- [x] Add tests for side panel mode state and width acceptance logic.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 3: Explorer And Changes Side Panel Modes

- [x] Add `SidePanelExplorer` by moving file explorer behavior out of the workbench-local sidebar.
- [x] Keep new file, new folder, refresh, and collapse actions in the Explorer view header.
- [x] Remove the workbench-local explorer sidebar from `WorkspaceWorkbench`.
- [x] Keep workbench tabs and breadcrumbs as the only persistent workbench chrome.
- [x] Add `SidePanelChanges` with changed files grouped by staged, unstaged, and untracked where the available state supports it.
- [x] Move per-file stage and revert controls to Changes.
- [x] Move commit graph into Changes if available for the active repository.
- [x] Move commit, push, publish branch, and pull request entry points from header git controls into Changes.
- [x] Keep Status Bar git chip as the compact global summary and quick entry point into Changes.
- [x] Preserve `GitActionsControl.logic.ts` behavior while retiring the header UI component.
- [x] Add empty, loading, no-repository, and error states for Changes.
- [x] Add tests for Changes view-model grouping and action availability.
- [x] Delete `WorkbenchToolbarActions` once save/stage/revert are no longer mounted there.
- [x] Remove dead props and imports from `WorkspaceWorkbench`.
- [x] Verify diff and editor flows still open the expected files.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 4: Composer Run Context Pill

- [x] Add `RunContextPill` docked at the top of the composer.
- [x] Collapse environment, environment mode, and branch into one compact label.
- [x] On click, open a popover with the existing environment selector, environment mode selector, and branch selector behavior.
- [x] Preserve locked-thread behavior as a non-interactive chip.
- [x] Preserve checkout PR behavior in the popover only where it belongs.
- [x] Consume or rename `BranchToolbar.logic.ts` so run-context logic is not branch-toolbar-specific.
- [x] Retire `BranchToolbar.tsx`, `BranchToolbarBranchSelector.tsx`, `BranchToolbarEnvModeSelector.tsx`, and `BranchToolbarEnvironmentSelector.tsx` after their behavior is absorbed.
- [x] Remove the full-width branch toolbar row from `ChatView`.
- [x] Verify the composer does not shift vertically when the pill changes labels or loading state.
- [x] Add tests for pill labels, disabled states, locked-thread states, and popover action availability.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 5: Chat Header Prune

- [x] Reduce `ChatHeader` to thread title, thread-local status if needed, and the narrow mobile chat/files segmented control.
- [x] Remove project badge and no-git pill from `ChatHeader`; Status Bar owns them.
- [x] Remove git actions from `ChatHeader`; Changes and Status Bar own them.
- [x] Remove scripts from `ChatHeader`; Run and Status Bar own them.
- [x] Remove open-in editor from `ChatHeader`; expose it from the project chip overflow only when relevant.
- [x] Remove terminal toggle from `ChatHeader`; Status Bar terminal chip and keyboard shortcut own it.
- [x] Remove the desktop sidebar trigger from `ChatHeader`; Activity Rail and shell shortcut own it.
- [x] Move mobile workbench pane toggle into the chat pane as a local segmented control.
- [x] Delete `ChatHeader` overflow menu code that no longer has a purpose.
- [x] Update or delete `ChatHeader` tests to reflect the reduced responsibility.
- [x] Verify thread title truncation, empty title state, and mobile touch targets.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 6: Run Mode And Bottom Panel

- [x] Add `SidePanelRun` for project scripts and runnable tasks.
- [x] Move script list, script execution, and last-run state from `ProjectScriptsControl` into Run.
- [x] Add Status Bar last-run chip with one-click rerun and overflow into Run.
- [x] Rename or wrap `ThreadTerminalDrawer` as `BottomPanel`.
- [x] Keep terminal as the first bottom panel tab.
- [x] Add room in the `BottomPanel` model for future output/log panels without implementing unused panels.
- [x] Move terminal toggle ownership to Status Bar terminal chip and `Cmd+J`.
- [x] Retire `ProjectScriptsControl` as a header control once Run owns the behavior.
- [x] Verify terminal sessions, multiple terminal tabs, terminal status, and drawer resize behavior still work.
- [x] Add tests for Run view action availability and bottom panel state transitions.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 7: Settings And Search Modes

- [x] Add `SidePanelSettings` and move settings navigation into the Activity Rail model.
- [x] Keep settings content routes stable unless a route change is explicitly needed.
- [x] Remove shape-shifting settings sidebar behavior from route-level settings pages.
- [x] Add `SidePanelSearch` as a real search surface if search implementation exists; otherwise add only a clearly disabled mode with no dead code.
- [x] Make Activity Rail More behavior explicit on mobile for Run, Search, and Settings.
- [x] Verify direct settings URLs still load and highlight the correct settings location.
- [x] Verify search mode does not conflict with thread search/filter behavior.
- [x] Prune old settings sidebar imports when the new mode owns navigation.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 8: Mobile Layout Pass

- [x] Convert Activity Rail to a bottom tab bar on mobile: Chat, Threads, Explorer, Changes, More.
- [x] Make Side Panel a full-width sheet on mobile.
- [x] Compress Status Bar to connection, project, branch, and overflow.
- [x] Add an overflow sheet for hidden status bar chips and actions.
- [x] Keep the chat/files segmented control thumb-reachable and independent from global chrome.
- [x] Verify mobile does not mount two sidebars or two status action surfaces.
- [x] Verify keyboard, viewport resize, and safe-area behavior.
- [x] Verify all critical chips and tab labels fit at narrow widths.
- [x] Add browser/component coverage for mobile shell state transitions where the existing test setup supports it.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.

## Phase 9: Final Prune, Dead Code Removal, And Hardening

- [x] Remove retired components and tests that no longer describe shipped behavior.
- [x] Remove temporary compatibility props and feature flags introduced during the phases.
- [x] Remove duplicated formatting/view-model helpers that were only needed during migration.
- [x] Confirm there is one owner for each former header/sidebar/workbench action.
- [x] Confirm no app shell state is stored in ad hoc component-local storage when it should be persisted centrally.
- [x] Confirm all imports of retired components are gone.
- [x] Confirm Status Bar has not become a dumping ground for long labels or destructive actions.
- [x] Confirm Side Panel modes are modular and do not import unrelated mode-specific logic.
- [x] Confirm command/action logic is shared by Status Bar, Side Panel, keyboard shortcuts, and future command palette hooks.
- [x] Run focused `bun run test` suites for changed logic.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.
- [x] Capture final desktop and mobile screenshots for the affected states.

## Phase 10: Settings Navigation Deduplication

- [x] Keep Settings as an Activity Rail mode and remove the duplicate settings entry from the bottom of the sidebar.
- [x] Preserve direct settings URLs and route-level content.
- [x] Ensure only one settings affordance is visible in the app shell on desktop and mobile.
- [x] Remove any dead settings-sidebar trigger code left behind by the shell migration.
- [x] Verify the Settings rail icon opens the expected settings surface without mounting a second settings page.

## Phase 11: Search Mode Repair

- [x] Audit the current Search rail mode and identify whether it should search threads, files, or both.
- [x] Wire the Search rail icon to a working search surface instead of a dead panel.
- [x] Keep thread filtering/search behavior distinct from global search so the two states do not conflict.
- [x] Add empty, loading, and no-results states for the active search scope.
- [x] Verify keyboard focus, repeated searches, and switching away from Search do not lose active shell state.

## Phase 12: Remove Bottom Status Bar

- [x] Remove the bottom status bar entirely from the app shell.
- [x] Remove the permanent connected/disconnected bottom status chip; if the websocket disconnects, use an explicit disconnected app state, banner, toast, or reconnect surface instead of always showing "connected".
- [x] Remove the bottom project chip because project selection already belongs to the side panel project selector.
- [x] Remove the bottom git branch/status chip because git workflow belongs to the Changes panel and the Changes rail item can carry any lightweight changed-count badge.
- [x] Remove the bottom environment chip because environment selection belongs to the composer run-context pill only when it is actionable.
- [x] Remove the bottom diagnostics "OK" chip; do not show an always-OK status item.
- [x] Remove the bottom run/play chip together with the Run sidebar removal.
- [x] Remove bottom-bar mobile overflow UI and any shell state that only exists to support bottom status details.
- [x] Keep `Cmd+J` as the primary terminal toggle.
- [x] If a visible terminal toggle is still needed, put a fixed-size icon-only terminal button in the Activity Rail, with tooltip and accessible label, not in a bottom bar.
- [x] Ensure removing the bottom bar returns vertical space to chat, workbench, side panel, and mobile layouts.
- [x] Verify desktop, mobile, narrow desktop, and safe-area layouts no longer reserve space for the removed bottom bar.

## Phase 13: Remove Redundant Files And Changes Toggle

- [x] Remove the internal Files/Changes segmented toggle from the side panel.
- [x] Make the Files Activity Rail icon open only the file explorer panel.
- [x] Make the Changes Activity Rail icon open only the changes/diff panel.
- [x] Keep file-only actions such as new file, new folder, refresh, and collapse out of the Changes panel.
- [x] Verify switching between Files and Changes through the rail preserves the expected selection and scroll state.

## Phase 14: Remove Run Sidebar And Open-In Surfaces

- [x] Remove the Play/Run icon from the Activity Rail and the corresponding side panel mode.
- [x] Remove the Run/script sidebar surface unless another shipped workflow still owns it explicitly.
- [x] Remove Open In editor picker/menu/status/sidebar affordances for this fork.
- [x] Prune shell action state, props, imports, and tests that only existed for Run or Open In surfaces.
- [x] Verify terminal access still works through the bottom panel and shortcut after Run is removed.

## Phase 15: VS Code-Style Git Panel Above Graph

- [x] Replace the current git actions block below the graph with a dedicated source-control panel at the top of the Changes side panel.
- [x] The Changes panel top header must match a VS Code source-control structure: title `Changes`, refresh button, optional collapse-all/tree controls if useful, and an overflow menu only for secondary source-control actions.
- [x] Put a full-width commit message input directly below the header with placeholder text shaped like `Message (⌘Enter to commit on "main")`.
- [x] Add a generate-message button in or directly beside the commit message input.
- [x] The generate-message button must call the existing commit-message generation path used by the current commit flow; do not introduce a second generation implementation or prompt path.
- [x] Generated commit messages only populate the message input; generation must never stage, commit, push, or open a pull request.
- [x] If staged files exist, generate the message from staged changes.
- [x] If no files are staged, generate the message from unstaged/untracked changes so the user can draft a message before staging, but keep Commit disabled until something is staged.
- [x] Add a primary `Commit` button below the message input.
- [x] Disable `Commit` when the message is empty, no files are staged, git status is loading, the repository is unavailable, or a conflict state blocks normal commits.
- [x] Commit must operate only on staged files; do not auto-stage all files and do not make the default button behave as "Commit All".
- [x] If a separate commit-all action is kept, put it in an explicit dropdown/overflow item labeled `Commit All`; it must not be the primary action.
- [x] Show clear disabled, loading, success, and error states for commit, generate message, push, publish branch, and PR actions.
- [x] Split changed files into separate collapsible sections in this order: `Staged Changes`, `Changes`, `Untracked`, and conflict/merge sections when present.
- [x] Show per-section counts in badges like VS Code.
- [x] Tree-group files by directory in each section; keep directory disclosure chevrons and indentation stable.
- [x] File rows must show file icon, name, git status marker (`M`, `A`, `D`, `U`, etc.), and diff stats when available.
- [x] Hovering a file in `Changes` or `Untracked` must reveal stage and revert/discard controls.
- [x] Hovering a file in `Staged Changes` must reveal unstage and revert/discard controls.
- [x] Hovering a directory row must reveal controls for all descendant files in that section: stage all descendants for unstaged/untracked directories, unstage all descendants for staged directories, and revert/discard descendants where supported.
- [x] Section headers must support stage-all/unstage-all actions for the section where supported.
- [x] Click a file row to open its diff in the workbench.
- [x] Keep destructive revert/discard actions visibly secondary and confirm where the existing app pattern requires confirmation.
- [x] Add manual `Push`, `Publish Branch`, `Create PR`, and `Open PR` entry points in the source-control panel; do not bundle these into a single automatic commit/push/PR happy path.
- [x] Show `Push` only when local commits are ahead or a push is otherwise valid.
- [x] Show `Publish Branch` when the current branch has no upstream and publishing is possible.
- [x] Show `Create PR` or `Open PR` according to existing provider status.
- [x] Keep changed-file sections above the commit graph and keep the commit graph in a separate collapsible `Graph` section below source-control controls and file changes.
- [x] The graph controls must be graph-specific only; commit, stage, push, publish, and PR controls must not live inside the graph section.
- [x] Handle no repository, clean tree, detached HEAD, missing upstream, behind/diverged branch, conflicts, empty commit message, no staged files, generation failure, push failure, and PR provider unavailable states.
- [x] Ensure long paths, large change counts, and many files remain usable: the source-control controls stay reachable, file sections scroll, and the graph cannot push commit controls off-screen.

## Phase 16: Diff Viewer Controls And Pointer Affordances

- [x] Add a line-wrap toggle button to the file viewer when viewing a diff.
- [x] Add a diff layout toggle button to the file viewer when viewing a diff.
- [x] The diff layout toggle must switch between side-by-side and stacked above/below diff modes.
- [x] Persist or preserve the selected line-wrap and diff layout preferences according to the existing workbench state pattern; do not add ad hoc local storage if shell/workbench state already has a home.
- [x] Use icon buttons with tooltips and accessible labels for the line-wrap and diff-layout toggles.
- [x] Ensure the controls are visible in the diff viewer toolbar without crowding save, tab, breadcrumb, or file-state controls.
- [x] Add `cursor:pointer` affordance to every clickable control surface that currently lacks it, including tab selector controls, save controls, workbench toolbar buttons, side panel controls, file tree rows/actions, Changes panel controls, rail icons, and bottom panel/status controls.
- [x] Do not add pointer cursors to disabled controls or non-interactive labels.
- [x] Verify pointer affordances on hover match the actual click targets and do not imply clickability on static status text.

## Phase 17: Run Context Pill Actionability

- [x] Audit the composer `RunContextPill`, especially the locked `Local checkout` state.
- [x] Remove the locked `Local checkout` pill entirely; it is non-actionable and duplicates context already implied by the selected project/thread.
- [x] Preserve the old branch/worktree selection functionality that used to live in the branch toolbar.
- [x] Branch/worktree selection must live in an actionable composer run-context control for new threads, draft threads, and any unlocked thread state where changing context affects the next agent turn.
- [x] The composer run-context control must expose workspace mode selection: `Current checkout` and `New worktree`.
- [x] The composer run-context control must expose branch selection, including existing local branches, remote branches, create branch, and checkout pull request entries supported by the existing selector logic.
- [x] If multiple environments are available, the composer run-context control must expose environment selection too.
- [x] Do not move next-turn branch/worktree selection into the Changes panel; Changes owns source-control operations, not where the next agent runs.
- [x] Do not move next-turn branch/worktree selection into the removed bottom bar.
- [x] If the run context can be changed, render it as an actual clickable control with a chevron, pointer cursor, tooltip, and popover.
- [x] If the run context is locked and cannot be changed, hide the control instead of rendering a disabled or button-like status pill.
- [x] Reuse the existing `RunContextBranchSelector`, `RunContextEnvModeSelector`, `RunContextEnvironmentSelector`, and run-context logic where possible; do not reimplement branch/worktree selection.
- [x] Verify clicking every visible pill/control either performs an action, opens a menu, or is clearly non-interactive and not styled as a control.

## Phase 18: Follow-Up Verification And Diff Review

- [x] Review the shell against the provided VS Code and current-app screenshots after the fixes are implemented.
- [x] Verify desktop, mobile, narrow desktop, and Safari rounded-window layouts.
- [x] Confirm no bottom status bar, duplicate settings, redundant Files/Changes toggles, dead Search, Run sidebar, or Open In fragments remain.
- [x] Confirm the Changes panel owns commit, stage, generated-message, push, publish branch, and PR actions.
- [x] Confirm generate-message UX reuses the existing commit-message generation implementation and does not create a parallel generation path.
- [x] Confirm Commit stays disabled until at least one file is staged and a non-empty message exists.
- [x] Confirm diff viewer line-wrap and side-by-side/stacked layout toggles work for active diffs.
- [x] Confirm all clickable controls show pointer affordance and disabled/static controls do not.
- [x] Confirm the locked `Local checkout` run-context pill is removed or clearly non-interactive and no longer appears clickable.
- [x] Review the full diff for godfile risk, dead code, duplicate action ownership, and legacy fragments.
- [x] Run `bun fmt`.
- [x] Run `bun lint`.
- [x] Run `bun typecheck`.
- [x] Run `bun run test`.
- [x] Run `bun run build`.

## Acceptance Criteria

- There is exactly one sidebar surface.
- The app shell is Activity Rail, Side Panel, main content, Status Bar, and optional Bottom Panel.
- Chat header is thread-local and no longer owns project, git, scripts, environment, open-in, or terminal controls.
- Workbench owns tabs, breadcrumbs, editor state, and file content, not global git/project actions.
- Workbench diff views expose line-wrap and side-by-side/stacked layout toggles.
- Branch toolbar row is gone; run context is a compact composer pill.
- Git workflow lives in Changes with a compact Status Bar summary.
- Changes has a VS Code-style source-control panel with staged/unstaged sections, hover stage/revert controls, generated commit message UX, commit, push, publish branch, and PR actions.
- Commit is disabled unless a non-empty message and at least one staged file exist.
- Generated commit messages reuse the existing commit-message generation implementation and never trigger staging, commit, push, or PR creation.
- Scripts and Run sidebar surfaces are removed unless a later explicit workflow reintroduces them.
- Bottom status bar is removed entirely.
- Terminal opens through `Cmd+J`; if a visible terminal toggle is still needed, it lives as a stable icon-only Activity Rail control.
- Locked `Local checkout` is removed; non-actionable run-context state is not rendered as a clickable-looking pill.
- Branch/worktree selection remains available as an actionable composer run-context control for new, draft, or otherwise unlocked turns.
- The composer run-context control preserves current-checkout/new-worktree mode, branch selection, create branch, checkout PR, and environment selection where those options are supported.
- Every clickable control shows pointer affordance; disabled and static controls do not.
- Mobile has bottom navigation, a side-panel sheet, compressed status bar, and no double-sidebar behavior.
- Retired components are deleted or reduced to thin compatibility wrappers with explicit follow-up tasks.
- `bun fmt`, `bun lint`, and `bun typecheck` pass.

## Deferred Decisions

- Split side panel mode with Threads above Explorer or Changes. Default to single-mode first; add split only after the simpler model proves insufficient.
- Command palette. The action ownership layer should make this easy, but it does not need to block the shell rewrite unless shortcut discoverability becomes a problem.
- Full search implementation. The shell can reserve the mode before search is fully built, but avoid dead placeholder complexity.
- Autosave. Dirty indicators and `Cmd+S` are enough for this rewrite; autosave should be a separate reliability decision.
- Additional bottom panel tabs for logs/output. Build the shell to allow them later, but ship terminal first.
