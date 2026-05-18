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

interface ManagedStdioMcpServer {
  readonly name: typeof CHROME_DEVTOOLS_MCP_SERVER_NAME;
  readonly command: "npx";
  readonly args: ReadonlyArray<string>;
  readonly env: Record<string, string>;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlStringArray(values: ReadonlyArray<string>): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

function buildChromeDevToolsMcpStdioServer(
  settings: ChromeDevToolsMcpIntegrationSettings,
): ManagedStdioMcpServer | undefined {
  if (!settings.enabled) {
    return undefined;
  }

  return {
    name: CHROME_DEVTOOLS_MCP_SERVER_NAME,
    command: "npx",
    args: buildChromeDevToolsMcpNpxArgs(),
    env: buildChromeDevToolsMcpEnv(),
  };
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
  const server = buildChromeDevToolsMcpStdioServer(settings);
  if (!server) {
    return [];
  }

  const mcpServerKey = `mcp_servers.${server.name}`;

  return [
    "-c",
    `${mcpServerKey}.command=${tomlString(server.command)}`,
    "-c",
    `${mcpServerKey}.args=${tomlStringArray(server.args)}`,
    ...Object.entries(server.env).flatMap(([name, value]) => [
      "-c",
      `${mcpServerKey}.env.${name}=${tomlString(value)}`,
    ]),
  ];
}

export function buildChromeDevToolsMcpClaudeServers(settings: ChromeDevToolsMcpIntegrationSettings):
  | Record<
      typeof CHROME_DEVTOOLS_MCP_SERVER_NAME,
      {
        readonly type: "stdio";
        readonly command: string;
        readonly args: string[];
        readonly env: Record<string, string>;
      }
    >
  | undefined {
  const server = buildChromeDevToolsMcpStdioServer(settings);
  if (!server) {
    return undefined;
  }

  return {
    [server.name]: {
      type: "stdio",
      command: server.command,
      args: [...server.args],
      env: { ...server.env },
    },
  };
}

export function buildChromeDevToolsMcpAcpServers(
  settings: ChromeDevToolsMcpIntegrationSettings,
): ReadonlyArray<{
  readonly name: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: ReadonlyArray<{
    readonly name: string;
    readonly value: string;
  }>;
}> {
  const server = buildChromeDevToolsMcpStdioServer(settings);
  if (!server) {
    return [];
  }

  return [
    {
      name: server.name,
      command: server.command,
      args: server.args,
      env: Object.entries(server.env).map(([name, value]) => ({ name, value })),
    },
  ];
}
