import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildChromeDevToolsMcpAcpServers,
  buildChromeDevToolsMcpClaudeServers,
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

  it("does not generate Claude or ACP server config when disabled", () => {
    assert.equal(buildChromeDevToolsMcpClaudeServers({ enabled: false }), undefined);
    assert.deepEqual(buildChromeDevToolsMcpAcpServers({ enabled: false }), []);
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

  it("builds Claude SDK MCP server config", () => {
    assert.deepEqual(buildChromeDevToolsMcpClaudeServers({ enabled: true }), {
      "chrome-devtools": {
        type: "stdio",
        command: "npx",
        args: [
          "-y",
          CHROME_DEVTOOLS_MCP_PACKAGE_SPECIFIER,
          "--headless=true",
          "--isolated=true",
          `--viewport=${CHROME_DEVTOOLS_MCP_VIEWPORT}`,
          "--no-usage-statistics",
          "--no-performance-crux",
          "--redact-network-headers=true",
        ],
        env: {
          T3CODE_MANAGED_CHROME_MCP: "1",
        },
      },
    });
  });

  it("builds ACP MCP server config", () => {
    assert.deepEqual(buildChromeDevToolsMcpAcpServers({ enabled: true }), [
      {
        name: "chrome-devtools",
        command: "npx",
        args: [
          "-y",
          CHROME_DEVTOOLS_MCP_PACKAGE_SPECIFIER,
          "--headless=true",
          "--isolated=true",
          `--viewport=${CHROME_DEVTOOLS_MCP_VIEWPORT}`,
          "--no-usage-statistics",
          "--no-performance-crux",
          "--redact-network-headers=true",
        ],
        env: [
          {
            name: "T3CODE_MANAGED_CHROME_MCP",
            value: "1",
          },
        ],
      },
    ]);
  });

  it("marks the MCP server as managed in env", () => {
    assert.deepEqual(buildChromeDevToolsMcpEnv(), {
      T3CODE_MANAGED_CHROME_MCP: "1",
    });
  });
});
