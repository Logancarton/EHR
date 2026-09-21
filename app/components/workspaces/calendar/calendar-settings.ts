"use client";

import { useEffect, useState } from "react";
import { CALENDAR_BASE_SLOT_HEIGHT, CALENDAR_EVENT_CARD_HEIGHT } from "../../../lib/calendar-grid-layout";

export type CalendarDensity = "compact" | "standard" | "spacious";
export type CalendarHourPreset = "full-day" | "clinic" | "work" | "custom";

export interface CalendarViewSettings {
  density: CalendarDensity;
  slotHeight: number;
  eventCardHeight: number;
  hourPreset: CalendarHourPreset;
  startHour: number; // 0..23
  endHour: number;   // 1..24
}

const STORAGE_KEY = "clinical-bond:calendar-view-settings";

export const DENSITY_CONFIG: Record<
  CalendarDensity,
  { slotHeight: number; cardHeight: number; label: string; description: string }
> = {
  compact: {
    slotHeight: 14,
    cardHeight: 28,
    label: "Compact (Thin)",
    description: "Thinner rows to view the entire day without scrolling",
  },
  standard: {
    slotHeight: CALENDAR_BASE_SLOT_HEIGHT, // 24
    cardHeight: CALENDAR_EVENT_CARD_HEIGHT, // 44
    label: "Standard",
    description: "Comfortable default scale (96px/hour)",
  },
  spacious: {
    slotHeight: 32,
    cardHeight: 56,
    label: "Spacious (Tall)",
    description: "Lengthened rows with extra breathing room",
  },
};

export const HOUR_PRESETS: Record<
  CalendarHourPreset,
  { startHour: number; endHour: number; label: string; description: string }
> = {
  "full-day": {
    startHour: 0,
    endHour: 24,
    label: "Full Day (24 hrs)",
    description: "Round-the-clock view from 12 AM to 12 AM",
  },
  clinic: {
    startHour: 7,
    endHour: 20,
    label: "Clinic Hours",
    description: "Standard clinic hours (7:00 AM – 8:00 PM)",
  },
  work: {
    startHour: 8,
    endHour: 18,
    label: "Core Work Hours",
    description: "Focused business day (8:00 AM – 6:00 PM)",
  },
  custom: {
    startHour: 7,
    endHour: 20,
    label: "Custom",
    description: "Choose your own start and end hours",
  },
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarViewSettings = {
  density: "standard",
  slotHeight: CALENDAR_BASE_SLOT_HEIGHT,
  eventCardHeight: CALENDAR_EVENT_CARD_HEIGHT,
  hourPreset: "clinic",
  startHour: 7,
  endHour: 20,
};

export function formatHourLabel(hour24: number): string {
  const normalized = hour24 % 24;
  if (normalized === 0) return "12 AM";
  if (normalized === 12) return "12 PM";
  if (normalized < 12) return `${normalized} AM`;
  return `${normalized - 12} PM`;
}

function deriveCardHeight(slotHeight: number): number {
  if (slotHeight <= 16) return Math.max(26, slotHeight * 2);
  if (slotHeight >= 28) return Math.min(60, slotHeight * 2 - 4);
  return CALENDAR_EVENT_CARD_HEIGHT;
}

function deriveDensity(slotHeight: number): CalendarDensity {
  if (slotHeight <= 16) return "compact";
  if (slotHeight >= 28) return "spacious";
  return "standard";
}

function loadSavedSettings(): CalendarViewSettings {
  if (typeof window === "undefined") return DEFAULT_CALENDAR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CALENDAR_SETTINGS;
    const parsed = JSON.parse(raw);
    const startHour = typeof parsed.startHour === "number" && parsed.startHour >= 0 && parsed.startHour < 24
      ? parsed.startHour
      : DEFAULT_CALENDAR_SETTINGS.startHour;
    const endHour = typeof parsed.endHour === "number" && parsed.endHour > startHour && parsed.endHour <= 24
      ? parsed.endHour
      : DEFAULT_CALENDAR_SETTINGS.endHour;
    const slotHeight = typeof parsed.slotHeight === "number" && parsed.slotHeight >= 10 && parsed.slotHeight <= 48
      ? parsed.slotHeight
      : DEFAULT_CALENDAR_SETTINGS.slotHeight;
    const density = deriveDensity(slotHeight);
    const eventCardHeight = deriveCardHeight(slotHeight);
    const hourPreset = (["full-day", "clinic", "work", "custom"].includes(parsed.hourPreset)
      ? parsed.hourPreset
      : "custom") as CalendarHourPreset;

    return {
      density,
      slotHeight,
      eventCardHeight,
      hourPreset,
      startHour,
      endHour,
    };
  } catch {
    return DEFAULT_CALENDAR_SETTINGS;
  }
}

export function useCalendarSettings() {
  const [settings, setSettings] = useState<CalendarViewSettings>(loadSavedSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage write errors
    }
  }, [settings]);

  const setDensity = (density: CalendarDensity) => {
    const config = DENSITY_CONFIG[density];
    setSettings((prev) => ({
      ...prev,
      density,
      slotHeight: config.slotHeight,
      eventCardHeight: config.cardHeight,
    }));
  };

  const setSlotHeight = (height: number) => {
    const clamped = Math.max(12, Math.min(36, Math.round(height)));
    setSettings((prev) => ({
      ...prev,
      slotHeight: clamped,
      density: deriveDensity(clamped),
      eventCardHeight: deriveCardHeight(clamped),
    }));
  };

  const setHourPreset = (preset: CalendarHourPreset) => {
    if (preset === "custom") {
      setSettings((prev) => ({ ...prev, hourPreset: "custom" }));
      return;
    }
    const { startHour, endHour } = HOUR_PRESETS[preset];
    setSettings((prev) => ({
      ...prev,
      hourPreset: preset,
      startHour,
      endHour,
    }));
  };

  const setHoursRange = (startHour: number, endHour: number) => {
    const validStart = Math.max(0, Math.min(23, startHour));
    const validEnd = Math.max(validStart + 1, Math.min(24, endHour));
    setSettings((prev) => ({
      ...prev,
      hourPreset: "custom",
      startHour: validStart,
      endHour: validEnd,
    }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_CALENDAR_SETTINGS);
  };

  return {
    settings,
    setDensity,
    setSlotHeight,
    setHourPreset,
    setHoursRange,
    resetSettings,
  };
}

export type CalendarSettingsHook = ReturnType<typeof useCalendarSettings>;
