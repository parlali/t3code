import type { ChromeDevToolsMcpIntegrationSettings } from "@t3tools/contracts";

export const CHROME_DEVTOOLS_MCP_SERVER_NAME = "chrome-devtools";
export const CHROME_DEVTOOLS_MCP_PACKAGE_VERSION = "0.26.0";
export const CHROME_DEVTOOLS_MCP_PACKAGE_SPECIFIER = `chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_PACKAGE_VERSION}`;
export const CHROME_DEVTOOLS_MCP_VIEWPORT = "1280x720";

const CHROME_DEVTOOLS_MCP_NPX_ARGS = [
  "-y",
  CHROME_DEVTOOLS_MCP_PACKAGE_SPECIFIER,
  "--headless=true",
  "--isolated=true",
  `--viewport=${CHROME_DEVTOOLS_MCP_VIEWPORT}`,
  "--no-usage-statistics",
  "--no-performance-crux",
  "--redact-network-headers=true",
] as const;

const CHROME_DEVTOOLS_MCP_ENV = {
  T3CODE_MANAGED_CHROME_MCP: "1",
} as const;

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlStringArray(values: ReadonlyArray<string>): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

export function buildChromeDevToolsMcpNpxArgs(): ReadonlyArray<string> {
  return [...CHROME_DEVTOOLS_MCP_NPX_ARGS];
}

export function buildChromeDevToolsMcpEnv(): Record<string, string> {
  return { ...CHROME_DEVTOOLS_MCP_ENV };
}

export function buildChromeDevToolsMcpCodexConfigArgs(
  settings: ChromeDevToolsMcpIntegrationSettings,
): ReadonlyArray<string> {
  if (!settings.enabled) {
    return [];
  }

  const mcpServerKey = `mcp_servers.${CHROME_DEVTOOLS_MCP_SERVER_NAME}`;
  const args = buildChromeDevToolsMcpNpxArgs();
  const env = buildChromeDevToolsMcpEnv();

  return [
    "-c",
    `${mcpServerKey}.command=${tomlString("npx")}`,
    "-c",
    `${mcpServerKey}.args=${tomlStringArray(args)}`,
    ...Object.entries(env).flatMap(([name, value]) => [
      "-c",
      `${mcpServerKey}.env.${name}=${tomlString(value)}`,
    ]),
  ];
}
