/**
 * Panel results summarise several analytes in one value ("Na 140, K 4.2") and
 * carry the stored unit sentinel "multi". That sentinel is a storage marker, not
 * a unit of measure, so it must never reach the clinician beside the value.
 */
export const MULTI_ANALYTE_UNIT = "multi";

export function displayLabUnit(unit: string | null | undefined): string {
  const trimmed = (unit ?? "").trim();
  return trimmed.toLowerCase() === MULTI_ANALYTE_UNIT ? "" : trimmed;
}

export function formatLabValue(valueText: string | null | undefined, unit: string | null | undefined): string {
  const value = (valueText ?? "").trim();
  const displayUnit = displayLabUnit(unit);
  return displayUnit ? `${value} ${displayUnit}`.trim() : value;
}
