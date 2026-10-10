/**
 * Reads a follow-up against the questions asked before it (D-132, CONV-1b).
 *
 * The Clinical AI conversation sends the questions the clinician already asked
 * about this patient. They are only the clinician's own words — never answers,
 * never model text — so nothing carried forward can stand in for a fact. Every
 * follow-up is re-planned and re-answered from authoritative records.
 *
 * Two follow-ups need the earlier question to mean anything:
 *
 * - "What about Jordan Reed?" asks the previous question about someone else.
 *   The patient still comes from this request, through the same name check as
 *   any other (a first name alone does not switch).
 * - "And the one before that?" asks for the result before the one just given.
 *   Repeating it walks further back.
 *
 * Anything else is planned as written. Topic changes ("what about TSH?") already
 * stand on their own, and guessing a link the clinician did not make would be
 * worse than answering the sentence they typed.
 */

export const MAX_PRIOR_QUESTIONS = 6;

export type ConversationFollowUp =
  | { kind: "standalone" }
  | { kind: "another_patient"; question: string; basedOn: string; resultOffset: number }
  | { kind: "earlier_result"; question: string; basedOn: string; resultOffset: number };

type Resolved = { question: string; resultOffset: number };

const EARLIER_FILLER = new Set([
  "and", "what", "about", "was", "is", "the", "one", "result", "value", "level", "reading", "how", "then", "that's",
]);
const EARLIER_PHRASES = new Set(["before that", "before it", "before", "previous", "prior", "earlier"]);

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
}

function asksForEarlierResult(query: string): boolean {
  const remaining = words(query).filter((word) => !EARLIER_FILLER.has(word)).join(" ");
  return EARLIER_PHRASES.has(remaining);
}

const ANOTHER_PATIENT = /^\s*(?:and|what about|how about|same for|same question for|and for|now for|and what about)\s+(.+?)\s*[?.!]*\s*$/i;

/**
 * @param isPatientReference true when the text is nothing but a reference to a
 *   patient this clinician can reach (a name, name part or MRN).
 */
export function resolveConversationFollowUp(
  query: string,
  priorQuestions: readonly string[],
  isPatientReference: (text: string) => boolean,
): ConversationFollowUp {
  const priors = priorQuestions.slice(-MAX_PRIOR_QUESTIONS);
  if (priors.length === 0) return { kind: "standalone" };

  // Resolve the earlier questions in order, so "before that" after "before that"
  // walks back from the first real question rather than restarting.
  let previous: Resolved | null = null;
  for (const prior of priors) {
    previous = step(prior, previous, isPatientReference) ?? { question: prior, resultOffset: 0 };
  }
  if (!previous) return { kind: "standalone" };

  if (asksForEarlierResult(query)) {
    return {
      kind: "earlier_result",
      question: previous.question,
      basedOn: previous.question,
      resultOffset: previous.resultOffset + 1,
    };
  }

  const another = ANOTHER_PATIENT.exec(query);
  if (another && isPatientReference(another[1])) {
    return { kind: "another_patient", question: previous.question, basedOn: previous.question, resultOffset: 0 };
  }

  return { kind: "standalone" };
}

function step(
  question: string,
  previous: Resolved | null,
  isPatientReference: (text: string) => boolean,
): Resolved | null {
  if (!previous) return null;
  if (asksForEarlierResult(question)) {
    return { question: previous.question, resultOffset: previous.resultOffset + 1 };
  }
  const another = ANOTHER_PATIENT.exec(question);
  if (another && isPatientReference(another[1])) return { question: previous.question, resultOffset: 0 };
  return null;
}
