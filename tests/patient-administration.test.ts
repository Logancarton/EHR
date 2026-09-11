import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import { ageFromDateOfBirth, displayPatientName, mayContactBy } from "../app/domain/patient-administration";

/**
 * The patient administrative foundation (roadmap phase P2).
 *
 * The clinical half of a chart already had a normalized home. This covers the rest
 * a practice needs to operate: who the person is, how to reach them, who may be
 * contacted about them and what each of those people may be told.
 */

test("age is derived from date of birth, never stored", () => {
  const now = new Date("2026-09-11T12:00:00.000Z");

  assert.equal(ageFromDateOfBirth("1992-04-18", now), 34);
  assert.equal(ageFromDateOfBirth("04/18/1992", now), 34, "the intake/fixture format parses too");

  // The bug a stored column could not avoid: the day before a birthday and the day
  // after are different ages, and nothing writes to the row in between.
  assert.equal(ageFromDateOfBirth("1992-09-12", now), 33, "not yet had this year's birthday");
  assert.equal(ageFromDateOfBirth("1992-09-11", now), 34, "birthday today");
  assert.equal(ageFromDateOfBirth("1992-09-10", now), 34);

  assert.equal(ageFromDateOfBirth("", now), undefined);
  assert.equal(ageFromDateOfBirth("not a date", now), undefined);
  assert.equal(ageFromDateOfBirth("2099-01-01", now), undefined, "a future birth date yields no age");
});

test("the patient is called what they asked to be called", () => {
  assert.equal(displayPatientName({ legalName: "Margaret Chen", preferredName: "Maggie" }), "Maggie");
  assert.equal(displayPatientName({ legalName: "Margaret Chen" }), "Margaret Chen");
  assert.equal(
    displayPatientName({ legalName: "Margaret Chen", preferredName: "   " }),
    "Margaret Chen",
    "blank is not a preferred name",
  );
});

test("an unanswered contact permission is not consent", () => {
  assert.equal(mayContactBy(true), true);
  assert.equal(mayContactBy(false), false);
  assert.equal(
    mayContactBy(undefined),
    false,
    "nobody has asked whether a voicemail about psychiatric care is welcome, so none is left",
  );
});

test("identity, contact, related people and care network persist and stay patient-bound", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-patient-admin-"));
  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";

  try {
    const [{ ClinicalActionGateway }, { PatientRepository }, { PatientAdministrationRepository }, { AuditRepository }] =
      await Promise.all([
        import("../app/server/actions/clinical-action-gateway"),
        import("../app/server/repositories/patient-repository"),
        import("../app/server/repositories/patient-administration-repository"),
        import("../app/server/repositories/audit-repository"),
      ]);

    await grantSyntheticOrganizationAccess(["admin-provider"]);
    const actor = {
      userId: "admin-provider",
      displayName: "Admin Provider",
      credentials: "MD",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-patient-administration" };

    const createPatient = (id: string, mrn: string, name: string, dob: string) =>
      ClinicalActionGateway.execute({
        actor,
        context,
        action: {
          type: "create_patient",
          payload: {
            id,
            name,
            initials: name.split(" ").map((part) => part[0]).join(""),
            dob,
            age: 0,
            pronouns: "they/them",
            mrn,
            status: "New Patient",
            allergies: [],
            diagnoses: [],
            meds: [],
            vitals: {},
            lastVisit: "Initial Intake",
            nextVisit: "Scheduled",
            identity: { preferredName: "Sam", preferredLanguage: "Spanish", recordStatus: "active" },
            contact: { mobilePhone: "555-0100", allowVoicemail: false, allowSms: true },
          },
        },
      });

    const patient = (await createPatient("admin-a", "ADM-A", "Samuel Ortiz", "2009-05-02")) as any;

    // ---- identity and contact round-trip ----------------------------------
    assert.equal(patient.identity.preferredName, "Sam");
    assert.equal(patient.identity.preferredLanguage, "Spanish");
    assert.equal(patient.identity.recordStatus, "active");
    assert.equal(patient.contact.mobilePhone, "555-0100");
    assert.equal(patient.contact.allowVoicemail, false);
    assert.equal(patient.contact.allowSms, true);
    assert.equal(
      patient.contact.allowEmail,
      undefined,
      "a permission nobody was asked about stays unknown rather than defaulting to no",
    );
    assert.equal(patient.age, ageFromDateOfBirth("2009-05-02"), "age comes from the date of birth");

    // ---- duplicate MRN is refused ------------------------------------------
    await assert.rejects(
      () => createPatient("admin-b", "ADM-A", "Other Person", "1980-01-01"),
      /already belongs to another patient/,
      "two charts under one MRN cannot be safely merged later, so the collision is refused",
    );

    // ---- a chart needs enough identity to be findable -----------------------
    await assert.rejects(
      () => createPatient("admin-c", "ADM-C", "   ", "1980-01-01"),
      /needs a legal name/,
    );

    // ---- related people, with independent disclosure scope -----------------
    const guardian = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "admin-a",
      action: {
        type: "add_related_person",
        payload: {
          patientId: "admin-a",
          role: "guardian",
          relationship: "Mother",
          name: "Elena Ortiz",
          phone: "555-0111",
          consentScope: "full",
          priority: 1,
        },
      },
    })) as any;

    const school = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "admin-a",
      action: {
        type: "add_related_person",
        payload: {
          patientId: "admin-a",
          role: "authorized-contact",
          relationship: "School counsellor",
          name: "R. Patel",
          consentScope: "scheduling",
          priority: 2,
        },
      },
    })) as any;

    const people = PatientAdministrationRepository.listRelatedPeople("admin-a");
    assert.equal(people.length, 2, "an adolescent chart routinely carries more than one contact");
    assert.deepEqual(
      people.map((person) => person.consentScope),
      ["full", "scheduling"],
      "each person carries their own disclosure scope; the role does not imply it",
    );

    // ---- withdrawing disclosure is recorded, not erased ---------------------
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "admin-a",
      action: {
        type: "update_related_person",
        payload: { recordId: school.id, patch: { consentScope: "none", status: "inactive" } },
      },
    });

    assert.equal(
      PatientAdministrationRepository.listRelatedPeople("admin-a").length,
      1,
      "a retired contact leaves the active list",
    );
    assert.equal(
      PatientAdministrationRepository.listRelatedPeople("admin-a", true).length,
      2,
      "but the record of who was authorised, and when that changed, survives",
    );

    const scopeAudit = AuditRepository.getRecent(100, "admin-a").find(
      (entry: any) => entry.eventType === "patient_related_person_updated",
    ) as any;
    assert.ok(scopeAudit, "a disclosure change is auditable");
    assert.match(scopeAudit.description, /scheduling to none/);

    // ---- care network ------------------------------------------------------
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "admin-a",
      action: {
        type: "add_care_network_member",
        payload: {
          patientId: "admin-a",
          role: "pcp",
          name: "Dr. Aisha Rahman",
          organization: "Northside Family Medicine",
          phone: "555-0130",
          npi: "1234567890",
        },
      },
    });
    const network = PatientAdministrationRepository.listCareNetwork("admin-a");
    assert.equal(network.length, 1);
    assert.equal(network[0].role, "pcp");
    assert.equal(network[0].npi, "1234567890");

    // ---- patient binding ---------------------------------------------------
    await createPatient("admin-d", "ADM-D", "Unrelated Patient", "1975-03-03");
    await assert.rejects(
      () =>
        ClinicalActionGateway.execute({
          actor,
          context,
          expectedPatientId: "admin-d",
          action: {
            type: "update_related_person",
            payload: { recordId: guardian.id, patch: { phone: "555-9999" } },
          },
        }),
      /binding|patient/i,
      "a contact belonging to one chart cannot be edited from another chart's context",
    );

    // ---- identity edits merge rather than blank the other section ----------
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "admin-a",
      action: {
        type: "update_patient",
        payload: { patientId: "admin-a", updates: { identity: { preferredLanguage: "English" } } },
      },
    });
    const afterEdit = PatientRepository.getById("admin-a")!;
    assert.equal(afterEdit.identity.preferredLanguage, "English");
    assert.equal(
      afterEdit.identity.preferredName,
      "Sam",
      "editing one identity field must not erase the ones the form did not send",
    );
    assert.equal(afterEdit.contact.mobilePhone, "555-0100", "and must not erase the contact section");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
  }
});

test("cross-organization access cannot reach another practice's administrative record", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-patient-admin-access-"));
  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";

  try {
    const [{ ClinicalActionGateway }, { assignSyntheticPatients }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("./helpers/organization-access"),
    ]);

    const homeOrg = await grantSyntheticOrganizationAccess(["home-provider"], { organizationId: "org-home" });
    await grantSyntheticOrganizationAccess(["rival-provider"], { organizationId: "org-rival" });

    const homeActor = {
      userId: "home-provider",
      displayName: "Home Provider",
      credentials: "MD",
      role: "provider" as const,
    };
    const rivalActor = {
      userId: "rival-provider",
      displayName: "Rival Provider",
      credentials: "MD",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-patient-administration-access" };

    await ClinicalActionGateway.execute({
      actor: homeActor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: "home-patient",
          name: "Home Patient",
          initials: "HP",
          dob: "1990-01-01",
          age: 0,
          pronouns: "they/them",
          mrn: "HOME-1",
          status: "Established",
          allergies: [],
          diagnoses: [],
          meds: [],
          vitals: {},
          lastVisit: "Initial",
          nextVisit: "Scheduled",
        },
      },
    });
    await assignSyntheticPatients(["home-patient"], homeOrg);

    await assert.rejects(
      () =>
        ClinicalActionGateway.execute({
          actor: rivalActor,
          context,
          expectedPatientId: "home-patient",
          action: {
            type: "add_related_person",
            payload: { patientId: "home-patient", role: "guardian", name: "Someone Else" },
          },
        }),
      /access|permitted|not/i,
      "another practice cannot add a contact to a chart it may not reach",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
  }
});
