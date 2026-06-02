import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";
import { createPortal } from "react-dom";

/**
 * Single source of truth for the workspace context controls that live on the
 * unified top bar (`ShellTopBar`). The right panel and its workbench are deep
 * in the tree, so instead of duplicating a header row under the top bar they
 * teleport their toolbars into one shared slot on the top bar via a portal.
 *
 * - `ShellTopBar` registers the slot element with `useShellHeaderSlotTarget`.
 * - Producers (workbench breadcrumb/controls, nested panel title/actions, the
 *   nested-sidebar toggle) render through `ShellHeaderSlotPortal`, ordering
 *   themselves with the `order` prop so mount order does not matter.
 */
interface ShellHeaderSlotContextValue {
  readonly slot: HTMLElement | null;
  readonly setSlot: (element: HTMLElement | null) => void;
}

const ShellHeaderSlotContext = createContext<ShellHeaderSlotContextValue | null>(null);

export function ShellHeaderSlotProvider({ children }: { readonly children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return <ShellHeaderSlotContext value={value}>{children}</ShellHeaderSlotContext>;
}

export function useShellHeaderSlotTarget(): RefCallback<HTMLElement> {
  const context = use(ShellHeaderSlotContext);
  return useCallback(
    (element: HTMLElement | null) => {
      context?.setSlot(element);
    },
    [context],
  );
}

export function ShellHeaderSlotPortal({
  order = 0,
  children,
}: {
  readonly order?: number;
  readonly children: ReactNode;
}) {
  const context = use(ShellHeaderSlotContext);
  if (!context?.slot) return null;
  return createPortal(
    <div className="flex min-w-0 items-center gap-1" style={{ order }}>
      {children}
    </div>,
    context.slot,
  );
}
