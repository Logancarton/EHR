"use client";

import { type ProviderPreferences, builtInPresets } from "./preference-engine";

/**
 * Client access to the practice's shared layouts.
 *
 * A practice that has not defined any falls back to the built-in presets, so
 * the defaults list is never empty on a fresh install. Once an owner saves one,
 * theirs replace the shipped set — the practice's own arrangements are always a
 * better answer than mine.
 */

export type PracticeTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  appliesToRole: string;
  sortOrder: number;
  config: Partial<ProviderPreferences>;
  /** True for the shipped fallbacks, which have no server row behind them. */
  builtIn?: boolean;
};

export type PracticeTemplateState = {
  templates: PracticeTemplate[];
  canEdit: boolean;
  membershipRole: string;
  usingBuiltIns: boolean;
};

export const BUILT_IN_TEMPLATES: PracticeTemplate[] = Object.values(builtInPresets).map(
  (preset, index) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    icon: preset.icon,
    appliesToRole: "",
    sortOrder: index,
    config: preset.config,
    builtIn: true,
  }),
);

const FALLBACK: PracticeTemplateState = {
  templates: BUILT_IN_TEMPLATES,
  canEdit: false,
  membershipRole: "member",
  usingBuiltIns: true,
};

export async function fetchPracticeTemplates(): Promise<PracticeTemplateState> {
  try {
    const response = await fetch("/api/organization/workspace-templates");
    if (!response.ok) return FALLBACK;
    const body = await response.json();
    const templates: PracticeTemplate[] = Array.isArray(body?.templates) ? body.templates : [];
    return {
      templates: templates.length ? templates : BUILT_IN_TEMPLATES,
      canEdit: Boolean(body?.canEdit),
      membershipRole: typeof body?.membershipRole === "string" ? body.membershipRole : "member",
      usingBuiltIns: templates.length === 0,
    };
  } catch {
    // An unreachable server should still leave a clinician a set of defaults.
    return FALLBACK;
  }
}

export async function savePracticeTemplate(input: {
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  appliesToRole?: string;
  sortOrder?: number;
  preferences: ProviderPreferences;
}): Promise<{ ok: boolean; error?: string }> {
  // The template carries the layout only. `customPresets` is the clinician's own
  // saved list and must never travel into something the whole practice reads.
  const { customPresets: _personal, activePresetId: _active, ...config } = input.preferences;

  try {
    const response = await fetch("/api/organization/workspace-templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        name: input.name,
        description: input.description ?? "",
        icon: input.icon ?? "dashboard",
        appliesToRole: input.appliesToRole ?? "",
        sortOrder: input.sortOrder ?? 0,
        config,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: body?.error ?? "Could not save that layout." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

export async function deletePracticeTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `/api/organization/workspace-templates?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: body?.error ?? "Could not delete that layout." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

/**
 * Adopting a template copies its layout into the clinician's own preferences.
 * Nothing links back to the template afterwards, so an owner editing it later
 * never rearranges a screen someone is in the middle of using.
 */
export function adoptTemplate(
  template: PracticeTemplate,
  current: ProviderPreferences,
): ProviderPreferences {
  const config = template.config;
  return {
    ...current,
    activePresetId: template.id,
    density: config.density ?? current.density,
    headerDensity: config.headerDensity ?? current.headerDensity,
    showCompanionRail: config.showCompanionRail ?? current.showCompanionRail,
    showSidebar: config.showSidebar ?? current.showSidebar,
    rails: { ...current.rails, ...(config.rails ?? {}) },
    today: { ...current.today, ...(config.today ?? {}) },
    overview: { ...current.overview, ...(config.overview ?? {}) },
    encounter: { ...current.encounter, ...(config.encounter ?? {}) },
    customPresets: current.customPresets,
  };
}
