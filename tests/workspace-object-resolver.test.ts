import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("workspace object resolver finds authorized charts, document passages, notes, people, and workspaces", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-workspace-object-resolver-"));
  process.chdir(isolatedRoot);

  try {
    const defaultOrg = await grantSyntheticOrganizationAccess(["resolver-provider", "resolver-colleague"]);
    const hiddenOrg = await grantSyntheticOrganizationAccess(["hidden-owner"], { organizationId: "hidden-org" });

    const [
      { PatientRepository },
      { ClinicalRecordRepository },
      { ClinicalSearchRepository },
      { ProspectivePersonRepository },
      { resolveWorkspaceObjects },
    ] = await Promise.all([
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/clinical-search-repository"),
      import("../app/server/repositories/prospective-person-repository"),
      import("../app/server/ai/workspace-object-resolver"),
    ]);

    const actor = {
      userId: "resolver-provider",
      displayName: "Resolver Provider",
      role: "provider" as const,
      membershipRole: "owner" as const,
      organizationId: defaultOrg,
    };

    PatientRepository.create({
      id: "savannah-search",
      name: "Savannah Search",
      initials: "SS",
      dob: "2000-01-01",
      age: 26,
      pronouns: "she/her",
      mrn: "SEARCH-001",
      status: "Established",
      allergies: [],
      diagnoses: [],
      meds: [],
      vitals: {},
      lastVisit: "2026-09-01",
      nextVisit: "Unscheduled",
    }, defaultOrg);

    PatientRepository.create({
      id: "hidden-search",
      name: "Hidden Search",
      initials: "HS",
      dob: "2000-01-01",
      age: 26,
      pronouns: "they/them",
      mrn: "HIDDEN-001",
      status: "Established",
      allergies: [],
      diagnoses: [],
      meds: [],
      vitals: {},
      lastVisit: "Initial",
      nextVisit: "Unscheduled",
    }, hiddenOrg);

    const qbt = ClinicalRecordRepository.createDocument({
      patientId: "savannah-search",
      documentType: "adhd-testing",
      title: "QbTest diagnostic report",
      mimeType: "text/plain",
      contentText: "Testing completed. Cardiology clearance received before medication planning. QbTest showed elevated activity.",
    }, actor);

    ClinicalRecordRepository.createDocument({
      patientId: "hidden-search",
      documentType: "outside-record",
      title: "Private cardiology report",
      mimeType: "text/plain",
      contentText: "restricted clearance content",
    }, { userId: "hidden-owner", displayName: "Hidden Owner", role: "provider" as const });

    ClinicalSearchRepository.indexEncounter({
      id: "savannah-encounter",
      patientId: "savannah-search",
      date: "2026-09-30",
      chiefComplaint: "Follow-up",
      intervalHistory: "Patient reports intermittent dizziness while standing.",
      treatmentResponse: "",
      assessment: "Dizziness discussed; PCP follow-up planned.",
      plan: "Review PCP findings.",
    } as any, "Savannah Search");

    ProspectivePersonRepository.create({
      organizationId: defaultOrg,
      name: "Taylor Intake",
      email: "synthetic@example.test",
    });
