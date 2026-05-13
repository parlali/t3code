import { useCallback, useMemo } from "react";

import { useSettings, useUpdateSettings } from "./hooks/useSettings";

export function useDismissedProviderUpdateNotificationKeys() {
  const dismissedKeys = useSettings((settings) => settings.dismissedProviderUpdateNotificationKeys);
  const { updateSettings } = useUpdateSettings();
  const dismissedKeySet = useMemo(() => new Set(dismissedKeys), [dismissedKeys]);

  const dismissNotificationKey = useCallback(
    (key: string) => {
      const trimmedKey = key.trim();
      if (trimmedKey.length === 0 || dismissedKeySet.has(trimmedKey)) {
        return;
      }
      updateSettings({
        dismissedProviderUpdateNotificationKeys: [...dismissedKeys, trimmedKey],
      });
    },
    [dismissedKeySet, dismissedKeys, updateSettings],
  );

  return {
    dismissedNotificationKeys: dismissedKeySet,
    dismissNotificationKey,
  };
}
