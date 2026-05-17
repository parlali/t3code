import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildChromeDevToolsMcpCodexConfigArgs,
  buildChromeDevToolsMcpEnv,
  buildChromeDevToolsMcpNpxArgs,
  CHROME_DEVTOOLS_MCP_PACKAGE_SPECIFIER,
  CHROME_DEVTOOLS_MCP_VIEWPORT,
} from "./chromeDevToolsMcp.ts";

describe("Chrome DevTools MCP integration config", () => {
  it("does not generate Codex config args when disabled", () => {
    assert.deepEqual(buildChromeDevToolsMcpCodexConfigArgs({ enabled: false }), []);
  });

  it("builds pinned managed npx args", () => {
    assert.deepEqual(buildChromeDevToolsMcpNpxArgs(), [
      "-y",
      CHROME_DEVTOOLS_MCP_PACKAGE_SPECIFIER,
      "--headless=true",
      "--isolated=true",
      `--viewport=${CHROME_DEVTOOLS_MCP_VIEWPORT}`,
      "--no-usage-statistics",
      "--no-performance-crux",
      "--redact-network-headers=true",
    ]);
  });

  it("builds Codex -c overrides without exposing arbitrary command input", () => {
    assert.deepEqual(buildChromeDevToolsMcpCodexConfigArgs({ enabled: true }), [
      "-c",
      'mcp_servers.chrome-devtools.command="npx"',
      "-c",
      `mcp_servers.chrome-devtools.args=["-y", "${CHROME_DEVTOOLS_MCP_PACKAGE_SPECIFIER}", "--headless=true", "--isolated=true", "--viewport=${CHROME_DEVTOOLS_MCP_VIEWPORT}", "--no-usage-statistics", "--no-performance-crux", "--redact-network-headers=true"]`,
      "-c",
      'mcp_servers.chrome-devtools.env.T3CODE_MANAGED_CHROME_MCP="1"',
    ]);
  });

  it("marks the MCP server as managed in env", () => {
    assert.deepEqual(buildChromeDevToolsMcpEnv(), {
      T3CODE_MANAGED_CHROME_MCP: "1",
    });
  });
});
