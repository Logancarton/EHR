import { createHash } from "node:crypto";
import path from "node:path";

export type BrowserManifestSuite = {
  file?: string;
  specs?: { file: string }[];
  suites?: BrowserManifestSuite[];
};

/** Use Playwright's selected manifest, rather than maintaining another test list. */
export function selectedBrowserFiles(suites: BrowserManifestSuite[]): string[] {
  const files = new Set<string>();
  function visit(suite: BrowserManifestSuite) {
    for (const spec of suite.specs ?? []) files.add(spec.file);
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of suites) visit(suite);
  return [...files].sort();
}

export function browserFileKey(file: string): string {
  const label = path.basename(file).replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${label}-${createHash("sha256").update(file).digest("hex").slice(0, 10)}`;
}
