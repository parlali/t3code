import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FilePlusIcon,
  FolderPlusIcon,
  XIcon,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "../../lib/utils";
import { WorkbenchTreeIcon } from "./WorkbenchTreeIcon";

export type CreateEntryKind = "file" | "directory";

export interface ExplorerCreateDraft {
  readonly kind: CreateEntryKind;
  readonly parentPath: string | null;
  readonly error: string | null;
  readonly isSaving: boolean;
}

export interface TreeNode {
  readonly path: string;
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly children: TreeNode[];
}

interface ExplorerTreeProps {
  readonly nodes: readonly TreeNode[];
  readonly expanded: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly onToggle: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly createDraft?: ExplorerCreateDraft | null;
  readonly onStartCreate?: ((kind: CreateEntryKind, parentPath: string | null) => void) | undefined;
  readonly onSubmitCreate?: ((draft: ExplorerCreateDraft, name: string) => void) | undefined;
  readonly onCancelCreate?: (() => void) | undefined;
}

function CreateEntryRow(props: {
  readonly depth: number;
  readonly draft: ExplorerCreateDraft;
  readonly onSubmit: (draft: ExplorerCreateDraft, name: string) => void;
  readonly onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const Icon = props.draft.kind === "directory" ? FolderPlusIcon : FilePlusIcon;
  const error = props.draft.error ?? localError;
  const label = props.draft.kind === "directory" ? "folder" : "file";

  useEffect(() => {
    setValue("");
    setLocalError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [props.draft.kind, props.draft.parentPath]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = value.trim();
    if (name.length === 0) {
      setLocalError(`Enter a ${label} name.`);
      return;
    }
    setLocalError(null);
    props.onSubmit(props.draft, name);
  };

  return (
    <form className="px-1 py-0.5" style={{ paddingLeft: 8 + props.depth * 14 }} onSubmit={submit}>
      <div
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-sm border border-border bg-background px-1.5 text-xs text-foreground shadow-xs",
          error && "border-destructive/60",
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          value={value}
          disabled={props.draft.isSaving}
          placeholder={props.draft.kind === "directory" ? "folder-name" : "file-name"}
          aria-label={`New ${label} name`}
          onChange={(event) => {
            setValue(event.target.value);
            setLocalError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onCancel();
            }
          }}
        />
        <button
          type="submit"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={props.draft.isSaving}
          aria-label={`Create ${label}`}
          title={`Create ${label}`}
        >
          <CheckIcon className="size-3.5" />
        </button>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={props.draft.isSaving}
          aria-label="Cancel create"
          title="Cancel"
          onClick={props.onCancel}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {error && <div className="mt-1 px-1 text-[11px] text-destructive">{error}</div>}
    </form>
  );
}

export const ExplorerTree = memo(function ExplorerTree(props: ExplorerTreeProps) {
  const renderCreateRow = (parentPath: string | null, depth: number) => {
    if (!props.createDraft || props.createDraft.parentPath !== parentPath) return null;
    if (!props.onSubmitCreate || !props.onCancelCreate) return null;
    return (
      <CreateEntryRow
        key={`create:${parentPath ?? "root"}`}
        depth={depth}
        draft={props.createDraft}
        onSubmit={props.onSubmitCreate}
        onCancel={props.onCancelCreate}
      />
    );
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const expanded = props.expanded.has(node.path);
    return (
      <div key={node.path}>
        <div
          className={cn(
            "group flex h-7 w-full items-center rounded-sm text-xs text-muted-foreground hover:bg-accent/70 hover:text-foreground",
            props.selectedPath === node.path && "bg-accent text-foreground",
          )}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2 text-left outline-none"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() =>
              node.kind === "directory" ? props.onToggle(node.path) : props.onOpenFile(node.path)
            }
            title={node.path}
          >
            {node.kind === "directory" ? (
              expanded ? (
                <ChevronDownIcon className="size-3 shrink-0" />
              ) : (
                <ChevronRightIcon className="size-3 shrink-0" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <WorkbenchTreeIcon kind={node.kind} expanded={expanded} className="size-3.5" />
            <span className="min-w-0 truncate">{node.name}</span>
          </button>
          {node.kind === "directory" && props.onStartCreate && (
            <div className="mr-1 hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`New file in ${node.path}`}
                title="New file"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onStartCreate?.("file", node.path);
                }}
              >
                <FilePlusIcon className="size-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`New folder in ${node.path}`}
                title="New folder"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onStartCreate?.("directory", node.path);
                }}
              >
                <FolderPlusIcon className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        {node.kind === "directory" && expanded
          ? [
              renderCreateRow(node.path, depth + 1),
              ...node.children.map((child) => renderNode(child, depth + 1)),
            ]
          : null}
      </div>
    );
  };

  return (
    <>
      {renderCreateRow(null, 0)}
      {props.nodes.map((node) => renderNode(node, 0))}
    </>
  );
});
