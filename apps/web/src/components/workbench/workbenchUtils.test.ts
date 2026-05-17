import { describe, expect, it } from "vitest";

import {
  buildNewEntryRelativePath,
  relativePathAncestors,
  resolveWorkbenchRelativePath,
} from "./workbenchUtils";

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

describe("resolveWorkbenchRelativePath", () => {
  it("converts absolute workspace paths to relative paths", () => {
    expect(
      resolveWorkbenchRelativePath(
        "/Users/julius/project/src/components/Button.tsx",
        "/Users/julius/project",
      ),
    ).toBe("src/components/Button.tsx");
  });

  it("normalizes relative paths", () => {
    expect(resolveWorkbenchRelativePath("./src\\main.ts", "/Users/julius/project")).toBe(
      "src/main.ts",
    );
  });

  it("handles slash-prefixed windows drive paths", () => {
    expect(
      resolveWorkbenchRelativePath(
        "/C:/Users/mike/dev-stuff/t3code/apps/web/src/session-logic.ts",
        "C:/Users/mike/dev-stuff/t3code",
      ),
    ).toBe("apps/web/src/session-logic.ts");
  });

  it("rejects absolute paths outside the workspace", () => {
    expect(
      resolveWorkbenchRelativePath("/Users/julius/other/README.md", "/Users/julius/project"),
    ).toBeNull();
  });

  it("rejects parent-relative paths", () => {
    expect(resolveWorkbenchRelativePath("../other/README.md", "/Users/julius/project")).toBeNull();
  });
});
