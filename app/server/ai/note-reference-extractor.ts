import {
  validateExtractionOutput,
  type ExtractionCandidate,
  type ExtractionRequest,
  type ValidatedExtraction,
} from "../../domain/note-reference-extraction";

/**
 * Finding which of a patient's records a note section is talking about.
 *
 * The interface is the point. A hosted model and the local deterministic matcher
 * below answer the same narrow question — which of *these* records does *this*
 * text refer to — so one can replace the other without the EHR changing, which is
 * the replaceability requirement in AGENTS.md. The omnibox planner already proved
 * this shape once.
 *
 * No model is wired into this repository yet. The deterministic implementation is
 * not a placeholder for one: it is weaker, and that is acceptable, because every
 * reference it produces is a proposal requiring confirmation either way.
 */
export interface NoteReferenceExtractor {
  readonly provider: string;
  readonly model: string;
  extract(request: ExtractionRequest): Promise<unknown>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Terms that would identify this record in prose, longest first.
 *
 * A medication's chart display carries dose and frequency ("Sertraline 100 mg
 * daily") which a note rarely repeats verbatim, so the leading drug name earns its
 * own term. The full display still matches first and scores higher.
 */
function matchTerms(candidate: ExtractionCandidate): Array<{ term: string; confidence: number }> {
  const terms: Array<{ term: string; confidence: number }> = [
    { term: candidate.display, confidence: 0.9 },
  ];

  for (const alias of candidate.aliases || []) {
    if (alias.trim().length >= 3) terms.push({ term: alias, confidence: 0.75 });
  }

  const leading = candidate.display.trim().split(/[\s,(]/)[0];
  if (leading && leading.length >= 4 && leading.toLowerCase() !== candidate.display.trim().toLowerCase()) {
    terms.push({ term: leading, confidence: 0.6 });
  }

  return terms
    .filter((entry) => entry.term.trim().length >= 3)
    .sort((a, b) => b.term.length - a.term.length);
}

export class DeterministicNoteReferenceExtractor implements NoteReferenceExtractor {
  readonly provider = "local";
  readonly model = "deterministic-v1";

  async extract(request: ExtractionRequest): Promise<unknown> {
    const selections: Array<{ entityId: string; spanStart: number; spanEnd: number; confidence: number }> = [];

    for (const candidate of request.candidates) {
      for (const { term, confidence } of matchTerms(candidate)) {
        // Word-boundary matching, so "Lithium" does not match inside another word
        // and a three-letter abbreviation does not match inside a longer one.
        const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, "i");
        const found = pattern.exec(request.text);
        if (!found) continue;

        selections.push({
          entityId: candidate.entityId,
          spanStart: found.index,
          spanEnd: found.index + found[0].length,
          confidence,
        });
        break;
      }
    }

    return { selections };
  }
}

/** Run an extractor and validate what it returns against what it was offered. */
export async function extractWithModel(
  extractor: NoteReferenceExtractor,
  request: ExtractionRequest,
): Promise<ValidatedExtraction> {
  const raw = await extractor.extract(request);
  return validateExtractionOutput(raw, request);
}
