import type { ClinicalAction } from "./clinical-action-gateway";
import type { AllergySeverity, AllergyStatus, ProblemStatus } from "../../domain/clinical-records";

const problemStatuses = new Set<ProblemStatus>(["active", "resolved", "inactive", "entered-in-error"]);
const allergyStatuses = new Set<AllergyStatus>(["active", "inactive", "entered-in-error"]);
const allergySeverities = new Set<AllergySeverity>(["mild", "moderate", "severe", "unknown"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

function optionalText(value: unknown, label: string, max = 500): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, label, max);
}

function nullableText(value: unknown, label: string, max = 500): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return requiredText(value, label, max);
}

function dateValue(value: unknown, label: string, nullable = false): string | null | undefined {
  if (value === undefined) return undefined;
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid.`);
  return value;
}

function ensurePatch(patch: Record<string, unknown>, label: string) {
  if (Object.values(patch).every((value) => value === undefined)) throw new Error(`${label} must include at least one change.`);
}

export function validateProblemAllergyAction(body: unknown): ClinicalAction | null {
  const envelope = object(body, "Clinical record action");
  const type = envelope.type;
  if (typeof type !== "string") throw new Error("Clinical record action type is required.");
  const payload = object(envelope.payload ?? {}, "Clinical record payload");

  if (type === "add_problem") {
    return {
      type,
      payload: {
        patientId: requiredText(payload.patientId, "patientId", 200),
        displayText: requiredText(payload.displayText, "Problem", 500),
        code: optionalText(payload.code, "Problem code", 100),
        codingSystem: optionalText(payload.codingSystem, "Coding system", 100),
        onsetDate: dateValue(payload.onsetDate, "Onset date") || undefined,
      },
    };
  }

  if (type === "update_problem") {
    const rawPatch = object(payload.patch ?? {}, "Problem patch");
    const status = rawPatch.status === undefined ? undefined : requiredText(rawPatch.status, "Problem status", 50) as ProblemStatus;
    if (status && !problemStatuses.has(status)) throw new Error(`Unsupported problem status: ${status}`);
    const patch = {
      displayText: optionalText(rawPatch.displayText, "Problem", 500),
      code: nullableText(rawPatch.code, "Problem code", 100),
      codingSystem: nullableText(rawPatch.codingSystem, "Coding system", 100),
      onsetDate: dateValue(rawPatch.onsetDate, "Onset date", true),
      status,
      resolvedDate: dateValue(rawPatch.resolvedDate, "Resolution date", true),
    };
    ensurePatch(patch, "Problem patch");
    return { type, payload: { recordId: requiredText(payload.recordId, "recordId", 200), patch } };
  }

  if (type === "add_allergy") {
    const severity = payload.severity === undefined
      ? "unknown"
      : requiredText(payload.severity, "Allergy severity", 50) as AllergySeverity;
    if (!allergySeverities.has(severity)) throw new Error(`Unsupported allergy severity: ${severity}`);
    return {
      type,
      payload: {
        patientId: requiredText(payload.patientId, "patientId", 200),
        substance: requiredText(payload.substance, "Allergy substance", 300),
        reaction: optionalText(payload.reaction, "Reaction", 500),
        severity,
      },
    };
  }

  if (type === "update_allergy") {
    const rawPatch = object(payload.patch ?? {}, "Allergy patch");
    const status = rawPatch.status === undefined ? undefined : requiredText(rawPatch.status, "Allergy status", 50) as AllergyStatus;
    if (status && !allergyStatuses.has(status)) throw new Error(`Unsupported allergy status: ${status}`);
    const severity = rawPatch.severity === undefined
      ? undefined
      : requiredText(rawPatch.severity, "Allergy severity", 50) as AllergySeverity;
    if (severity && !allergySeverities.has(severity)) throw new Error(`Unsupported allergy severity: ${severity}`);
    const patch = {
      reaction: nullableText(rawPatch.reaction, "Reaction", 500),
      severity,
      status,
    };
    ensurePatch(patch, "Allergy patch");
    return { type, payload: { recordId: requiredText(payload.recordId, "recordId", 200), patch } };
  }

  return null;
}
