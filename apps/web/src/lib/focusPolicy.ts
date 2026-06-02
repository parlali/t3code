export function hasMeaningfulDocumentFocus(
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): boolean {
  if (!doc) return false;
  const activeElement = doc.activeElement;
  if (!(activeElement instanceof Element)) return false;
  if (!activeElement.isConnected) return false;
  if (activeElement === doc.body || activeElement === doc.documentElement) return false;
  return true;
}

export function focusIfDocumentLacksMeaningfulFocus(focus: () => void): boolean {
  if (hasMeaningfulDocumentFocus()) {
    return false;
  }
  focus();
  return true;
}
