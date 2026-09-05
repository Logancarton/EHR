import {
  type LabRequisitionAdapter,
  type LabTransmissionResult,
  type LabRequisitionSlip,
} from "./types";
import { type LabOrder, type ProviderAuth } from "../../domain/orders";
import { type Patient } from "../../domain/patient";

export class MockQuestAdapter implements LabRequisitionAdapter {
  id = "quest-quanum";
  name = "Quest Diagnostics (Quanum e-Orders)";
  protocol = "HL7 v2.5.1 ORM^O01 / Quanum Connect Direct";
  description = "Automated electronic lab orders and specimen accessioning with Quest Diagnostics.";

  generateRequisitionSlip(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth,
    requisitionNumber: string
  ): LabRequisitionSlip {
    const hasFasting = orders.some((o) => o.fastingRequired);

    return {
      requisitionNumber,
      barcode: `*${requisitionNumber.replace(/[^A-Z0-9]/gi, "")}*`,
      facility: "Quest Diagnostics - San Francisco Main PSC",
      facilityAddress: "3838 California St, Suite 100, San Francisco, CA 94118",
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
      specimenCollectionInstructions: hasFasting
        ? "PATIENT INSTRUCTIONS: 10–12 hour overnight fast required. Water permitted. Draw early morning. Serum separator tube (SST) & Lavender EDTA."
        : "Standard non-fasting specimen collection. Routine blood draw.",
      priority: orders.some((o) => o.priority === "STAT") ? "STAT" : "Routine Outpatient",
    };
  }

  async transmitLabOrders(
    orders: LabOrder[],
    patient: Patient,
    auth: ProviderAuth
  ): Promise<LabTransmissionResult> {
    await new Promise((resolve) => setTimeout(resolve, 550));

    if (orders.length === 0) {
      throw new Error("Cannot transmit empty lab requisition batch.");
    }

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
    const requisitionNumber = `QD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    const transmissionId = `TX-QUEST-${timestamp}`;

    // Realistic HL7 ORM^O01 preview
    const hl7Preview = `MSH|^~\\&|EHR_CORE|BAY_PSYCH|QUEST_QUANUM|QD_SF|${timestamp}||ORM^O01|${transmissionId}|P|2.5.1
PID|1||${patient.mrn}^^^EHR^MR||${patient.name.split(" ").reverse().join("^")}||${patient.dob.replace(/\//g, "")}|${patient.pronouns.includes("she") ? "F" : "M"}
PV1|1|O|||||${auth.npi}^${auth.providerName}^MD
${orders
  .map(
    (ord, i) =>
      `ORC|NW|${requisitionNumber}-${i + 1}|QD-ORD-${i + 1}||||||${timestamp}|||${auth.npi}
OBR|${i + 1}|${requisitionNumber}-${i + 1}||${ord.loincCode}^${ord.testName}^LN|||${timestamp}||||||${ord.fastingRequired ? "FASTING" : "NON-FASTING"}|${ord.specimen}||||||||||F`
  )
  .join("\n")}`;

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
      vendor: "Quest Diagnostics Quanum e-Orders",
      protocol: this.protocol,
      transmittedCount: orders.length,
      facilityName: "Quest Diagnostics Outpatient PSC",
      hl7MessagePreview: hl7Preview,
      requisitionSlip,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  }
}
