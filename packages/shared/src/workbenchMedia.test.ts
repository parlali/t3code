import { describe, expect, it } from "vitest";

import {
  createBase64DataUrl,
  getWorkbenchMediaTypeByPath,
  isWorkbenchMediaPath,
} from "./workbenchMedia.ts";

describe("workbenchMedia", () => {
  it("detects browser-renderable images case-insensitively", () => {
    expect(getWorkbenchMediaTypeByPath("assets/Logo.SVG")).toEqual({
      kind: "image",
      mimeType: "image/svg+xml",
    });
    expect(getWorkbenchMediaTypeByPath("assets/photo.jpeg")).toEqual({
      kind: "image",
      mimeType: "image/jpeg",
    });
  });

  it("detects PDFs", () => {
    expect(getWorkbenchMediaTypeByPath("docs/spec.PDF")).toEqual({
      kind: "pdf",
      mimeType: "application/pdf",
    });
  });

  it("leaves regular source files as text", () => {
    expect(isWorkbenchMediaPath("src/App.tsx")).toBe(false);
    expect(getWorkbenchMediaTypeByPath("README.md")).toBeNull();
  });

  it("formats base64 data URLs", () => {
    expect(createBase64DataUrl({ mimeType: "image/png", base64: "AA==" })).toBe(
      "data:image/png;base64,AA==",
    );
  });
});
