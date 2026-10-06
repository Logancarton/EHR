/**
 * Clinicians need to see where a record came from, but in words, not storage
 * identifiers ("legacy-json · ehr-local"). Unknown values are shown as stored so
 * provenance is never hidden behind a guess.
 */
const SOURCE_TYPE_LABELS: Record<string, string> = {
  "legacy-json": "Migrated record",
  "clinician-entered": "Entered by clinician",
  "external-vendor": "External prescribing system",
  "manual-prescription-recovery": "Manual prescription recovery",
};

const SOURCE_SYSTEM_LABELS: Record<string, string> = {
  "ehr-local": "This EHR",
  "ehr-messaging": "EHR messaging",
  "synthetic-fixture-migration": "Synthetic data migration",
  "outside-records": "Outside records",
};

export function describeRecordSource(sourceType?: string | null, sourceSystem?: string | null): string {
  const type = (sourceType ?? "").trim();
  const system = (sourceSystem ?? "").trim();
  const parts = [
    type ? SOURCE_TYPE_LABELS[type] ?? type : "",
    system ? SOURCE_SYSTEM_LABELS[system] ?? system : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not recorded";
}
