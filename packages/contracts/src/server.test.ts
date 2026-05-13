import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ServerConfigStreamEvent, ServerLifecycleStreamEvent, ServerProvider } from "./server.ts";

const decodeServerProvider = Schema.decodeUnknownSync(ServerProvider);
const decodeServerConfigStreamEvent = Schema.decodeUnknownSync(ServerConfigStreamEvent);
const decodeServerLifecycleStreamEvent = Schema.decodeUnknownSync(ServerLifecycleStreamEvent);

describe("ServerProvider", () => {
  it("defaults capability arrays when decoding provider snapshots", () => {
    const parsed = decodeServerProvider({
      instanceId: "codex",
      driver: "codex",
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: {
        status: "authenticated",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [],
    });

    expect(parsed.slashCommands).toEqual([]);
    expect(parsed.skills).toEqual([]);
    expect(parsed.versionAdvisory).toBeUndefined();
    expect(parsed.updateState).toBeUndefined();
  });

  it("defaults one-click update support when decoding older advisory snapshots", () => {
    const parsed = decodeServerProvider({
      instanceId: "codex",
      driver: "codex",
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: {
        status: "authenticated",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [],
      versionAdvisory: {
        status: "behind_latest",
        currentVersion: "1.0.0",
        latestVersion: "1.0.1",
        updateCommand: "npm install -g @openai/codex@latest",
        checkedAt: "2026-04-10T00:00:00.000Z",
        message: "Update available.",
      },
    });

    expect(parsed.versionAdvisory?.canUpdate).toBe(false);
  });

  it("decodes continuation group metadata", () => {
    const parsed = decodeServerProvider({
      instanceId: "codex_personal",
      driver: "codex",
      continuation: { groupKey: "codex:home:/Users/julius/.codex" },
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: {
        status: "authenticated",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [],
    });

    expect(parsed.continuation?.groupKey).toBe("codex:home:/Users/julius/.codex");
  });
});

describe("ServerConfigStreamEvent", () => {
  it("decodes heartbeat events for websocket keepalives", () => {
    const parsed = decodeServerConfigStreamEvent({
      version: 1,
      type: "heartbeat",
      payload: {
        at: "2026-05-13T10:00:00.000Z",
      },
    });

    expect(parsed.type).toBe("heartbeat");
    if (parsed.type !== "heartbeat") {
      throw new Error("Expected heartbeat event.");
    }
    expect(parsed.payload.at).toBe("2026-05-13T10:00:00.000Z");
  });
});

describe("ServerLifecycleStreamEvent", () => {
  it("decodes heartbeat events for websocket keepalives", () => {
    const parsed = decodeServerLifecycleStreamEvent({
      version: 1,
      sequence: 0,
      type: "heartbeat",
      payload: {
        at: "2026-05-13T10:00:00.000Z",
      },
    });

    expect(parsed.type).toBe("heartbeat");
    if (parsed.type !== "heartbeat") {
      throw new Error("Expected heartbeat event.");
    }
    expect(parsed.payload.at).toBe("2026-05-13T10:00:00.000Z");
  });
});
