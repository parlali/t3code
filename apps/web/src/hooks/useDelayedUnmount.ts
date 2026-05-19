import { useEffect, useState } from "react";

export function useDelayedUnmount(visible: boolean, delayMs: number): boolean {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMounted(false);
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, visible]);

  return mounted;
}
