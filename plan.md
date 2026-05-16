# Chrome Rewrite Plan

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
  - [ ] `bun fmt`
  - [ ] `bun lint`
  - [ ] `bun typecheck`
- Do not run `bun test`. Use `bun run test` only when tests are needed.

## Phase 0: Baseline And Shell Inventory

- [ ] Record current screenshots for desktop and mobile states that will be affected: chat-only, chat plus workbench, sidebar open, workbench explorer open, git changes visible, terminal drawer open, settings.
- [ ] Inventory current keyboard shortcuts and decide which ones remain shell-level shortcuts.
- [ ] Inventory persisted UI state in local storage/settings related to sidebar, workbench, terminal, branch toolbar, and mobile pane selection.
- [ ] Identify all current imports of `ChatHeader`, `BranchToolbar`, `GitActionsControl`, `ProjectScriptsControl`, `WorkbenchExplorerPanel`, `WorkbenchToolbarActions`, `ThreadTerminalDrawer`, and `AppSidebarLayout`.
- [ ] Decide exact storage keys for active side panel mode, per-mode widths, rail collapse state, bottom panel state, and mobile sheet state.
- [ ] Define acceptance screenshots for each later phase so regressions are obvious.
- [ ] Run the required verification commands and note any pre-existing failures before implementation starts.

## Phase 1: Action Ownership And Read-Only Status Bar

- [ ] Create a small web-side action ownership layer for shell commands without changing visible behavior.
- [ ] Route existing terminal toggle, project switch, git quick action, script run, and workbench save actions through shared action functions where practical.
- [ ] Add `StatusBar` with read-only connection, project, branch, environment, ahead/behind, diagnostics, and terminal state chips.
- [ ] Keep existing header/sidebar controls during this phase; the status bar validates data wiring without removing old entry points.
- [ ] Use existing git status state helpers from `apps/web/src/lib/gitStatusState.ts`.
- [ ] Keep chip labels compact and define overflow behavior for narrow widths.
- [ ] Add tests for status chip view-model logic, especially missing git repository, detached/no branch, disconnected, and loading states.
- [ ] Verify desktop layout does not steal composer/editor vertical space unexpectedly.
- [ ] Verify mobile status bar compression state exists, even if not final.
- [ ] Prune any status-specific duplicated formatting introduced during the phase.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 2: App Shell, Activity Rail, And Threads Side Panel

- [ ] Reshape `AppSidebarLayout` into an app shell that owns Activity Rail, Side Panel, main content, and Status Bar.
- [ ] Add `ActivityRail` with Threads as the only enabled mode initially.
- [ ] Add `SidePanel` shell using existing sidebar/resizable primitives where practical.
- [ ] Extract project switcher/header behavior from `Sidebar` into a reusable top slot for every side panel mode.
- [ ] Move current thread list behavior into `SidePanelThreads` with minimal behavior changes.
- [ ] Preserve current project grouping, sorting, archive, new thread, search/filter, and settings access behavior until later phases relocate them.
- [ ] Persist active side panel mode and Threads width.
- [ ] Add `Cmd+B` or existing sidebar shortcut support for toggling the side panel.
- [ ] Keep old settings route reachable while Settings mode is not complete.
- [ ] Remove any duplicated sidebar trigger that becomes redundant after the rail is active.
- [ ] Verify no second app sidebar is mounted.
- [ ] Add tests for side panel mode state and width acceptance logic.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 3: Explorer And Changes Side Panel Modes

- [ ] Add `SidePanelExplorer` by moving file explorer behavior out of the workbench-local sidebar.
- [ ] Keep new file, new folder, refresh, and collapse actions in the Explorer view header.
- [ ] Remove the workbench-local explorer sidebar from `WorkspaceWorkbench`.
- [ ] Keep workbench tabs and breadcrumbs as the only persistent workbench chrome.
- [ ] Add `SidePanelChanges` with changed files grouped by staged, unstaged, and untracked where the available state supports it.
- [ ] Move per-file stage and revert controls to Changes.
- [ ] Move commit graph into Changes if available for the active repository.
- [ ] Move commit, push, publish branch, and pull request entry points from header git controls into Changes.
- [ ] Keep Status Bar git chip as the compact global summary and quick entry point into Changes.
- [ ] Preserve `GitActionsControl.logic.ts` behavior while retiring the header UI component.
- [ ] Add empty, loading, no-repository, and error states for Changes.
- [ ] Add tests for Changes view-model grouping and action availability.
- [ ] Delete `WorkbenchToolbarActions` once save/stage/revert are no longer mounted there.
- [ ] Remove dead props and imports from `WorkspaceWorkbench`.
- [ ] Verify diff and editor flows still open the expected files.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 4: Composer Run Context Pill

- [ ] Add `RunContextPill` docked at the top of the composer.
- [ ] Collapse environment, environment mode, and branch into one compact label.
- [ ] On click, open a popover with the existing environment selector, environment mode selector, and branch selector behavior.
- [ ] Preserve locked-thread behavior as a non-interactive chip.
- [ ] Preserve checkout PR behavior in the popover only where it belongs.
- [ ] Consume or rename `BranchToolbar.logic.ts` so run-context logic is not branch-toolbar-specific.
- [ ] Retire `BranchToolbar.tsx`, `BranchToolbarBranchSelector.tsx`, `BranchToolbarEnvModeSelector.tsx`, and `BranchToolbarEnvironmentSelector.tsx` after their behavior is absorbed.
- [ ] Remove the full-width branch toolbar row from `ChatView`.
- [ ] Verify the composer does not shift vertically when the pill changes labels or loading state.
- [ ] Add tests for pill labels, disabled states, locked-thread states, and popover action availability.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 5: Chat Header Prune

- [ ] Reduce `ChatHeader` to thread title, thread-local status if needed, and the narrow mobile chat/files segmented control.
- [ ] Remove project badge and no-git pill from `ChatHeader`; Status Bar owns them.
- [ ] Remove git actions from `ChatHeader`; Changes and Status Bar own them.
- [ ] Remove scripts from `ChatHeader`; Run and Status Bar own them.
- [ ] Remove open-in editor from `ChatHeader`; expose it from the project chip overflow only when relevant.
- [ ] Remove terminal toggle from `ChatHeader`; Status Bar terminal chip and keyboard shortcut own it.
- [ ] Remove the desktop sidebar trigger from `ChatHeader`; Activity Rail and shell shortcut own it.
- [ ] Move mobile workbench pane toggle into the chat pane as a local segmented control.
- [ ] Delete `ChatHeader` overflow menu code that no longer has a purpose.
- [ ] Update or delete `ChatHeader` tests to reflect the reduced responsibility.
- [ ] Verify thread title truncation, empty title state, and mobile touch targets.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 6: Run Mode And Bottom Panel

- [ ] Add `SidePanelRun` for project scripts and runnable tasks.
- [ ] Move script list, script execution, and last-run state from `ProjectScriptsControl` into Run.
- [ ] Add Status Bar last-run chip with one-click rerun and overflow into Run.
- [ ] Rename or wrap `ThreadTerminalDrawer` as `BottomPanel`.
- [ ] Keep terminal as the first bottom panel tab.
- [ ] Add room in the `BottomPanel` model for future output/log panels without implementing unused panels.
- [ ] Move terminal toggle ownership to Status Bar terminal chip and `Cmd+J`.
- [ ] Retire `ProjectScriptsControl` as a header control once Run owns the behavior.
- [ ] Verify terminal sessions, multiple terminal tabs, terminal status, and drawer resize behavior still work.
- [ ] Add tests for Run view action availability and bottom panel state transitions.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 7: Settings And Search Modes

- [ ] Add `SidePanelSettings` and move settings navigation into the Activity Rail model.
- [ ] Keep settings content routes stable unless a route change is explicitly needed.
- [ ] Remove shape-shifting settings sidebar behavior from route-level settings pages.
- [ ] Add `SidePanelSearch` as a real search surface if search implementation exists; otherwise add only a clearly disabled mode with no dead code.
- [ ] Make Activity Rail More behavior explicit on mobile for Run, Search, and Settings.
- [ ] Verify direct settings URLs still load and highlight the correct settings location.
- [ ] Verify search mode does not conflict with thread search/filter behavior.
- [ ] Prune old settings sidebar imports when the new mode owns navigation.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 8: Mobile Layout Pass

- [ ] Convert Activity Rail to a bottom tab bar on mobile: Chat, Threads, Explorer, Changes, More.
- [ ] Make Side Panel a full-width sheet on mobile.
- [ ] Compress Status Bar to connection, project, branch, and overflow.
- [ ] Add an overflow sheet for hidden status bar chips and actions.
- [ ] Keep the chat/files segmented control thumb-reachable and independent from global chrome.
- [ ] Verify mobile does not mount two sidebars or two status action surfaces.
- [ ] Verify keyboard, viewport resize, and safe-area behavior.
- [ ] Verify all critical chips and tab labels fit at narrow widths.
- [ ] Add browser/component coverage for mobile shell state transitions where the existing test setup supports it.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

## Phase 9: Final Prune, Dead Code Removal, And Hardening

- [ ] Remove retired components and tests that no longer describe shipped behavior.
- [ ] Remove temporary compatibility props and feature flags introduced during the phases.
- [ ] Remove duplicated formatting/view-model helpers that were only needed during migration.
- [ ] Confirm there is one owner for each former header/sidebar/workbench action.
- [ ] Confirm no app shell state is stored in ad hoc component-local storage when it should be persisted centrally.
- [ ] Confirm all imports of retired components are gone.
- [ ] Confirm Status Bar has not become a dumping ground for long labels or destructive actions.
- [ ] Confirm Side Panel modes are modular and do not import unrelated mode-specific logic.
- [ ] Confirm command/action logic is shared by Status Bar, Side Panel, keyboard shortcuts, and future command palette hooks.
- [ ] Run focused `bun run test` suites for changed logic.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.
- [ ] Capture final desktop and mobile screenshots for the affected states.

## Acceptance Criteria

- There is exactly one sidebar surface.
- The app shell is Activity Rail, Side Panel, main content, Status Bar, and optional Bottom Panel.
- Chat header is thread-local and no longer owns project, git, scripts, environment, open-in, or terminal controls.
- Workbench owns tabs, breadcrumbs, editor state, and file content, not global git/project actions.
- Branch toolbar row is gone; run context is a compact composer pill.
- Git workflow lives in Changes with a compact Status Bar summary.
- Scripts live in Run with a compact Status Bar last-run entry.
- Terminal opens through Bottom Panel from Status Bar and shortcut.
- Mobile has bottom navigation, a side-panel sheet, compressed status bar, and no double-sidebar behavior.
- Retired components are deleted or reduced to thin compatibility wrappers with explicit follow-up tasks.
- `bun fmt`, `bun lint`, and `bun typecheck` pass.

## Deferred Decisions

- Split side panel mode with Threads above Explorer or Changes. Default to single-mode first; add split only after the simpler model proves insufficient.
- Command palette. The action ownership layer should make this easy, but it does not need to block the shell rewrite unless shortcut discoverability becomes a problem.
- Full search implementation. The shell can reserve the mode before search is fully built, but avoid dead placeholder complexity.
- Autosave. Dirty indicators and `Cmd+S` are enough for this rewrite; autosave should be a separate reliability decision.
- Additional bottom panel tabs for logs/output. Build the shell to allow them later, but ship terminal first.
