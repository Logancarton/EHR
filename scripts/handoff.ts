#!/usr/bin/env node
/**
 * scripts/handoff.ts
 *
 * Automated handoff generator for the Logancarton/EHR workspace.
 * Conforms to the execution contract and handoff discipline defined in AGENTS.md.
 *
 * Usage:
 *   npx tsx scripts/handoff.ts [options]
 *   npm run handoff -- [options]
 *
 * Options:
 *   -t, --title <title>     Title or slug for the handoff (e.g. "billing-workflow-default")
 *   -s, --summary <text>    Summary of work completed in the session
 *   -a, --active            Update root HANDOFF.md with in-flight transfer state
 *   -c, --check             Run npm run check before generating and embed live validation output
 *   -d, --dry-run           Print generated handoff markdown to stdout without writing files
 *   -h, --help              Show help
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

function getGitOutput(command: string): string {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function runCommand(command: string): { success: boolean; output: string } {
  try {
    const output = execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    return { success: true, output };
  } catch (error: any) {
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    return { success: false, output: [stdout, stderr].filter(Boolean).join("\n") };
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function parseRoadmapNext(roadmapContent: string): { nextSlice: string; openDefects: string[] } {
  const lines = roadmapContent.split("\n");
  let nextSlice = "Return to CB-7 (clinical certification gate) or UI-9 / AMB-1";
  const openDefects: string[] = [];
  let inOpenDefects = false;

  for (const line of lines) {
    if (line.startsWith("## Open defects and follow-ups")) {
      inOpenDefects = true;
      continue;
    }
    if (inOpenDefects && line.startsWith("## ")) {
      inOpenDefects = false;
    }
    if (inOpenDefects && line.trim().startsWith("- **")) {
      openDefects.push(line.trim());
    }
    if (line.includes("The next eligible slice returns to")) {
      nextSlice = line.replace(/^\*\*/, "").replace(/\*\*.*$/, "").trim();
    }
  }

  return { nextSlice, openDefects };
}

async function main() {
  const { values } = parseArgs({
    options: {
      title: { type: "string", short: "t" },
      summary: { type: "string", short: "s" },
      active: { type: "boolean", short: "a", default: false },
      check: { type: "boolean", short: "c", default: false },
      "dry-run": { type: "boolean", short: "d", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Clinical Bond Handoff Generator (AGENTS.md Compliant)

Usage:
  npx tsx scripts/handoff.ts [options]
  npm run handoff -- [options]

Options:
  -t, --title <title>     Title or slug for the handoff (e.g. "billing-workflow-default")
  -s, --summary <text>    Summary of work completed in the session
  -a, --active            Update root HANDOFF.md with in-flight transfer state
  -c, --check             Run 'npm run check' before generating and embed live validation output
  -d, --dry-run           Print generated handoff markdown to stdout without writing files
  -h, --help              Show this help message
`);
    process.exit(0);
  }

  const rootDir = process.cwd();
  const today = new Date().toISOString().split("T")[0];
  const timestamp = new Date().toISOString();

  // 1. Gather Git Information
  const branch = getGitOutput("git rev-parse --abbrev-ref HEAD") || "main";
  const headSha = getGitOutput("git rev-parse HEAD") || "unknown";
  const shortSha = getGitOutput("git rev-parse --short HEAD") || "unknown";
  const statusPorcelain = getGitOutput("git status --porcelain");
  const isClean = statusPorcelain.length === 0;

  const modifiedFiles = statusPorcelain
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const diffStat = getGitOutput("git diff --stat HEAD");
  const recentCommits = getGitOutput("git log -n 5 --oneline");

  // 2. Run check if requested
  let checkOutput = "";
  let checkPassed: boolean | null = null;
  if (values.check) {
    console.log("Running 'npm run check' for live validation evidence...");
    const res = runCommand("npm run check");
    checkPassed = res.success;
    checkOutput = res.output;
  }

  // 3. Inspect Roadmap Context
  const roadmapPath = path.join(rootDir, "docs/ROADMAP.md");
  let roadmapNext = "Consult docs/ROADMAP.md for active items";
  let openDefects: string[] = [];
  if (fs.existsSync(roadmapPath)) {
    const content = fs.readFileSync(roadmapPath, "utf8");
    const parsed = parseRoadmapNext(content);
    roadmapNext = parsed.nextSlice;
    openDefects = parsed.openDefects.slice(0, 5); // top 5
  }

  // 4. Determine Title & Slug
  const title = values.title || (modifiedFiles.length > 0 ? "session-handoff" : "workspace-state");
  const slug = slugify(title);

  // 5. Structure Handoff Content
  const handoffMarkdown = `# Active Handoff — ${title}

**Date:** ${today} (${timestamp})  
**Branch:** \`${branch}\`  
**Current SHA:** \`${headSha}\` (\`${shortSha}\`)  
**Working Tree Status:** ${isClean ? "Clean" : `Modified (${modifiedFiles.length} files in working tree)`}  

---

## 1. Work Completed in this Session

${
  values.summary
    ? values.summary
    : modifiedFiles.length > 0
      ? `The session made changes across ${modifiedFiles.length} files in the working tree. See file inventory below.`
      : "No uncommitted modifications in working tree. Repository is at baseline."
}

### Recent Git Commits:
\`\`\`text
${recentCommits || "No recent commits found."}
\`\`\`

---

## 2. Modified & Created Files

${
  modifiedFiles.length > 0
    ? `\`\`\`text\n${statusPorcelain}\n\`\`\`\n\n### Diff Summary:\n\`\`\`text\n${diffStat || "No diff stats available."}\n\`\`\``
    : "Working tree is clean. No uncommitted modifications."
}

---

## 3. Validation Evidence & Verification Gates

${
  checkPassed !== null
    ? `**Validation Result (\`npm run check\`):** ${checkPassed ? "PASSED (0 errors)" : "FAILED"}\n\n\`\`\`text\n${
        checkOutput.length > 1500 ? checkOutput.slice(-1500) : checkOutput
      }\n\`\`\``
    : `Run the required repository validation gates before completing:
- \`npm run check\` (lint + typecheck + Node test suite)
- \`npm run build\` (Next.js production build verification)
- Affected browser tests via Playwright (\`npx playwright test <path>\`)`
}

---

## 4. Architectural Boundaries & Safety Invariants

Every agent working in this repository MUST uphold these invariant rules per \`AGENTS.md\`:
1. **EHR-First Scope Firewall:** Synthetic data only. No PHI, no paid integrations, and no mock tokens that fabricate transport success.
2. **Clinical Immutability:** \`signed_encounter_snapshots\` are cryptographically sealed (\`content_sha256\`) and strictly immutable. Corrections or billing metadata attach out-of-band.
3. **Two-Level Workspace Shell:** Calm global topbar above persistent labeled patient/workspace tabs. No permanent left rails.
4. **Authoritative State:** Structured clinical tables remain the source of truth; AI and workflows are derived assistance.

---

## 5. Open Defects & Remaining Scope (from ROADMAP.md)

${
  openDefects.length > 0
    ? openDefects.join("\n")
    : "- Consult [docs/ROADMAP.md](docs/ROADMAP.md) for full open defect list."
}

---

## 6. Next Steps for Incoming Agent

- **Next Eligible Slice:** ${roadmapNext}
- **Incoming Agent Instructions:**
  1. Inspect the code on \`main\` before assuming prior chat context matches reality.
  2. Confirm branch status against \`origin/main\`.
  3. Bound the vertical slice to one coherent workflow.
  4. Verify with \`npm run check\` and \`npm run build\` before reporting completion.
  5. Archive completed handoffs to \`docs/archive/handoffs/\` and keep root \`HANDOFF.md\` ephemeral.
`;

  if (values["dry-run"]) {
    console.log(handoffMarkdown);
    return;
  }

  // 6. Write Archive Handoff
  const archiveDir = path.join(rootDir, "docs/archive/handoffs");
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const archiveFileName = `HANDOFF-${today}-${slug}.md`;
  const archiveFilePath = path.join(archiveDir, archiveFileName);
  fs.writeFileSync(archiveFilePath, handoffMarkdown, "utf8");
  console.log(`✓ Archived handoff created: docs/archive/handoffs/${archiveFileName}`);

  // 7. Update root HANDOFF.md if --active is specified
  if (values.active) {
    const rootHandoffPath = path.join(rootDir, "HANDOFF.md");
    const activeNotice = `# Active Handoff — ${title}

**Status:** In-flight handoff active.  
**Date:** ${today}  
**Detailed Record:** [docs/archive/handoffs/${archiveFileName}](docs/archive/handoffs/${archiveFileName})  

---

${handoffMarkdown}
`;
    fs.writeFileSync(rootHandoffPath, activeNotice, "utf8");
    console.log("✓ Root HANDOFF.md updated with active in-flight transfer.");
  } else {
    console.log("ℹ Root HANDOFF.md left in clean state (use --active to update it for in-flight handoffs).");
  }
}

main().catch((err) => {
  console.error("Error generating handoff:", err);
  process.exit(1);
});
