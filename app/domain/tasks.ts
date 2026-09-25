/**
 * A clinician's own scratchpad note. It belongs to its author inside one
 * practice (`scratch_notes`), and is either about one patient or a practice note.
 */
export type ScratchNote = {
  id: string;
  patientId?: string;
  text: string;
  /** ISO timestamp; clients format it. */
  createdAt: string;
  color: string;
  /**
   * Written before notes had authors and not attributable from the audit log.
   * Shown to the practice rather than hidden from everyone.
   */
  unattributed?: boolean;
};

/** Seed rows only: written to `tasks` and moved into `scratch_notes` by migration. */
export type SeedScratchNote = {
  id: string;
  patientId?: string;
  text: string;
  color: string;
};

export type ClinicalTask = {
  id: string;
  patientId?: string;
  text: string;
  completed: boolean;
  due: string;
};

export const initialScratchNotes: SeedScratchNote[] = [
  {
    id: "note-1",
    patientId: "maya-chen",
    text: "Titration note: Discussed Guanfacine ER increase to 3mg nightly if bedtime sedation is tolerated. Check blood pressure before committing.",
    color: "note-yellow",
  },
  {
    id: "note-2",
    patientId: "maya-chen",
    text: "Differential: GAD vs ADHD-related emotional dysregulation. Follow up Vanderbilt rating scale and repeat GAD-7 at next visit.",
    color: "note-blue",
  },
  {
    id: "note-3",
    text: "Front desk: confirm the new fax cover sheet carries the practice NPI before Friday.",
    color: "note-green",
  },
];

export const initialTasks: ClinicalTask[] = [
  { id: "task-1", text: "Review Jordan Reed lithium level (Due today)", completed: false, due: "Today" },
  { id: "task-2", text: "Complete prior authorization for Vyvanse 40mg", completed: false, due: "Tomorrow" },
  { id: "task-3", text: "Sign encounter draft for Maya Chen", completed: false, due: "Today" },
  { id: "task-4", text: "Order follow-up CMP & Lipid panel", completed: true, due: "Done" },
];
