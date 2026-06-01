import { describe, expect, it } from "vitest";

import {
  normalizePlanExplanation,
  normalizePlanSteps,
  normalizePlanStepStatus,
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
});
