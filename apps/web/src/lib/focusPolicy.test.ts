import { afterEach, describe, expect, it, vi } from "vitest";

import { focusIfDocumentLacksMeaningfulFocus, hasMeaningfulDocumentFocus } from "./focusPolicy";

class MockElement {
  isConnected = true;
}

class MockDocument {
  readonly body = new MockElement();
  readonly documentElement = new MockElement();

  constructor(readonly activeElement: MockElement | null) {}
}

const originalDocument = globalThis.document;
const originalElement = globalThis.Element;

afterEach(() => {
  if (originalDocument === undefined) {
    delete (globalThis as { document?: Document }).document;
  } else {
    globalThis.document = originalDocument;
  }

  if (originalElement === undefined) {
    delete (globalThis as { Element?: typeof Element }).Element;
  } else {
    globalThis.Element = originalElement;
  }
});

describe("hasMeaningfulDocumentFocus", () => {
  it("returns false when only the document body is focused", () => {
    const doc = new MockDocument(null);
    globalThis.Element = MockElement as unknown as typeof Element;

    expect(
      hasMeaningfulDocumentFocus({ ...doc, activeElement: doc.body } as unknown as Document),
    ).toBe(false);
  });

  it("returns false for detached focused elements", () => {
    const activeElement = new MockElement();
    activeElement.isConnected = false;
    globalThis.Element = MockElement as unknown as typeof Element;

    expect(hasMeaningfulDocumentFocus(new MockDocument(activeElement) as unknown as Document)).toBe(
      false,
    );
  });

  it("returns true for connected focused elements other than body or html", () => {
    globalThis.Element = MockElement as unknown as typeof Element;

    expect(
      hasMeaningfulDocumentFocus(new MockDocument(new MockElement()) as unknown as Document),
    ).toBe(true);
  });
});

describe("focusIfDocumentLacksMeaningfulFocus", () => {
  it("focuses only when no meaningful element is focused", () => {
    const doc = new MockDocument(null);
    globalThis.Element = MockElement as unknown as typeof Element;
    globalThis.document = { ...doc, activeElement: doc.body } as unknown as Document;
    const focus = vi.fn();

    expect(focusIfDocumentLacksMeaningfulFocus(focus)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does not focus over an existing focused element", () => {
    globalThis.Element = MockElement as unknown as typeof Element;
    globalThis.document = new MockDocument(new MockElement()) as unknown as Document;
    const focus = vi.fn();

    expect(focusIfDocumentLacksMeaningfulFocus(focus)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });
});
