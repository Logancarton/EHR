import {
  type ClinicalOrder,
  type MedicationOrder,
  type LabOrder,
  type ProviderAuth,
  type OrderTransmissionReceipt,
  initialStagedOrders,
  initialTransmittedOrders,
} from "../domain/orders";
import { type Patient } from "../domain/patient";
import {
  defaultPrescribingAdapter,
  defaultLabAdapter,
  type PrescriptionTransmissionResult,
  type LabTransmissionResult,
} from "../adapters";

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

/**
 * Execute multi-vendor transmission of all staged orders for a patient
 */
export async function transmitStagedOrders(
  patient: Patient,
  stagedOrders: ClinicalOrder[],
  auth: ProviderAuth
): Promise<MultiOrderTransmissionReceipt> {
  const medOrders = stagedOrders.filter((o): o is MedicationOrder => o.type === "medication");
  const labOrders = stagedOrders.filter((o): o is LabOrder => o.type === "lab");

  let rxResult: PrescriptionTransmissionResult | undefined;
  let labResult: LabTransmissionResult | undefined;

  if (medOrders.length > 0) {
    rxResult = await defaultPrescribingAdapter.transmitPrescriptions(medOrders, auth);
  }

  if (labOrders.length > 0) {
    labResult = await defaultLabAdapter.transmitLabOrders(labOrders, patient, auth);
  }

  const parts: string[] = [];
  if (rxResult) {
    parts.push(
      `${medOrders.length} prescription(s) transmitted to ${rxResult.pharmacyRouting.pharmacyName} via Surescripts (${rxResult.transmissionId})`
    );
  }
  if (labResult) {
    parts.push(
      `${labOrders.length} lab order(s) transmitted to Quest Diagnostics (Req #${labResult.requisitionNumber})`
    );
  }

  return {
    prescriptionResult: rxResult,
    labResult: labResult,
    summaryText: parts.join(" · "),
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    totalTransmitted: stagedOrders.length,
  };
}
