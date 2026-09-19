"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api-client";
import {
  applyPreset,
  deleteCustomPreset,
  loadPreferences,
  resetToDefaults,
  saveCustomPreset,
  type ProviderPreferences,
} from "./preference-engine";
import { writeToolPins } from "./workspace-tools";
import {
  BUILT_IN_TEMPLATES,
  adoptTemplate,
  deletePracticeTemplate,
  fetchPracticeTemplates,
  savePracticeTemplate,
  type PracticeTemplate,
  type PracticeTemplateState,
} from "./workspace-templates";

export interface UseWorkspacePreferencesControllerOptions {
  onNotify?: (message: string, holdMs?: number) => void;
}

export interface WorkspacePreferencesController {
  preferences: ProviderPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<ProviderPreferences>>;
  persistPreferences: (updated: ProviderPreferences) => void;
  practiceTemplates: PracticeTemplateState;
  customizerOpen: boolean;
  setCustomizerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleResetDefaults: () => void;
  handleApplyTemplate: (template: PracticeTemplate) => void;
  handleApplyFavorite: (id: string) => void;
  handleSaveFavorite: (name: string) => void;
  handleDeleteFavorite: (id: string) => void;
  handleSavePracticeDefault?: (name: string) => void;
  handleDeletePracticeDefault?: (id: string) => void;
}

/**
 * Manages provider preferences, durable persistence, preset switching,
 * practice-level templates, and associated tool pins synchronization.
 */
export function useWorkspacePreferencesController({
  onNotify,
}: UseWorkspacePreferencesControllerOptions = {}): WorkspacePreferencesController {
  const [preferences, setPreferences] = useState<ProviderPreferences>(() => loadPreferences());
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const [practiceTemplates, setPracticeTemplates] = useState<PracticeTemplateState>({
    templates: BUILT_IN_TEMPLATES,
    canEdit: false,
    membershipRole: "member",
    usingBuiltIns: true,
  });

  // Hydrate preferences from the authenticated session
  useEffect(() => {
    api.preferences
      .get()
      .then((remotePrefs) => {
        if (remotePrefs) setPreferences(remotePrefs);
      })
      .catch(() => {
        setPreferences(loadPreferences());
      });

    void fetchPracticeTemplates().then(setPracticeTemplates);
  }, []);

  /**
   * Applies a preference change and makes it durable.
   * Survives page reload by saving to server.
   */
  const persistPreferences = useCallback(
    (updated: ProviderPreferences) => {
      setPreferences(updated);
      api.preferences.save(updated).catch(() => {
        // The workspace still reflects the change; only durability was lost.
        onNotify?.("Layout change could not be saved and may not persist.", 3500);
      });
    },
    [onNotify],
  );

  const handleResetDefaults = useCallback(() => {
    const reset = resetToDefaults();
    persistPreferences(reset);
    writeToolPins({ left: reset.rails.left, right: reset.rails.right });
    onNotify?.("Reset layout to clean defaults", 2500);
  }, [persistPreferences, onNotify]);

  const handleApplyTemplate = useCallback(
    (template: PracticeTemplate) => {
      const next = adoptTemplate(template, preferences);
      persistPreferences(next);
      writeToolPins({ left: next.rails.left, right: next.rails.right });
      onNotify?.(`Switched to ${template.name}`, 2500);
    },
    [preferences, persistPreferences, onNotify],
  );

  const handleApplyFavorite = useCallback(
    (id: string) => {
      const next = applyPreset(id, preferences);
      persistPreferences(next);
      writeToolPins({ left: next.rails.left, right: next.rails.right });
      onNotify?.("Switched to your saved layout", 2500);
    },
    [preferences, persistPreferences, onNotify],
  );

  const handleSaveFavorite = useCallback(
    (name: string) => {
      const next = saveCustomPreset(name, preferences);
      persistPreferences(next);
      onNotify?.(`Saved "${name}" to your layouts`, 2500);
    },
    [preferences, persistPreferences, onNotify],
  );

  const handleDeleteFavorite = useCallback(
    (id: string) => {
      const next = deleteCustomPreset(id, preferences);
      persistPreferences(next);
      onNotify?.("Layout deleted", 2000);
    },
    [preferences, persistPreferences, onNotify],
  );

  const handleSavePracticeDefault = practiceTemplates.canEdit
    ? (name: string) => {
        void savePracticeTemplate({ name, preferences }).then(async (result) => {
          if (!result.ok) {
            onNotify?.(result.error ?? "Could not save that layout", 3000);
          } else {
            setPracticeTemplates(await fetchPracticeTemplates());
            onNotify?.(`"${name}" is now a practice default`, 3000);
          }
        });
      }
    : undefined;

  const handleDeletePracticeDefault = practiceTemplates.canEdit
    ? (id: string) => {
        void deletePracticeTemplate(id).then(async (result) => {
          if (!result.ok) {
            onNotify?.(result.error ?? "Could not delete that layout", 2500);
          } else {
            setPracticeTemplates(await fetchPracticeTemplates());
            onNotify?.("Practice default removed", 2500);
          }
        });
      }
    : undefined;

  return {
    preferences,
    setPreferences,
    persistPreferences,
    practiceTemplates,
    customizerOpen,
    setCustomizerOpen,
    handleResetDefaults,
    handleApplyTemplate,
    handleApplyFavorite,
    handleSaveFavorite,
    handleDeleteFavorite,
    handleSavePracticeDefault,
    handleDeletePracticeDefault,
  };
}
