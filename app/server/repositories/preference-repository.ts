import { getDatabase } from "../db/connection";
import { type ProviderPreferences, defaultPreferences, mergeStoredPreferences } from "../../lib/preference-engine";

export class PreferenceConcurrencyError extends Error {
  readonly serverRevision: number;
  readonly serverPreferences: ProviderPreferences;

  constructor(serverRevision: number, serverPreferences: ProviderPreferences) {
    super(`Preference revision conflict: expected revision does not match current server revision ${serverRevision}`);
    this.name = "PreferenceConcurrencyError";
    this.serverRevision = serverRevision;
    this.serverPreferences = serverPreferences;
  }
}

export const PreferenceRepository = {
  getPreferences(providerId: string = "dr-carton"): ProviderPreferences {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM provider_preferences WHERE provider_id = ?").get(providerId) as any;

    if (!row || !row.config_json) {
      return defaultPreferences;
    }

    try {
      const parsed = JSON.parse(row.config_json);
      // Nested groups merge per-group, so a setting added after this row was written
      // arrives at its default instead of undefined.
      const revision = typeof row.revision === "number" ? row.revision : (typeof parsed.revision === "number" ? parsed.revision : 1);
      return {
        ...mergeStoredPreferences(parsed),
        revision,
        updatedAt: row.updated_at || parsed.updatedAt,
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

  savePreferences(
    prefs: ProviderPreferences,
    providerId: string = "dr-carton",
    expectedRevision?: number,
  ): ProviderPreferences {
    const db = getDatabase();
    const now = new Date().toISOString();

    const existingRow = db.prepare("SELECT * FROM provider_preferences WHERE provider_id = ?").get(providerId) as any;
    const currentServerRevision = existingRow
      ? (typeof existingRow.revision === "number" ? existingRow.revision : 1)
      : 1;

    if (expectedRevision !== undefined && expectedRevision !== currentServerRevision) {
      const currentPrefs = PreferenceRepository.getPreferences(providerId);
      throw new PreferenceConcurrencyError(currentServerRevision, currentPrefs);
    }

    const nextRevision = currentServerRevision + 1;

    const preferencesToSave: ProviderPreferences = {
      ...prefs,
      revision: nextRevision,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO provider_preferences (
        provider_id, active_preset_id, density, header_density,
        show_companion_rail, show_sidebar, config_json, revision, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        active_preset_id = excluded.active_preset_id,
        density = excluded.density,
        header_density = excluded.header_density,
        show_companion_rail = excluded.show_companion_rail,
        show_sidebar = excluded.show_sidebar,
        config_json = excluded.config_json,
        revision = excluded.revision,
        updated_at = excluded.updated_at
    `).run(
      providerId,
      preferencesToSave.activePresetId,
      preferencesToSave.density,
      preferencesToSave.headerDensity,
      preferencesToSave.showCompanionRail ? 1 : 0,
      preferencesToSave.showSidebar ? 1 : 0,
      JSON.stringify(preferencesToSave),
      nextRevision,
      now,
    );

    return preferencesToSave;
  },
};

