import { useCallback } from "react";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

export function IntegrationsSettings() {
  const chromeDevToolsEnabled = useSettings(
    (settings) => settings.integrations.chromeDevToolsMcp.enabled,
  );
  const { updateSettings } = useUpdateSettings();
  const updateChromeDevToolsEnabled = useCallback(
    (enabled: boolean) => {
      updateSettings({
        integrations: {
          chromeDevToolsMcp: {
            enabled,
          },
        },
      });
    },
    [updateSettings],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Integrations">
        <SettingsRow
          title="Chrome DevTools MCP"
          description="Runs managed headless Chrome on the backend for new Codex, Claude, and Cursor sessions."
          status={chromeDevToolsEnabled ? "Enabled for new agent sessions" : "Disabled"}
          control={
            <Switch
              checked={chromeDevToolsEnabled}
              aria-label="Enable Chrome DevTools MCP"
              onCheckedChange={(checked) => updateChromeDevToolsEnabled(Boolean(checked))}
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
