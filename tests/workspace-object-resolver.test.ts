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
    }, { userId: "hidden-owner", displayName: "Hidden Owner" });

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

    const qbtResults = resolveWorkspaceObjects({ query: "find Savannah Search QbTest", actor });
    const qbtTarget = qbtResults.find((target) => target.id === qbt.id);
    assert.ok(qbtTarget, "document title search should return the patient's exact document");
    assert.equal(qbtTarget?.navigation.kind, "patient");
    if (qbtTarget?.navigation.kind === "patient") {
      assert.equal(qbtTarget.navigation.patientId, "savannah-search");
      assert.equal(qbtTarget.navigation.section, "documents");
      assert.equal(qbtTarget.navigation.documentId, qbt.id);
    }

    const passageResults = resolveWorkspaceObjects({
      query: "find file that mentions cardiology clearance",
      actor,
    });
    const passage = passageResults.find((target) => target.id === qbt.id);
    assert.equal(passage?.kind, "document_passage");
    assert.match(passage?.snippet || "", /cardiology clearance/i);
    assert.equal(passage?.navigation.kind, "patient");
    if (passage?.navigation.kind === "patient") {
      assert.equal(passage.navigation.documentId, qbt.id);
      assert.equal(passage.navigation.documentVersionNumber, 1);
      assert.deepEqual(passage.navigation.documentSearchTerms, ["cardiology", "clearance"]);
    }
    assert.ok(
      passageResults.every((target) => target.id !== "hidden-search" && !/private cardiology/i.test(target.label)),
      "cross-patient search must not reveal inaccessible charts or documents",
    );

    const encounterResults = resolveWorkspaceObjects({
      query: "find Savannah Search note mentioning dizziness",
      actor,
    });
    const encounter = encounterResults.find((target) => target.kind === "encounter" && target.id === "savannah-encounter");
    assert.ok(encounter, "encounter full-text search should return matching chart text");
    assert.equal(encounter?.navigation.kind, "patient");
    if (encounter?.navigation.kind === "patient") {
      assert.equal(encounter.navigation.section, "history");
    }

    const chartResults = resolveWorkspaceObjects({ query: "find Savannah Search chart", actor });
    assert.ok(chartResults.some((target) => target.kind === "patient" && target.id === "savannah-search"));

    const prospectResults = resolveWorkspaceObjects({ query: "find Taylor Intake person", actor });
    assert.ok(prospectResults.some((target) => target.kind === "prospective_person" && target.label === "Taylor Intake"));

    const staffResults = resolveWorkspaceObjects({ query: "find Synthetic resolver-colleague staff", actor });
    assert.ok(staffResults.some((target) => target.kind === "staff" && target.id === "resolver-colleague"));

    const calendarResults = resolveWorkspaceObjects({ query: "open calendar workspace", actor });
    assert.ok(
      calendarResults.some(
        (target) => target.kind === "workspace" && target.navigation.kind === "view" && target.navigation.view === "calendar",
      ),
    );

    const taskResults = resolveWorkspaceObjects({ query: "open tasks", actor });
    assert.ok(
      taskResults.some(
        (target) => target.kind === "workspace" && target.navigation.kind === "module" && target.navigation.module === "tasks",
      ),
      "non-launcher operational workspaces are still navigable by the object resolver",
    );

    const activeMedicationResults = resolveWorkspaceObjects({
      query: "open meds",
      actor,
      activePatientId: "savannah-search",
    });
    assert.ok(
      activeMedicationResults.some(
        (target) =>
          target.kind === "patient"
          && target.id === "savannah-search"
          && target.navigation.kind === "patient"
          && target.navigation.section === "medications",
      ),
      "section-only navigation stays bound to the active chart when no other patient is named",
    );

    const hiddenResults = resolveWorkspaceObjects({ query: "find Hidden Search chart", actor });
    assert.ok(hiddenResults.every((target) => target.kind !== "patient" || target.id !== "hidden-search"));
  } finally {
    process.chdir(originalCwd);
  }
});
