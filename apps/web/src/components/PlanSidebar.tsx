import { memo, useState, useCallback } from "react";
import type { EnvironmentId, OrchestrationTaskPlan } from "@t3tools/contracts";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import { taskPlanStepsForStatus } from "@t3tools/shared/providerPlan";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import ChatMarkdown from "./ChatMarkdown";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisIcon,
  LoaderIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { LatestProposedPlanState } from "../session-logic";
import { formatTimestamp } from "../timestampFormat";
import {
  proposedPlanTitle,
  buildProposedPlanMarkdownFilename,
  normalizePlanMarkdownForExport,
  downloadPlanAsTextFile,
  stripDisplayedPlanMarkdown,
} from "../proposedPlan";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { PANE_ICON_BUTTON_CLASS, PaneHeader, PaneSidebarToggleButton } from "./ui/pane-chrome";
import { readEnvironmentApi } from "~/environmentApi";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

function stepStatusIcon(
  status: OrchestrationTaskPlan["steps"][number]["status"],
  planStatus: OrchestrationTaskPlan["status"],
): React.ReactNode {
  if (status === "completed") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-success-foreground">
        <CheckIcon className="size-3" />
      </span>
    );
  }
  if (status === "inProgress") {
    if (planStatus !== "active") {
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30">
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        </span>
      );
    }
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <LoaderIcon className="size-3 animate-spin" />
      </span>
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30">
      <span className="size-1.5 rounded-full bg-muted-foreground/30" />
    </span>
  );
}

function planStatusLabel(status: OrchestrationTaskPlan["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
  }
}

interface PlanSidebarProps {
  activePlan: OrchestrationTaskPlan | null;
  activeProposedPlan: LatestProposedPlanState | null;
  label?: string;
  environmentId: EnvironmentId;
  markdownCwd: string | undefined;
  workspaceRoot: string | undefined;
  timestampFormat: TimestampFormat;
  mode?: "sheet" | "sidebar";
  onClose: () => void;
}

const PlanSidebar = memo(function PlanSidebar({
  activePlan,
  activeProposedPlan,
  label = "Plan",
  environmentId,
  markdownCwd,
  workspaceRoot,
  timestampFormat,
  mode = "sidebar",
  onClose,
}: PlanSidebarProps) {
  const [proposedPlanExpanded, setProposedPlanExpanded] = useState(false);
  const [isSavingToWorkspace, setIsSavingToWorkspace] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const planMarkdown = activeProposedPlan?.planMarkdown ?? null;
  const displayedPlanMarkdown = planMarkdown ? stripDisplayedPlanMarkdown(planMarkdown) : null;
  const planTitle = planMarkdown ? proposedPlanTitle(planMarkdown) : null;
  const displayedSteps = activePlan
    ? taskPlanStepsForStatus(activePlan.status, activePlan.steps)
    : [];

  const handleCopyPlan = useCallback(() => {
    if (!planMarkdown) return;
    copyToClipboard(planMarkdown);
  }, [planMarkdown, copyToClipboard]);

  const handleDownload = useCallback(() => {
    if (!planMarkdown) return;
    const filename = buildProposedPlanMarkdownFilename(planMarkdown);
    downloadPlanAsTextFile(filename, normalizePlanMarkdownForExport(planMarkdown));
  }, [planMarkdown]);

  const handleSaveToWorkspace = useCallback(() => {
    const api = readEnvironmentApi(environmentId);
    if (!api || !workspaceRoot || !planMarkdown) return;
    const filename = buildProposedPlanMarkdownFilename(planMarkdown);
    setIsSavingToWorkspace(true);
    void api.projects
      .writeFile({
        cwd: workspaceRoot,
        relativePath: filename,
        contents: normalizePlanMarkdownForExport(planMarkdown),
      })
      .then((result) => {
        toastManager.add({
          type: "success",
          title: "Plan saved",
          description: result.relativePath,
        });
      })
      .catch((error) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not save plan",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      })
      .then(
        () => setIsSavingToWorkspace(false),
        () => setIsSavingToWorkspace(false),
      );
  }, [environmentId, planMarkdown, workspaceRoot]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-card/50",
        mode === "sidebar"
          ? "h-full w-[340px] shrink-0 border-l border-border/70"
          : "h-full w-full",
      )}
    >
      {/* Header */}
      <PaneHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <Badge
              variant="info"
              size="sm"
              className="shrink-0 rounded-md px-1.5 py-0 font-semibold tracking-wide uppercase"
            >
              {label}
            </Badge>
            {activePlan ? (
              <span className="shrink-0 text-[11px] text-muted-foreground/60 tabular-nums">
                {formatTimestamp(activePlan.updatedAt, timestampFormat)}
              </span>
            ) : null}
            {activePlan ? (
              <span
                className={cn(
                  "shrink-0 rounded-md px-1.5 py-0 text-[10px] font-medium",
                  activePlan.status === "active" && "bg-blue-500/10 text-blue-400",
                  activePlan.status === "completed" && "bg-emerald-500/10 text-emerald-500",
                  activePlan.status === "failed" && "bg-destructive/10 text-destructive",
                  activePlan.status === "interrupted" && "bg-muted text-muted-foreground",
                )}
              >
                {planStatusLabel(activePlan.status)}
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            {planMarkdown ? (
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon"
                      variant="ghost"
                      className={PANE_ICON_BUTTON_CLASS}
                      aria-label="Plan actions"
                    />
                  }
                >
                  <EllipsisIcon className="size-3.5" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuItem onClick={handleCopyPlan}>
                    {isCopied ? "Copied!" : "Copy to clipboard"}
                  </MenuItem>
                  <MenuItem onClick={handleDownload}>Download as markdown</MenuItem>
                  <MenuItem
                    onClick={handleSaveToWorkspace}
                    disabled={!workspaceRoot || isSavingToWorkspace}
                  >
                    Save to workspace
                  </MenuItem>
                </MenuPopup>
              </Menu>
            ) : null}
            <PaneSidebarToggleButton
              type="button"
              side="right"
              expanded
              label={`Close ${label.toLowerCase()} sidebar`}
              onClick={onClose}
            />
          </>
        }
      />

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3 space-y-4">
          {/* Explanation */}
          {activePlan?.explanation ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground/80">
              {activePlan.explanation}
            </p>
          ) : null}

          {/* Plan Steps */}
          {activePlan && displayedSteps.length > 0 ? (
            <div className="space-y-1">
              <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted-foreground/40 uppercase">
                Steps
              </p>
              {displayedSteps.map((step) => (
                <div
                  key={`${step.status}:${step.step}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200",
                    step.status === "inProgress" &&
                      activePlan.status === "active" &&
                      "bg-blue-500/5",
                    step.status === "completed" && "bg-emerald-500/5",
                  )}
                >
                  {stepStatusIcon(step.status, activePlan.status)}
                  <p
                    className={cn(
                      "text-[13px] leading-snug",
                      step.status === "completed"
                        ? "text-muted-foreground/50 line-through decoration-muted-foreground/20"
                        : step.status === "inProgress" && activePlan.status === "active"
                          ? "text-foreground/90"
                          : "text-muted-foreground/70",
                    )}
                  >
                    {step.step}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Proposed Plan Markdown */}
          {planMarkdown ? (
            <div className="space-y-2">
              <button
                type="button"
                className="group flex w-full items-center gap-1.5 text-left"
                onClick={() => setProposedPlanExpanded((v) => !v)}
              >
                {proposedPlanExpanded ? (
                  <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground/40 transition-transform" />
                ) : (
                  <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/40 transition-transform" />
                )}
                <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/40 uppercase group-hover:text-muted-foreground/60">
                  {planTitle ?? "Full Plan"}
                </span>
              </button>
              {proposedPlanExpanded ? (
                <div className="rounded-lg border border-border/50 bg-background/50 p-3">
                  <ChatMarkdown
                    text={displayedPlanMarkdown ?? ""}
                    cwd={markdownCwd}
                    isStreaming={false}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Empty state */}
          {!activePlan && !planMarkdown ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-[13px] text-muted-foreground/40">No active plan yet.</p>
              <p className="mt-1 text-[11px] text-muted-foreground/30">
                Plans will appear here when generated.
              </p>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
});

export default PlanSidebar;
export type { PlanSidebarProps };
