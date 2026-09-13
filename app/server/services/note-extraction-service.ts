import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import { EncounterRepository } from "../repositories/encounter-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import {
  NoteReferenceRepository,
  type NoteReferenceActor,
  type NoteReferenceInput,
  type NoteReferenceRecord,
} from "../repositories/note-reference-repository";
import {
  entityTypeFor,
  type ExtractionCandidate,
  type ExtractionRequest,
} from "../../domain/note-reference-extraction";
import {
  DeterministicNoteReferenceExtractor,
  extractWithModel,
  type NoteReferenceExtractor,
} from "../ai/note-reference-extractor";

/**
 * Proposing references from what a note section says.
 *
 * Everything this produces is a proposal: `ai-extracted`, `proposed`, counting
 * toward nothing until a clinician confirms it at signing. What makes that safe
 * enough to run automatically is the candidate set — the extractor is handed this
 * patient's own records and can only point at them, so a pass can never introduce
 * a clinical fact, only notice one already on the chart.
 *
 * See docs/NOTE_REFERENCES.md §2.2 and §2.5.
 */

const defaultExtractor = new DeterministicNoteReferenceExtractor();

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The records this patient actually has, and nothing else.
 *
 * Deliberately narrow: active problems and medications, and recent observations.
 * No other patient's data, no free-form chart access, nothing the extractor could
 * mistake for permission to look further.
 */
function candidateSet(patientId: string): ExtractionCandidate[] {
  const candidates: ExtractionCandidate[] = [];

  for (const problem of ClinicalRecordRepository.problems(patientId) as any[]) {
    if (problem.status && problem.status !== "active") continue;
    candidates.push({
      entityType: "problem",
      entityId: problem.id,
      display: text(problem.display_text),
      aliases: [text(problem.code)].filter(Boolean),
    });
  }

  for (const medication of ClinicalRecordRepository.medications(patientId) as any[]) {
    if (medication.status && medication.status !== "active") continue;
    candidates.push({
      entityType: "medication",
      entityId: medication.id,
      display: text(medication.display_text),
      aliases: [text(medication.medication_name), text(medication.generic_name)].filter(Boolean),
    });
  }

  for (const observation of ClinicalRecordRepository.observations(patientId, undefined, 40) as any[]) {
    candidates.push({
      entityType: "observation",
      entityId: observation.id,
      display: text(observation.test_name),
      aliases: [text(observation.code)].filter(Boolean),
    });
  }

  return candidates.filter((candidate) => candidate.display.trim().length > 0);
}

function alreadySeen(encounterId: string, section: string, contentSha: string, modelId: string): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT content_sha, model_id FROM encounter_section_extractions
       WHERE encounter_id = ? AND section = ?`,
    )
    .get(encounterId, section) as any;
  return Boolean(row && row.content_sha === contentSha && row.model_id === modelId);
}

function recordSeen(encounterId: string, section: string, contentSha: string, modelId: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO encounter_section_extractions (encounter_id, section, content_sha, model_id, extracted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (encounter_id, section) DO UPDATE SET
         content_sha = excluded.content_sha,
         model_id = excluded.model_id,
         extracted_at = excluded.extracted_at`,
    )
    .run(encounterId, section, contentSha, modelId, new Date().toISOString());
}

/** A discarded selection is a fault worth keeping, not a value to guess at. */
function recordDiscards(
  encounterId: string,
  patientId: string,
  modelId: string,
  discarded: unknown[],
  actor: NoteReferenceActor,
): void {
  if (discarded.length === 0) return;
  const payload = JSON.stringify({ modelId, discarded });
  getDatabase()
    .prepare(
      `INSERT INTO provenance_events
       (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
        actor_id, actor_name, payload_sha256, metadata_json, created_at)
       VALUES (?, ?, 'note-reference', ?, 'note-extraction-rejected', 'ai', 'ehr-local', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `prov-${randomUUID()}`,
      patientId,
      encounterId,
      modelId,
      actor.userId,
      actor.displayName,
      sha(payload),
      payload,
      new Date().toISOString(),
    );
}

export const NoteExtractionService = {
  /**
   * Propose references for one note section.
   *
   * Returns the section's references afterwards. Unchanged text is never
   * re-extracted, so the steady state costs nothing.
   */
  async extractSection(
    encounterId: string,
    section: string,
    sectionText: string,
    actor: NoteReferenceActor,
    extractor: NoteReferenceExtractor = defaultExtractor,
  ): Promise<NoteReferenceRecord[]> {
    const encounter = EncounterRepository.getById(encounterId);
    if (!encounter) return [];

    // A signed note is settled. Its references were confirmed at signing and are
    // frozen with it; a later pass has no business proposing anything about it.
    if (encounter.status === "signed") {
      return NoteReferenceRepository.listForEncounter(encounterId).filter(
        (reference) => reference.section === section,
      );
    }

    const contentSha = sha(sectionText);
    if (alreadySeen(encounterId, section, contentSha, extractor.model)) {
      return NoteReferenceRepository.listForEncounter(encounterId).filter(
        (reference) => reference.section === section,
      );
    }

    const request: ExtractionRequest = {
      section,
      text: sectionText,
      candidates: candidateSet(encounter.patientId),
    };

    const { selections, discarded } = await extractWithModel(extractor, request);
    recordDiscards(encounterId, encounter.patientId, extractor.model, discarded, actor);

    const inputs: NoteReferenceInput[] = [];
    for (const selection of selections) {
      const entityType = entityTypeFor(request, selection.entityId);
      if (!entityType) continue;
      inputs.push({
        section,
        entityType,
        entityId: selection.entityId,
        spanStart: selection.spanStart,
        spanEnd: selection.spanEnd,
        source: "ai-extracted",
        confidence: selection.confidence,
        modelId: extractor.model,
      });
    }

    const references = NoteReferenceRepository.replaceSection(
      encounterId,
      encounter.patientId,
      section,
      inputs,
      actor,
      "ai-extracted",
    );
    recordSeen(encounterId, section, contentSha, extractor.model);
    return references;
  },
};
