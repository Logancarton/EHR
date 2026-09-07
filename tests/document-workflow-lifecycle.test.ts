import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("document lifecycle is ordered, patient-bound, versioned, and provenance-backed", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-document-workflow-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { PatientRepository },
      { ClinicalRecordRepository },
      { DocumentWorkflowRepository },
      { ClinicalActionGateway },
    ] = await Promise.all([
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/document-workflow-repository"),
      import("../app/server/actions/clinical-action-gateway"),
    ]);

    const actor = { userId:"doc-test-provider", displayName:"Document Test Provider", role:"provider" as const };
    const context = { source:"api" as const, requestId:"document-workflow-test" };

    for (const [id, name, mrn] of [
      ["doc-patient-a", "Document Patient A", "DOC-A"],
      ["doc-patient-b", "Document Patient B", "DOC-B"],
    ] as const) {
      PatientRepository.create({
        id, name, initials:name.endsWith("A") ? "DA" : "DB", dob:"01/01/1990", age:36,
        pronouns:"they/them", mrn, status:"Established", allergies:[], diagnoses:[], meds:[], vitals:{},
        lastVisit:"Initial", nextVisit:"Unscheduled",
      });
    }

    const source = ClinicalRecordRepository.createDocument({
      patientId:"doc-patient-a",
      documentType:"outside-record",
      title:"Outside psychiatric evaluation",
      mimeType:"application/pdf",
      storageKey:"synthetic/source.pdf",
    }, actor, { system:"external-records", ref:"external/source" });

    const replacement = ClinicalRecordRepository.createDocument({
      patientId:"doc-patient-a",
      documentType:"outside-record",
      title:"Updated psychiatric evaluation",
      mimeType:"application/pdf",
      storageKey:"synthetic/replacement.pdf",
    }, actor, { system:"external-records", ref:"external/replacement" });

    const initial = ClinicalRecordRepository.documents("doc-patient-a").find((doc) => doc.id === source.id);
    assert.equal(initial?.workflow_status, "received");

    await assert.rejects(
      () => ClinicalActionGateway.execute({
        action:{ type:"transition_document_workflow", payload:{ documentId:source.id, toStatus:"reviewed" } },
        actor, context, expectedPatientId:"doc-patient-a",
      }),
      /Invalid document workflow transition/,
      "workflow cannot skip needs-review state",
    );

    await assert.rejects(
      () => ClinicalActionGateway.execute({
        action:{ type:"transition_document_workflow", payload:{ documentId:source.id, toStatus:"needs_review" } },
        actor, context, expectedPatientId:"doc-patient-b",
      }),
      /Patient binding mismatch/,
      "stale or wrong-patient chart cannot mutate the document",
    );

    for (const toStatus of ["needs_review", "reviewed", "filed"] as const) {
      await ClinicalActionGateway.execute({
        action:{ type:"transition_document_workflow", payload:{ documentId:source.id, toStatus } },
        actor, context, expectedPatientId:"doc-patient-a",
      });
    }

    await ClinicalActionGateway.execute({
      action:{
        type:"transition_document_workflow",
        payload:{ documentId:source.id, toStatus:"superseded", supersededByDocumentId:replacement.id },
      },
      actor, context, expectedPatientId:"doc-patient-a",
    });

    const final = ClinicalRecordRepository.documents("doc-patient-a").find((doc) => doc.id === source.id) as any;
    assert.equal(final.workflow_status, "superseded");
    assert.equal(final.superseded_by_document_id, replacement.id);
    assert.equal(final.reviewed_by, actor.displayName);
    assert.ok(final.reviewed_at);
    assert.equal(final.filed_by, actor.displayName);
    assert.ok(final.filed_at);

    const events = DocumentWorkflowRepository.events(source.id);
    assert.deepEqual(events.map((event: any) => event.to_status), ["needs_review", "reviewed", "filed", "superseded"]);

    const versions = ClinicalRecordRepository.versions("document", source.id);
    assert.ok(versions.filter((version: any) => version.operation === "workflow_transition").length >= 4);
    const provenance = ClinicalRecordRepository.provenance("document", source.id);
    assert.ok(provenance.filter((event: any) => event.activity === "workflow_transition").length >= 4);
  } finally {
    process.chdir(originalCwd);
  }
});
