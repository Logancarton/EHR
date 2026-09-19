"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatToIsoDate,
  offsetDays,
  formatTargetDateDisplay,
  parseDateString,
  stepDate,
} from "../../../lib/schedule-data";
import {
  WORKSPACE_CALENDAR_JUMP_DATE_EVENT,
  subscribeWorkspaceEvent,
} from "../../../lib/workspace-events";
import { practiceMinutesNow, practiceToday } from "../../../lib/practice-calendar";
import type { CalendarViewType } from "./calendar-types";

export type CalendarJumpBase = "today" | "current";

/**
 * The Calendar's date/navigation state: current date, view mode, the mini
 * calendar, the clinical interval jump bar, and the practice clock. Owns
 * nothing about schedule data, filters, or the event editor.
 */
export function useCalendarNavigation(showToast: (message: string) => void) {
  const todayStr = practiceToday();
  const [currentDate, setCurrentDate] = useState<string>(todayStr);
  const [practiceNowMinutes, setPracticeNowMinutes] = useState(() => practiceMinutesNow());
  const [viewMode, setViewMode] = useState<CalendarViewType>("week");
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(() => parseDateString(todayStr));
  const [toolbarDaysInput, setToolbarDaysInput] = useState<string>("");
  const [jumpBaseDate, setJumpBaseDate] = useState<CalendarJumpBase>("today");

  useEffect(() => {
    const timer = window.setInterval(() => setPracticeNowMinutes(practiceMinutesNow()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Sync mini calendar when currentDate changes drastically
  useEffect(() => {
    const cur = parseDateString(currentDate);
    if (cur.getMonth() !== miniCalMonth.getMonth() || cur.getFullYear() !== miniCalMonth.getFullYear()) {
      setMiniCalMonth(new Date(cur.getFullYear(), cur.getMonth(), 1));
    }
  }, [currentDate]);

  const parsedToolbarDays = parseInt(toolbarDaysInput, 10);
  const toolbarDaysAreValid = Number.isInteger(parsedToolbarDays) && parsedToolbarDays >= 1 && parsedToolbarDays <= 730;
  const liveTypedPreview = useMemo(() => {
    if (!toolbarDaysAreValid) return null;
    const base = jumpBaseDate === "today" ? todayStr : currentDate;
    const target = offsetDays(base, parsedToolbarDays);
    const display = formatTargetDateDisplay(target);
    const weeks = Math.round((parsedToolbarDays / 7) * 10) / 10;
    const weeksHint = weeks === Math.floor(weeks) ? `${weeks}w` : `${weeks.toFixed(1)}w`;
    return { target, display, weeksHint };
  }, [parsedToolbarDays, toolbarDaysAreValid, jumpBaseDate, todayStr, currentDate]);

  function handleJumpDays(days: number, fromBase: CalendarJumpBase = jumpBaseDate) {
    if (!Number.isInteger(days) || days < 1 || days > 730) {
      showToast("Choose an interval from 1 to 730 days.");
      return;
    }
    const base = fromBase === "today" ? todayStr : currentDate;
    const target = offsetDays(base, days);
    setCurrentDate(target);
    const [y, m] = target.split("-").map(Number);
    setMiniCalMonth(new Date(y, m - 1, 1));
    const formatted = formatTargetDateDisplay(target);
    const baseLabel = fromBase === "today" ? "from today" : "from current view";
    showToast(`Jumped calendar to ${formatted} (${days} days ${baseLabel})`);
  }

  // Listen for calendar jump events (omnibox, companion panel, or external triggers)
  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_CALENDAR_JUMP_DATE_EVENT, (detail) => {
      if (detail?.date) {
        const target = detail.date;
        const parsedTarget = /^\d{4}-\d{2}-\d{2}$/.test(target) ? parseDateString(target) : null;
        const isValidTarget =
          parsedTarget !== null &&
          Number.isFinite(parsedTarget.getTime()) &&
          formatToIsoDate(parsedTarget) === target;
        if (!isValidTarget) {
          showToast("Calendar jump ignored because the target date was invalid.");
          return;
        }
        setCurrentDate(target);
        const [y, m] = target.split("-").map(Number);
        setMiniCalMonth(new Date(y, m - 1, 1));
        const formatted = formatTargetDateDisplay(target);
        const daysLater = detail.daysLater;
        const daysText =
          Number.isInteger(daysLater) && daysLater! >= 1 && daysLater! <= 730
            ? ` (${daysLater} days later)`
            : "";
        showToast(`Jumped calendar to ${formatted}${daysText}`);
      }
    });
  }, [showToast]);

  // Step period: prev/next
  function handleStep(direction: "prev" | "next") {
    if (viewMode === "day") {
      setCurrentDate(stepDate(currentDate, direction));
    } else if (viewMode === "week") {
      const d = parseDateString(currentDate);
      d.setDate(d.getDate() + (direction === "next" ? 7 : -7));
      setCurrentDate(formatToIsoDate(d));
    } else if (viewMode === "month") {
      const d = parseDateString(currentDate);
      d.setMonth(d.getMonth() + (direction === "next" ? 1 : -1));
      setCurrentDate(formatToIsoDate(d));
    }
  }

  function resetToToday() {
    setCurrentDate(todayStr);
    const [y, m] = todayStr.split("-").map(Number);
    setMiniCalMonth(new Date(y, m - 1, 1));
    setToolbarDaysInput("");
    showToast("Calendar reset to today");
  }

  // Mini Calendar grid
  const miniGridCells = useMemo(() => {
    const year = miniCalMonth.getFullYear();
    const month = miniCalMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday

    const cells: { dateStr: string; dayNum: number; inMonth: boolean }[] = [];

    // Preceding days
    for (let i = startDayOfWeek; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      cells.push({ dateStr: formatToIsoDate(d), dayNum: d.getDate(), inMonth: false });
    }
    // Days in month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, month, day);
      cells.push({ dateStr: formatToIsoDate(d), dayNum: day, inMonth: true });
    }
    // Trailing days to fill 35 or 42 grid
    const total = cells.length > 35 ? 42 : 35;
    const remaining = total - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      cells.push({ dateStr: formatToIsoDate(d), dayNum: d.getDate(), inMonth: false });
    }

    return cells;
  }, [miniCalMonth]);

  return {
    todayStr,
    currentDate,
    setCurrentDate,
    practiceNowMinutes,
    viewMode,
    setViewMode,
    miniCalMonth,
    setMiniCalMonth,
    toolbarDaysInput,
    setToolbarDaysInput,
    jumpBaseDate,
    setJumpBaseDate,
    parsedToolbarDays,
    toolbarDaysAreValid,
    liveTypedPreview,
    handleJumpDays,
    handleStep,
    resetToToday,
    miniGridCells,
  };
}

export type CalendarNavigation = ReturnType<typeof useCalendarNavigation>;
