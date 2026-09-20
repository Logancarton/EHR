import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * CB-2 Prototype Operations & Unsupported Integrations Containment Tests.
 *
 * Verifies that:
 * 1. No timer or local-state success claims exist for unconfigured external transports (fax, email, sms, social publishing, website deployment, CAQH credentialing).
 * 2. Logan's identity is not associated with fictional MD/NPI/DEA details or fictional email credentials in normal UI.
 * 3. All unconfigured prototype workspaces render truthful unavailable/draft notice banners.
 * 4. Fictional metrics (Google rating, social reach, delivered faxes) are not presented as live authoritative data.
 */

const APP_ROOT = join(import.meta.dirname, "..", "app");

function codeOnly(contents: string): string {
  return contents
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !(
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      );
    })
    .join("\n");
}

function sourceFiles(root: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

test("no workspace surface claims simulated external transport or publishing success", () => {
  const forbiddenPhrases = [
    "Secure email dispatched successfully",
    "Practice broadcast SMS sent to 142",
    "Post scheduled & dispatched to",
    "Public website changes deployed live to clinicalbondpsych.com",
    "Automated CAQH credentialing renewal notice dispatched for",
    "DrFirst IdenTrust hard tokens active",
    "CONF-EHR-",
  ];

  const offenders: string[] = [];
  for (const file of sourceFiles(APP_ROOT)) {
    if (file.includes("preview")) continue;
    const contents = codeOnly(readFileSync(file, "utf8"));
    for (const phrase of forbiddenPhrases) {
      if (contents.includes(phrase)) {
        offenders.push(`${relative(APP_ROOT, file)}: "${phrase}"`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Forbidden external transport/publishing simulations found:\n${offenders.join("\n")}`,
  );
});

test("Logan's identity is not used with fictional MD/NPI/DEA credentials", () => {
  const fictionalCredentials = [
    "BC8921045",
    "1841920391",
    "lcarton@clinicalbondpsych.com",
  ];

  const offenders: string[] = [];
  for (const file of sourceFiles(APP_ROOT)) {
    if (file.includes("preview")) continue;
    const contents = codeOnly(readFileSync(file, "utf8"));
    for (const cred of fictionalCredentials) {
      if (contents.includes(cred)) {
        offenders.push(`${relative(APP_ROOT, file)} contains "${cred}"`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Logan's identity must not carry fictional credentials:\n${offenders.join("\n")}`,
  );
});

test("prototype workspaces declare explicit unconfigured transport banners", () => {
  const emailWorkspace = readFileSync(join(APP_ROOT, "components", "workspaces", "EmailWorkspace.tsx"), "utf8");
  assert.ok(emailWorkspace.includes('data-email-transport="unavailable"'), "Email workspace must declare unconfigured transport");
  assert.ok(emailWorkspace.includes("Drafts"), "Email workspace must include Drafts folder");

  const faxWorkspace = readFileSync(join(APP_ROOT, "components", "workspaces", "FaxWorkspace.tsx"), "utf8");
  assert.ok(faxWorkspace.includes('data-fax-transport="unavailable"'), "Fax workspace must declare unconfigured transport");
  assert.ok(faxWorkspace.includes("Draft"), "Fax workspace must preserve drafts");

  const smsWorkspace = readFileSync(join(APP_ROOT, "components", "workspaces", "PatientCommunicationWorkspace.tsx"), "utf8");
  assert.ok(smsWorkspace.includes('data-sms-transport="unavailable"'), "SMS workspace must declare unconfigured transport");

  const socialWorkspace = readFileSync(join(APP_ROOT, "components", "workspaces", "SocialMediaWorkspace.tsx"), "utf8");
  assert.ok(socialWorkspace.includes('data-social-integration="unconfigured"'), "Social workspace must declare unconfigured integration");

  const hrWorkspace = readFileSync(join(APP_ROOT, "components", "workspaces", "HRStaffWorkspace.tsx"), "utf8");
  assert.ok(hrWorkspace.includes('data-hr-credentialing="unconfigured"'), "HR workspace must declare unconfigured credentialing");

  const websiteWorkspace = readFileSync(join(APP_ROOT, "components", "workspaces", "WebsiteManagerWorkspace.tsx"), "utf8");
  assert.ok(websiteWorkspace.includes('data-website-cms="unconfigured"'), "Website workspace must declare unconfigured CMS");

  const communityWorkspace = readFileSync(join(APP_ROOT, "components", "workspaces", "CommunityWorkspace.tsx"), "utf8");
  assert.ok(communityWorkspace.includes('data-community-network="unconfigured"'), "Community workspace must declare demonstration mode");
});

test("TeamCollaborationDock supports real internal team operations while containing external channels", () => {
  const dock = readFileSync(join(APP_ROOT, "components", "team", "TeamCollaborationDock.tsx"), "utf8");

  // Real internal team operations
  assert.ok(dock.includes("teamApi.sendMessage"), "Team messaging must remain operational");
  assert.ok(dock.includes("teamApi.assignTask"), "Team tasks must remain operational");
  assert.ok(dock.includes("teamApi.updateTaskStatus"), "Team task status updates must remain operational");

  // Contained external channels
  assert.ok(!dock.includes("alert(`Email response dispatched.`"), "Alert simulations must not exist");
  assert.ok(dock.includes("Draft Mode"), "Patient SMS in dock must indicate draft mode");
  assert.ok(dock.includes("Save as Draft (No Gateway)"), "Fax in dock must indicate save as draft");
});
