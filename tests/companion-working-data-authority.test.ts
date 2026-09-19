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
