import assert from "node:assert/strict";
import test from "node:test";
import { EncounterSaveCoordinator, type EncounterDraftSavePayload } from "../app/lib/encounter-save-lifecycle";
import { createInitialEncounter } from "../app/lib/encounter-engine";

function payload(patientId: string, encounterId: string, plan: string) {
  return {
    id: encounterId,
    patientId,
    type: "Medication Management",
    chiefComplaint: "Follow-up",
    intervalHistory: "Stable",
    treatmentResponse: "Improved",
    sideEffects: "None",
    assessment: "Stable",
    plan,
    cptCode: "99214",
    emLevel: "moderate",
    mse: {},
    workingState: {
      selectedTemplateId: "psych-follow-up",
      psychotherapyMinutes: 16,
      candidateActions: [],
      ambientTranscript: [],
      lastAutosavedAt: "2026-09-09T14:00:00.000Z",
    },
  };
}

function queueDraft(
  coordinator: EncounterSaveCoordinator,
  ownerId: string,
  patientId: string,
  encounterId: string,
  plan: string,
) {
  const draft = { ...createInitialEncounter(patientId), encounterId, plan };
  coordinator.queue({
    ownerId,
    draft,
    selectedTemplateId: "psych-follow-up",
    psychotherapyMinutes: 16,
    payload: payload(patientId, encounterId, plan),
  });
}

test("delayed older acknowledgement never marks newer encounter work saved", async () => {
  const coordinator = new EncounterSaveCoordinator(60_000);
  const requests: EncounterDraftSavePayload[] = [];
  const resolvers: Array<(value: { id: string; patientId: string; status: "draft"; updatedAt: string }) => void> = [];
  coordinator.configureTransport((request) => {
    requests.push(request);
    return new Promise((resolve) => resolvers.push(resolve));
  });

  const ownerId = "provider-a";
  const patientId = "maya-chen";
  const encounterId = "enc-save-ordering";
  coordinator.beginHydration({ ownerId, patientId, encounterId });
  coordinator.finishHydration(ownerId, patientId);

  queueDraft(coordinator, ownerId, patientId, encounterId, "revision one");
  const firstFlush = coordinator.flush(ownerId, patientId);
  await Promise.resolve();
  assert.equal(requests.length, 1);

  queueDraft(coordinator, ownerId, patientId, encounterId, "revision two");
  resolvers[0]({ id: encounterId, patientId, status: "draft", updatedAt: "server-v1" });
  await Promise.resolve();

  const afterOldAck = coordinator.getState(ownerId, patientId);
  assert.ok(afterOldAck);
  assert.notEqual(afterOldAck.status, "saved", "an old acknowledgement cannot certify the newer revision");
  assert.equal(afterOldAck.dirty, true);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2, "the newer revision should follow the acknowledged older write");
  assert.equal(requests[1].plan, "revision two");
  assert.equal(requests[1].expectedUpdatedAt, "server-v1");

  resolvers[1]({ id: encounterId, patientId, status: "draft", updatedAt: "server-v2" });
  await firstFlush;
  const finalState = coordinator.getState(ownerId, patientId);
  assert.equal(finalState?.status, "saved");
  assert.equal(finalState?.acknowledgedRevision, 2);
  assert.equal(finalState?.serverUpdatedAt, "server-v2");
});

test("failed save remains recoverable and retry preserves owner, patient and encounter identity", async () => {
  const coordinator = new EncounterSaveCoordinator(60_000);
  let attempt = 0;
  const seen: EncounterDraftSavePayload[] = [];
  coordinator.configureTransport(async (request) => {
    seen.push(request);
    attempt += 1;
    if (attempt === 1) throw new Error("synthetic network failure");
    return { id: request.id, patientId: request.patientId, status: "draft", updatedAt: "server-retry" };
  });

  const ownerId = "provider-a";
  const patientId = "jordan-reed";
  const encounterId = "enc-retry-identity";
  coordinator.beginHydration({ ownerId, patientId, encounterId });
  coordinator.finishHydration(ownerId, patientId);
  queueDraft(coordinator, ownerId, patientId, encounterId, "keep this work");

  await coordinator.flush(ownerId, patientId);
  assert.equal(coordinator.getState(ownerId, patientId)?.status, "failed");
  assert.match(coordinator.getState(ownerId, patientId)?.error || "", /synthetic network failure/);

  await coordinator.retry(ownerId, patientId);
  assert.equal(coordinator.getState(ownerId, patientId)?.status, "saved");
  assert.equal(seen.length, 2);
  for (const request of seen) {
    assert.equal(request.expectedActorId, ownerId);
    assert.equal(request.patientId, patientId);
    assert.equal(request.id, encounterId);
  }
});

test("signed encounter cancels pending retries and cannot be flushed as a draft", async () => {
  const coordinator = new EncounterSaveCoordinator(60_000);
  let writes = 0;
  coordinator.configureTransport(async (request) => {
    writes += 1;
    return { id: request.id, patientId: request.patientId, status: "draft", updatedAt: "server-write" };
  });

  const ownerId = "provider-a";
  const patientId = "maya-chen";
  const encounterId = "enc-signed-cancel";
  coordinator.beginHydration({ ownerId, patientId, encounterId });
  coordinator.finishHydration(ownerId, patientId);
  queueDraft(coordinator, ownerId, patientId, encounterId, "pending before sign");
  coordinator.markSigned(ownerId, patientId, encounterId);

  await coordinator.flush(ownerId, patientId);
  assert.equal(writes, 0);
  assert.equal(coordinator.getState(ownerId, patientId)?.dirty, false);
});
