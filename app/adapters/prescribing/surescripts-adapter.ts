import {
  type EPrescribingAdapter,
  type PrescriptionTransmissionResult,
  type EpcsVerificationResult,
} from "./types";
import {
  type MedicationOrder,
  type Pharmacy,
  type ProviderAuth,
  standardPharmacies,
} from "../../domain/orders";

export class MockSurescriptsAdapter implements EPrescribingAdapter {
  id = "surescripts-ncpdp";
  name = "Surescripts Network (NCPDP SCRIPT)";
  standard = "NCPDP SCRIPT Standard v2017071";
  description = "Certified national e-prescribing network with EPCS Level 3 two-factor validation.";

  async transmitPrescriptions(
    orders: MedicationOrder[],
    auth: ProviderAuth
  ): Promise<PrescriptionTransmissionResult> {
    // Simulate brief network latency
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (orders.length === 0) {
      throw new Error("Cannot transmit empty prescription batch.");
    }

    const primaryPharmacy = orders[0].pharmacy;
    const hasControlled = orders.some((o) => o.requiresEpcs || o.deaSchedule !== "None");

    const transmissionId = `SS-NCPDP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    const auditCode = `EPCS-SHA256-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Realistic NCPDP XML EDI representation
    const ediPreview = `<?xml version="1.0" encoding="UTF-8"?>
<Message Datetime="${new Date().toISOString()}" MessageID="${transmissionId}" xmlns="http://www.ncpdp.org/schema/SCRIPT">
  <Header>
    <To Qualifier="P">${primaryPharmacy.ncpdpId}</To>
    <From Qualifier="C">EHR-CORE-LOGANCARTON-MD</From>
    <MessageReferenceNumber>${transmissionId}</MessageReferenceNumber>
    <Security>
      <ProviderNPI>${auth.npi}</ProviderNPI>
      ${hasControlled ? `<DEANumber>${auth.deaNumber || "BC1049281"}</DEANumber>\n      <EPCSAuditHash>${auditCode}</EPCSAuditHash>` : ""}
    </Security>
  </Header>
  <Body>
    <NewRx>
      ${orders
        .map(
          (ord) => `<MedicationPrescribed>
        <DrugDescription>${ord.medication}</DrugDescription>
        <Quantity Qualifier="C38">${ord.dispenseQuantity}</Quantity>
        <DaysSupply>${ord.daysSupply}</DaysSupply>
        <Refills>${ord.refills}</Refills>
        <Sig>${ord.sig}</Sig>
        <DEASchedule>${ord.deaSchedule}</DEASchedule>
        <DiagnosisICD10>${ord.indication}</DiagnosisICD10>
      </MedicationPrescribed>`
        )
        .join("\n      ")}
    </NewRx>
  </Body>
</Message>`;

    return {
      success: true,
      transmissionId,
      vendor: "Surescripts LLC",
      standard: this.standard,
      transmittedCount: orders.length,
      pharmacyRouting: {
        pharmacyName: primaryPharmacy.name,
        ncpdpId: primaryPharmacy.ncpdpId,
        deliveryMethod: "EDI",
      },
      ediMessagePreview: ediPreview,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      auditTrailCode: auditCode,
      epcsVerified: hasControlled,
    };
  }

  async searchPharmacies(query: string, zipCode?: string): Promise<Pharmacy[]> {
    const q = query.toLowerCase().trim();
    if (!q) return standardPharmacies;

    return standardPharmacies.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.ncpdpId.includes(q) ||
        (zipCode && p.address.includes(zipCode))
    );
  }

  async verifyEpcsCredentials(
    npi: string,
    deaNumber: string,
    pin: string,
    otpToken: string
  ): Promise<EpcsVerificationResult> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Simple realistic verification simulation: requires 4+ char PIN
    if (!pin || pin.length < 4) {
      return {
        verified: false,
        providerNpi: npi,
        deaNumber,
        timestamp: new Date().toISOString(),
        auditToken: "",
        authMethod: "Two-Factor Push / TOTP",
        error: "EPCS master PIN must be at least 4 digits.",
      };
    }

    return {
      verified: true,
      providerNpi: npi,
      deaNumber,
      timestamp: new Date().toISOString(),
      auditToken: `NIST-SP800-63-${Date.now().toString().slice(-6)}`,
      authMethod: "Two-Factor Push / TOTP",
    };
  }

  async cancelPrescription(orderId: string, reason: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return true;
  }
}
