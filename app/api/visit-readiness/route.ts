import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext, hasPermission } from "../../server/auth/provider-context";
import { assertPatientAccess } from "../../server/auth/patient-access";
import { clinicalActionError } from "../../server/http/clinical-http";
import { getDatabase } from "../../server/db/connection";
import { EncounterRepository } from "../../server/repositories/encounter-repository";
import { NoteReferenceRepository } from "../../server/repositories/note-reference-repository";
import { PatientAdministrationRepository } from "../../server/repositories/patient-administration-repository";
import { careCompletionService } from "../../server/services/care-completion-service";
import { billingSetupService } from "../../server/services/billing-setup-service";
import { ClinicalMonitoringPolicyService } from "../../server/services/clinical-monitoring-policy-service";
import { ClinicalRecordRepository } from "../../server/repositories/clinical-record-repository";
import { MeasurementRepository } from "../../server/repositories/measurement-repository";
import { calculateMonitoringStatus, monitoringEvidenceFromRecord } from "../../lib/clinical-protocols";
import { coverageReadiness, type VisitReadinessServerView } from "../../domain/visit-readiness";

/**
 * The chart-side half of the note's readiness panel (D-100).
 *
 * One read that assembles, for one patient, the facts the draft cannot see from
 * the browser: open care loops, coverage completeness, the encounter's coded
 * diagnosis links, and whether the practice has set this visit type up to bill.
 *
 * Each part fails on its own and says so. A coverage read that throws does not
 * blank the labs, and none of them is ever reported as "nothing to do" because it
 * could not be read. Patient access is asserted before anything is read, and an
 * encounter id is honoured only when it belongs to that patient.
 */
function partError(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "Could not be read." };
}

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId")?.trim();
    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }
    assertPatientAccess(actor, patientId);
    if (!hasPermission(actor, "read_clinical")) {
      throw new Error(`User ${actor.userId} lacks permission: read_clinical`);
    }

    const encounterId = searchParams.get("encounterId")?.trim() || null;
    let diagnosis: VisitReadinessServerView["diagnosis"] = null;
    if (encounterId) {
      const encounter = EncounterRepository.getById(encounterId);
      if (encounter && encounter.patientId !== patientId) {
        throw new Error(
          `Patient binding mismatch: encounter ${encounterId} belongs to ${encounter.patientId}, not ${patientId}.`,
        );
      }
      if (encounter) {
        const problems = NoteReferenceRepository.listEnrichedForEncounter(encounterId).filter(
          (reference) => reference.entityType === "problem" && Boolean(reference.code),
        );
        const chart = getDatabase()
          .prepare(
            "SELECT COUNT(*) AS total FROM patient_problems WHERE patient_id = ? AND status = 'active' AND code IS NOT NULL AND code != ''",
          )
          .get(patientId) as { total: number };
        diagnosis = {
          confirmedCoded: problems.filter((reference) => reference.status === "confirmed").length,
          proposedCoded: problems.filter((reference) => reference.status === "proposed").length,
          chartCodedProblems: Number(chart?.total ?? 0),
        };
      }
    }

    let care: VisitReadinessServerView["care"];
    try {
      care = { items: careCompletionService.patientItems(actor, patientId) };
    } catch (error) {
      care = partError(error);
    }

    // Medication surveillance is D-099's: the same effective policy and the same
    // evidence mapping the chart Overview uses, so the two cannot disagree. A
    // policy that cannot be read is reported, never replaced by system defaults.
    let monitoring: VisitReadinessServerView["monitoring"];
    try {
      const policy = ClinicalMonitoringPolicyService.read(actor, patientId);
      const activeMedications = (ClinicalRecordRepository.medications(patientId) as any[])
        .filter((medication) => medication.status === "active")
        .map((medication) => medication.display_text || medication.medication_name);
      const evidence = monitoringEvidenceFromRecord(
        ClinicalRecordRepository.nonVitalObservations(patientId) as any[],
        MeasurementRepository.listVitals(patientId),
      );
      monitoring = { items: calculateMonitoringStatus(activeMedications, evidence, { protocols: policy.effectiveRules }) };
    } catch (error) {
      monitoring = partError(error);
    }

    let coverage: VisitReadinessServerView["coverage"];
    try {
      coverage = {
        findings: coverageReadiness(
          PatientAdministrationRepository.listCoverage(patientId),
          new Date().toISOString().slice(0, 10),
        ),
      };
    } catch (error) {
      coverage = partError(error);
    }

    let billing: VisitReadinessServerView["billing"];
    try {
      billing = billingSetupService.readinessContext(actor);
    } catch (error) {
      billing = partError(error);
    }

    const view: VisitReadinessServerView = {
      patientId,
      encounterId,
      resolvedAt: new Date().toISOString(),
      care,
      monitoring,
      coverage,
      diagnosis,
      billing,
    };
    return NextResponse.json({ success: true, readiness: view });
  } catch (error) {
    return clinicalActionError(error);
  }
}
