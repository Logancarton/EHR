import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import {
  ageFromDateOfBirth,
  coveragePriorityLabel,
  displayPatientName,
  mayContactBy,
  preferredPharmacy,
  primaryCoverage,
  type CoveragePolicy,
  type PatientPharmacy,
} from "../app/domain/patient-administration";

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

test("the policy billed first, and the pharmacy prescribed to, are explicit choices", () => {
  const policy = (id: string, priority: number, status: CoveragePolicy["status"] = "active"): CoveragePolicy => ({
    id,
    patientId: "p",
    payerName: id,
    coverageType: "commercial",
    isSelfPay: false,
    priority,
    status,
  });

  assert.equal(
    primaryCoverage([policy("secondary", 2), policy("primary", 1)])?.id,
    "primary",
    "billing order comes from the recorded priority, not from insert order",
  );
  assert.equal(
    primaryCoverage([policy("terminated", 1, "terminated"), policy("current", 2)])?.id,
    "current",
    "a terminated policy is never billed, whatever its priority was",
  );
  assert.equal(primaryCoverage([]), undefined);
  assert.equal(primaryCoverage([policy("old", 1, "inactive")]), undefined);

  assert.equal(coveragePriorityLabel(1), "Primary");
  assert.equal(coveragePriorityLabel(2), "Secondary");
  assert.equal(coveragePriorityLabel(3), "Tertiary");
  assert.equal(coveragePriorityLabel(4), "Priority 4");

  const pharmacy = (id: string, priority: number, status: PatientPharmacy["status"] = "active"): PatientPharmacy => ({
    pharmacyId: id,
    name: id,
    priority,
    status,
  });

  assert.equal(preferredPharmacy([pharmacy("alt", 2), pharmacy("main", 1)])?.pharmacyId, "main");
  assert.equal(
    preferredPharmacy([pharmacy("retired", 1, "inactive"), pharmacy("alt", 2)])?.pharmacyId,
    "alt",
    "a retired pharmacy is not a prescribing destination",
  );
  assert.equal(preferredPharmacy([]), undefined);
});

test("coverage and pharmacy persist, and self-pay is a state rather than an absence", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-coverage-"));
  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";

  try {
    const [{ ClinicalActionGateway }, { PatientAdministrationRepository }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/patient-administration-repository"),
    ]);

    await grantSyntheticOrganizationAccess(["coverage-provider"]);
    const actor = {
      userId: "coverage-provider",
      displayName: "Coverage Provider",
      credentials: "MD",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-coverage" };
    const patientId = "coverage-patient";

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: patientId,
          name: "Coverage Patient",
          initials: "CP",
          dob: "1988-02-02",
          age: 0,
          pronouns: "they/them",
          mrn: "COV-1",
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

    // Primary and secondary, deliberately added in the wrong order.
    const secondary = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "add_insurance",
        payload: {
          patientId,
          payerName: "Second Payer",
          memberId: "S-2",
          coveragePriority: 2,
          subscriberName: "A Parent",
          subscriberDob: "1960-06-06",
          relationship: "child",
        },
      },
    })) as any;

    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "add_insurance",
        payload: { patientId, payerName: "First Payer", memberId: "F-1", coveragePriority: 1 },
      },
    });

    const coverage = PatientAdministrationRepository.listCoverage(patientId);
    assert.equal(coverage.length, 2);
    assert.equal(
      primaryCoverage(coverage)?.payerName,
      "First Payer",
      "the policy billed first is the one marked primary, not the one entered first",
    );
    const child = coverage.find((policy) => policy.memberId === "S-2")!;
    assert.equal(child.subscriberDob, "1960-06-06", "payers need the subscriber DOB when it is not the patient");
    assert.equal(child.relationship, "child");

    // Terminating keeps the policy readable: a claim filed last month went somewhere.
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "update_insurance",
        payload: { recordId: secondary.id, patch: { status: "terminated", terminationDate: "2026-09-01" } },
      },
    });
    const afterTermination = PatientAdministrationRepository.listCoverage(patientId);
    assert.equal(afterTermination.length, 2, "a terminated policy stays on the record");
    assert.equal(afterTermination.find((policy) => policy.id === secondary.id)?.status, "terminated");

    // Self-pay is its own coverage state.
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "add_insurance",
        payload: { patientId, payerName: "Self-pay", coverageType: "self-pay", isSelfPay: true, coveragePriority: 3 },
      },
    });
    const selfPay = PatientAdministrationRepository.listCoverage(patientId).find((policy) => policy.isSelfPay);
    assert.ok(selfPay, "self-pay is recorded rather than represented by an empty coverage list");
    assert.equal(selfPay?.coverageType, "self-pay");

    // ---- pharmacy ----------------------------------------------------------
    const main = (await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "add_pharmacy",
        payload: { patientId, name: "Market St Pharmacy", ncpdpId: "1234567", phone: "555-0180", priority: 1 },
      },
    })) as any;

    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: { type: "add_pharmacy", payload: { patientId, name: "Mail Order Rx", priority: 2 } },
    });

    const pharmacies = PatientAdministrationRepository.listPharmacies(patientId);
    assert.equal(pharmacies.length, 2);
    assert.equal(preferredPharmacy(pharmacies)?.name, "Market St Pharmacy");
    assert.notEqual(
      preferredPharmacy(pharmacies)?.pharmacyId,
      "1234567",
      "the NCPDP directory id is not our key for the pharmacy",
    );
    assert.equal(preferredPharmacy(pharmacies)?.ncpdpId, "1234567");

    // Promoting the alternate demotes the incumbent, so the chart never holds two
    // "send here first" entries.
    const alternate = pharmacies.find((pharmacy) => pharmacy.name === "Mail Order Rx")!;
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "update_patient_pharmacy",
        payload: { patientId, pharmacyId: alternate.pharmacyId, patch: { priority: 1 } },
      },
    });
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "update_patient_pharmacy",
        payload: { patientId, pharmacyId: main.id, patch: { priority: 2 } },
      },
    });
    assert.equal(
      preferredPharmacy(PatientAdministrationRepository.listPharmacies(patientId))?.name,
      "Mail Order Rx",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
  }
});

test("a brand-new database seeds and reads back derived ages", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  // Deliberately a directory nothing has touched: the schema, every migration and the
  // seed all run here for the first time. A column added to one and forgotten in
  // another only shows up on a first install, which is the worst place to find it.
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-fresh-install-"));
  process.chdir(isolatedRoot);
  env.NODE_ENV = "development";

  try {
    const { PatientRepository } = await import("../app/server/repositories/patient-repository");
    const { getDatabase } = await import("../app/server/db/connection");
    getDatabase();

    const roster = PatientRepository.getAll();
    assert.ok(roster.length > 0, "a first install seeds a usable synthetic roster");

    const columns = (
      getDatabase().prepare(`PRAGMA table_info(patients)`).all() as Array<{ name?: unknown }>
    ).map((entry) => String(entry.name));
    assert.ok(!columns.includes("age"), "age is not a stored column on a fresh install");
    assert.ok(columns.includes("preferred_name"), "the administrative columns exist");
    assert.ok(columns.includes("allow_voicemail"));

    for (const patient of roster) {
      assert.equal(
        patient.age,
        ageFromDateOfBirth(patient.dob),
        `${patient.name}'s age is derived from their date of birth`,
      );
    }
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
  }
});
