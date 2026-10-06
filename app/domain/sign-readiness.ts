import type { ReadinessGroup, ReadinessItem } from "./visit-readiness";

/**
 * Visit readiness at the moment of signing.
 *
 * This is a reading of the one readiness projection (D-100), never a second
 * checklist: the groups come from `buildVisitReadiness`, and nothing here decides
 * whether an item is open. It answers three questions the signing ceremony and the
 * note's status line both need, so they cannot disagree:
 *
 * - what is still open, grouped as the readiness panel groups it;
 * - whether any part could not be read (unavailable is never "ready");
 * - whether signing needs the clinician's explicit acknowledgement.
 *
 * Readiness remains advisory, with an explicit acknowledgement: open items
 * or an unreadable source require one deliberate acknowledgement before Sign
 * enables; a clear readiness adds no friction.
 */

export type SignReadinessStatus = "clear" | "open" | "loading" | "unavailable";

export type SignReadinessGroup = {
  id: ReadinessGroup["id"];
  label: string;
  open: ReadinessItem[];
  /** Why this group could not be read, when it could not. */
  unavailable: string | null;
};

export type SignReadinessSummary = {
  status: SignReadinessStatus;
  openCount: number;
  /** Includes refreshes of a retained source snapshot. */
  checking: boolean;
  /** Groups with open or unavailable content only, in panel order. */
  groups: SignReadinessGroup[];
  /** Ids of every open item, in panel order. */
  openItemIds: string[];
  /** Labels of the groups or items that could not be read. */
  unavailableParts: string[];
  requiresAcknowledgement: boolean;
};

export function summarizeSignReadiness(groups: readonly ReadinessGroup[]): SignReadinessSummary {
  const summaryGroups: SignReadinessGroup[] = [];
  const unavailableParts: string[] = [];
  let loading = false;

  for (const group of groups) {
    const open = group.items.filter((item) => item.state === "open");
    const unavailableItems = group.items.filter((item) => item.state === "unavailable");
    if (group.loading) loading = true;
    const reasons: string[] = [];
    if (group.error) {
      reasons.push(group.error);
      unavailableParts.push(group.label);
    }
    for (const item of unavailableItems) {
      reasons.push(item.label);
      unavailableParts.push(item.label);
    }
    if (open.length > 0 || reasons.length > 0) {
      summaryGroups.push({ id: group.id, label: group.label, open, unavailable: reasons.length > 0 ? reasons.join(" · ") : null });
    }
  }

  const openItems = summaryGroups.flatMap((group) => group.open);
  const openCount = openItems.length;
  const status: SignReadinessStatus =
    unavailableParts.length > 0 ? "unavailable" : loading ? "loading" : openCount > 0 ? "open" : "clear";

  return {
    status,
    openCount,
    checking: loading,
    groups: summaryGroups,
    openItemIds: openItems.map((item) => item.id),
    unavailableParts,
    requiresAcknowledgement: status !== "clear",
  };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The readiness half of the draft note's status line ("DRAFT NOTE · …").
 * "Ready for review" is said only when every part of readiness was read and
 * nothing is open.
 */
export function draftReadinessStatusText(summary: SignReadinessSummary): string {
  const count = summary.openCount > 0 ? plural(summary.openCount, "open item") : null;
  switch (summary.status) {
    case "clear":
      return "Ready for review";
    case "open":
      return count!;
    case "loading":
      return count ? `${count} · checking the chart…` : "Checking readiness…";
    case "unavailable":
      return count ? `${count} · some checks unavailable` : "Readiness unavailable";
  }
}

/** The words on the acknowledgement control, so the count the clinician sees is the count recorded. */
export function acknowledgementLabel(summary: SignReadinessSummary): string {
  if (summary.status === "unavailable" || summary.status === "loading") {
    const prefix = summary.openCount > 0 ? `I've reviewed ${plural(summary.openCount, "open readiness item")}, ` : "";
    return `${prefix}${prefix ? "understand" : "I understand"} that readiness could not be fully checked, and choose to sign.`;
  }
  return `I've reviewed ${plural(summary.openCount, "open readiness item")} and choose to sign.`;
}

/**
 * What the sign request carries when the clinician acknowledged open readiness.
 * It is the client's projection at the moment of signing, recorded so the audit
 * says what the clinician was shown; the server does not recompute readiness.
 */
export type ReadinessAcknowledgement = {
  status: Exclude<SignReadinessStatus, "clear">;
  openCount: number;
  openItemIds: string[];
  unavailableParts: string[];
};

export function readinessAcknowledgementFor(summary: SignReadinessSummary): ReadinessAcknowledgement | null {
  if (summary.status === "clear") return null;
  return {
    status: summary.status,
    openCount: summary.openCount,
    openItemIds: summary.openItemIds,
    unavailableParts: summary.unavailableParts,
  };
}

/** A stable key for "the set of things acknowledged"; when it changes, the acknowledgement no longer applies. */
export function acknowledgementKey(summary: SignReadinessSummary): string {
  return JSON.stringify({
    status: summary.status,
    checking: summary.checking,
    groups: summary.groups.map((group) => ({
      id: group.id, unavailable: group.unavailable,
      open: group.open.map((item) => ({ id: item.id, label: item.label, detail: item.detail })),
    })),
    unavailableParts: summary.unavailableParts,
  });
}

const MAX_IDS = 100;
const MAX_TEXT = 200;

function boundedStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.slice(0, MAX_TEXT));
  if (strings.length !== value.length) return null;
  return strings.slice(0, MAX_IDS);
}

/**
 * Server-side reading of an untrusted acknowledgement from a request body.
 * Returns null for absent or malformed input; it never invents one.
 */
export function parseReadinessAcknowledgement(raw: unknown): ReadinessAcknowledgement | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.status !== "open" && value.status !== "loading" && value.status !== "unavailable") return null;
  const openCount = value.openCount;
  if (typeof openCount !== "number" || !Number.isInteger(openCount) || openCount < 0 || openCount > 10_000) return null;
  const openItemIds = boundedStrings(value.openItemIds);
  const unavailableParts = boundedStrings(value.unavailableParts ?? []);
  if (!openItemIds || !unavailableParts) return null;
  return { status: value.status, openCount, openItemIds, unavailableParts };
}
