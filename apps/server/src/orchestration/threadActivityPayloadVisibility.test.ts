import { EventId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";

import { redactThreadActivityPayloadForDetail } from "./threadActivityPayloadVisibility.ts";

describe("threadActivityPayloadVisibility", () => {
  it("preserves user-input payloads and redacts generic tool payloads", () => {
    assert.deepEqual(
      redactThreadActivityPayloadForDetail({
        id: EventId.make("activity-user-input"),
        tone: "info",
        kind: "user-input.requested",
        summary: "User input requested",
        payload: {
          requestId: "request-1",
          questions: [
            {
              id: "scope",
              header: "Scope",
              question: "Which scope?",
              options: [{ label: "Server", description: "Use server code." }],
              multiSelect: false,
            },
          ],
        },
        turnId: null,
        createdAt: "2026-04-11T00:00:00.000Z",
      }).payload,
      {
        requestId: "request-1",
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Which scope?",
            options: [{ label: "Server", description: "Use server code." }],
            multiSelect: false,
          },
        ],
      },
    );

    assert.equal(
      redactThreadActivityPayloadForDetail({
        id: EventId.make("activity-tool"),
        tone: "tool",
        kind: "tool.completed",
        summary: "Tool completed",
        payload: { detail: "large tool output" },
        turnId: null,
        createdAt: "2026-04-11T00:00:01.000Z",
      }).payload,
      null,
    );
  });
});
