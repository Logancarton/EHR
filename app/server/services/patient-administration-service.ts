import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { PatientRepository } from "../repositories/patient-repository";
import {
  PatientAdministrationRepository,
  type CareNetworkInput,
  type CareNetworkPatch,
  type RelatedPersonInput,
  type RelatedPersonPatch,
} from "../repositories/patient-administration-repository";
import type { PatientAdministrativeRecord } from "../../domain/patient-administration";
import type { ClinicalExecutionContext } from "./clinical-service";

/**
 * The administrative record behind the patient chart.
 *
 * Every write here is a disclosure decision as much as a data edit: who may be
 * called, what they may be told, which outside clinician is in the loop. So each
 * one is permission-checked, patient-bound by the gateway before it arrives, and
 * written to the audit trail with the actor who made it.
 */

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

function meta(context: ClinicalExecutionContext) {
  return { source: context.source, requestId: context.requestId };
}

function requirePatient(patientId: string) {
  const patient = PatientRepository.getById(patientId);
  if (!patient) throw new Error(`Patient not found: ${patientId}`);
  return patient;
}

export class PatientAdministrationService {
  /** Everything the administrative editor needs for one chart, in one read. */
  read(
    patientId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): PatientAdministrativeRecord {
    assertPermission(actor, "read_clinical");
    const patient = requirePatient(patientId);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "patient_administration_viewed",
      patientId,
      description: `Viewed administrative record for ${patient.name}.`,
      metadata: meta(context),
    });

    return {
      patientId,
      identity: patient.identity,
      contact: patient.contact,
      relatedPeople: PatientAdministrationRepository.listRelatedPeople(patientId),
      careNetwork: PatientAdministrationRepository.listCareNetwork(patientId),
    };
  }

  addRelatedPerson(input: RelatedPersonInput, actor: ProviderContext, context: ClinicalExecutionContext) {
    assertPermission(actor, "edit_patient");
    const patient = requirePatient(input.patientId);
    if (!input.name?.trim()) throw new Error("A related person needs a name.");

    const person = PatientAdministrationRepository.addRelatedPerson({
      ...input,
      name: input.name.trim(),
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "patient_related_person_added",
      patientId: input.patientId,
      description: `Added ${person.role} ${person.name} for ${patient.name} with ${person.consentScope} disclosure scope.`,
      metadata: { ...meta(context), relatedPersonId: person.id, consentScope: person.consentScope },
    });
    return person;
  }

  updateRelatedPerson(
    recordId: string,
    patch: RelatedPersonPatch,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "edit_patient");
    const existing = PatientAdministrationRepository.getRelatedPerson(recordId);
    if (!existing) throw new Error(`Related person not found: ${recordId}`);

    const person = PatientAdministrationRepository.updateRelatedPerson(recordId, patch);
    if (!person) throw new Error(`Related person not found: ${recordId}`);

    // A change to what may be disclosed is the part worth being able to reconstruct.
    const scopeChanged = existing.consentScope !== person.consentScope;
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "patient_related_person_updated",
      patientId: person.patientId,
      description: scopeChanged
        ? `Changed disclosure scope for ${person.name} from ${existing.consentScope} to ${person.consentScope}.`
        : `Updated related person ${person.name}.`,
      metadata: {
        ...meta(context),
        relatedPersonId: person.id,
        previousConsentScope: existing.consentScope,
        consentScope: person.consentScope,
        previousStatus: existing.status,
        status: person.status,
      },
    });
    return person;
  }

  addCareNetworkMember(input: CareNetworkInput, actor: ProviderContext, context: ClinicalExecutionContext) {
    assertPermission(actor, "edit_patient");
    const patient = requirePatient(input.patientId);
    if (!input.name?.trim()) throw new Error("A care network member needs a name.");

    const member = PatientAdministrationRepository.addCareNetworkMember({
      ...input,
      name: input.name.trim(),
    });

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "patient_care_network_added",
      patientId: input.patientId,
      description: `Added ${member.role} ${member.name} to ${patient.name}'s care network.`,
      metadata: { ...meta(context), careNetworkId: member.id },
    });
    return member;
  }

  updateCareNetworkMember(
    recordId: string,
    patch: CareNetworkPatch,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "edit_patient");
    const existing = PatientAdministrationRepository.getCareNetworkMember(recordId);
    if (!existing) throw new Error(`Care network member not found: ${recordId}`);

    const member = PatientAdministrationRepository.updateCareNetworkMember(recordId, patch);
    if (!member) throw new Error(`Care network member not found: ${recordId}`);

    AuditRepository.log({
      ...auditActor(actor),
      eventType: "patient_care_network_updated",
      patientId: member.patientId,
      description: `Updated ${member.role} ${member.name} in the care network.`,
      metadata: { ...meta(context), careNetworkId: member.id, previousStatus: existing.status, status: member.status },
    });
    return member;
  }
}

export const patientAdministrationService = new PatientAdministrationService();
