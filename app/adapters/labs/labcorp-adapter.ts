import {
  type LabRequisitionAdapter,
  type LabTransmissionResult,
  type LabRequisitionSlip,
} from "./types";
import { type LabOrder, type ProviderAuth } from "../../domain/orders";
import { type Patient } from "../../domain/patient";

export class MockLabcorpAdapter implements LabRequisitionAdapter {
  id = "labcorp-beacon";
  name = "Labcorp (Beacon e-Orders)";
  protocol = "HL7 v2.5.1 / Labcorp Direct API";
  description = "Electronic ordering and accession transmission to Labcorp patient service centers.";

  generateRequisitionSlip(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth,
    requisitionNumber: string
  ): LabRequisitionSlip {
    return {
      requisitionNumber,
      barcode: `*${requisitionNumber}*`,
      facility: "Labcorp Outpatient Center",
      facilityAddress: "2299 Post St, Suite 101, San Francisco, CA 94115",
      dateGenerated: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      patient: {
        name: patient.name,
        dob: patient.dob,
        age: patient.age,
        gender: patient.pronouns.includes("she") ? "Female" : "Male",
        mrn: patient.mrn,
      },
      orderingProvider: {
        name: auth.providerName || "Dr. Logan Carton, MD",
        npi: auth.npi || "1841295031",
        clinicName: "Bay Psychiatric Medical Group",
        clinicPhone: "(415) 555-0199",
      },
      tests: orders.map((ord) => ({
        testName: ord.testName,
        loincCode: ord.loincCode,
        specimen: ord.specimen,
        fasting: ord.fastingRequired,
        icd10: ord.indication,
      })),
      specimenCollectionInstructions: "Routine phlebotomy collection. Verify patient fasting status if metabolic tests ordered.",
      priority: orders.some((o) => o.priority === "STAT") ? "STAT" : "Routine",
    };
  }

  async transmitLabOrders(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth
  ): Promise<LabTransmissionResult> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const requisitionNumber = `LC-${Date.now().toString().slice(-6)}`;
    const transmissionId = `TX-LC-${Date.now()}`;

    const requisitionSlip = this.generateRequisitionSlip(
      orders,
      patient,
      auth,
      requisitionNumber
    );

    return {
      success: true,
      transmissionId,
      requisitionNumber,
      vendor: "Laboratory Corporation of America (Labcorp Beacon)",
      protocol: this.protocol,
      transmittedCount: orders.length,
      facilityName: "Labcorp Regional Facility",
      hl7MessagePreview: `MSH|^~\\&|EHR_CORE|BAY_PSYCH|LABCORP_BEACON|LC_SF|${new Date().toISOString()}||ORM^O01|${transmissionId}|P|2.5.1`,
      requisitionSlip,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  }
}
