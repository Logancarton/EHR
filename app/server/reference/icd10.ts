import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

/**
 * ICD-10-CM reference (FY2026 valid codes from CMS, public domain).
 *
 * `icd10cm-2026.tsv.gz` is generated from CMS's `icd10cm_codes_2026.txt`: every
 * code valid for use on a claim, with its full description and the conventional
 * dot after the third character. Reference data only: picking a code never
 * changes a chart by itself; the clinician saves the problem.
 */
export const ICD10_CM_VERSION = "ICD-10-CM FY2026";
const FILE = "icd10cm-2026.tsv.gz";

export type Icd10Code = { code: string; description: string };
type Indexed = Icd10Code & { compact: string; lower: string };

let cache: Indexed[] | null = null;

function locate(): string {
  const candidates = [
    join(process.cwd(), "app", "server", "reference", FILE),
    (() => {
      try {
        return fileURLToPath(new URL(`./${FILE}`, import.meta.url));
      } catch {
        return "";
      }
    })(),
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("The ICD-10-CM reference file is missing.");
  return found;
}

function load(): Indexed[] {
  if (cache) return cache;
  const text = gunzipSync(readFileSync(locate())).toString("utf8");
  cache = text
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [code, description] = line.split("\t");
      return { code, description, compact: code.replace(".", "").toLowerCase(), lower: description.toLowerCase() };
    });
  return cache;
}

/** Exact lookup, dot optional: "F31.81" and "F3181" both find Bipolar II disorder. */
export function findIcd10Code(code: string): Icd10Code | null {
  const compact = code.trim().replace(".", "").toLowerCase();
  const hit = load().find((entry) => entry.compact === compact);
  return hit ? { code: hit.code, description: hit.description } : null;
}

/**
 * Search by code or words. A code-like query matches by prefix; otherwise every
 * word must appear in the description. Ranked: exact code, code prefix,
 * description starting with the query, then the rest; mental and behavioral
 * (F) codes break ties first, as this is a psychiatric practice.
 */
export function searchIcd10(query: string, limit = 25): Icd10Code[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const compactQuery = q.replace(".", "");
  const codeLike = /^[a-z][0-9]/.test(compactQuery) && !/\s/.test(q);
  const words = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ entry: Indexed; score: number }> = [];
  for (const entry of load()) {
    let score = -1;
    if (codeLike) {
      if (entry.compact === compactQuery) score = 0;
      else if (entry.compact.startsWith(compactQuery)) score = 1 + entry.compact.length / 100;
    } else if (words.every((word) => entry.lower.includes(word))) {
      score = entry.lower.startsWith(q) ? 2 : 3;
      score += entry.lower.length / 1000;
    }
    if (score < 0) continue;
    if (!entry.code.startsWith("F")) score += 0.5;
    scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.entry.code.localeCompare(b.entry.code))
    .slice(0, limit)
    .map(({ entry }) => ({ code: entry.code, description: entry.description }));
}
