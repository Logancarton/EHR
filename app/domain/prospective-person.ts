/**
 * The pre-chart identity stage (D-076).
 *
 * `initial inquiry / tentative appointment -> prospective administrative
 * identity -> minimum identity confirmation / duplicate resolution ->
 * deliberate promotion/link to a durable patient chart`
 *
 * A prospective person is the front door: enough to hold calendar time and
 * follow up, never enough to be a clinical chart. It carries no diagnoses,
 * medications, labs, or notes — only what Intake needs before a human
 * decides this caller is (or is not) an existing patient.
 */

export type ProspectivePersonStatus = "active" | "promoted" | "archived";

export type PromotionKind = "created" | "linked_existing";

export type ProspectivePerson = {
  id: string;
  organizationId: string;
  name: string;
  dob?: string;
  mobilePhone?: string;
  email?: string;
  status: ProspectivePersonStatus;
  promotedPatientId?: string;
  promotedAt?: string;
  promotedBy?: string;
  promotionKind?: PromotionKind;
  createdAt: string;
  updatedAt: string;
};

export type ProspectivePersonCandidateMatch = {
  patientId: string;
  name: string;
  dob: string;
  mrn: string;
  /** Which attributes matched — shown to staff, never used to auto-merge. */
  matchedOn: Array<"dob" | "name">;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Surfaces possible existing-patient matches for a human to resolve. Never
 * merges, never blocks creation — it only informs the choice between
 * "link to this existing chart" and "create a new one".
 */
export function findPossibleDuplicates(
  prospect: Pick<ProspectivePerson, "name" | "dob">,
  candidates: readonly { id: string; name: string; dob: string; mrn: string }[],
): ProspectivePersonCandidateMatch[] {
  const normalizedProspectName = normalizeName(prospect.name);
  const results: ProspectivePersonCandidateMatch[] = [];

  for (const candidate of candidates) {
    const matchedOn: Array<"dob" | "name"> = [];
    if (prospect.dob && candidate.dob && candidate.dob === prospect.dob) matchedOn.push("dob");
    if (normalizeName(candidate.name) === normalizedProspectName) matchedOn.push("name");
    if (matchedOn.length > 0) {
      results.push({ patientId: candidate.id, name: candidate.name, dob: candidate.dob, mrn: candidate.mrn, matchedOn });
    }
  }

  // Both attributes matching is the strongest signal; surface it first without
  // hiding weaker single-attribute matches a human might still recognize.
  return results.sort((a, b) => b.matchedOn.length - a.matchedOn.length);
}
