"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { Patient, Section } from "../domain/patient";
import { resolveSectionFromCommand } from "../domain/patient";
import { resolveRosterPatientFromCommand } from "./patient-roster";
import {
  executeClinicalQuery,
  type ClinicalQueryAnswer,
} from "../domain/clinical-query";
import {
  parseAiPreferenceCommand,
  type ProviderPreferences,
} from "./preference-engine";
import { parseScheduleJumpQuery } from "./schedule-data";
import type { CompanionToolId } from "./use-companion-rail-controller";

export type OmniboxFilterId = "all" | "actions" | "patients" | "ai" | "apps";

export const OMNIBOX_FILTERS: readonly {
  id: OmniboxFilterId;
  label: string;
  icon: string;
}[] = [
  { id: "all", label: "All", icon: "search" },
  { id: "actions", label: "Actions", icon: "bolt" },
  { id: "patients", label: "Patients", icon: "people" },
  { id: "ai", label: "AI queries", icon: "auto_awesome" },
  { id: "apps", label: "Apps", icon: "apps" },
] as const;

export interface UseOmniboxControllerOptions {
  roster: readonly Patient[];
  activePatient: Patient | null | undefined;
  preferences: ProviderPreferences;
  onPersistPreferences: (updated: ProviderPreferences) => void;
  onJumpCalendarDate: (targetDate: string, daysLater?: number) => void;
  onSplitScreenPatient: (targetId: string) => void;
  onOpenComposer: (
    patientId: string,
    tab: "cart" | "prescribe" | "labs",
    prefill?: string,
  ) => void;
  onDraftLabOrder: (patientId: string, labName: string) => void;
  onOpenPatient: (id: string, targetSection?: Section) => void;
  onSetSection: (section: Section) => void;
  onToggleCompanionPanel: (id: CompanionToolId) => void;
  activeCompanionPanel: CompanionToolId | null;
  onSetGlobalAiPrompt: (prompt: string) => void;
  onNotify?: (message: string, holdMs?: number) => void;
  commandInputRef?: RefObject<HTMLInputElement | null>;
}

export interface OmniboxController {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  searchFocused: boolean;
  setSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  omniboxFilter: OmniboxFilterId;
  setOmniboxFilter: React.Dispatch<React.SetStateAction<OmniboxFilterId>>;
  normalizedQuery: string;
  commandPatient: Patient | undefined;
  commandSection: Section | undefined;
  filteredPatients: Patient[];
  queryClinicalAnswer: ClinicalQueryAnswer | null;
  commandLabel: string;
  dismissOmnibox: () => void;
  runAiCommand: (rawCommand: string) => void;
}

/**
 * Controller for the application omnibox, query resolution, shortcuts, and AI command execution.
 */
export function useOmniboxController({
  roster,
  activePatient,
  preferences,
  onPersistPreferences,
  onJumpCalendarDate,
  onSplitScreenPatient,
  onOpenComposer,
  onDraftLabOrder,
  onOpenPatient,
  onSetSection,
  onToggleCompanionPanel,
  activeCompanionPanel,
  onSetGlobalAiPrompt,
  onNotify,
  commandInputRef,
}: UseOmniboxControllerOptions): OmniboxController {
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [omniboxFilter, setOmniboxFilter] = useState<OmniboxFilterId>("all");

  const normalizedQuery = query.trim().toLowerCase();
  const commandPatient = useMemo(
    () => resolveRosterPatientFromCommand(query, roster),
    [query, roster],
  );
  const commandSection = useMemo(() => resolveSectionFromCommand(query), [query]);

  const filteredPatients = useMemo(() => {
    if (!normalizedQuery) return [];
    return roster.filter((patient) => {
      const searchable = `${patient.name} ${patient.mrn} ${patient.dob}`.toLowerCase();
      const nameParts = patient.name.toLowerCase().split(" ");
      return (
        searchable.includes(normalizedQuery) ||
        nameParts.some((part) => part.length > 2 && normalizedQuery.includes(part))
      );
    });
  }, [normalizedQuery, roster]);

  const queryClinicalAnswer = useMemo<ClinicalQueryAnswer | null>(() => {
    return executeClinicalQuery(query, activePatient, preferences, roster);
  }, [query, activePatient, preferences, roster]);

  const dismissOmnibox = useCallback(() => {
    setSearchFocused(false);
    commandInputRef?.current?.blur();
  }, [commandInputRef]);

  // Global Ctrl/Cmd + K shortcut
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        commandInputRef?.current?.focus();
        setSearchFocused(true);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [commandInputRef]);

  const runAiCommand = useCallback(
    (rawCommand: string) => {
      const command = rawCommand.trim();
      if (!command) return;

      // Check for calendar / schedule jump command (e.g. "pull up 28 days later", "56 days later", "84 days later", "in 28 days")
      const scheduleJump = parseScheduleJumpQuery(command);
      if (scheduleJump) {
        onJumpCalendarDate(scheduleJump.targetDate, scheduleJump.days);
        setQuery("");
        setSearchFocused(false);
        return;
      }

      if (queryClinicalAnswer?.scheduleDate) {
        onJumpCalendarDate(
          queryClinicalAnswer.scheduleDate,
          queryClinicalAnswer.scheduleDaysLater,
        );
        setQuery("");
        setSearchFocused(false);
        return;
      }

      // Check for layout & preference commands
      const aiPref = parseAiPreferenceCommand(command, preferences);
      if (aiPref.recognized && aiPref.updatedPreferences) {
        onPersistPreferences(aiPref.updatedPreferences);
        onNotify?.(aiPref.feedback, 3500);
        setQuery("");
        setSearchFocused(false);
        return;
      }

      if (queryClinicalAnswer?.isSplitScreen) {
        onSplitScreenPatient(queryClinicalAnswer.patientId);
        onNotify?.(
          `Split screen opened with ${queryClinicalAnswer.patientName}`,
          3000,
        );
        setQuery("");
        setSearchFocused(false);
        return;
      }

      if (queryClinicalAnswer?.orderType === "prescribe") {
        onOpenComposer(
          queryClinicalAnswer.patientId,
          "prescribe",
          queryClinicalAnswer.prefillDrug,
        );
        setQuery("");
        setSearchFocused(false);
        return;
      }

      if (queryClinicalAnswer?.labOrderName) {
        onDraftLabOrder(
          queryClinicalAnswer.patientId,
          queryClinicalAnswer.labOrderName,
        );
        setQuery("");
        setSearchFocused(false);
        return;
      }

      if (queryClinicalAnswer?.actionSection) {
        onOpenPatient(
          queryClinicalAnswer.patientId,
          queryClinicalAnswer.actionSection,
        );
        return;
      }

      const targetPatient = resolveRosterPatientFromCommand(command, roster);
      const targetSection = resolveSectionFromCommand(command);

      if (targetPatient) {
        onOpenPatient(targetPatient.id, targetSection ?? "Overview");
        return;
      }

      if (targetSection) {
        onSetSection(targetSection);
        setQuery("");
        setSearchFocused(false);
        return;
      }

      onSetGlobalAiPrompt(command);
      if (activeCompanionPanel !== "ai") onToggleCompanionPanel("ai");
      setQuery("");
      setSearchFocused(false);
    },
    [
      queryClinicalAnswer,
      preferences,
      onJumpCalendarDate,
      onPersistPreferences,
      onSplitScreenPatient,
      onOpenComposer,
      onDraftLabOrder,
      onOpenPatient,
      onSetSection,
      onSetGlobalAiPrompt,
      activeCompanionPanel,
      onToggleCompanionPanel,
      roster,
      onNotify,
    ],
  );

  const commandLabel = commandPatient
    ? `Open ${commandPatient.name}${commandSection ? ` · ${commandSection}` : ""}`
    : commandSection && activePatient
      ? `Open ${activePatient.name} · ${commandSection}`
      : query.trim()
        ? `Ask Clinical AI: “${query.trim()}”`
        : "";

  return {
    query,
    setQuery,
    searchFocused,
    setSearchFocused,
    omniboxFilter,
    setOmniboxFilter,
    normalizedQuery,
    commandPatient,
    commandSection,
    filteredPatients,
    queryClinicalAnswer,
    commandLabel,
    dismissOmnibox,
    runAiCommand,
  };
}
