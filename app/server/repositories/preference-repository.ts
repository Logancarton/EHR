import { getDatabase } from "../db/connection";
import { type ProviderPreferences, defaultPreferences } from "../../lib/preference-engine";

export const PreferenceRepository = {
  getPreferences(providerId: string = "dr-carton"): ProviderPreferences {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM provider_preferences WHERE provider_id = ?").get(providerId) as any;

    if (!row || !row.config_json) {
      return defaultPreferences;
    }

    try {
      const parsed = JSON.parse(row.config_json);
      return {
        ...defaultPreferences,
        ...parsed,
        activePresetId: row.active_preset_id || parsed.activePresetId || defaultPreferences.activePresetId,
        density: row.density || parsed.density || defaultPreferences.density,
        headerDensity: row.header_density || parsed.headerDensity || defaultPreferences.headerDensity,
        showCompanionRail: Boolean(row.show_companion_rail),
        showSidebar: Boolean(row.show_sidebar),
      };
    } catch {
      return defaultPreferences;
    }
  },

  savePreferences(prefs: ProviderPreferences, providerId: string = "dr-carton"): ProviderPreferences {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO provider_preferences (
        provider_id, active_preset_id, density, header_density,
        show_companion_rail, show_sidebar, config_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        active_preset_id = excluded.active_preset_id,
        density = excluded.density,
        header_density = excluded.header_density,
        show_companion_rail = excluded.show_companion_rail,
        show_sidebar = excluded.show_sidebar,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `).run(
      providerId,
      prefs.activePresetId,
      prefs.density,
      prefs.headerDensity,
      prefs.showCompanionRail ? 1 : 0,
      prefs.showSidebar ? 1 : 0,
      JSON.stringify(prefs),
      now
    );

    return prefs;
  },
};
