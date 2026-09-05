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
import { type Patient } from "../../domain/patient";

export class MockDrFirstAdapter implements EPrescribingAdapter {
  id = "drfirst-rcopia";
  name = "DrFirst Rcopia (E-Prescribing & EPCS)";
  standard = "DrFirst Rcopia 4.x / Surescripts Gold Partner API";
  description = "Turnkey certified Surescripts gateway with EPCS Level 3 2FA, PDMP state database access, and medication history.";

  /**
   * Generates a single sign-on (SSO) launch URL for DrFirst Rcopia embedded view
   */
  generateRcopiaSsoUrl(patient: Patient, auth: ProviderAuth): string {
    const timestamp = Date.now();
    const token = Math.random().toString(36).substring(2, 12);
    return `https://rcopia.drfirst.com/api/sso/v4?practiceId=BAY_PSYCH&providerNpi=${auth.npi}&patientMrn=${patient.mrn}&sessionToken=${token}&t=${timestamp}`;
  }

  async transmitPrescriptions(
    orders: MedicationOrder[],
    auth: ProviderAuth
  ): Promise<PrescriptionTransmissionResult> {
    // Simulate network roundtrip to DrFirst Rcopia servers
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (orders.length === 0) {
      throw new Error("Cannot transmit empty prescription batch.");
    }

    const primaryPharmacy = orders[0].pharmacy;
    const hasControlled = orders.some((o) => o.requiresEpcs || o.deaSchedule !== "None");

    const transmissionId = `DF-RCOPIA-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    const auditCode = `DF-EPCS-SHA256-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Realistic DrFirst Rcopia JSON/REST payload
    const drFirstPayload = JSON.stringify(
      {
        partner: "DrFirst Rcopia 4.2",
        transactionId: transmissionId,
        surescriptsNetworkStatus: "VERIFIED_ACTIVE",
        prescriber: {
          name: auth.providerName || "Dr. Logan Carton, MD",
          npi: auth.npi || "1841295031",
          dea: auth.deaNumber || "BC1049281",
          epcsRegistered: true,
          auditHash: hasControlled ? auditCode : undefined,
        },
        pharmacy: {
          name: primaryPharmacy.name,
          ncpdpId: primaryPharmacy.ncpdpId,
          deliveryRouting: "SURESCRIPTS_EDI_DIRECT",
        },
        medications: orders.map((ord) => ({
          drugName: ord.medication,
          genericName: ord.genericName,
          sig: ord.sig,
          quantity: ord.dispenseQuantity,
          daysSupply: ord.daysSupply,
          refills: ord.refills,
          deaSchedule: ord.deaSchedule,
          requiresEpcs: ord.requiresEpcs,
          icd10: ord.indication,
        })),
        pdmpChecked: true,
        allergiesScreened: true,
        drugInteractionsScreened: true,
      },
      null,
      2
    );

    return {
      success: true,
      transmissionId,
      vendor: "DrFirst Inc. (Rcopia)",
      standard: this.standard,
      transmittedCount: orders.length,
      pharmacyRouting: {
        pharmacyName: primaryPharmacy.name,
        ncpdpId: primaryPharmacy.ncpdpId,
        deliveryMethod: "EDI",
      },
      ediMessagePreview: drFirstPayload,
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

    if (!pin || pin.length < 4) {
      return {
        verified: false,
        providerNpi: npi,
        deaNumber,
        timestamp: new Date().toISOString(),
        auditToken: "",
        authMethod: "Two-Factor Push / TOTP",
        error: "DrFirst EPCS credential verification failed: PIN must be at least 4 digits.",
      };
    }

    return {
      verified: true,
      providerNpi: npi,
      deaNumber,
      timestamp: new Date().toISOString(),
      auditToken: `DF-NIST-SP800-${Date.now().toString().slice(-6)}`,
      authMethod: "Two-Factor Push / TOTP",
    };
  }

  async cancelPrescription(orderId: string, reason: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return true;
  }
}
