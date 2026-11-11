/** The tabs of the Ayarlar page; `?tab=` picks one */
export const SETTINGS_TABS = ["parameters", "notifications"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function parseSettingsTab(value: unknown): SettingsTab {
  return SETTINGS_TABS.find((tab) => tab === value) ?? "parameters";
}
