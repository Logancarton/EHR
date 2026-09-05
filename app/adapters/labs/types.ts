import { type LabOrder, type ProviderAuth } from "../../domain/orders";
import { type Patient } from "../../domain/patient";

export type LabRequisitionSlip = {
  requisitionNumber: string;
  barcode: string;
  facility: string;
  facilityAddress: string;
  dateGenerated: string;
  patient: {
    name: string;
    dob: string;
    age: number;
    gender: string;
    mrn: string;
  };
  orderingProvider: {
    name: string;
    npi: string;
    clinicName: string;
    clinicPhone: string;
  };
  tests: {
    testName: string;
    loincCode: string;
    specimen: string;
    fasting: boolean;
    icd10: string;
  }[];
  specimenCollectionInstructions: string;
  priority: string;
};

export type LabTransmissionResult = {
  success: boolean;
  transmissionId: string;
  requisitionNumber: string;
  vendor: string;
  protocol: string;
  transmittedCount: number;
  facilityName: string;
  hl7MessagePreview: string; // HL7 ORM^O01 message simulation
  requisitionSlip: LabRequisitionSlip;
  timestamp: string;
  error?: string;
};

export interface LabRequisitionAdapter {
  id: string;
  name: string;
  protocol: string;
  description: string;

  /**
   * Transmit electronic lab order to clinical reference laboratory via HL7 / FHIR
   */
  transmitLabOrders(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth
  ): Promise<LabTransmissionResult>;

  /**
   * Generate clean patient requisition slip with barcodes and specimen prep instructions
   */
  generateRequisitionSlip(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth,
    requisitionNumber: string
  ): LabRequisitionSlip;
}
