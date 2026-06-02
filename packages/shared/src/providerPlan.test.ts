import { describe, expect, it } from "vitest";
import { EventId, ThreadId, TurnId } from "@t3tools/contracts";

import {
  normalizePlanExplanation,
  normalizePlanSteps,
  normalizePlanStepStatus,
  settleTaskPlan,
  taskPlanStepsForStatus,
  taskPlanTerminalStatusFromCheckpointStatus,
  taskPlanTerminalStatusFromSessionStatus,
  taskPlanTerminalStatusFromTurnState,
} from "./providerPlan.ts";

describe("providerPlan", () => {
  it("normalizes provider-specific task statuses", () => {
    expect(normalizePlanStepStatus("in_progress")).toBe("inProgress");
    expect(normalizePlanStepStatus("running")).toBe("inProgress");
    expect(normalizePlanStepStatus("done")).toBe("completed");
    expect(normalizePlanStepStatus("unknown")).toBe("pending");
  });

  it("normalizes common task shapes into a stable plan snapshot", () => {
    expect(
      normalizePlanSteps([
        { content: "  Inspect state  ", status: "in_progress" },
        { title: "Patch projection", status: "done" },
        { description: "Verify UI", status: "pending" },
      ]),
    ).toEqual([
      { step: "Inspect state", status: "inProgress" },
      { step: "Patch projection", status: "completed" },
      { step: "Verify UI", status: "pending" },
    ]);
  });

  it("trims optional explanations", () => {
    expect(normalizePlanExplanation("  Rewrite task projection  ")).toBe("Rewrite task projection");
    expect(normalizePlanExplanation("  ")).toBeNull();
  });

  it("treats missing checkpoint status as provisional for task plans", () => {
    expect(taskPlanTerminalStatusFromCheckpointStatus("missing")).toBeNull();
    expect(taskPlanTerminalStatusFromCheckpointStatus("ready")).toBe("completed");
    expect(taskPlanTerminalStatusFromCheckpointStatus("error")).toBe("failed");
  });

  it("does not treat generic ready sessions as task completion", () => {
    expect(taskPlanTerminalStatusFromSessionStatus("ready")).toBeNull();
    expect(taskPlanTerminalStatusFromSessionStatus("interrupted")).toBe("interrupted");
    expect(taskPlanTerminalStatusFromSessionStatus("stopped")).toBe("interrupted");
    expect(taskPlanTerminalStatusFromSessionStatus("error")).toBe("failed");
  });

  it("maps terminal turn states to task plan statuses", () => {
    expect(taskPlanTerminalStatusFromTurnState("completed")).toBe("completed");
    expect(taskPlanTerminalStatusFromTurnState("interrupted")).toBe("interrupted");
    expect(taskPlanTerminalStatusFromTurnState("error")).toBe("failed");
    expect(taskPlanTerminalStatusFromTurnState("running")).toBeNull();
  });

  it("allows authoritative terminal status repair and completes stale steps", () => {
    const interruptedPlan = {
      threadId: ThreadId.make("thread-1"),
      turnId: TurnId.make("turn-1"),
      status: "interrupted" as const,
      explanation: null,
      steps: [
        { step: "Inspect", status: "completed" as const },
        { step: "Patch", status: "inProgress" as const },
      ],
      sourceActivityId: EventId.make("activity-1"),
      createdAt: "2026-02-27T00:00:00.000Z",
      updatedAt: "2026-02-27T00:00:01.000Z",
      settledAt: "2026-02-27T00:00:01.000Z",
    };

    expect(
      settleTaskPlan(interruptedPlan, {
        turnId: interruptedPlan.turnId,
        status: "completed",
        settledAt: "2026-02-27T00:00:02.000Z",
      }),
    ).toMatchObject({
      status: "completed",
      settledAt: "2026-02-27T00:00:02.000Z",
      steps: [
        { step: "Inspect", status: "completed" },
        { step: "Patch", status: "completed" },
      ],
    });
  });

  it("does not downgrade a completed task plan", () => {
    const completedPlan = {
      threadId: ThreadId.make("thread-1"),
      turnId: TurnId.make("turn-1"),
      status: "completed" as const,
      explanation: null,
      steps: [{ step: "Inspect", status: "completed" as const }],
      sourceActivityId: EventId.make("activity-1"),
      createdAt: "2026-02-27T00:00:00.000Z",
      updatedAt: "2026-02-27T00:00:01.000Z",
      settledAt: "2026-02-27T00:00:01.000Z",
    };

    expect(
      settleTaskPlan(completedPlan, {
        turnId: completedPlan.turnId,
        status: "interrupted",
        settledAt: "2026-02-27T00:00:02.000Z",
      }),
    ).toBe(completedPlan);
  });

  it("ignores duplicate completed settlements when the task plan is already current", () => {
    const completedPlan = {
      threadId: ThreadId.make("thread-1"),
      turnId: TurnId.make("turn-1"),
      status: "completed" as const,
      explanation: null,
      steps: [{ step: "Inspect", status: "completed" as const }],
      sourceActivityId: EventId.make("activity-1"),
      createdAt: "2026-02-27T00:00:00.000Z",
      updatedAt: "2026-02-27T00:00:02.000Z",
      settledAt: "2026-02-27T00:00:02.000Z",
    };

    expect(
      settleTaskPlan(completedPlan, {
        turnId: completedPlan.turnId,
        status: "completed",
        settledAt: "2026-02-27T00:00:02.000Z",
      }),
    ).toBe(completedPlan);
  });

  it("projects completed task plans with completed display steps", () => {
    expect(
      taskPlanStepsForStatus("completed", [
        { step: "Inspect", status: "inProgress" },
        { step: "Patch", status: "pending" },
      ]),
    ).toEqual([
      { step: "Inspect", status: "completed" },
      { step: "Patch", status: "completed" },
    ]);
  });
});
