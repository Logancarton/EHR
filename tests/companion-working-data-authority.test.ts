import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = () => readFileSync(join(process.cwd(), "app/lib/use-companion-working-data.ts"), "utf8");

test("companion working data never treats fixture data as authoritative hydration", () => {
  const text = source();
  assert.equal(text.includes("initialTasks"), false);
  assert.equal(text.includes("initialScratchNotes"), false);
  assert.equal(text.includes("remoteTasks.length > 0"), false);
  assert.equal(text.includes("remoteNotes.length > 0"), false);
  assert.match(text, /setTasks\(remoteTasks\)/);
  assert.match(text, /setScratchpadNotes\(remoteNotes\)/);
});

test("companion mutations only change visible state after the server confirms them", () => {
  const text = source();
  assert.match(text, /\.toggle\(id\)[\s\S]*?\.then\(\(updated\)/);
  assert.match(text, /createScratchNote[\s\S]*?\.then\(\(created\)/);
  assert.doesNotMatch(text, /\.catch\(\(\) => \{\}\)/);
});

test("rating scales start blank and keep answers per patient", () => {
  const text = source();
  // A pre-filled answer set was a fabricated PHQ-9 score one click from the chart.
  assert.match(text, /useState<Record<string, Record<number, number>>>\(\{\}\)/);
  assert.doesNotMatch(text, /phqAnswers/);

  const panel = readFileSync(join(process.cwd(), "app/components/companion/CalculatorPanel.tsx"), "utf8");
  assert.match(panel, /answerKey = `\$\{boundPatient\?\.patientId \?\? "unbound"\}:\$\{activeInstrument\}`/);
  assert.match(panel, /answered/, "an incomplete scale reports progress, not a score");
});

test("scratchpad notes name their patient and hide other patients' notes behind a chart", () => {
  const panel = readFileSync(join(process.cwd(), "app/components/companion/ScratchpadPanel.tsx"), "utf8");
  assert.match(panel, /Practice note — no patient/);
  assert.match(panel, /!note\.patientId \|\| note\.patientId === activePatient\.id/);
});
