import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("order stage and authorization replays do not duplicate legal audit events", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-order-idempotency-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { AuditRepository }, { OrderRepository }] =
      await Promise.all([
        import("../app/server/actions/clinical-action-gateway"),
        import("../app/server/repositories/audit-repository"),
        import("../app/server/repositories/order-repository"),
      ]);

    const provider = {
      userId: "idempotency-provider",
      displayName: "Synthetic Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "order-idempotency-test" };
    const patientId = "order-idempotency-patient";
    const otherPatientId = "order-idempotency-other";
    const orderId = "order-idempotency-lab";

    const createPatient = (id: string, mrn: string, name: string) =>
      ClinicalActionGateway.execute({
        actor: provider,
        context,
        action: {
          type: "create_patient",
          payload: {
            id,
            name,
            initials: "SP",
            dob: "01/01/1990",
            age: 36,
            pronouns: "they/them",
            mrn,
            status: "Established",
            allergies: [],
            diagnoses: [],
            meds: [],
            vitals: {},
            lastVisit: "Initial",
            nextVisit: "4 weeks",
          },
        },
      });

    await createPatient(patientId, "IDEMP-001", "Synthetic Patient");
    await createPatient(otherPatientId, "IDEMP-002", "Synthetic Other");

    const stageAction = {
      type: "stage_order" as const,
      payload: {
        id: orderId,
        patientId,
        orderType: "lab" as const,
        name: "Synthetic CMP",
        details: {
          testName: "Synthetic CMP",
          targetFacility: "Synthetic Lab",
        },
      },
    };

    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientId,
      action: stageAction,
    });
    assert.equal(OrderRepository.getById(orderId)?.status, "staged");

    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientId,
      action: {
        type: "authorize_order",
        payload: {
          orderId,
          authMetadata: { authorizationSource: "synthetic-test" },
        },
      },
    });
    assert.equal(OrderRepository.getById(orderId)?.status, "authorized");

    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientId,
      action: stageAction,
    });
    assert.equal(OrderRepository.getById(orderId)?.status, "authorized");

    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: patientId,
      action: {
        type: "authorize_order",
        payload: {
          orderId,
          authMetadata: { authorizationSource: "synthetic-replay" },
        },
      },
    });
    assert.equal(OrderRepository.getById(orderId)?.status, "authorized");

    const audit = AuditRepository.getRecent(100, patientId);
    assert.equal(
      audit.filter((entry) => entry.eventType === "order_staged").length,
      1,
      "re-staging an already authorized order must not create another stage audit event",
    );
    assert.equal(
      audit.filter((entry) => entry.eventType === "order_authorized").length,
      1,
      "re-authorizing an already authorized order must not create another authorization audit event",
    );

    const stored = OrderRepository.getById(orderId);
    assert.equal(stored?.status, "authorized");
    assert.equal(stored?.details.authorizationSource, "synthetic-test");

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: provider,
        context,
        expectedPatientId: otherPatientId,
        action: stageAction,
      }),
      /Patient binding mismatch/i,
    );
  } finally {
    process.chdir(originalCwd);
  }
});
