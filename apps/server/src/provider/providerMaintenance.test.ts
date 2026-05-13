import { describe, expect, it } from "@effect/vitest";
import { ProviderDriverKind } from "@t3tools/contracts";

import {
  createProviderVersionAdvisory,
  makePackageManagedProviderMaintenanceResolver,
  resolvePackageManagedProviderMaintenance,
} from "./providerMaintenance.ts";

const provider = ProviderDriverKind.make("codex");
const definition = {
  provider,
  npmPackageName: "@openai/codex",
  homebrewFormula: "codex",
  nativeUpdate: null,
} as const;

describe("providerMaintenance", () => {
  it("detects npm-managed providers from global node module paths", () => {
    const capabilities = resolvePackageManagedProviderMaintenance(definition, {
      binaryPath: "/usr/local/lib/node_modules/@openai/codex/bin/codex.js",
      realCommandPath: "/usr/local/lib/node_modules/@openai/codex/bin/codex.js",
    });

    expect(capabilities.update?.command).toBe("npm install -g @openai/codex@latest");
    expect(capabilities.update?.lockKey).toBe("npm-global");
  });

  it("falls back to manual-only updates for explicit unmanaged paths", () => {
    const resolver = makePackageManagedProviderMaintenanceResolver(definition);
    const capabilities = resolver.resolve({
      binaryPath: "/opt/custom/codex",
      realCommandPath: "/opt/custom/codex",
    });

    expect(capabilities.packageName).toBe("@openai/codex");
    expect(capabilities.update).toBeNull();
  });

  it("marks providers behind the latest version as update candidates", () => {
    const advisory = createProviderVersionAdvisory({
      driver: provider,
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      checkedAt: "2026-05-13T00:00:00.000Z",
      maintenanceCapabilities: resolvePackageManagedProviderMaintenance(definition, {
        binaryPath: "/usr/local/lib/node_modules/@openai/codex/bin/codex.js",
      }),
    });

    expect(advisory.status).toBe("behind_latest");
    expect(advisory.canUpdate).toBe(true);
    expect(advisory.updateCommand).toBe("npm install -g @openai/codex@latest");
  });
});
