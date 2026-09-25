export type ScratchNote = {
  id: string;
  patientId?: string;
  text: string;
  time: string;
  color: string;
};

export type ClinicalTask = {
  id: string;
  patientId?: string;
  text: string;
  completed: boolean;
  due: string;
};

export const initialScratchNotes: ScratchNote[] = [
  {
    id: "note-1",
    patientId: "maya-chen",
    text: "Titration note: Discussed Guanfacine ER increase to 3mg nightly if bedtime sedation is tolerated. Check blood pressure before committing.",
    time: "10:45 AM",
    color: "note-yellow",
  },
  {
    id: "note-2",
    patientId: "maya-chen",
    text: "Differential: GAD vs ADHD-related emotional dysregulation. Follow up Vanderbilt rating scale and repeat GAD-7 at next visit.",
    time: "Yesterday",
    color: "note-blue",
  },
  {
    id: "note-3",
    text: "Front desk: confirm the new fax cover sheet carries the practice NPI before Friday.",
    time: "Monday",
    color: "note-green",
  },
];

export const initialTasks: ClinicalTask[] = [
  { id: "task-1", text: "Review Jordan Reed lithium level (Due today)", completed: false, due: "Today" },
  { id: "task-2", text: "Complete prior authorization for Vyvanse 40mg", completed: false, due: "Tomorrow" },
  { id: "task-3", text: "Sign encounter draft for Maya Chen", completed: false, due: "Today" },
  { id: "task-4", text: "Order follow-up CMP & Lipid panel", completed: true, due: "Done" },
];
