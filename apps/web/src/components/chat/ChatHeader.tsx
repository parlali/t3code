import {
  type EnvironmentId,
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import { EllipsisIcon, FilesIcon, MessageSquareIcon, TerminalSquareIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuGroup, MenuGroupLabel, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { SidebarTrigger } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { usePrimaryEnvironmentId } from "../../environments/primary";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  isGitRepo: boolean;
  openInCwd: string | null;
  activeProjectScripts: ProjectScript[] | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  mobileWorkbenchAvailable?: boolean;
  mobileWorkbenchPane?: "chat" | "workbench";
  gitCwd: string | null;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleTerminal: () => void;
  onMobileWorkbenchPaneChange?: (pane: "chat" | "workbench") => void;
}

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): boolean {
  return (
    Boolean(input.activeProjectName) &&
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  );
}

const ACTIVE_BUTTON_CLASS = "bg-accent/80 text-foreground dark:bg-input/70";

const MobileViewToggle = memo(function MobileViewToggle({
  pane,
  onPaneChange,
}: {
  pane: "chat" | "workbench";
  onPaneChange: (pane: "chat" | "workbench") => void;
}) {
  return (
    <Group aria-label="Mobile workspace view" className="shrink-0">
      <Button
        size="icon-sm"
        variant="outline"
        className={cn("size-8", pane === "chat" && ACTIVE_BUTTON_CLASS)}
        aria-label="Show chat"
        aria-pressed={pane === "chat"}
        onClick={() => onPaneChange("chat")}
      >
        <MessageSquareIcon className="size-3.5" />
      </Button>
      <GroupSeparator />
      <Button
        size="icon-sm"
        variant="outline"
        className={cn("size-8", pane === "workbench" && ACTIVE_BUTTON_CLASS)}
        aria-label="Show files"
        aria-pressed={pane === "workbench"}
        onClick={() => onPaneChange("workbench")}
      >
        <FilesIcon className="size-3.5" />
      </Button>
    </Group>
  );
});

const OverflowMenu = memo(function OverflowMenu({
  activeProjectName,
  isGitRepo,
  activeProjectScripts,
  keybindings,
  preferredScriptId,
  showOpenInPicker,
  availableEditors,
  openInCwd,
  gitCwd,
  activeThreadRef,
  draftId,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
}: {
  activeProjectName: string | undefined;
  isGitRepo: boolean;
  activeProjectScripts: ProjectScript[] | undefined;
  keybindings: ResolvedKeybindingsConfig;
  preferredScriptId: string | null;
  showOpenInPicker: boolean;
  availableEditors: ReadonlyArray<EditorId>;
  openInCwd: string | null;
  gitCwd: string | null;
  activeThreadRef: ReturnType<typeof scopeThreadRef>;
  draftId?: DraftId;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button size="icon-sm" variant="outline" aria-label="More actions" className="sm:hidden">
            <EllipsisIcon className="size-3.5" />
          </Button>
        }
      />
      <MenuPopup side="bottom" align="end" className="w-72 max-w-[calc(100vw-1rem)] sm:hidden">
        {activeProjectName && (
          <>
            <div className="min-w-0 px-2 py-1.5">
              <div className="truncate text-xs font-semibold text-foreground">
                {activeProjectName}
              </div>
              {!isGitRepo && <div className="mt-0.5 text-xs text-warning">No Git repository</div>}
            </div>
            <MenuSeparator />
          </>
        )}
        <MenuGroup>
          {activeProjectScripts && (
            <>
              <MenuGroupLabel>Actions</MenuGroupLabel>
              <ProjectScriptsControl
                scripts={activeProjectScripts}
                keybindings={keybindings}
                preferredScriptId={preferredScriptId}
                display="menu"
                onRunScript={onRunProjectScript}
                onAddScript={onAddProjectScript}
                onUpdateScript={onUpdateProjectScript}
                onDeleteScript={onDeleteProjectScript}
              />
            </>
          )}
        </MenuGroup>
        {activeProjectScripts && showOpenInPicker && <MenuSeparator />}
        <MenuGroup>
          {showOpenInPicker && (
            <>
              <MenuGroupLabel>Open in</MenuGroupLabel>
              <OpenInPicker
                keybindings={keybindings}
                availableEditors={availableEditors}
                openInCwd={openInCwd}
                display="menu"
              />
            </>
          )}
        </MenuGroup>
        {(activeProjectScripts || showOpenInPicker) && activeProjectName && <MenuSeparator />}
        <MenuGroup>
          {activeProjectName && (
            <>
              <MenuGroupLabel>Git</MenuGroupLabel>
              <GitActionsControl
                gitCwd={gitCwd}
                activeThreadRef={activeThreadRef}
                {...(draftId ? { draftId } : {})}
                display="menu"
              />
            </>
          )}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});

export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  draftId,
  activeProjectName,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  mobileWorkbenchAvailable = false,
  mobileWorkbenchPane = "chat",
  gitCwd,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onMobileWorkbenchPaneChange,
}: ChatHeaderProps) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const showOpenInPicker = shouldShowOpenInPicker({
    activeProjectName,
    activeThreadEnvironmentId,
    primaryEnvironmentId,
  });
  const activeThreadRef = scopeThreadRef(activeThreadEnvironmentId, activeThreadId);
  const hasOverflowActions =
    Boolean(activeProjectScripts) || showOpenInPicker || Boolean(activeProjectName);

  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
        <SidebarTrigger className="size-7 shrink-0" />
        {activeProjectName && (
          <Badge variant="outline" className="hidden min-w-0 shrink overflow-hidden sm:flex">
            <span className="min-w-0 truncate">{activeProjectName}</span>
          </Badge>
        )}
        {activeProjectName && !isGitRepo && (
          <Badge variant="outline" className="hidden shrink-0 text-[10px] text-amber-700 sm:flex">
            No Git
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5 @3xl/header-actions:gap-2">
        {mobileWorkbenchAvailable && onMobileWorkbenchPaneChange && (
          <div>
            <MobileViewToggle
              pane={mobileWorkbenchPane}
              onPaneChange={onMobileWorkbenchPaneChange}
            />
          </div>
        )}

        {hasOverflowActions && (
          <div className="sm:hidden">
            <OverflowMenu
              activeProjectName={activeProjectName}
              isGitRepo={isGitRepo}
              activeProjectScripts={activeProjectScripts}
              keybindings={keybindings}
              preferredScriptId={preferredScriptId}
              showOpenInPicker={showOpenInPicker}
              availableEditors={availableEditors}
              openInCwd={openInCwd}
              gitCwd={gitCwd}
              activeThreadRef={activeThreadRef}
              {...(draftId ? { draftId } : {})}
              onRunProjectScript={onRunProjectScript}
              onAddProjectScript={onAddProjectScript}
              onUpdateProjectScript={onUpdateProjectScript}
              onDeleteProjectScript={onDeleteProjectScript}
            />
          </div>
        )}

        {(activeProjectScripts || showOpenInPicker || activeProjectName) && (
          <Group aria-label="Project actions" className="hidden sm:flex">
            {activeProjectScripts && (
              <ProjectScriptsControl
                scripts={activeProjectScripts}
                keybindings={keybindings}
                preferredScriptId={preferredScriptId}
                display="items"
                onRunScript={onRunProjectScript}
                onAddScript={onAddProjectScript}
                onUpdateScript={onUpdateProjectScript}
                onDeleteScript={onDeleteProjectScript}
              />
            )}
            {showOpenInPicker && (
              <OpenInPicker
                keybindings={keybindings}
                availableEditors={availableEditors}
                openInCwd={openInCwd}
                display="items"
              />
            )}
            {activeProjectName && (
              <GitActionsControl
                gitCwd={gitCwd}
                activeThreadRef={activeThreadRef}
                {...(draftId ? { draftId } : {})}
                display="items"
              />
            )}
          </Group>
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Toggle terminal drawer"
                className={cn(terminalOpen && ACTIVE_BUTTON_CLASS)}
                disabled={!terminalAvailable}
                onClick={onToggleTerminal}
              >
                <TerminalSquareIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">
            {!terminalAvailable
              ? "Terminal is unavailable until this thread has an active project."
              : terminalToggleShortcutLabel
                ? `Toggle terminal drawer (${terminalToggleShortcutLabel})`
                : "Toggle terminal drawer"}
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});
