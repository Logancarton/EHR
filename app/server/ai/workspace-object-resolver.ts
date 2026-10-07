import type {
  OmniboxSurface,
  OmniboxWorkspaceTarget,
  OmniboxWorkspaceTargetNavigation,
} from "../../domain/omnibox";
import { getLauncherWorkspaceDestinations } from "../../lib/workspace-catalog";
import {
  GLOBAL_WORKSPACE_MODULES,
  isGlobalModuleAvailable,
  moduleTitle,
  type GlobalWorkspaceModule,
} from "../../lib/workspace-navigation";
import { accessiblePatientIds, accessSelectionForActor } from "../auth/patient-access";
import { hasPermission, type ProviderContext } from "../auth/provider-context";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { ClinicalSearchRepository } from "../repositories/clinical-search-repository";
import { PatientRepository, type PatientRecord } from "../repositories/patient-repository";
import { ProspectivePersonRepository } from "../repositories/prospective-person-repository";
import { TeamRepository } from "../repositories/team-repository";
import { sharePractice } from "../services/collaboration-service";

const COMMAND_WORDS = new Set([
  "find", "search", "locate", "look", "for", "open", "show", "me", "go", "to",
  "where", "is", "are", "the", "a", "an", "my", "this", "that", "patient", "patients",
  "chart", "charts", "file", "files", "document", "documents", "record", "records",
  "note", "notes", "encounter", "encounters", "visit", "visits", "person", "people",
  "staff", "employee", "employees", "workspace", "area", "section", "inside", "within",
  "mentions", "mention", "mentioned", "discussed", "talked", "about", "please",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function words(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function targetKey(target: OmniboxWorkspaceTarget): string {
  return `${target.kind}:${target.id}`;
}

function lexicalScore(text: string, terms: readonly string[]): number {
  const normalized = normalize(text);
  if (!normalized || terms.length === 0) return 0;
  let score = 0;
  for (const term of terms) {
    if (normalized === term) score += 50;
    else if (normalized.includes(term)) score += 12;
  }
  if (terms.every((term) => normalized.includes(term))) score += 24;
  return score;
}

function passageAround(text: string, terms: readonly string[], radius = 120): string | undefined {
  if (!text.trim() || terms.length === 0) return undefined;
  const lower = text.toLowerCase();
  let index = -1;
  for (const term of terms) {
    index = lower.indexOf(term.toLowerCase());
    if (index >= 0) break;
  }
  if (index < 0) return undefined;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

function sectionFromQuery(query: string): OmniboxSurface {
  const normalized = normalize(query);
  if (/\bdocuments?\b|\bfiles?\b/.test(normalized)) return "documents";
  if (/\blabs?\b|\bresults?\b/.test(normalized)) return "labs";
  if (/\bmeds?\b|\bmedications?\b|\bprescriptions?\b/.test(normalized)) return "medications";
  if (/\bmessages?\b|\bthreads?\b/.test(normalized)) return "messages";
  if (/\bhistory\b|\btimeline\b|\bnotes?\b|\bencounters?\b|\bvisits?\b/.test(normalized)) return "history";
  if (/\bencounter\b/.test(normalized)) return "encounter";
  return "general";
}

function patientMentioned(query: string, patient: PatientRecord): boolean {
  const normalizedQuery = ` ${normalize(query)} `;
  const normalizedName = normalize(patient.name);
  if (normalizedName && normalizedQuery.includes(` ${normalizedName} `)) return true;
  if (normalize(patient.mrn) && normalizedQuery.includes(` ${normalize(patient.mrn)} `)) return true;
  const nameParts = normalizedName.split(" ").filter((part) => part.length >= 3);
  return nameParts.length > 0 && nameParts.every((part) => normalizedQuery.includes(` ${part} `));
}

function searchTerms(query: string, namedPatients: readonly PatientRecord[]): string[] {
  const patientWords = new Set(namedPatients.flatMap((patient) => words(patient.name)));
  return unique(
    words(query).filter((word) =>
      word.length >= 2 &&
      !COMMAND_WORDS.has(word) &&
      !patientWords.has(word),
    ),
  ).slice(0, 12);
}

function workspaceNavigation(entry: ReturnType<typeof getLauncherWorkspaceDestinations>[number]): OmniboxWorkspaceTargetNavigation | null {
  if (entry.id === "home") return { kind: "view", view: "home" };
  if (entry.id === "dashboard" || entry.id === "clinical") return { kind: "view", view: "today" };
  if (entry.id === "calendar") return { kind: "view", view: "calendar" };
  if (entry.id === "patients") return { kind: "view", view: "patient" };
  if (entry.targetModule) {
    return {
      kind: "module",
      module: entry.targetModule as Extract<OmniboxWorkspaceTargetNavigation, { kind: "module" }>["module"],
    };
  }
  return null;
}

function workspaceTargets(query: string, terms: readonly string[]): OmniboxWorkspaceTarget[] {
  const normalizedQuery = normalize(query);
  return getLauncherWorkspaceDestinations().flatMap((entry) => {
    const navigation = workspaceNavigation(entry);
    if (!navigation) return [];
    const haystack = [entry.label, entry.description, ...(entry.keywords || [])].join(" ");
    let score = lexicalScore(haystack, terms);
    if (normalizedQuery === normalize(entry.label)) score += 100;
    if (normalizedQuery.includes(normalize(entry.label))) score += 40;
    if (score <= 0) return [];
    return [{
      id: `workspace-${entry.id}`,
      kind: "workspace" as const,
      label: entry.label,
      description: entry.description,
      score,
      navigation,
    }];
  });
}

const MODULE_SEARCH_ALIASES: Partial<Record<GlobalWorkspaceModule, string[]>> = {
  intake: ["prospective", "registration", "onboarding", "new patient"],
  inbox: ["messages", "inbox", "communication"],
  tasks: ["task", "tasks", "todo", "work"],
  documents: ["document", "documents", "file", "files", "records", "uploads", "scans"],
  labs: ["lab", "labs", "result", "results"],
  prescribing: ["prescribing", "prescription", "prescriptions", "rx", "erx", "medications", "meds"],
  billing: ["billing", "claims", "charges", "insurance"],
  brand: ["brand", "branding", "marketing", "reputation"],
  reports: ["reports", "analytics", "analysis"],
  settings: ["settings", "organization", "administration", "admin"],
  website: ["website", "portal"],
  social_media: ["social", "social media", "reputation"],
  email: ["email", "mail"],
  hr: ["hr", "staff", "people", "employee", "employees", "licenses"],
  patient_communication: ["patient communication", "sms", "patient messages"],
  financial_integration: ["financial", "banking", "bank"],
  fax: ["fax", "efax"],
  community: ["community", "peer", "network"],
};

function globalModuleTargets(query: string, terms: readonly string[]): OmniboxWorkspaceTarget[] {
  const normalizedQuery = normalize(query);
  return [...GLOBAL_WORKSPACE_MODULES].flatMap((module) => {
    if (!isGlobalModuleAvailable(module)) return [];
    const label = moduleTitle(module);
    const aliases = MODULE_SEARCH_ALIASES[module] || [];
    const haystack = [label, module.replaceAll("_", " "), ...aliases].join(" ");
    let score = lexicalScore(haystack, terms);
    if (normalizedQuery === normalize(label) || normalizedQuery === normalize(module)) score += 100;
    if (aliases.some((alias) => normalizedQuery.includes(normalize(alias)))) score += 35;
    if (score <= 0) return [];
    return [{
      id: `workspace-${module}`,
      kind: "workspace" as const,
      label,
      description: `Clinical Bond workspace · ${label}`,
      score,
      navigation: {
        kind: "module" as const,
        module: module as Extract<OmniboxWorkspaceTargetNavigation, { kind: "module" }>["module"],
      },
    }];
  });
}

function patientTargets(
  query: string,
  patients: readonly PatientRecord[],
  namedPatients: readonly PatientRecord[],
  patientScope: readonly PatientRecord[],
): OmniboxWorkspaceTarget[] {
  const normalizedQuery = normalize(query);
  const section = sectionFromQuery(query);
  return patients.flatMap((patient) => {
    const name = normalize(patient.name);
    const mrn = normalize(patient.mrn);
    const mentioned = namedPatients.some((item) => item.id === patient.id);
    const scoped = patientScope.some((item) => item.id === patient.id);
    let score = mentioned ? 120 : 0;
    if (!mentioned && scoped && (section !== "general" || /\b(this|current)\s+(patient|chart)\b|\bchart\b/i.test(query))) {
      score += 90;
    }
    if (normalizedQuery === name || normalizedQuery === mrn) score += 100;
    else if (name && normalizedQuery.includes(name)) score += 60;
    else {
      const parts = words(patient.name).filter((part) => part.length >= 3);
      if (parts.some((part) => normalizedQuery.includes(part))) score += 20;
    }
    if (score <= 0) return [];
    return [{
      id: patient.id,
      kind: "patient" as const,
      label: patient.name,
      description: `Patient chart · ${patient.mrn}`,
      provenanceRef: `patients/${patient.id}`,
      score,
      navigation: { kind: "patient" as const, patientId: patient.id, section },
    }];
  });
}

function documentTargets(
  query: string,
  patients: readonly PatientRecord[],
  namedPatients: readonly PatientRecord[],
  terms: readonly string[],
): OmniboxWorkspaceTarget[] {
  const wantsDocuments = /\b(files?|documents?|pdfs?|scans?|uploads?)\b/i.test(query);
  const scopedPatients = namedPatients.length ? namedPatients : patients;
  const output: OmniboxWorkspaceTarget[] = [];

  for (const patient of scopedPatients) {
    const documents = ClinicalRecordRepository.documents(patient.id).slice(0, 80);
    for (const doc of documents) {
      const metadata = [
        doc.title,
        doc.document_type,
        doc.mime_type,
        doc.source_system,
        doc.source_ref,
        doc.created_by,
      ].filter(Boolean).join(" ");
      const titleScore = lexicalScore(metadata, terms);
      const versions = ClinicalRecordRepository.documentVersions(doc.id);
      const current = versions.find((version: any) => Number(version.version_number) === Number(doc.current_version)) || versions[0];
      const content = typeof current?.content_text === "string" ? current.content_text : "";
      const contentScore = lexicalScore(content, terms);
      const shouldListRecent = wantsDocuments && namedPatients.length > 0 && terms.length === 0;
      if (titleScore <= 0 && contentScore <= 0 && !shouldListRecent) continue;

      const passage = contentScore > 0 ? passageAround(content, terms) : undefined;
      const kind = passage ? "document_passage" as const : "document" as const;
      const score = (passage ? 85 : 65) + titleScore + Math.min(contentScore, 50) + (namedPatients.length ? 30 : 0);
      output.push({
        id: doc.id,
        kind,
        label: String(doc.title || "Untitled document"),
        description: `${patient.name} · ${String(doc.document_type || "document").replaceAll("_", " ")} · v${doc.current_version}`,
        snippet: passage,
        provenanceRef: passage
          ? `documents/${doc.id}/versions/${current?.version_number ?? doc.current_version}`
          : `documents/${doc.id}`,
        score,
        navigation: {
          kind: "patient",
          patientId: patient.id,
          section: "documents",
          documentId: doc.id,
        },
      });
    }
  }

  return output;
}

function encounterTargets(
  query: string,
  patients: readonly PatientRecord[],
  namedPatients: readonly PatientRecord[],
  terms: readonly string[],
): OmniboxWorkspaceTarget[] {
  if (!terms.length) return [];
  const scopedPatients = namedPatients.length ? namedPatients : patients;
  const searchText = terms.join(" ");
  return scopedPatients.flatMap((patient) =>
    ClinicalSearchRepository.searchEncounters(searchText, patient.id, namedPatients.length ? 5 : 2).map((match) => ({
      id: match.encounterId,
      kind: "encounter" as const,
      label: `${patient.name} · ${match.date}`,
      description: match.chiefComplaint || "Encounter",
      snippet: match.snippet.replace(/\*\*/g, ""),
      provenanceRef: `encounters/${match.encounterId}`,
      score: 70 + (namedPatients.length ? 35 : 0) + Math.max(0, 10 - Math.abs(match.rank || 0)),
      navigation: {
        kind: "patient" as const,
        patientId: patient.id,
        section: "history" as const,
      },
    })),
  );
}

function prospectiveTargets(
  query: string,
  actor: ProviderContext,
): OmniboxWorkspaceTarget[] {
  const normalized = normalize(query);
  const selection = accessSelectionForActor(actor);
  const organizationIds = unique([...selection.organizationIds, ...selection.assignedScopeOrganizationIds]);
  const seen = new Set<string>();
  const prospects = organizationIds.flatMap((organizationId) =>
    ProspectivePersonRepository.listActiveByOrganization(organizationId),
  ).filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });

  return prospects.flatMap((person) => {
    const name = normalize(person.name);
    if (!name || !normalized.includes(name)) {
      const parts = words(person.name).filter((part) => part.length >= 3);
      if (!parts.some((part) => normalized.includes(part))) return [];
    }
    return [{
      id: person.id,
      kind: "prospective_person" as const,
      label: person.name,
      description: "Prospective person · Intake",
      provenanceRef: `prospective-persons/${person.id}`,
      score: normalized.includes(name) ? 105 : 55,
      navigation: { kind: "module" as const, module: "intake" as const },
    }];
  });
}

function staffTargets(query: string, actor: ProviderContext): OmniboxWorkspaceTarget[] {
  if (!hasPermission(actor, "collaborate_team")) return [];
  const normalized = normalize(query);
  let members: ReturnType<typeof TeamRepository.listMembers> = [];
  try {
    members = TeamRepository.listMembers(actor.userId)
      .filter((member) => sharePractice(actor.userId, member.id));
  } catch {
    return [];
  }

  return members.flatMap((member) => {
    const name = normalize(member.displayName);
    if (!name || !normalized.includes(name)) {
      const parts = words(member.displayName).filter((part) => part.length >= 3);
      if (!parts.some((part) => normalized.includes(part))) return [];
    }
    return [{
      id: member.id,
      kind: "staff" as const,
      label: member.displayName,
      description: `Staff · ${member.credentials || member.role}`,
      provenanceRef: `team-members/${member.id}`,
      score: normalized.includes(name) ? 100 : 50,
      navigation: { kind: "communication" as const, partnerId: member.id },
    }];
  });
}

export function isWorkspaceLookupQuery(query: string): boolean {
  const normalized = normalize(query);
  if (/^(find|search|locate)\b/.test(normalized)) return true;
  if (/^look\s+for\b/.test(normalized)) return true;
  if (/\bwhere\b.*\b(file|document|note|encounter|chart|patient|person|workspace|section|area|calendar|intake|tasks|billing|hr)\b/.test(normalized)) return true;
  if (/^(open|go to)\b/.test(normalized) && /\b(file|document|chart|patient|calendar|schedule|intake|documents|labs|results|meds|medications|messages|history|tasks|billing|brand|branding|prescribing|inbox|dashboard|home|clinical|ehr|reports|analysis|settings|email|fax|community|website|social|staff|people|hr|note|encounter|visit|workspace|area|section)\b/.test(normalized)) return true;
  if (/^show me\b/.test(normalized) && /\b(file|document|chart|patient|person|people|staff|workspace|area|section|note|encounter|visit)\b/.test(normalized)) return true;
  return false;
}

export function resolveWorkspaceObjects(input: {
  query: string;
  actor: ProviderContext;
  activePatientId?: string;
  limit?: number;
}): OmniboxWorkspaceTarget[] {
  const patients = PatientRepository.getManyByIds(accessiblePatientIds(input.actor));
  const namedPatients = patients.filter((patient) => patientMentioned(input.query, patient));
  const activePatient = input.activePatientId
    ? patients.find((patient) => patient.id === input.activePatientId)
    : undefined;
  const crossPatientRequested = /\b(across|all|any|every)\s+(?:the\s+)?patients?\b|\bpractice[- ]wide\b|\bacross\s+(?:the\s+)?practice\b/i.test(input.query);
  const patientScope = namedPatients.length
    ? namedPatients
    : activePatient && !crossPatientRequested
      ? [activePatient]
      : [];
  const terms = searchTerms(input.query, patientScope);

  const candidates = [
    ...workspaceTargets(input.query, terms.length ? terms : words(input.query)),
    ...globalModuleTargets(input.query, terms.length ? terms : words(input.query)),
    ...patientTargets(input.query, patients, namedPatients, patientScope),
    ...documentTargets(input.query, patients, patientScope, terms),
    ...encounterTargets(input.query, patients, patientScope, terms),
    ...prospectiveTargets(input.query, input.actor),
    ...staffTargets(input.query, input.actor),
  ];

  const best = new Map<string, OmniboxWorkspaceTarget>();
  for (const candidate of candidates) {
    const key = targetKey(candidate);
    const existing = best.get(key);
    if (!existing || candidate.score > existing.score) best.set(key, candidate);
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, input.limit ?? 12);
}
