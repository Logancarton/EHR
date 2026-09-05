export type AppointmentStatus =
  | "scheduled"
  | "waiting"
  | "in-visit"
  | "completed"
  | "no-show";

export type VisitType =
  | "30-min Med Check"
  | "60-min Intake"
  | "Psychotherapy + Meds"
  | "Urgent Walk-in";

export type ScheduleItem = {
  id: string;
  patientId: string;
  patientName: string;
  dob: string;
  age: number;
  mrn: string;
  time: string;
  duration: string;
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

export const initialSchedule: ScheduleItem[] = [
  {
    id: "apt-1",
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
