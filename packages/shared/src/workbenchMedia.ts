export type WorkbenchMediaKind = "image" | "pdf";

export interface WorkbenchMediaType {
  readonly kind: WorkbenchMediaKind;
  readonly mimeType: string;
}

const WORKBENCH_IMAGE_MIME_TYPES_BY_EXTENSION = new Map<string, string>([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function extensionForPath(path: string): string {
  const basename = path.split(/[\\/]/u).at(-1) ?? path;
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === basename.length - 1) return "";
  return basename.slice(dotIndex).toLowerCase();
}

export function getWorkbenchMediaTypeByPath(path: string): WorkbenchMediaType | null {
  const extension = extensionForPath(path);
  if (extension === ".pdf") return { kind: "pdf", mimeType: "application/pdf" };

  const imageMimeType = WORKBENCH_IMAGE_MIME_TYPES_BY_EXTENSION.get(extension);
  return imageMimeType ? { kind: "image", mimeType: imageMimeType } : null;
}

export function isWorkbenchMediaPath(path: string): boolean {
  return getWorkbenchMediaTypeByPath(path) !== null;
}

export function createBase64DataUrl(input: { readonly mimeType: string; readonly base64: string }) {
  return `data:${input.mimeType};base64,${input.base64}`;
}
