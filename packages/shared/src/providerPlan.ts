import type {
  OrchestrationTaskPlan,
  OrchestrationTaskPlanStatus,
  OrchestrationTaskPlanStep,
  OrchestrationTaskPlanStepStatus,
  TurnId,
} from "@t3tools/contracts";
import { TrimmedNonEmptyString } from "@t3tools/contracts";

export function normalizePlanStepStatus(raw: unknown): OrchestrationTaskPlanStepStatus {
  switch (raw) {
    case "completed":
    case "complete":
    case "done":
      return "completed";
    case "inProgress":
    case "in_progress":
    case "in-progress":
    case "running":
    case "active":
      return "inProgress";
    default:
      return "pending";
  }
}

export function normalizePlanStep(
  raw: unknown,
  fallbackLabel: string,
): OrchestrationTaskPlanStep | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const rawStep = record.step ?? record.content ?? record.title ?? record.description;
  const step = typeof rawStep === "string" && rawStep.trim().length > 0 ? rawStep.trim() : null;
  if (!step) {
    return fallbackLabel.trim().length > 0
      ? {
          step: TrimmedNonEmptyString.make(fallbackLabel.trim()),
          status: normalizePlanStepStatus(record.status),
        }
      : null;
  }
  return {
    step: TrimmedNonEmptyString.make(step),
    status: normalizePlanStepStatus(record.status),
  };
}

export function normalizePlanSteps(raw: unknown): OrchestrationTaskPlanStep[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry, index) => {
    const step = normalizePlanStep(entry, `Task ${index + 1}`);
    return step ? [step] : [];
  });
}

export function normalizePlanExplanation(raw: unknown): typeof TrimmedNonEmptyString.Type | null {
  return typeof raw === "string" && raw.trim().length > 0
    ? TrimmedNonEmptyString.make(raw.trim())
    : null;
}

export function taskPlanTerminalStatusFromSessionStatus(
  status: string,
): OrchestrationTaskPlanStatus | null {
  switch (status) {
    case "interrupted":
    case "stopped":
      return "interrupted";
    case "error":
      return "failed";
    default:
      return null;
  }
}

export function taskPlanTerminalStatusFromCheckpointStatus(
  status: "ready" | "missing" | "error",
): OrchestrationTaskPlanStatus | null {
  if (status === "ready") return "completed";
  if (status === "error") return "failed";
  return null;
}

export function taskPlanTerminalStatusFromTurnState(
  state: string,
): OrchestrationTaskPlanStatus | null {
  switch (state) {
    case "completed":
      return "completed";
    case "interrupted":
      return "interrupted";
    case "error":
      return "failed";
    default:
      return null;
  }
}

export function taskPlanStepsForStatus(
  status: OrchestrationTaskPlanStatus,
  steps: ReadonlyArray<OrchestrationTaskPlanStep>,
): OrchestrationTaskPlanStep[] {
  if (status !== "completed") {
    return steps as OrchestrationTaskPlanStep[];
  }
  let changed = false;
  const completedSteps = steps.map((step) => {
    if (step.status === "completed") {
      return step;
    }
    changed = true;
    return {
      ...step,
      status: "completed" as const,
    };
  });
  return changed ? completedSteps : (steps as OrchestrationTaskPlanStep[]);
}

type TaskPlanStatusOwner = Pick<
  OrchestrationTaskPlan,
  "status" | "steps" | "turnId" | "updatedAt" | "settledAt"
>;

function taskPlanStatusPriority(status: OrchestrationTaskPlanStatus): number {
  switch (status) {
    case "active":
      return 0;
    case "interrupted":
      return 1;
    case "failed":
      return 2;
    case "completed":
      return 3;
  }
}

function shouldApplyTaskPlanStatus(
  current: OrchestrationTaskPlanStatus,
  next: OrchestrationTaskPlanStatus,
): boolean {
  if (current === next) return true;
  return taskPlanStatusPriority(next) > taskPlanStatusPriority(current);
}

export function settleTaskPlan<TPlan extends TaskPlanStatusOwner>(
  taskPlan: TPlan | null,
  input: {
    readonly turnId: TurnId | null;
    readonly status: OrchestrationTaskPlanStatus | null;
    readonly settledAt: string;
  },
): TPlan | null {
  if (taskPlan === null || input.turnId === null || taskPlan.turnId !== input.turnId) {
    return taskPlan;
  }
  if (input.status === null || !shouldApplyTaskPlanStatus(taskPlan.status, input.status)) {
    return taskPlan;
  }

  const steps = taskPlanStepsForStatus(input.status, taskPlan.steps);
  const updatedAt = taskPlan.updatedAt > input.settledAt ? taskPlan.updatedAt : input.settledAt;
  const settledAt =
    taskPlan.settledAt !== null && taskPlan.settledAt > input.settledAt
      ? taskPlan.settledAt
      : input.settledAt;

  if (
    taskPlan.status === input.status &&
    taskPlan.updatedAt === updatedAt &&
    taskPlan.settledAt === settledAt &&
    taskPlan.steps === steps
  ) {
    return taskPlan;
  }

  return {
    ...taskPlan,
    status: input.status,
    steps,
    updatedAt,
    settledAt,
  };
}
