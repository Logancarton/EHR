import { EncounterRepository } from "../repositories/encounter-repository";
import { OrderRepository } from "../repositories/order-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import {
  NoteReferenceRepository,
  type NoteReferenceActor,
  type NoteReferenceInput,
  type NoteReferenceRecord,
} from "../repositories/note-reference-repository";

/**
 * References the system knows structurally, without reading a sentence.
 *
 * An order staged against an encounter, a medication whose clinical truth was
 * confirmed from that order — these are things the clinician did, recorded as
 * records with identity. They need no language understanding to find, and they
 * carry the heaviest element of E/M coding: prescription drug management is the
 * Moderate-risk pillar of a 99214, and it is almost entirely knowable from here.
 *
 * This is the strongest evidence class in the reference layer and the one that
 * works with no model available at all. See docs/NOTE_REFERENCES.md §2.2.
 */

/** The section a derived reference is attributed to. Ordering is plan activity. */
const DERIVED_SECTION = "plan";

function medicationReferences(patientId: string, orders: ReturnType<typeof OrderRepository.getByEncounter>) {
  // Medication truth is separate from prescribing intent (D-019/D-021). An order
  // becomes a reference only once it has been converted into a medication record:
  // before that there is no record to point at, and pointing at the order instead
  // would make a prescription look like a medication the patient is taking.
  const medications = new Set(ClinicalRecordRepository.medications(patientId).map((row: any) => row.id));
  const references: NoteReferenceInput[] = [];
  const seen = new Set<string>();

  for (const order of orders) {
    if (order.type !== "medication") continue;
    const recordId = order.details?.medicationTruthConfirmation?.medicationRecordId;
    if (typeof recordId !== "string" || !recordId) continue;

    // Never reference a record that is not there. A dangling reference would read
    // downstream as a documented medication that no chart can produce.
    if (!medications.has(recordId)) continue;
    if (seen.has(recordId)) continue;

    seen.add(recordId);
    references.push({
      section: DERIVED_SECTION,
      entityType: "medication",
      entityId: recordId,
      source: "action-derived",
    });
  }

  return references;
}

export const ActionDerivedReferenceService = {
  /**
   * Rebuild the action-derived reference set for one encounter.
   *
   * Derived, not authored: the set is recomputed from the encounter's orders each
   * time, so withdrawing an order withdraws its reference. Extraction output and
   * clinician links in the same section are untouched — each pass retires only its
   * own rows.
   */
  deriveForEncounter(encounterId: string, actor: NoteReferenceActor): NoteReferenceRecord[] {
    const encounter = EncounterRepository.getById(encounterId);
    if (!encounter) return [];

    const orders = OrderRepository.getByEncounter(encounterId);
    const references = medicationReferences(encounter.patientId, orders);

    return NoteReferenceRepository.replaceSection(
      encounterId,
      encounter.patientId,
      DERIVED_SECTION,
      references,
      actor,
      "action-derived",
    );
  },
};
