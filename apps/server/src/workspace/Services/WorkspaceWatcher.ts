import { Context, Schema } from "effect";
import type { Stream } from "effect";

import type { ProjectEntriesStreamEvent, ProjectEntriesSubscribeInput } from "@t3tools/contracts";

export class WorkspaceWatcherError extends Schema.TaggedErrorClass<WorkspaceWatcherError>()(
  "WorkspaceWatcherError",
  {
    cwd: Schema.String,
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export interface WorkspaceWatcherShape {
  readonly streamEntries: (
    input: ProjectEntriesSubscribeInput,
  ) => Stream.Stream<ProjectEntriesStreamEvent, WorkspaceWatcherError>;
}

export class WorkspaceWatcher extends Context.Service<WorkspaceWatcher, WorkspaceWatcherShape>()(
  "t3/workspace/Services/WorkspaceWatcher",
) {}
