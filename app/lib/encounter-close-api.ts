import type { ClinicalOrder } from "../domain/orders";
import type { EncounterRecord } from "../server/repositories/encounter-repository";
import type { OrderRecord } from "../server/repositories/order-repository";
import type { OrderTransmissionOutcome } from "../server/services/order-transmission-service";

const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

async function patientRequest<T>(
  endpoint: string,
  patientId: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      [ACTIVE_PATIENT_HEADER]: patientId,
      ...(options.headers || {}),
    },
  });
  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Clinical request failed (${response.status}).`);
  }
  return json as T;
}

export async function listEncounterClosingOrders(patientId: string): Promise<OrderRecord[]> {
  const response = await patientRequest<{ success: true; orders: OrderRecord[] }>(
    `/api/orders?patientId=${encodeURIComponent(patientId)}`,
    patientId,
  );
  return response.orders;
}

export async function stageEncounterClosingOrder(
  patientId: string,
  order: ClinicalOrder,
): Promise<OrderRecord> {
  const response = await patientRequest<{ success: true; order: OrderRecord }>(
    "/api/orders",
    patientId,
    {
      method: "POST",
      body: JSON.stringify({
        id: order.id,
        patientId,
        type: order.type,
        name: order.type === "medication" ? order.medication : order.testName,
        details: order,
      }),
    },
  );
  return response.order;
}

export async function authorizeEncounterClosingOrder(
  patientId: string,
  orderId: string,
  authMetadata: Record<string, unknown>,
): Promise<OrderRecord> {
  const response = await patientRequest<{ success: true; order: OrderRecord }>(
    "/api/orders",
    patientId,
    {
      method: "PATCH",
      body: JSON.stringify({ id: orderId, authMetadata }),
    },
  );
  return response.order;
}

export async function transmitEncounterClosingOrder(
  patientId: string,
  orderId: string,
  transmissionMetadata: Record<string, unknown>,
): Promise<OrderTransmissionOutcome> {
  const response = await patientRequest<{ success: true; outcome: OrderTransmissionOutcome }>(
    "/api/orders",
    patientId,
    {
      method: "PATCH",
      body: JSON.stringify({
        id: orderId,
        operation: "transmit",
        transmissionMetadata,
      }),
    },
  );
  return response.outcome;
}

export async function getClosingEncounter(
  patientId: string,
  encounterId: string,
): Promise<EncounterRecord> {
  const response = await patientRequest<{ success: true; encounter: EncounterRecord }>(
    `/api/encounters/${encodeURIComponent(encounterId)}`,
    patientId,
  );
  return response.encounter;
}
