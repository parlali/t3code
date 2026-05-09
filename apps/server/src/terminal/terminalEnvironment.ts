const TERMINAL_BASE_ENV_BLOCKLIST = new Set([
  "PORT",
  "ELECTRON_RENDERER_PORT",
  "ELECTRON_RUN_AS_NODE",
  "NO_COLOR",
]);

const DEFAULT_TERMINAL_TERM = "xterm-256color";
const DEFAULT_TERMINAL_COLORTERM = "truecolor";

function shouldExcludeTerminalBaseEnvKey(key: string): boolean {
  const normalizedKey = key.toUpperCase();
  if (normalizedKey.startsWith("T3CODE_")) {
    return true;
  }
  if (normalizedKey.startsWith("VITE_")) {
    return true;
  }
  return TERMINAL_BASE_ENV_BLOCKLIST.has(normalizedKey);
}

export function createTerminalSpawnEnv(
  baseEnv: NodeJS.ProcessEnv,
  runtimeEnv?: Record<string, string> | null,
): NodeJS.ProcessEnv {
  const spawnEnv: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) continue;
    if (shouldExcludeTerminalBaseEnvKey(key)) continue;
    spawnEnv[key] = value;
  }

  spawnEnv.TERM = DEFAULT_TERMINAL_TERM;
  if (!spawnEnv.COLORTERM) {
    spawnEnv.COLORTERM = DEFAULT_TERMINAL_COLORTERM;
  }

  if (runtimeEnv) {
    for (const [key, value] of Object.entries(runtimeEnv)) {
      spawnEnv[key] = value;
    }
  }
  return spawnEnv;
}

export function normalizedRuntimeEnv(
  env: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!env) return null;
  const entries = Object.entries(env);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));
}
