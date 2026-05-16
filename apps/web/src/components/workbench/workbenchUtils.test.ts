import { describe, expect, it } from "vitest";

import { buildNewEntryRelativePath, relativePathAncestors } from "./workbenchUtils";

describe("buildNewEntryRelativePath", () => {
  it("builds root and nested create paths", () => {
    expect(buildNewEntryRelativePath(null, "README.md")).toBe("README.md");
    expect(buildNewEntryRelativePath("src", "App.tsx")).toBe("src/App.tsx");
    expect(buildNewEntryRelativePath("src", "components/Button.tsx")).toBe(
      "src/components/Button.tsx",
    );
  });

  it("normalizes separators and rejects ambiguous path segments", () => {
    expect(buildNewEntryRelativePath("src", "components\\Button.tsx")).toBe(
      "src/components/Button.tsx",
    );
    expect(buildNewEntryRelativePath("src", "")).toBeNull();
    expect(buildNewEntryRelativePath("src", "../escape.ts")).toBeNull();
    expect(buildNewEntryRelativePath("src", "./local.ts")).toBeNull();
  });
});

describe("relativePathAncestors", () => {
  it("returns parents from root to leaf parent", () => {
    expect(relativePathAncestors("src/components/Button.tsx")).toEqual(["src", "src/components"]);
    expect(relativePathAncestors("README.md")).toEqual([]);
  });
});
