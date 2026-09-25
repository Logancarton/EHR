import { chargeTotalCents, type BillingChargeRecord } from "./billing";
import type { PracticeBillingProfile, ProviderBillingIdentity } from "./billing-setup";

/**
 * A superbill (BILL-3, D-101).
 *
 * The itemized statement a patient submits to their own insurer for
 * out-of-network or self-pay care. It is the one financial document this product
 * can produce with no vendor at all, which is why it exists before claims do.
 *
 * It is a *rendering* of records that already exist — a reviewed charge, the
 * practice's billing profile, the rendering provider's identifiers and the
 * coverage on file — never a place new facts are typed. Every field that the
 * records do not hold is listed in `missing` and printed as "Not recorded", so a
 * superbill with a gap looks like one. Nothing is filled with a plausible value.
 */

export type SuperbillLine = {
  serviceDate: string;
  placeOfService: string | null;
  code: string;
  modifiers: string[];
  description: string;
  units: number;
  /** Letters of the diagnoses this line points to (A–L), in order. */
  diagnosisPointers: string[];
  feeCents: number | null;
};

export type SuperbillDiagnosis = {
  pointer: string;
  code: string;
  display: string;
};

export type Superbill = {
  chargeId: string;
  chargeVersion: number;
  generatedAt: string;
  generatedByName: string;
  encounterSnapshotSha256: string;
  practice: {
    legalName: string;
    address: string[];
    phone: string;
    taxId: string;
    groupNpi: string;
  };
  renderingProvider: {
    name: string;
    credentials: string;
    npi: string;
    licenseNumber: string;
    licenseState: string;
  };
  patient: {
    name: string;
    dob: string;
    mrn: string;
    address: string[];
  };
  coverage: {
    basis: BillingChargeRecord["coverageBasis"];
    payerName: string;
    memberId: string;
    groupNumber: string;
    subscriberName: string;
    relationship: string;
  } | null;
  diagnoses: SuperbillDiagnosis[];
  lines: SuperbillLine[];
  /** Null when any line has no scheduled fee: a partial sum is not a total. */
  totalCents: number | null;
  /** Human labels of every field the records do not hold. */
  missing: string[];
};

export type SuperbillInput = {
  charge: BillingChargeRecord;
  generatedAt: string;
  generatedByName: string;
  profile: PracticeBillingProfile;
  provider: ProviderBillingIdentity | null;
  providerFallbackName: string;
  patient: {
    name: string;
    dob: string;
    mrn: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  };
  coverage: {
    payerName: string;
    memberId?: string | null;
    groupNumber?: string | null;
    subscriberName?: string | null;
    relationship?: string | null;
  } | null;
};

const POINTERS = "ABCDEFGHIJKL".split("");

function addressLines(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string[] {
  const cityLine = [parts.city?.trim(), [parts.state?.trim(), parts.postalCode?.trim()].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [parts.addressLine1?.trim(), parts.addressLine2?.trim(), cityLine].filter(
    (line): line is string => Boolean(line),
  );
}

/** Whether a charge may be rendered as a superbill, and if not, why not. */
export function superbillRefusal(charge: BillingChargeRecord): string | null {
  if (charge.status === "void") return "This charge was voided, so it cannot be itemized for the patient.";
  if (charge.status !== "reviewed") {
    return "A superbill is produced only from a reviewed charge. Review the charge first so an accountable person has looked at the codes.";
  }
  if (charge.procedureCodes.length === 0) return "The charge carries no procedure code to itemize.";
  if (charge.diagnosisCodes.length === 0) return "The charge carries no coded diagnosis, which an insurer requires.";
  return null;
}

export function buildSuperbill(input: SuperbillInput): Superbill {
  const { charge, profile, provider, patient, coverage } = input;
  const missing: string[] = [];

  const diagnoses = charge.diagnosisCodes.slice(0, POINTERS.length).map((diagnosis, index) => ({
    pointer: POINTERS[index],
    code: diagnosis.code,
    display: diagnosis.display,
  }));
  // Up to four pointers per line is the CMS-1500 limit; every line points to the
  // attested diagnoses in the order they were attested.
  const pointers = diagnoses.slice(0, 4).map((diagnosis) => diagnosis.pointer);

  const lines: SuperbillLine[] = charge.procedureCodes.map((line) => ({
    serviceDate: charge.serviceDate,
    placeOfService: charge.placeOfService,
    code: line.code.replace(/^\+/, ""),
    modifiers: line.modifiers ?? [],
    description: line.description,
    units: line.units,
    diagnosisPointers: pointers,
    feeCents: typeof line.feeCents === "number" ? line.feeCents : null,
  }));

  const practiceAddress = addressLines(profile);
  const patientAddress = addressLines(patient);

  if (!profile.legalName.trim()) missing.push("Practice legal name");
  if (practiceAddress.length === 0) missing.push("Practice address");
  if (!profile.phone.trim()) missing.push("Practice phone");
  if (!profile.taxId.trim()) missing.push("Practice tax ID");
  if (!provider?.npi.trim()) missing.push("Rendering provider NPI");
  if (!provider?.licenseNumber.trim()) missing.push("Rendering provider license");
  if (patientAddress.length === 0) missing.push("Patient address");
  if (!charge.placeOfService) missing.push("Place of service (no charge template applied, or the visit modality is unknown)");
  const unpriced = lines.filter((line) => line.feeCents === null).map((line) => line.code);
  if (unpriced.length > 0) missing.push(`Practice fee for ${unpriced.join(", ")}`);
  if (charge.coverageBasis === "policy-on-file" && !coverage?.memberId?.trim()) missing.push("Insurance member ID");

  return {
    chargeId: charge.id,
    chargeVersion: charge.version,
    generatedAt: input.generatedAt,
    generatedByName: input.generatedByName,
    encounterSnapshotSha256: charge.encounterSnapshotSha256,
    practice: {
      legalName: profile.legalName,
      address: practiceAddress,
      phone: profile.phone,
      taxId: profile.taxId,
      groupNpi: profile.groupNpi,
    },
    renderingProvider: {
      name: provider?.displayName || input.providerFallbackName,
      credentials: provider?.credentials ?? "",
      npi: provider?.npi ?? "",
      licenseNumber: provider?.licenseNumber ?? "",
      licenseState: provider?.licenseState ?? "",
    },
    patient: { name: patient.name, dob: patient.dob, mrn: patient.mrn, address: patientAddress },
    coverage:
      charge.coverageBasis === "none-on-file"
        ? null
        : {
            basis: charge.coverageBasis,
            payerName: charge.coverageBasis === "self-pay-recorded" ? "Self-pay" : coverage?.payerName || charge.coveragePayerName || "",
            memberId: coverage?.memberId?.trim() || "",
            groupNumber: coverage?.groupNumber?.trim() || "",
            subscriberName: coverage?.subscriberName?.trim() || "",
            relationship: coverage?.relationship?.trim() || "",
          },
    diagnoses,
    lines,
    totalCents: chargeTotalCents(charge.procedureCodes),
    missing,
  };
}
