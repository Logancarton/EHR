# Archived communication fixtures — non-authoritative

Archived 2026-10-06 from `app/components/workspaces/FaxWorkspace.tsx` and `app/components/team/TeamCollaborationDock.tsx`. Reason: unmounted/legacy surfaces contained invented patient events and transport confirmations. Replacement: canonical Communication owner and explicitly empty disconnected legacy views. These are fictional historical code snippets, never clinical evidence. Components remain because containment tests and legacy shell imports reference them.

```tsx
const INITIAL_FAXES: FaxRecord[] = [
  {
    id: "fax-001",
    direction: "inbound",
    recipientOrSender: "Labcorp Northern California",
    organization: "Labcorp Client Services",
    faxNumber: "(800) 555-0199",
    pages: 3,
    subject: "Diagnostic Report: Comprehensive Metabolic & Lithium Panel",
    timestamp: "Today, 11:22 AM",
    status: "received",
    confirmationId: "CONF-LBC-88219",
    patientName: "Marcus Vance",
    summary: "Critical diagnostic report indicating serum lithium levels within therapeutic target range (0.9 mEq/L). Signed by pathologist Dr. A. Vance.",
  },
  {
    id: "fax-002",
    direction: "outbound",
    recipientOrSender: "Dr. Sarah Jenkins, MD",
    organization: "Bay Area Family Medicine",
    faxNumber: "(415) 555-3810",
    pages: 2,
    subject: "Consultation Note & Treatment Plan: Elena Rostova",
    timestamp: "Today, 09:15 AM",
    status: "delivered",
    confirmationId: "CONF-BAFM-44102",
    patientName: "Elena Rostova",
    summary: "Comprehensive psychiatric intake summary, diagnostic formulation (MDD, recurrent), and psychopharmacology recommendations.",
  },
  {
    id: "fax-003",
    direction: "inbound",
    recipientOrSender: "Walgreens Pharmacy #1402",
    organization: "Walgreens Specialty Pharmacy",
    faxNumber: "(415) 555-0144",
    pages: 1,
    subject: "Prior Authorization Clarification - Lamotrigine Starter Pack",
    timestamp: "Yesterday, 3:45 PM",
    status: "received",
    confirmationId: "CONF-WLG-10928",
    patientName: "Jordan Reed",
    summary: "Refill clearance notice requesting clinician signature and ICD-10 indication documentation for 30-day titration starter pack.",
  },
  {
    id: "fax-004",
    direction: "outbound",
    recipientOrSender: "Quest Diagnostics Specimen Lab",
    organization: "Quest Regional Lab",
    faxNumber: "(510) 555-9012",
    pages: 1,
    subject: "Lab Order Requisition: TSH, CBC with Differential, Hepatic Panel",
    timestamp: "Sep 11, 2026",
    status: "delivered",
    confirmationId: "CONF-QST-77192",
    patientName: "Maya Chen",
    summary: "Official lab requisition order for annual psychiatric psychopharmacology surveillance panel.",
  },
];
  const [emails] = useState([
    {
      id: "em-1",
      from: "Dr. Sarah Jenkins, MD (Bay Area Family Med)",
      subject: "Psychiatric Consultation Referral: Elena Rostova",
      snippet: "Attaching recent metabolic lab panels and previous SSRI trials for Elena Rostova ahead of intake...",
      time: "10:14 AM",
      unread: true,
      body: "Dear Dr. Taylor,\n\nI am referring Elena Rostova (DOB: 04/12/1988) for comprehensive psychiatric evaluation regarding recurrent depressive symptoms. Her CBC, CMP, and thyroid panel from last week are normal. Looking forward to your consultation notes.\n\nBest regards,\nDr. Sarah Jenkins, MD",
    },
    {
      id: "em-2",
      from: "Walgreens Specialty Pharmacy #1402",
      subject: "Prior Authorization Clarification - Lamotrigine 100mg (Jordan Reed)",
      snippet: "Electronic prior authorization question regarding titration starter pack quantity override...",
      time: "09:30 AM",
      unread: true,
      body: "Attention: Dr. Taylor Smith, MD\n\nRegarding patient Jordan Reed (DOB: 08/22/1991):\nThe e-prescription for Lamotrigine Starter Kit was received. Aetna requires an explicit ICD-10 indication code on file to approve the 30-day starter pack dispensation. Please confirm F31.81 via reply.\n\nThank you,\nPharmacy Staff, Walgreens #1402",
    },
    {
      id: "em-3",
      from: "Labcorp Client Services",
      subject: "Critical Lab Result Notification - Lithium Level (Marcus Vance)",
      snippet: "Serum Lithium level report for Marcus Vance: 0.9 mEq/L (Therapeutic range: 0.6 - 1.2 mEq/L)...",
      time: "Yesterday",
      unread: false,
      body: "CLINICAL NOTIFICATION:\n\nLab results for patient Marcus Vance (MRN-55104) drawn on 09/11/2026:\nTest: Lithium Level, Serum\nResult: 0.9 mEq/L\nStatus: Normal / Therapeutic.",
    },
  ]);

  const [recentFaxes, setRecentFaxes] = useState([
    { id: "fx-1", to: "Bay Area Family Medicine", number: "(415) 555-3810", subject: "Consultation Note: Elena Rostova", time: "Today, 09:15 AM", status: "Delivered", pages: 2 },
    { id: "fx-2", to: "Walgreens Pharmacy #1402", number: "(415) 555-0144", subject: "Lamotrigine Titration Prior-Auth", time: "Yesterday, 3:45 PM", status: "Received", pages: 1 },
    { id: "fx-3", to: "Labcorp Northern California", number: "(800) 555-0199", subject: "Lab Requisition: Marcus Vance", time: "Sep 11, 2026", status: "Delivered", pages: 3 },
  ]);

```
