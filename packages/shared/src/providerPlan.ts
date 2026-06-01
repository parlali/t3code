import type {
  OrchestrationTaskPlanStep,
  OrchestrationTaskPlanStepStatus,
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
