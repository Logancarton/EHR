import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { EPrescribingAdapter, PrescriptionTransmissionResult } from "../app/adapters";
import type { IntegrationSecretProvider } from "../app/server/integrations/secret-provider";

test("Phase 4K adds durable integration configuration, secret references, migrations, and conservative transport reliability", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-phase-4k-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { applyMigrations, APPLICATION_MIGRATIONS },
      { IntegrationConfigurationService },
      { IntegrationHealthService },
      { IntegrationConfigurationRepository },
      { IntegrationOutcomeUncertainError },
      { OrderRepository },
      { PatientRepository },
      { AuditRepository },
      { PrescriptionTransactionRepository },
      { prescriptionTransactionService },
      { OrderTransmissionService },
      adapters,
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/db/migrations"),
      import("../app/server/services/integration-configuration-service"),
      import("../app/server/services/integration-health-service"),
      import("../app/server/repositories/integration-configuration-repository"),
      import("../app/server/integrations/reliability"),
      import("../app/server/repositories/order-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/repositories/prescription-transaction-repository"),
      import("../app/server/services/prescription-transaction-service"),
      import("../app/server/services/order-transmission-service"),
      import("../app/adapters"),
    ]);

    const provider = {
      userId: "phase-4k-provider",
      displayName: "Synthetic Infrastructure Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const staff = {
      userId: "phase-4k-staff",
      displayName: "Synthetic Staff",
      role: "staff" as const,
    };
    const configService = new IntegrationConfigurationService();
    const secretValue = "PHASE4K-RAW-CLIENT-SECRET-MUST-NEVER-PERSIST";
    const secretRef = "prescribing/synthetic/production";
    const secretProvider: IntegrationSecretProvider = {
      async getSecret(ref) { return ref === secretRef ? secretValue : undefined; },
    };
    const missingSecretProvider: IntegrationSecretProvider = {
      async getSecret() { return undefined; },
    };

    assert.throws(
      () => configService.save({
        id: "synthetic-prescribing-production",
        adapterId: "synthetic-production-adapter",
        purpose: "prescribing",
        environment: "production",
        enabled: true,
        nonSecretConfig: { clientSecret: secretValue },
      }, provider),
      /secret-like key/i,
    );
    assert.throws(
      () => configService.save({
        id: "staff-cannot-configure",
        adapterId: "synthetic-production-adapter",
        purpose: "prescribing",
        environment: "production",
        enabled: false,
      }, staff),
      /lacks permission: manage_integrations/i,
    );

    const input = {
      id: "synthetic-prescribing-production",
      adapterId: "synthetic-production-adapter",
      purpose: "prescribing" as const,
      environment: "production" as const,
      enabled: true,
      nonSecretConfig: { endpointProfile: "synthetic-certified-endpoint", timeoutMs: 5000 },
      secretRefs: { clientSecret: secretRef },
    };
    const created = configService.save(input, provider);
    assert.equal(created.created, true);
    assert.equal(created.configuration.version, 1);
    const replay = configService.save(input, provider);
    assert.equal(replay.changed, false);
    assert.equal(replay.configuration.version, 1, "semantic replay must not create a new configuration version");
    assert.throws(
      () => configService.save({ ...input, adapterId: "another-adapter" }, provider),
      /cannot be rebound/i,
    );

    const db = getDatabase();
    const rawConfig = db.prepare(`SELECT * FROM integration_configurations WHERE id = ?`).get(input.id) as any;
    assert.ok(rawConfig);
    assert.equal(rawConfig.secret_refs_json.includes(secretRef), true, "only the secret reference is durable");
    assert.equal(JSON.stringify(rawConfig).includes(secretValue), false, "raw secret material must not be durable");

    await assert.rejects(
      () => configService.assertReadyForAdapter(input.adapterId, "prescribing", missingSecretProvider),
      /missing required secret material/i,
    );
    await configService.assertReadyForAdapter(input.adapterId, "prescribing", secretProvider);

    const missingHealth = await new IntegrationHealthService(missingSecretProvider).list(provider);
    const health = missingHealth.find((entry) => entry.integrationId === input.id)!;
    assert.equal(health.readiness, "missing_secret");
    assert.deepEqual(health.missingSecretAliases, ["clientSecret"]);
    assert.equal(JSON.stringify(health).includes(secretRef), false);
    assert.equal(JSON.stringify(health).includes(secretValue), false);

    const migrationDb = new DatabaseSync(":memory:");
    const deterministicMigration = [{
      id: "test-001",
      description: "deterministic fixture",
      apply(target: DatabaseSync) { target.exec(`CREATE TABLE migration_fixture (id TEXT PRIMARY KEY);`); },
    }] as const;
    applyMigrations(migrationDb, deterministicMigration);
    applyMigrations(migrationDb, deterministicMigration);
    assert.equal(
      Number((migrationDb.prepare(`SELECT COUNT(*) AS n FROM schema_migrations WHERE id = 'test-001'`).get() as any).n),
      1,
    );
    assert.throws(() => applyMigrations(migrationDb, [{
      id: "test-002",
      description: "atomic failure fixture",
      apply(target: DatabaseSync) {
        target.exec(`CREATE TABLE must_rollback (id TEXT PRIMARY KEY);`);
        throw new Error("synthetic migration failure");
      },
    }]), /Database migration test-002 failed/);
    assert.equal(migrationDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='must_rollback'`).get(), undefined);
    assert.equal(migrationDb.prepare(`SELECT id FROM schema_migrations WHERE id='test-002'`).get(), undefined);
    migrationDb.close();

    const persistencePath = join(isolatedRoot, "integration-persistence.db");
    let persistenceDb = new DatabaseSync(persistencePath);
    applyMigrations(persistenceDb, [APPLICATION_MIGRATIONS[0]]);
    persistenceDb.prepare(`INSERT INTO integration_configurations (
      id, adapter_id, purpose, environment, enabled, scope_type, non_secret_config_json,
      secret_refs_json, version, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, 'prescribing', 'test', 0, 'practice', '{}', '{}', 1, 'fixture', 'fixture', ?, ?)`)
      .run("restart-proof", "restart-adapter", new Date().toISOString(), new Date().toISOString());
    persistenceDb.close();
    persistenceDb = new DatabaseSync(persistencePath);
    assert.equal((persistenceDb.prepare(`SELECT adapter_id FROM integration_configurations WHERE id='restart-proof'`).get() as any).adapter_id, "restart-adapter");
    persistenceDb.close();

    const at = new Date().toISOString();
    const patientId = "phase-4k-patient";
    db.prepare(`INSERT INTO patients (
      id, name, dob, age, mrn, status, pronouns, initials, alert,
      allergies_json, diagnoses_json, meds_json, vitals_json,
      last_visit, next_visit, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', '[]', '[]', '{}', ?, ?, ?, ?)`)
      .run(
        patientId, "Synthetic Phase 4K Patient", "01/01/1990", 36, "PHASE4K-001",
        "Established", "they/them", "PK", "Initial", "4 weeks", at, at,
      );

    let adapterCalls = 0;
    const pinMarker = "PHASE4K-EPCS-PIN-NEVER-PERSIST";
    const otpMarker = "PHASE4K-OTP-NEVER-PERSIST";
    const uncertainAdapter: EPrescribingAdapter = {
      id: input.adapterId,
      name: "Synthetic Production Adapter",
      standard: "synthetic",
      description: "test only",
      async transmitPrescriptions(_orders, auth): Promise<PrescriptionTransmissionResult> {
        adapterCalls += 1;
        assert.equal(auth.epcsPin, pinMarker);
        assert.equal(auth.otpToken, otpMarker);
        throw new IntegrationOutcomeUncertainError(`socket closed after send token=${secretValue}`);
      },
      async searchPharmacies() { return []; },
      async verifyEpcsCredentials(npi, deaNumber) {
        return {
          verified: false,
          providerNpi: npi,
          deaNumber,
          timestamp: at,
          auditToken: "",
          authMethod: "Two-Factor Push / TOTP" as const,
        };
      },
      async cancelPrescription() { return false; },
    };
    const readiness = {
      assertReadyForAdapter(adapterId: string, purpose: "prescribing" | "labs" | "communications" | "scheduling" | "billing" | "interoperability") {
        return configService.assertReadyForAdapter(adapterId, purpose, secretProvider);
      },
    };
    const transmissionService = new OrderTransmissionService({
      orders: OrderRepository,
      patients: PatientRepository,
      audit: AuditRepository,
      prescribingAdapter: uncertainAdapter,
      labAdapter: adapters.defaultLabAdapter,
      prescriptionTransactions: prescriptionTransactionService,
      integrationReadiness: readiness,
    });

    const orderId = "phase-4k-uncertain-rx";
    OrderRepository.stageOrder({
      id: orderId,
      patientId,
      type: "medication",
      name: "Synthetic Sertraline",
      details: {
        medication: "Synthetic Sertraline",
        medicationName: "Synthetic Sertraline",
        strength: "100 mg",
        dose: "100 mg",
        route: "oral",
        frequency: "daily",
        dispenseQuantity: 30,
        daysSupply: 30,
        refills: 1,
        sig: "Take one tablet daily",
        pharmacy: { name: "Synthetic Pharmacy", ncpdpId: "0000000" },
      },
      orderedBy: provider.displayName,
    });
    OrderRepository.authorize(orderId, provider.displayName, {});

    const medicationCountBefore = Number((db.prepare(`SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`).get(patientId) as any).n);
    await assert.rejects(
      () => transmissionService.transmit(
        orderId,
        { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
        provider,
        { source: "api" as const, requestId: "phase-4k-uncertain" },
      ),
      /outcome is uncertain/i,
    );
    assert.equal(adapterCalls, 1);
    assert.equal(OrderRepository.getById(orderId)?.status, "transmission_uncertain");
    const uncertainTransactions = PrescriptionTransactionRepository.getByOrder(orderId);
    assert.equal(uncertainTransactions.length, 1);
    assert.equal(uncertainTransactions[0].state, "outcome_uncertain");
    assert.equal(uncertainTransactions[0].attemptCount, 1);
    assert.equal(Number((db.prepare(`SELECT COUNT(*) AS n FROM patient_medications WHERE patient_id = ?`).get(patientId) as any).n), medicationCountBefore);

    await assert.rejects(
      () => transmissionService.transmit(
        orderId,
        { npi: "0000000000", epcsPin: pinMarker, otpToken: otpMarker },
        provider,
        { source: "api" as const, requestId: "phase-4k-blind-retry" },
      ),
      /cannot be retried until reconciled/i,
    );
    assert.equal(adapterCalls, 1, "uncertain outcome must block a blind duplicate adapter call");
    assert.equal(PrescriptionTransactionRepository.getByOrder(orderId).length, 1, "retry must not create duplicate transaction authority");

    const persistenceSurface = JSON.stringify({
      config: db.prepare(`SELECT * FROM integration_configurations`).all(),
      audits: db.prepare(`SELECT description, metadata_json FROM audit_logs`).all(),
      orders: db.prepare(`SELECT details_json FROM orders`).all(),
      transactions: db.prepare(`SELECT last_error_code, last_error_message FROM prescription_transactions`).all(),
      events: db.prepare(`SELECT metadata_json, error_code, error_message FROM prescription_transaction_events`).all(),
    });
    assert.equal(persistenceSurface.includes(secretValue), false);
    assert.equal(persistenceSurface.includes(pinMarker), false);
    assert.equal(persistenceSurface.includes(otpMarker), false);

    configService.save({ ...input, enabled: false }, provider);
    await assert.rejects(
      () => configService.assertReadyForAdapter(input.adapterId, "prescribing", secretProvider),
      /not enabled/i,
    );

    const disabledOrderId = "phase-4k-disabled-rx";
    OrderRepository.stageOrder({
      id: disabledOrderId,
      patientId,
      type: "medication",
      name: "Synthetic Disabled Rx",
      details: { medication: "Synthetic Disabled Rx" },
      orderedBy: provider.displayName,
    });
    OrderRepository.authorize(disabledOrderId, provider.displayName, {});
    await assert.rejects(
      () => transmissionService.transmit(
        disabledOrderId,
        { npi: "0000000000" },
        provider,
        { source: "api" as const, requestId: "phase-4k-disabled" },
      ),
      /not enabled/i,
    );
    assert.equal(PrescriptionTransactionRepository.getByOrder(disabledOrderId).length, 0, "disabled integration must fail before creating transport authority");
    assert.equal(adapterCalls, 1);

    const wrongAdapter: EPrescribingAdapter = { ...uncertainAdapter, id: "wrong-adapter", name: "Wrong Adapter" };
    const wrongService = new OrderTransmissionService({
      orders: OrderRepository,
      patients: PatientRepository,
      audit: AuditRepository,
      prescribingAdapter: wrongAdapter,
      labAdapter: adapters.defaultLabAdapter,
      prescriptionTransactions: prescriptionTransactionService,
      integrationReadiness: readiness,
    });
    await assert.rejects(
      () => wrongService.transmit(
        disabledOrderId,
        { npi: "0000000000" },
        provider,
        { source: "api" as const, requestId: "phase-4k-wrong-adapter" },
      ),
      /not enabled/i,
    );

    assert.equal(IntegrationConfigurationRepository.getById(input.id)?.enabled, false);
  } finally {
    process.chdir(originalCwd);
  }
});
