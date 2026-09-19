import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("global task load failure is not converted into an authoritative empty queue", () => {
  const text = read("app/components/GlobalWorkspaceShell.tsx");
  assert.doesNotMatch(text, /catch \{\s*setTasks\(\[\]\);/);
  assert.match(text, /The task queue could not be loaded\./);
  assert.match(text, /Previously loaded tasks may be stale\./);
});

test("global inbox labels partial chart failures instead of presenting an apparently complete queue", () => {
  const text = read("app/components/GlobalWorkspaceShell.tsx");
  assert.match(text, /rejectedCount/);
  assert.match(text, /Some patient charts could not be checked\. This message queue may be incomplete\./);
});

test("patient messages never hydrate runtime threads from local fixture storage", () => {
  const text = read("app/components/patient/PatientMessages.tsx");
  assert.equal(text.includes("loadPatientThreads"), false);
  assert.equal(text.includes("savePatientThreads"), false);
  assert.equal(text.includes("offline/development fallback"), false);
  assert.match(text, /Patient messages could not be loaded\. Try again\./);
});
