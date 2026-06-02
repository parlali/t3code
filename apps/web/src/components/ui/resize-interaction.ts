export type ResizeInteractionCursor = "col-resize" | "row-resize";

type ResizePointerDownEvent<T extends HTMLElement = HTMLElement> = {
  readonly currentTarget: T;
  readonly pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
};

export type ResizeInteractionHandle = {
  readonly pointerId: number;
  release(): void;
};

const activeResizeInteractions: Array<{
  readonly cursor: ResizeInteractionCursor;
  readonly token: symbol;
}> = [];

function setDocumentResizeCursor(cursor: ResizeInteractionCursor | null): void {
  if (typeof document === "undefined") return;

  if (cursor) {
    document.documentElement.dataset.resizeCursor = cursor;
    document.documentElement.dataset.resizing = "true";
    return;
  }

  delete document.documentElement.dataset.resizeCursor;
  delete document.documentElement.dataset.resizing;
}

function removeBrowserSelection(): void {
  if (typeof document === "undefined") return;
  document.getSelection()?.removeAllRanges();
}

export function startResizeInteraction(
  event: ResizePointerDownEvent,
  options: {
    readonly cursor: ResizeInteractionCursor;
    readonly stopPropagation?: boolean;
  },
): ResizeInteractionHandle {
  event.preventDefault();
  if (options.stopPropagation) {
    event.stopPropagation();
  }

  const pointerId = event.pointerId;
  const target = event.currentTarget;
  if (typeof target.setPointerCapture === "function") {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Pointer capture can fail if the browser already ended the pointer stream.
    }
  }
  removeBrowserSelection();

  const token = Symbol("resizeInteraction");
  activeResizeInteractions.push({ cursor: options.cursor, token });
  setDocumentResizeCursor(options.cursor);

  let released = false;

  return {
    pointerId,
    release() {
      if (released) return;
      released = true;

      const index = activeResizeInteractions.findIndex(
        (interaction) => interaction.token === token,
      );
      if (index >= 0) {
        activeResizeInteractions.splice(index, 1);
      }

      if (
        typeof target.hasPointerCapture === "function" &&
        typeof target.releasePointerCapture === "function" &&
        target.hasPointerCapture(pointerId)
      ) {
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // Best-effort cleanup; the document resize state below is the critical part.
        }
      }

      setDocumentResizeCursor(activeResizeInteractions.at(-1)?.cursor ?? null);
    },
  };
}
