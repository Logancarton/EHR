import { randomUUID } from "node:crypto";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { assertPatientAccess, organizationForNewPatient } from "../auth/patient-access";
import { assertProspectiveOrganizationAccess, assertProspectivePersonAccess } from "../auth/prospective-access";
import { AuditRepository } from "../repositories/audit-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { AppointmentRepository } from "../repositories/appointment-repository";
import { ProspectivePersonRepository, type CreateProspectivePersonInput } from "../repositories/prospective-person-repository";
import { IntakeRepository } from "../repositories/intake-repository";
import { tentativeIntakeError } from "../../domain/patient-administration";
import { findPossibleDuplicates, type ProspectivePerson, type ProspectivePersonCandidateMatch } from "../../domain/prospective-person";
import { ageFromDateOfBirth } from "../../domain/patient-administration";
import type { ClinicalExecutionContext } from "./clinical-service";

export class ProspectivePersonError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProspectivePersonError";
  }
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}
function meta(context: ClinicalExecutionContext) {
  return { source: context.source, requestId: context.requestId };
}

export const prospectivePersonService = {
  /**
   * The front door: a caller's name/DOB/phone/email, held as an
   * organization-scoped administrative identity with no clinical chart. Reuses
   * the same minimum-identity validation the tentative-hold flow already
   * required (D-073) so the bar for "enough to follow up on" does not drift
   * between the two.
   */
  create(
    input: { name: string; dob?: string; mobilePhone?: string; email?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): ProspectivePerson {
    assertPermission(actor, "edit_patient");
    const name = input.name.trim();
    if (!name) throw new ProspectivePersonError("A prospective record needs a name.", 400);
    const intakeError = tentativeIntakeError({ name, dob: input.dob || "", phone: input.mobilePhone, email: input.email });
    if (intakeError) throw new ProspectivePersonError(intakeError, 400);

    const organizationId = organizationForNewPatient(actor);
    const prospect = ProspectivePersonRepository.create({
      organizationId,
      name,
      dob: input.dob?.trim(),
      mobilePhone: input.mobilePhone?.trim(),
      email: input.email?.trim(),
    } satisfies CreateProspectivePersonInput);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "prospective_person_created",
      description: `Recorded prospective front-door identity for ${prospect.name}.`,
      metadata: { prospectiveId: prospect.id, organizationId, ...meta(context) },
    });
    return prospect;
  },

  update(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { prospectiveId: string; name?: string; dob?: string; mobilePhone?: string; email?: string },
  ): ProspectivePerson {
    const prospect = this.getById(actor, input.prospectiveId);
    assertPermission(actor, "edit_patient");
    if (prospect.status === "promoted") {
      throw new ProspectivePersonError("This prospective record has already been promoted; edit the patient chart instead.", 409);
    }
    const name = input.name?.trim();
    if (name !== undefined && !name) throw new ProspectivePersonError("A prospective record needs a name.", 400);

    const updated = ProspectivePersonRepository.update(prospect.id, {
      name,
      dob: input.dob?.trim(),
      mobilePhone: input.mobilePhone?.trim(),
      email: input.email?.trim(),
    })!;

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "prospective_person_updated",
      description: `Updated prospective front-door identity for ${updated.name}.`,
      metadata: { prospectiveId: updated.id, ...meta(context) },
    });
    return updated;
  },

  getById(actor: ProviderContext, id: string): ProspectivePerson {
    const prospect = ProspectivePersonRepository.getById(id);
    if (!prospect) throw new ProspectivePersonError(`Prospective record not found: ${id}`, 404);
    assertProspectiveOrganizationAccess(actor, prospect.organizationId);
    return prospect;
  },

  /**
   * Surfaces possible existing-patient matches for a human to resolve. Never
   * merges, never blocks either promotion path — it only informs the choice
   * between "link to this existing chart" and "create a new one".
   */
  findPossibleDuplicates(actor: ProviderContext, prospectiveId: string): ProspectivePersonCandidateMatch[] {
    const prospect = this.getById(actor, prospectiveId);
    assertPermission(actor, "edit_patient");
    const candidates = PatientRepository.getAll().filter((p) => {
      try {
        assertPatientAccess(actor, p.id);
        return true;
      } catch {
        return false;
      }
    });
    return findPossibleDuplicates(prospect, candidates.map((p) => ({ id: p.id, name: p.name, dob: p.dob, mrn: p.mrn })));
  },

  /**
   * Promotion: the only way a prospect becomes (or is attached to) a chart.
   * `mode: "create"` reuses the existing patient-creation authority exactly
   * as any staff-initiated chart creation would; `mode: "link"` attaches to
   * a chart staff explicitly selected. Neither branch runs automatically —
   * both require this explicit call, and duplicate candidates are surfaced
   * by `findPossibleDuplicates` beforehand for a human to weigh, never acted
   * on here.
   */
  promote(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { prospectiveId: string; mode: "create" | "link"; existingPatientId?: string },
  ) {
    const prospect = this.getById(actor, input.prospectiveId);
    assertPermission(actor, "edit_patient");
    if (prospect.status === "promoted") {
      throw new ProspectivePersonError(`Prospective record ${prospect.id} has already been promoted to patient ${prospect.promotedPatientId}.`, 409);
    }

    let patient: { id: string; name: string };
    let promotionKind: "created" | "linked_existing";

    if (input.mode === "link") {
      if (!input.existingPatientId) throw new ProspectivePersonError("Select the existing patient to link to.", 400);
      assertPatientAccess(actor, input.existingPatientId);
      const existing = PatientRepository.getById(input.existingPatientId);
      if (!existing) throw new ProspectivePersonError(`Patient not found: ${input.existingPatientId}`, 404);
      patient = existing;
      promotionKind = "linked_existing";
    } else {
      if (!prospect.dob) throw new ProspectivePersonError("A date of birth is required before creating a chart.", 400);
      const mrn = `MRN-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const created = PatientRepository.create(
        {
          id: `patient-${randomUUID()}`,
          mrn,
          name: prospect.name,
          initials: prospect.name.split(/\s+/).filter(Boolean).map((p) => p[0]?.toUpperCase()).slice(0, 2).join("") || "PT",
          dob: prospect.dob,
          age: ageFromDateOfBirth(prospect.dob) ?? 0,
          pronouns: "",
          status: "New Patient",
          diagnoses: [],
          allergies: [],
          meds: [],
          vitals: {},
          lastVisit: "Never",
          nextVisit: "Unscheduled",
          contact: { mobilePhone: prospect.mobilePhone, email: prospect.email },
        } as any,
        prospect.organizationId,
      );
      patient = created;
      promotionKind = "created";
    }

    ProspectivePersonRepository.markPromoted(prospect.id, {
      promotedPatientId: patient.id,
      promotedBy: providerLabel(actor),
      promotionKind,
    });

    // Every appointment and Intake episode still pointing at the prospect id
    // is relinked to the real chart. The prospect row itself, its notes and
    // its evidence rows are left exactly as they were — promotion moves the
    // *reference* forward; it does not rewrite the front-door history it
    // came from.
    const relinkedAppointments = AppointmentRepository.relinkSubject(prospect.id, {
      patientId: patient.id,
      patientName: patient.name,
      dob: prospect.dob,
      mrn: (patient as any).mrn,
    });

    const episodes = IntakeRepository.listEpisodesByProspect(prospect.id);
    for (const episode of episodes) {
      IntakeRepository.linkEpisodeToPatient(episode.id, patient.id);
    }

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "prospective_person_promoted",
      patientId: patient.id,
      description: promotionKind === "created"
        ? `Promoted prospective record for ${prospect.name} to a new patient chart.`
        : `Linked prospective record for ${prospect.name} to existing patient ${patient.name}.`,
      metadata: { prospectiveId: prospect.id, promotionKind, relinkedAppointments, relinkedEpisodes: episodes.length, ...meta(context) },
    });

    return { prospect: ProspectivePersonRepository.getById(prospect.id)!, patient };
  },
};
