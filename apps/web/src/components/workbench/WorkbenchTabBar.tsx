import { FileCodeIcon, SplitSquareHorizontalIcon, XIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "../../lib/utils";

export type WorkbenchTab =
  | { readonly id: string; readonly kind: "file"; readonly path: string }
  | {
      readonly id: string;
      readonly kind: "diff";
      readonly path: string;
      readonly source: "working-tree" | "staged";
    };

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

interface WorkbenchTabBarProps {
  readonly tabs: readonly WorkbenchTab[];
  readonly activeTabId: string | null;
  readonly dirtyTabs: ReadonlySet<string>;
  readonly onSelectTab: (tabId: string) => void;
  readonly onCloseTab: (tabId: string) => void;
}

export const WorkbenchTabBar = memo(function WorkbenchTabBar({
  tabs,
  activeTabId,
  dirtyTabs,
  onSelectTab,
  onCloseTab,
}: WorkbenchTabBarProps) {
  if (tabs.length === 0) {
    return (
      <div className="flex h-full items-center gap-2 px-3 text-sm text-muted-foreground">
        <FileCodeIcon className="size-3.5" />
        Select a file to begin.
      </div>
    );
  }

  return (
    <>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "flex h-12 max-w-64 shrink-0 items-center gap-2 border-r border-border px-3 text-xs text-muted-foreground",
            tab.id === activeTabId && "bg-background text-foreground",
          )}
          title={tab.path}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.kind === "diff" ? (
              <SplitSquareHorizontalIcon className="size-3.5 shrink-0" />
            ) : (
              <FileCodeIcon className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate">
              {basename(tab.path)}
              {dirtyTabs.has(tab.id) ? " *" : ""}
            </span>
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-sm p-0.5 hover:bg-accent"
            aria-label={`Close ${basename(tab.path)}`}
            onClick={() => onCloseTab(tab.id)}
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </>
  );
});
