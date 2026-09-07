import {
  type ClinicalOrder,
  type ProviderAuth,
  initialStagedOrders,
  initialTransmittedOrders,
} from "../domain/orders";
import { type Patient } from "../domain/patient";
import {
  type PrescriptionTransmissionResult,
  type LabTransmissionResult,
} from "../adapters";
import {
  authorizeEncounterClosingOrder,
  stageEncounterClosingOrder,
  transmitEncounterClosingOrder,
} from "./encounter-close-api";

const ORDERS_STORAGE_KEY = "ehr_orders_staged_v1";
const TRANSMITTED_STORAGE_KEY = "ehr_orders_transmitted_v1";

export function loadStagedOrders(): Record<string, ClinicalOrder[]> {
  if (typeof window === "undefined") return initialStagedOrders;
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to load staged orders from localStorage", err);
  }
  return initialStagedOrders;
}

export function saveStagedOrders(orders: Record<string, ClinicalOrder[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  } catch (err) {
    console.warn("Failed to persist staged orders", err);
  }
}

export function loadTransmittedOrders(): Record<string, ClinicalOrder[]> {
  if (typeof window === "undefined") return initialTransmittedOrders;
  try {
    const raw = localStorage.getItem(TRANSMITTED_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to load transmitted orders from localStorage", err);
  }
  return initialTransmittedOrders;
}

export function saveTransmittedOrders(orders: Record<string, ClinicalOrder[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRANSMITTED_STORAGE_KEY, JSON.stringify(orders));
  } catch (err) {
    console.warn("Failed to persist transmitted orders", err);
  }
}

export type MultiOrderTransmissionReceipt = {
  prescriptionResult?: PrescriptionTransmissionResult;
  labResult?: LabTransmissionResult;
  summaryText: string;
  timestamp: string;
  totalTransmitted: number;
};

function isPrescriptionReceipt(
  receipt: PrescriptionTransmissionResult | LabTransmissionResult,
): receipt is PrescriptionTransmissionResult {
  return "pharmacyRouting" in receipt;
}

/**
 * Route the standalone cart through the same patient-bound server order gateway used by
 * encounter closing. Controlled prescriptions stay in the dedicated encounter-closing
 * authorization flow until the prototype has a separate server-side EPCS exchange.
 */
export async function transmitStagedOrders(
  patient: Patient,
  stagedOrders: ClinicalOrder[],
  auth: ProviderAuth,
): Promise<MultiOrderTransmissionReceipt> {
  const controlled = stagedOrders.find(
    (order) =>
      order.type === "medication" &&
      (order.requiresEpcs || order.deaSchedule !== "None"),
  );
  if (controlled) {
    throw new Error(
      "Controlled prescriptions must be finalized from the encounter closing workflow in this prototype.",
    );
  }

  for (const order of stagedOrders) {
    if (order.patientId !== patient.id) {
      throw new Error(`Patient binding mismatch for order ${order.id}.`);
    }
  }

  const authoritative = [];
  for (const order of stagedOrders) {
    authoritative.push(await stageEncounterClosingOrder(patient.id, order));
  }

  for (let index = 0; index < authoritative.length; index += 1) {
    if (authoritative[index].status !== "staged") continue;
    authoritative[index] = await authorizeEncounterClosingOrder(
      patient.id,
      authoritative[index].id,
      {
        npi: auth.npi,
        authorizationSource: "standalone-order-cart",
        target:
          stagedOrders[index].type === "medication"
            ? stagedOrders[index].pharmacy?.name
            : stagedOrders[index].targetFacility,
      },
    );
  }

  const prescriptionResults: PrescriptionTransmissionResult[] = [];
  const labResults: LabTransmissionResult[] = [];
  const failures: string[] = [];

  for (const order of authoritative) {
    try {
      const outcome = await transmitEncounterClosingOrder(patient.id, order.id, {
        npi: auth.npi,
        transmissionSource: "standalone-order-cart",
      });
      if (!outcome.receipt) continue;
      if (isPrescriptionReceipt(outcome.receipt)) prescriptionResults.push(outcome.receipt);
      else labResults.push(outcome.receipt);
    } catch (error) {
      failures.push(`${order.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Some orders failed to transmit. Successful orders remain complete and failed orders can be retried. ${failures.join(" · ")}`,
    );
  }

  const parts = [
    ...prescriptionResults.map(
      (result) =>
        `${result.transmittedCount || 1} prescription(s) transmitted to ${result.pharmacyRouting.pharmacyName} via ${result.vendor} (${result.transmissionId})`,
    ),
    ...labResults.map(
      (result) =>
        `${result.transmittedCount || 1} lab order(s) transmitted to ${result.facilityName} (${result.requisitionNumber})`,
    ),
  ];

  return {
    prescriptionResult: prescriptionResults[0],
    labResult: labResults[0],
    summaryText: parts.join(" · "),
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    totalTransmitted: stagedOrders.length,
  };
}
