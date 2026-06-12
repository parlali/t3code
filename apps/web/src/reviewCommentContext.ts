export interface ReviewCommentContext {
  id: string;
  sectionId: string;
  sectionTitle: string;
  filePath: string;
  startIndex: number | null;
  endIndex: number | null;
  rangeLabel: string;
  text: string;
  diff: string;
}

export type ReviewCommentMessageSegment =
  | { kind: "text"; id: string; text: string }
  | { kind: "review-comment"; comment: ReviewCommentContext };

const REVIEW_COMMENT_PATTERN = /<review_comment\b([^>]*)>([\s\S]*?)<\/review_comment>/gi;
const ATTRIBUTE_PATTERN = /([A-Za-z_:][\w:.-]*)=(?:"([^"]*)"|'([^']*)')/g;
const DIFF_FENCE_PATTERN = /```diff\s*\n([\s\S]*?)\n```/i;

function decodeAttributeValue(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? "";
    if (name) {
      attributes[name] = decodeAttributeValue(value);
    }
  }
  return attributes;
}

function parseOptionalInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCommentId(attributes: Record<string, string>, index: number): string {
  const sectionId = attributes.sectionId ?? "section";
  const filePath = attributes.filePath ?? "file";
  const rangeLabel = attributes.rangeLabel ?? "range";
  return `${sectionId}:${filePath}:${rangeLabel}:${index}`;
}

function parseReviewComment(
  attributesSource: string,
  body: string,
  index: number,
): ReviewCommentContext {
  const attributes = parseAttributes(attributesSource);
  const diffMatch = DIFF_FENCE_PATTERN.exec(body);
  const diff = diffMatch?.[1]?.trimEnd() ?? "";
  const text = (diffMatch ? body.slice(0, diffMatch.index) : body).trim();

  return {
    id: buildCommentId(attributes, index),
    sectionId: attributes.sectionId ?? "",
    sectionTitle: attributes.sectionTitle ?? "Review comment",
    filePath: attributes.filePath ?? "",
    startIndex: parseOptionalInteger(attributes.startIndex),
    endIndex: parseOptionalInteger(attributes.endIndex),
    rangeLabel: attributes.rangeLabel ?? "",
    text,
    diff,
  };
}

export function parseReviewCommentMessageSegments(text: string): ReviewCommentMessageSegment[] {
  const segments: ReviewCommentMessageSegment[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(REVIEW_COMMENT_PATTERN)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > cursor) {
      segments.push({
        kind: "text",
        id: `text:${cursor}`,
        text: text.slice(cursor, matchIndex),
      });
    }
    segments.push({
      kind: "review-comment",
      comment: parseReviewComment(match[1] ?? "", match[2] ?? "", index),
    });
    cursor = matchIndex + match[0].length;
    index += 1;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", id: `text:${cursor}`, text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ kind: "text", id: "text:0", text }];
}

export function buildReviewCommentRenderablePatch(comment: ReviewCommentContext): string {
  const diff = comment.diff.trim();
  if (diff.length === 0) {
    return "";
  }

  const hasFileHeader = /^diff --git |\+\+\+ |\-\-\- /m.test(diff);
  if (hasFileHeader) {
    return diff;
  }

  const filePath = comment.filePath || "review-comment";
  return [`diff --git a/${filePath} b/${filePath}`, `--- a/${filePath}`, `+++ b/${filePath}`, diff]
    .join("\n")
    .trim();
}
