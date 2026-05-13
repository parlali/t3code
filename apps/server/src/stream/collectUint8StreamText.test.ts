import { describe, expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";

import { collectUint8StreamText } from "./collectUint8StreamText.ts";

const encoder = new TextEncoder();

describe("collectUint8StreamText", () => {
  it.effect("collects text from Uint8Array chunks", () =>
    Effect.gen(function* () {
      const collected = yield* collectUint8StreamText({
        stream: Stream.make(encoder.encode("hello "), encoder.encode("world")),
      });

      expect(collected).toEqual({
        text: "hello world",
        bytes: 11,
        truncated: false,
      });
    }),
  );

  it.effect("truncates by bytes and appends the marker", () =>
    Effect.gen(function* () {
      const collected = yield* collectUint8StreamText({
        stream: Stream.make(encoder.encode("abcdef")),
        maxBytes: 3,
        truncatedMarker: "[cut]",
      });

      expect(collected).toEqual({
        text: "abc[cut]",
        bytes: 3,
        truncated: true,
      });
    }),
  );
});
