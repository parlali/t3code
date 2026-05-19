import { Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_LIST_ENTRIES_MAX_LIMIT = 10_000;
const PROJECT_FILE_PATH_MAX_LENGTH = 512;

export const ProjectSearchEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

const ProjectEntryKind = Schema.Literals(["file", "directory"]);

export const ProjectEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  parentPath: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectEntry = typeof ProjectEntry.Type;

export const ProjectSearchEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

export const ProjectListEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_LIST_ENTRIES_MAX_LIMIT)),
});
export type ProjectListEntriesInput = typeof ProjectListEntriesInput.Type;

export const ProjectEntriesSubscribeInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type ProjectEntriesSubscribeInput = typeof ProjectEntriesSubscribeInput.Type;

export const ProjectListEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectListEntriesResult = typeof ProjectListEntriesResult.Type;

export const ProjectCreateEntryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_FILE_PATH_MAX_LENGTH)),
  kind: ProjectEntryKind,
});
export type ProjectCreateEntryInput = typeof ProjectCreateEntryInput.Type;

export const ProjectCreateEntryResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
});
export type ProjectCreateEntryResult = typeof ProjectCreateEntryResult.Type;

export const ProjectEntriesReadyEvent = Schema.Struct({
  type: Schema.Literal("ready"),
  cwd: TrimmedNonEmptyString,
});
export type ProjectEntriesReadyEvent = typeof ProjectEntriesReadyEvent.Type;

export const ProjectEntriesChangedEvent = Schema.Struct({
  type: Schema.Literal("entries-changed"),
  cwd: TrimmedNonEmptyString,
});
export type ProjectEntriesChangedEvent = typeof ProjectEntriesChangedEvent.Type;

export const ProjectEntriesStreamEvent = Schema.Union([
  ProjectEntriesReadyEvent,
  ProjectEntriesChangedEvent,
]);
export type ProjectEntriesStreamEvent = typeof ProjectEntriesStreamEvent.Type;

export class ProjectSearchEntriesError extends Schema.TaggedErrorClass<ProjectSearchEntriesError>()(
  "ProjectSearchEntriesError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class ProjectListEntriesError extends Schema.TaggedErrorClass<ProjectListEntriesError>()(
  "ProjectListEntriesError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class ProjectEntriesSubscribeError extends Schema.TaggedErrorClass<ProjectEntriesSubscribeError>()(
  "ProjectEntriesSubscribeError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class ProjectCreateEntryError extends Schema.TaggedErrorClass<ProjectCreateEntryError>()(
  "ProjectCreateEntryError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ProjectReadFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_FILE_PATH_MAX_LENGTH)),
});
export type ProjectReadFileInput = typeof ProjectReadFileInput.Type;

export const ProjectReadFileContentKind = Schema.Literals(["text", "media"]);
export type ProjectReadFileContentKind = typeof ProjectReadFileContentKind.Type;

export const ProjectReadFileMediaKind = Schema.Literals(["image", "pdf"]);
export type ProjectReadFileMediaKind = typeof ProjectReadFileMediaKind.Type;

export const ProjectReadFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  contents: Schema.String,
  contentKind: Schema.optionalKey(ProjectReadFileContentKind),
  mediaKind: Schema.optionalKey(ProjectReadFileMediaKind),
  mediaType: Schema.optionalKey(TrimmedNonEmptyString),
  dataUrl: Schema.optionalKey(TrimmedNonEmptyString),
  sizeBytes: Schema.optionalKey(Schema.Number),
});
export type ProjectReadFileResult = typeof ProjectReadFileResult.Type;

export class ProjectReadFileError extends Schema.TaggedErrorClass<ProjectReadFileError>()(
  "ProjectReadFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ProjectWriteFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

export const ProjectWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;

export class ProjectWriteFileError extends Schema.TaggedErrorClass<ProjectWriteFileError>()(
  "ProjectWriteFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
