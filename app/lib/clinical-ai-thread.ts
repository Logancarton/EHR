import type { OmniboxPlan } from "../domain/omnibox";

/**
 * The Clinical AI conversation for one patient (D-132, CONV-1).
 *
 * A thread is the running exchange between a clinician and the assistant about
 * one chart: each turn is what was asked and what came back. It exists so a
 * follow-up ("and her last lithium level?") reads in context instead of
 * replacing the previous answer.
 *
 * It is deliberately not the patient record. AI_SYSTEM.md: "Do not treat model
 * conversation history as the patient record." Threads live in this browser
 * session only, are never sent anywhere as a transcript, and are dropped when
 * the session ends. Anything that should outlive them goes through its owning
 * workflow (Insert into note, a staged order, a task).
 *
 * A thread belongs to exactly one patient, fixed when it is created. A turn
 * whose answer resolved to someone else stays in this thread but says so; it
 * never moves the thread. Unqualified references ("her", "that level") can only
 * mean the thread's patient, because the planner receives the thread's patient
 * as the active one and falls back to it when nobody else is named.
 */

export type ClinicalAiTurnStatus = "pending" | "answered" | "failed" | "workspace";

export type ClinicalAiTurn = {
  id: string;
  /** The thread's patient when the turn was asked. Never rewritten. */
  patientId: string;
  query: string;
  askedAt: number;
  status: ClinicalAiTurnStatus;
  plan?: OmniboxPlan;
  error?: string;
  /** What a client-side workspace command (layout, split screen) did. */
  feedback?: string;
};

export type ClinicalAiTurnOutcome =
  | { status: "answered"; plan: OmniboxPlan }
  | { status: "failed"; error: string }
  | { status: "workspace"; feedback: string };

/** Oldest turns fall off past this; the thread is a working view, not an archive. */
export const MAX_THREAD_TURNS = 30;

const EMPTY_TURNS: readonly ClinicalAiTurn[] = Object.freeze([]);

let threads = new Map<string, readonly ClinicalAiTurn[]>();
let nextTurnNumber = 0;
const listeners = new Set<() => void>();

function publish(patientId: string, turns: readonly ClinicalAiTurn[]): void {
  const next = new Map(threads);
  if (turns.length === 0) next.delete(patientId);
  else next.set(patientId, Object.freeze([...turns]));
  threads = next;
  for (const listener of listeners) listener();
}

export function subscribeClinicalAiThreads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clinicalAiThreadFor(patientId: string): readonly ClinicalAiTurn[] {
  return threads.get(patientId) ?? EMPTY_TURNS;
}

/** True while this patient's thread is waiting on an answer. */
export function threadHasPendingTurn(patientId: string): boolean {
  return clinicalAiThreadFor(patientId).some((turn) => turn.status === "pending");
}

/** Adds a question to the patient's thread and returns its id. */
export function beginClinicalAiTurn(patientId: string, query: string, now = Date.now()): string {
  const id = `ai-turn-${++nextTurnNumber}`;
  const turn: ClinicalAiTurn = { id, patientId, query, askedAt: now, status: "pending" };
  publish(patientId, [...clinicalAiThreadFor(patientId), turn].slice(-MAX_THREAD_TURNS));
  return id;
}

/**
 * Records what a turn produced.
 *
 * Returns false and changes nothing when the turn is gone: the thread was
 * cleared, the turn dismissed or aged out, or the session ended while the
 * request was in flight. A late answer must not resurrect a conversation the
 * clinician removed, and it can only ever land in the thread it was asked in.
 */
export function settleClinicalAiTurn(
  patientId: string,
  turnId: string,
  outcome: ClinicalAiTurnOutcome,
): boolean {
  const turns = clinicalAiThreadFor(patientId);
  const index = turns.findIndex((turn) => turn.id === turnId);
  if (index < 0 || turns[index].status !== "pending") return false;
  const settled: ClinicalAiTurn = {
    id: turns[index].id,
    patientId: turns[index].patientId,
    query: turns[index].query,
    askedAt: turns[index].askedAt,
    ...outcome,
  };
  publish(patientId, turns.map((turn, i) => (i === index ? settled : turn)));
  return true;
}

export function dismissClinicalAiTurn(patientId: string, turnId: string): void {
  const turns = clinicalAiThreadFor(patientId);
  if (!turns.some((turn) => turn.id === turnId)) return;
  publish(patientId, turns.filter((turn) => turn.id !== turnId));
}

export function clearClinicalAiThread(patientId: string): void {
  if (!threads.has(patientId)) return;
  publish(patientId, EMPTY_TURNS);
}

/** Drops every thread when the session ends, so the next clinician starts empty. */
export function resetClinicalAiThreads(): void {
  threads = new Map();
  for (const listener of listeners) listener();
}

/**
 * The patient a turn's answer is actually about, when that is not the thread's.
 *
 * The planner resolves a named patient even inside another patient's thread.
 * That answer is shown, labelled, and kept out of follow-up context; the thread
 * itself does not switch.
 */
export function turnAnswersForAnotherPatient(turn: ClinicalAiTurn): { id: string; name: string } | null {
  const resolved = turn.plan?.patient.resolved;
  if (!resolved || resolved.id === turn.patientId) return null;
  return { id: resolved.id, name: resolved.name };
}

/** One line describing a settled turn, for collapsed earlier turns. */
export function turnSummary(turn: ClinicalAiTurn): string {
  switch (turn.status) {
    case "pending":
      return "Working…";
    case "failed":
      return turn.error ?? "The request failed.";
    case "workspace":
      return turn.feedback ?? "Workspace updated.";
    case "answered": {
      const plan = turn.plan;
      if (!plan) return "No answer.";
      if (plan.clarification) return plan.clarification.message;
      if (plan.answer) return plan.answer;
      if (plan.navigation) return plan.navigation.label;
      if (plan.workspaceTargets?.length) {
        return `${plan.workspaceTargets.length} result${plan.workspaceTargets.length === 1 ? "" : "s"} to open`;
      }
      if (plan.proposals.length) {
        return `${plan.proposals.length} proposal${plan.proposals.length === 1 ? "" : "s"} to review`;
      }
      if (plan.restrictedAction) return plan.restrictedAction.description;
      return "The assistant could not answer this.";
    }
  }
}
