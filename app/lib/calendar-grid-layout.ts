import { timeStringToMinutes, type ScheduleItem } from "./schedule-data";

export const CALENDAR_SLOT_MINUTES = 15;
export const CALENDAR_BASE_SLOT_HEIGHT = 24;
export const CALENDAR_EVENT_CARD_HEIGHT = 44;
/**
 * Retained for callers that still import the old row-step constant. Time-grid
 * geometry no longer expands by this value; overlapping cards are tiled into
 * horizontal lanes instead.
 */
export const CALENDAR_EVENT_ROW_STEP = CALENDAR_EVENT_CARD_HEIGHT + 4;

export type CalendarEventRow = {
  item: ScheduleItem;
  topPx: number;
  laneIndex: number;
  laneCount: number;
};

export type CalendarGridLayout = {
  slotHeights: readonly number[];
  slotOffsets: readonly number[];
  eventsByDate: ReadonlyMap<string, readonly CalendarEventRow[]>;
  minuteTop: (minutes: number) => number;
};

type PositionedEvent = {
  item: ScheduleItem;
  topPx: number;
};

/**
 * Time owns the vertical geometry of the Calendar. Every 15-minute interval is
 * exactly the same height, so every hour is exactly four slots tall regardless
 * of appointment density.
 *
 * When appointment cards would visually overlap, they share the horizontal
 * space in deterministic lanes rather than stretching that portion of the day.
 * This preserves an honest time scale while keeping every appointment
 * individually clickable.
 */
export function buildCalendarGridLayout(
  dates: readonly string[],
  appointmentsByDate: ReadonlyMap<string, readonly ScheduleItem[]>,
  startHour: number,
  endHour: number,
): CalendarGridLayout {
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;
  const slotCount = (endHour - startHour) * (60 / CALENDAR_SLOT_MINUTES);
  const slotHeights = Array<number>(slotCount).fill(CALENDAR_BASE_SLOT_HEIGHT);

  const slotOffsets = [0];
  for (const height of slotHeights) {
    slotOffsets.push(slotOffsets[slotOffsets.length - 1] + height);
  }

  const topForMinutes = (minutes: number) =>
    ((minutes - startMinutes) / CALENDAR_SLOT_MINUTES) * CALENDAR_BASE_SLOT_HEIGHT;

  const eventsByDate = new Map<string, CalendarEventRow[]>();

  for (const date of dates) {
    const positioned: PositionedEvent[] = [...(appointmentsByDate.get(date) || [])]
      .sort((a, b) => {
        const startDelta = timeStringToMinutes(a.time) - timeStringToMinutes(b.time);
        return startDelta || a.patientName.localeCompare(b.patientName) || a.id.localeCompare(b.id);
      })
      .flatMap((item) => {
        const minutes = timeStringToMinutes(item.time);
        if (minutes < startMinutes || minutes >= endMinutes) return [];
        return [{ item, topPx: topForMinutes(minutes) + 2 }];
      });

    const rows: CalendarEventRow[] = [];
    let clusterStart = 0;

    while (clusterStart < positioned.length) {
      let clusterEnd = clusterStart + 1;
      let visualEnd = positioned[clusterStart].topPx + CALENDAR_EVENT_CARD_HEIGHT;

      while (
        clusterEnd < positioned.length &&
        positioned[clusterEnd].topPx < visualEnd
      ) {
        visualEnd = Math.max(
          visualEnd,
          positioned[clusterEnd].topPx + CALENDAR_EVENT_CARD_HEIGHT,
        );
        clusterEnd += 1;
      }

      const cluster = positioned.slice(clusterStart, clusterEnd);
      const laneEnds: number[] = [];
      const assigned = cluster.map(({ item, topPx }) => {
        let laneIndex = laneEnds.findIndex((end) => end <= topPx);
        if (laneIndex === -1) {
          laneIndex = laneEnds.length;
          laneEnds.push(topPx + CALENDAR_EVENT_CARD_HEIGHT);
        } else {
          laneEnds[laneIndex] = topPx + CALENDAR_EVENT_CARD_HEIGHT;
        }
        return { item, topPx, laneIndex };
      });

      const laneCount = laneEnds.length;
      rows.push(...assigned.map((row) => ({ ...row, laneCount })));
      clusterStart = clusterEnd;
    }

    eventsByDate.set(date, rows);
  }

  function minuteTop(minutes: number): number {
    const clampedMinutes = Math.max(startMinutes, Math.min(endMinutes, minutes));
    return topForMinutes(clampedMinutes);
  }

  return { slotHeights, slotOffsets, eventsByDate, minuteTop };
}
