"use client";

import { useState } from "react";

/**
 * The Calendar's "My Calendars" category checkboxes plus the header/sidebar
 * search box. Purely toggle state — filtering mechanics (what a toggle
 * excludes) live in calendar-view-model.ts, which consumes this.
 */
export function useCalendarFilters() {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showInPerson, setShowInPerson] = useState(true);
  const [showTelehealth, setShowTelehealth] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [showBreaks, setShowBreaks] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showWaiting, setShowWaiting] = useState(true);

  return {
    searchQuery,
    setSearchQuery,
    showInPerson,
    setShowInPerson,
    showTelehealth,
    setShowTelehealth,
    showMeetings,
    setShowMeetings,
    showBreaks,
    setShowBreaks,
    showCompleted,
    setShowCompleted,
    showWaiting,
    setShowWaiting,
  };
}

export type CalendarFilters = ReturnType<typeof useCalendarFilters>;
