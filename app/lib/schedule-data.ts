export type AppointmentStatus =
  | "scheduled"
  | "waiting"
  | "in-visit"
  | "completed"
  | "no-show";

export type VisitType =
  | "30-min Med Check"
  | "45-min Therapy + Meds"
  | "60-min Intake"
  | "Psychotherapy + Meds"
  | "Urgent Walk-in";

export type ScheduleItem = {
  id: string;
  date: string; // ISO format: YYYY-MM-DD (e.g. 2026-09-04)
  patientId: string;
  patientName: string;
  dob: string;
  age: number;
  mrn: string;
  time: string; // e.g. "09:00 AM"
  duration: string; // e.g. "30 min", "45 min", "60 min"
  type: VisitType;
  status: AppointmentStatus;
  chiefComplaint: string;
  room?: string;
  alert?: string;
  insurance: string;
};

export type ActionQueueItem = {
  id: string;
  type: "unsigned-note" | "lab-alert" | "portal-message";
  title: string;
  patientId: string;
  patientName: string;
  date: string;
  summary: string;
  actionLabel: string;
  targetSection?: "Encounter" | "Labs" | "Messages" | "Meds";
};

export const defaultPracticeDate = "2026-09-04"; // Friday, Sep 4, 2026

export const initialSchedule: ScheduleItem[] = [
  // Thursday, Sep 3, 2026 (Yesterday - completed)
  {
    id: "apt-y-1",
    date: "2026-09-03",
    patientId: "marcus-vance",
    patientName: "Marcus Vance",
    dob: "08/14/1995",
    age: 31,
    mrn: "P-10231",
    time: "10:00 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "completed",
    chiefComplaint: "Prior day routine medication check.",
    room: "Room 1",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-y-2",
    date: "2026-09-03",
    patientId: "david-kim",
    patientName: "David Kim",
    dob: "12/05/1979",
    age: 46,
    mrn: "P-10889",
    time: "02:00 PM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "completed",
    chiefComplaint: "Mood check and coping strategies.",
    room: "Room 2",
    insurance: "Cigna Open Access",
  },

  // Friday, Sep 4, 2026 (Today)
  {
    id: "apt-1",
    date: "2026-09-04",
    patientId: "marcus-vance",
    patientName: "Marcus Vance",
    dob: "08/14/1995",
    age: 31,
    mrn: "P-10231",
    time: "09:00 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "completed",
    chiefComplaint: "ADHD medication refill and work focus review.",
    room: "Room 1",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-2",
    date: "2026-09-04",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    dob: "04/18/1992",
    age: 34,
    mrn: "P-10482",
    time: "10:30 AM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "completed",
    chiefComplaint: "Anxiety symptoms, sleep onset, Guanfacine titration response.",
    room: "Room 2",
    insurance: "Aetna Choice POS",
  },
  {
    id: "apt-3",
    date: "2026-09-04",
    patientId: "elena-rostova",
    patientName: "Elena Rostova",
    dob: "03/22/1988",
    age: 38,
    mrn: "P-10764",
    time: "01:15 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "in-visit",
    chiefComplaint: "Depressive symptoms, energy level on Bupropion XL.",
    room: "Telehealth Room A",
    insurance: "UnitedHealthcare",
  },
  {
    id: "apt-4",
    date: "2026-09-04",
    patientId: "david-kim",
    patientName: "David Kim",
    dob: "12/05/1979",
    age: 46,
    mrn: "P-10889",
    time: "02:45 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "completed",
    chiefComplaint: "Bipolar II maintenance, Lithium level review.",
    room: "Room 1",
    insurance: "Cigna Open Access",
  },
  {
    id: "apt-5",
    date: "2026-09-04",
    patientId: "jordan-reed",
    patientName: "Jordan Reed",
    dob: "11/03/1986",
    age: 39,
    mrn: "P-10917",
    time: "04:30 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "waiting",
    chiefComplaint: "Mood stabilization review, sleep quality on Quetiapine.",
    room: "Waiting Room · Lobby",
    alert: "Metabolic surveillance labs overdue (Fasting Lipids & HbA1c)",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-6",
    date: "2026-09-04",
    patientId: "sofia-martinez",
    patientName: "Sofia Martinez",
    dob: "01/27/2008",
    age: 18,
    mrn: "P-11104",
    time: "05:15 PM",
    duration: "60 min",
    type: "60-min Intake",
    status: "scheduled",
    chiefComplaint: "Comprehensive adolescent mood evaluation, college transition stress.",
    room: "Room 3",
    insurance: "Kaiser Permanente",
  },

  // Saturday, Sep 5, 2026 (Tomorrow)
  {
    id: "apt-sat-1",
    date: "2026-09-05",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    dob: "04/18/1992",
    age: 34,
    mrn: "P-10482",
    time: "10:00 AM",
    duration: "30 min",
    type: "Urgent Walk-in",
    status: "scheduled",
    chiefComplaint: "Urgent check-in regarding prescription refill prior authorization.",
    room: "Telehealth Room B",
    insurance: "Aetna Choice POS",
  },

  // Monday, Sep 7, 2026 (Upcoming Week)
  {
    id: "apt-mon-1",
    date: "2026-09-07",
    patientId: "jordan-reed",
    patientName: "Jordan Reed",
    dob: "11/03/1986",
    age: 39,
    mrn: "P-10917",
    time: "09:30 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    chiefComplaint: "Follow-up on metabolic blood draws and Quest lab receipts.",
    room: "Room 2",
    insurance: "Blue Cross Blue Shield",
  },
  {
    id: "apt-mon-2",
    date: "2026-09-07",
    patientId: "sofia-martinez",
    patientName: "Sofia Martinez",
    dob: "01/27/2008",
    age: 18,
    mrn: "P-11104",
    time: "11:00 AM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "scheduled",
    chiefComplaint: "Psychotherapy session #1: College adjustment coping tools.",
    room: "Room 1",
    insurance: "Kaiser Permanente",
  },
  {
    id: "apt-mon-3",
    date: "2026-09-07",
    patientId: "marcus-vance",
    patientName: "Marcus Vance",
    dob: "08/14/1995",
    age: 31,
    mrn: "P-10231",
    time: "02:15 PM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    chiefComplaint: "Work performance rating scale follow-up.",
    room: "Room 3",
    insurance: "Blue Cross Blue Shield",
  },

  // Tuesday, Sep 8, 2026
  {
    id: "apt-tue-1",
    date: "2026-09-08",
    patientId: "david-kim",
    patientName: "David Kim",
    dob: "12/05/1979",
    age: 46,
    mrn: "P-10889",
    time: "10:00 AM",
    duration: "30 min",
    type: "30-min Med Check",
    status: "scheduled",
    chiefComplaint: "Lithium level confirmation and hydration review.",
    room: "Room 1",
    insurance: "Cigna Open Access",
  },
  {
    id: "apt-tue-2",
    date: "2026-09-08",
    patientId: "elena-rostova",
    patientName: "Elena Rostova",
    dob: "03/22/1988",
    age: 38,
    mrn: "P-10764",
    time: "01:30 PM",
    duration: "45 min",
    type: "Psychotherapy + Meds",
    status: "scheduled",
    chiefComplaint: "CBT for dysthymia and behavioral activation.",
    room: "Telehealth Room A",
    insurance: "UnitedHealthcare",
  },
];

export const initialActionQueue: ActionQueueItem[] = [
  {
    id: "act-1",
    type: "unsigned-note",
    title: "Unsigned Encounter Draft",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    date: "Aug 12, 2026",
    summary: "Psychiatric Follow-Up draft awaiting final review & signature.",
    actionLabel: "Review & Sign",
    targetSection: "Encounter",
  },
  {
    id: "act-2",
    type: "lab-alert",
    title: "Overdue Lab Surveillance",
    patientId: "jordan-reed",
    patientName: "Jordan Reed",
    date: "Due now",
    summary: "Fasting Lipid Panel & HbA1c overdue 446 days for Quetiapine protocol.",
    actionLabel: "Draft Orders",
    targetSection: "Labs",
  },
  {
    id: "act-3",
    type: "portal-message",
    title: "Prescription Refill Request",
    patientId: "maya-chen",
    patientName: "Maya Chen",
    date: "Today · 11:15 AM",
    summary: "Requested 90-day refill for Sertraline 100mg with preferred local pharmacy.",
    actionLabel: "Review Request",
    targetSection: "Meds",
  },
];

// Helper functions for calendar and date navigation
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateHeading(dateStr: string): string {
  const date = parseDateString(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(dateStr: string): string {
  const date = parseDateString(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getRelativeDateBadge(dateStr: string, defaultDate = defaultPracticeDate): string {
  if (dateStr === defaultDate) return "TODAY'S SCHEDULE";
  const curr = parseDateString(dateStr).getTime();
  const def = parseDateString(defaultDate).getTime();
  const diffDays = Math.round((curr - def) / (1000 * 60 * 60 * 24));

  if (diffDays === -1) return "YESTERDAY";
  if (diffDays === 1) return "TOMORROW";
  if (diffDays > 1) return `IN ${diffDays} DAYS`;
  if (diffDays < -1) return `${Math.abs(diffDays)} DAYS AGO`;
  return "PRACTICE SCHEDULE";
}

export function stepDate(currentDateStr: string, direction: "prev" | "next"): string {
  const date = parseDateString(currentDateStr);
  date.setDate(date.getDate() + (direction === "next" ? 1 : -1));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Convert "09:30 AM" into minutes from midnight (570)
export function timeStringToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(" ");
  if (parts.length < 2) return 540; // fallback 9:00 AM
  const [time, period] = parts;
  const [hours, minutes] = time.split(":").map(Number);
  let hour = hours % 12;
  if (period.toUpperCase() === "PM") hour += 12;
  return hour * 60 + (minutes || 0);
}

export function durationStringToMinutes(durationStr: string): number {
  const num = parseInt(durationStr, 10);
  return isNaN(num) ? 30 : num;
}

export function formatToIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekDates(dateStr: string): string[] {
  const d = parseDateString(dateStr);
  const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    dates.push(formatToIsoDate(cur));
  }
  return dates;
}

export function get3DayDates(dateStr: string): string[] {
  const d = parseDateString(dateStr);
  const dates: string[] = [];
  for (let offset = -1; offset <= 1; offset++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + offset);
    dates.push(formatToIsoDate(cur));
  }
  return dates;
}

export interface MonthGridCell {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export function getMonthCalendarGrid(dateStr: string): MonthGridCell[] {
  const target = parseDateString(dateStr);
  const year = target.getFullYear();
  const month = target.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startDayOfWeek = firstDay.getDay();
  const paddingBefore = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const cells: MonthGridCell[] = [];
  const todayStr = defaultPracticeDate;

  // Days before
  for (let i = paddingBefore; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    const dStr = formatToIsoDate(d);
    cells.push({
      date: dStr,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
    });
  }

  // Days of current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(year, month, day);
    const dStr = formatToIsoDate(d);
    cells.push({
      date: dStr,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
    });
  }

  // Days after to reach full week grid
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const dStr = formatToIsoDate(d);
    cells.push({
      date: dStr,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
    });
  }

  return cells;
}

export function minutesToTimeString(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutesStr = String(minutes).padStart(2, "0");
  return `${hours12}:${minutesStr} ${period}`;
}

