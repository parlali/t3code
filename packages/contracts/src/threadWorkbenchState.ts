import { Schema } from "effect";
import { IsoDateTime, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { VcsFileDiffSource } from "./git.ts";

const THREAD_WORKBENCH_PATH_MAX_LENGTH = 512;

export const ThreadWorkbenchSelectionSource = Schema.Literals(["files", "changes"]);
export type ThreadWorkbenchSelectionSource = typeof ThreadWorkbenchSelectionSource.Type;

export const ThreadWorkbenchSelection = Schema.Struct({
  source: ThreadWorkbenchSelectionSource,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(THREAD_WORKBENCH_PATH_MAX_LENGTH)),
  changeSource: Schema.optional(VcsFileDiffSource),
});
export type ThreadWorkbenchSelection = typeof ThreadWorkbenchSelection.Type;

export const ThreadWorkbenchState = Schema.Struct({
  threadId: ThreadId,
  selection: Schema.NullOr(ThreadWorkbenchSelection),
  updatedAt: IsoDateTime,
});
export type ThreadWorkbenchState = typeof ThreadWorkbenchState.Type;

export const ThreadWorkbenchGetStateInput = Schema.Struct({
  threadId: ThreadId,
});
export type ThreadWorkbenchGetStateInput = typeof ThreadWorkbenchGetStateInput.Type;

export const ThreadWorkbenchSetStateInput = Schema.Struct({
  threadId: ThreadId,
  selection: Schema.NullOr(ThreadWorkbenchSelection),
});
export type ThreadWorkbenchSetStateInput = typeof ThreadWorkbenchSetStateInput.Type;

export class ThreadWorkbenchStateError extends Schema.TaggedErrorClass<ThreadWorkbenchStateError>()(
  "ThreadWorkbenchStateError",
  {
    operation: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `${this.operation}: ${this.detail}`;
  }
}
