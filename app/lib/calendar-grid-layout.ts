import { timeStringToMinutes, type ScheduleItem } from "./schedule-data";

export const CALENDAR_SLOT_MINUTES = 15;
export const CALENDAR_BASE_SLOT_HEIGHT = 16;
export const CALENDAR_EVENT_ROW_STEP = 48;
export const CALENDAR_EVENT_CARD_HEIGHT = 44;

export type CalendarEventRow = {
  item: ScheduleItem;
  topPx: number;
};

export type CalendarGridLayout = {
  slotHeights: readonly number[];
  slotOffsets: readonly number[];
  eventsByDate: ReadonlyMap<string, readonly CalendarEventRow[]>;
  minuteTop: (minutes: number) => number;
};

/**
 * The time grid reserves a full-width row for every appointment starting in a
 * quarter-hour slot. All visible days share the tallest slot, so crowded visits
 * never squeeze names into unreadable columns or cover later appointments.
 * Duration remains an appointment fact in the detail view, not a pixel width.
 */
export function buildCalendarGridLayout(
  dates: readonly string[],
  appointmentsByDate: ReadonlyMap<string, readonly ScheduleItem[]>,
  startHour: number,
  endHour: number,
): CalendarGridLayout {
  const startMinutes = startHour * 60;
  const slotCount = (endHour - startHour) * (60 / CALENDAR_SLOT_MINUTES);
  const slotHeights = Array<number>(slotCount).fill(CALENDAR_BASE_SLOT_HEIGHT);
  const dayBuckets = new Map<string, Map<number, ScheduleItem[]>>();

  for (const date of dates) {
    const buckets = new Map<number, ScheduleItem[]>();
    const appointments = [...(appointmentsByDate.get(date) || [])].sort((a, b) => {
      const startDelta = timeStringToMinutes(a.time) - timeStringToMinutes(b.time);
      return startDelta || a.patientName.localeCompare(b.patientName) || a.id.localeCompare(b.id);
    });

    for (const item of appointments) {
      const minutes = timeStringToMinutes(item.time);
      if (minutes < startMinutes || minutes >= endHour * 60) continue;
      const slot = Math.floor((minutes - startMinutes) / CALENDAR_SLOT_MINUTES);
      const rows = buckets.get(slot) || [];
      rows.push(item);
      buckets.set(slot, rows);
      slotHeights[slot] = Math.max(slotHeights[slot], rows.length * CALENDAR_EVENT_ROW_STEP);
    }
    dayBuckets.set(date, buckets);
  }

  const slotOffsets = [0];
  for (const height of slotHeights) {
    slotOffsets.push(slotOffsets[slotOffsets.length - 1] + height);
  }

  const eventsByDate = new Map<string, CalendarEventRow[]>();
  for (const date of dates) {
    const rows: CalendarEventRow[] = [];
    for (const [slot, items] of dayBuckets.get(date) || []) {
      items.forEach((item, rank) => {
        rows.push({ item, topPx: slotOffsets[slot] + rank * CALENDAR_EVENT_ROW_STEP + 2 });
      });
    }
    eventsByDate.set(date, rows);
  }

  function minuteTop(minutes: number): number {
    const slotFraction = Math.max(0, Math.min(slotCount, (minutes - startMinutes) / CALENDAR_SLOT_MINUTES));
    const slot = Math.min(Math.floor(slotFraction), slotCount - 1);
    if (slotFraction >= slotCount) return slotOffsets[slotCount];
    return slotOffsets[slot] + (slotFraction - slot) * slotHeights[slot];
  }

  return { slotHeights, slotOffsets, eventsByDate, minuteTop };
}
