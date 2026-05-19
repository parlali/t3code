import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ProjectReadFileResult } from "./project.ts";

const decodeReadFileResult = Schema.decodeUnknownSync(ProjectReadFileResult);

describe("ProjectReadFileResult", () => {
  it("accepts legacy text file responses", () => {
    expect(
      decodeReadFileResult({
        relativePath: "src/App.tsx",
        contents: "export {};\n",
      }),
    ).toEqual({
      relativePath: "src/App.tsx",
      contents: "export {};\n",
    });
  });

  it("accepts media file responses", () => {
    expect(
      decodeReadFileResult({
        relativePath: "assets/logo.svg",
        contents: "",
        contentKind: "media",
        mediaKind: "image",
        mediaType: "image/svg+xml",
        dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
        sizeBytes: 6,
      }),
    ).toEqual({
      relativePath: "assets/logo.svg",
      contents: "",
      contentKind: "media",
      mediaKind: "image",
      mediaType: "image/svg+xml",
      dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
      sizeBytes: 6,
    });
  });
});
