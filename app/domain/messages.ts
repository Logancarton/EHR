export type SenderRole = "patient" | "provider" | "assistant";

export type MessageChannel = "portal" | "sms";

export type MessageUrgency = "urgent" | "high" | "routine" | "info";

export type MessageCategory = "refill" | "symptom-check" | "scheduling" | "general";

export type PatientMessage = {
  id: string;
  threadId: string;
  senderRole: SenderRole;
  senderName: string;
  content: string;
  timestamp: string;
  channel: MessageChannel;
  status: "delivered" | "read" | "queued";
};

export type SuggestedAction = {
  id: string;
  label: string;
  type: "stage-refill" | "create-task" | "open-schedule" | "call-patient";
  payload?: Record<string, string>;
};

export type PatientMessageThread = {
  id: string;
  patientId: string;
  subject: string;
  category: MessageCategory;
  urgency: MessageUrgency;
  lastMessageAt: string;
  unreadCount: number;
  aiTriageSummary: string;
  clinicalIntent: string;
  suggestedActions: SuggestedAction[];
  smartReplies: string[];
  messages: PatientMessage[];
};

export const initialPatientThreads: Record<string, PatientMessageThread[]> = {
  "maya-chen": [
    {
      id: "th-mc-1",
      patientId: "maya-chen",
      subject: "Prescription Refill Request: Sertraline 100mg for upcoming travel",
      category: "refill",
      urgency: "high",
      lastMessageAt: "Sep 5, 2026 · 11:42 AM",
      unreadCount: 1,
      aiTriageSummary: "Patient requests 30-day Sertraline 100 mg refill. Departing on business trip next Tuesday; 4 days of medication remaining.",
      clinicalIntent: "Sertraline 100 mg (30-day supply) e-prescribing refill to CVS Pharmacy #1042.",
      suggestedActions: [
        {
          id: "act-refill-sertraline",
          label: "💊 Stage Sertraline 100mg Refill",
          type: "stage-refill",
          payload: { drug: "Sertraline (Zoloft)", strength: "100 mg", quantity: "30" },
        },
        {
          id: "act-task-sertraline",
          label: "✓ Task: Confirm pickup before Tuesday",
          type: "create-task",
          payload: { text: "Verify Maya Chen picked up Sertraline 100mg before trip" },
        },
      ],
      smartReplies: [
        "Hi Maya, I have authorized your 30-day Sertraline 100mg refill and transmitted it to CVS Pharmacy #1042. Safe travels!",
        "Hello Maya, your refill has been approved. Please confirm if you would like a 90-day supply instead for your trip.",
        "Refill approved and submitted electronically. Let's touch base at our scheduled visit on Sep 9.",
      ],
      messages: [
        {
          id: "msg-mc-1",
          threadId: "th-mc-1",
          senderRole: "patient",
          senderName: "Maya Chen",
          content: "Hi Dr. Carton, I noticed I only have about 4 tablets of Sertraline left in my bottle. I have an upcoming work conference in Chicago next Tuesday through Saturday. Could we please send a 30-day refill to my usual CVS on Market St so I don't run out while traveling? Thank you!",
          timestamp: "Sep 5, 2026 · 11:42 AM",
          channel: "portal",
          status: "delivered",
        },
      ],
    },
    {
      id: "th-mc-2",
      patientId: "maya-chen",
      subject: "Evening sleep onset on Guanfacine ER 2mg update",
      category: "symptom-check",
      urgency: "routine",
      lastMessageAt: "Aug 28, 2026 · 04:15 PM",
      unreadCount: 0,
      aiTriageSummary: "Positive treatment response report: sleep latency improved to ~25 min on Guanfacine ER 2mg without morning hangover.",
      clinicalIntent: "Medication tolerability update. No acute intervention required.",
      suggestedActions: [
        {
          id: "act-task-sleep",
          label: "✓ Task: Check sleep log at Sep 9 visit",
          type: "create-task",
          payload: { text: "Review Guanfacine ER sleep latency log at Sep 9 visit with Maya" },
        },
      ],
      smartReplies: [
        "Glad to hear the evening restlessness has settled down without morning grogginess. We'll formalize this in your chart next week.",
      ],
      messages: [
        {
          id: "msg-mc-2",
          threadId: "th-mc-2",
          senderRole: "patient",
          senderName: "Maya Chen",
          content: "Hi Dr. Carton, just wanted to let you know that since stepping up to the 2mg of Guanfacine at bedtime, falling asleep has been so much easier. My brain isn't racing as much at night. Mild vivid dreams on night 2, but feeling clear-headed in the morning!",
          timestamp: "Aug 28, 2026 · 02:10 PM",
          channel: "portal",
          status: "read",
        },
        {
          id: "msg-mc-3",
          threadId: "th-mc-2",
          senderRole: "provider",
          senderName: "Dr. Logan Carton, MD",
          content: "That is wonderful progress, Maya! Improved sleep latency without morning cognitive hangover is exactly our target. Keep taking it consistently at bedtime with a light snack, and we will do our formal follow-up on Sep 9.",
          timestamp: "Aug 28, 2026 · 04:15 PM",
          channel: "portal",
          status: "delivered",
        },
      ],
    },
  ],
  "jordan-reed": [
    {
      id: "th-jr-1",
      patientId: "jordan-reed",
      subject: "Fasting requirements for metabolic lab draw tomorrow",
      category: "general",
      urgency: "routine",
      lastMessageAt: "Sep 4, 2026 · 05:20 PM",
      unreadCount: 1,
      aiTriageSummary: "Patient inquiring whether water and morning medications are permitted prior to Quest fasting lipid/HbA1c blood draw.",
      clinicalIntent: "Patient education regarding fasting protocol: water permitted, take morning medications as usual.",
      suggestedActions: [
        {
          id: "act-reply-fasting",
          label: "✉ Send Fasting Instructions",
          type: "create-task",
          payload: { text: "Confirm Jordan completed fasting draw at Quest" },
        },
      ],
      smartReplies: [
        "Hi Jordan, yes—please drink plenty of water! You should fast from food for 10-12 hours, but take your morning medications with water as scheduled.",
        "Confirmed: 10-12 hour overnight food fast required. Black coffee or water is fine. Take morning meds.",
      ],
      messages: [
        {
          id: "msg-jr-1",
          threadId: "th-jr-1",
          senderRole: "patient",
          senderName: "Jordan Reed",
          content: "Hi Dr. Carton, I'm planning to head to Quest on California St first thing tomorrow morning for the metabolic panel we discussed. Can I have water and take my morning Lamotrigine beforehand, or do I need to hold everything?",
          timestamp: "Sep 4, 2026 · 05:20 PM",
          channel: "portal",
          status: "delivered",
        },
      ],
    },
  ],
  "sofia-martinez": [
    {
      id: "th-sm-1",
      patientId: "sofia-martinez",
      subject: "Fluoxetine 30mg timing with college schedule",
      category: "symptom-check",
      urgency: "routine",
      lastMessageAt: "Aug 19, 2026 · 03:30 PM",
      unreadCount: 0,
      aiTriageSummary: "Patient asking whether taking Fluoxetine 30mg with breakfast vs evening is better to prevent mild afternoon fatigue.",
      clinicalIntent: "Medication timing counseling for adolescent SSRI therapy.",
      suggestedActions: [
        {
          id: "act-task-sm",
          label: "✓ Task: Monitor energy levels at next appointment",
          type: "create-task",
          payload: { text: "Check fatigue levels with Sofia at Sep 11 appointment" },
        },
      ],
      smartReplies: [
        "Taking it with breakfast is recommended to avoid sleep disruption, but if drowsiness persists we can discuss shifting to dinner.",
      ],
      messages: [
        {
          id: "msg-sm-1",
          threadId: "th-sm-1",
          senderRole: "patient",
          senderName: "Sofia Martinez",
          content: "Hello Dr. Carton! My college classes start early next week. I've been taking the Prozac with breakfast as you said and feeling okay, just a little sleepy around 2 PM. Should I keep it in the morning?",
          timestamp: "Aug 19, 2026 · 01:15 PM",
          channel: "sms",
          status: "read",
        },
        {
          id: "msg-sm-2",
          threadId: "th-sm-1",
          senderRole: "provider",
          senderName: "Dr. Logan Carton, MD",
          content: "Hi Sofia! Yes, definitely stick with breakfast for now—Fluoxetine has a long activating half-life and morning dosing prevents sleep onset insomnia. The 2 PM dip usually resolves within 2–3 weeks. Keep up the great start!",
          timestamp: "Aug 19, 2026 · 03:30 PM",
          channel: "sms",
          status: "delivered",
        },
      ],
    },
  ],
};

const MESSAGES_STORAGE_KEY = "ehr_patient_messages_v1";

export function loadPatientThreads(): Record<string, PatientMessageThread[]> {
  if (typeof window === "undefined") return initialPatientThreads;
  try {
    const raw = localStorage.getItem(MESSAGES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to load patient messages from localStorage", err);
  }
  return initialPatientThreads;
}

export function savePatientThreads(threads: Record<string, PatientMessageThread[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(threads));
  } catch (err) {
    console.warn("Failed to persist patient messages", err);
  }
}
