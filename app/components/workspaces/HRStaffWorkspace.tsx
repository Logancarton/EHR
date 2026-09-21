"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../ui/Icon";
import { api } from "../../lib/api-client";
import { ApiError } from "../../lib/api-error";
import type { HrRecord, HrRecordItem } from "../../server/repositories/hr-repository";
import type { HrDirectoryEntry } from "../../server/services/hr-service";

/**
 * HR (D-086).
 *
 * Two scopes, and which one a viewer gets is the server's decision, not this
 * component's. Everyone sees their own record — insurance, licensing deadlines,
 * coachings, goals. Other people's records need `manage_hr`, held by owners and
 * managers and grantable by them to a designated HR administrator.
 *
 * What this replaced rendered a hard-coded roster of every employee's NPI, DEA
 * number, license expirations and malpractice policy to anyone who opened the module.
 * So two rules here are load-bearing rather than stylistic: the People tab is not
 * offered at all unless the server said the viewer may read others, and a refusal is
 * shown as a refusal. An HR surface that answers "nothing here" when it means "not
 * yours to see" is the failure this slice exists to prevent.
 */

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  license: "Licensing",
  coaching: "Coaching",
  goal: "Goals",
  other: "Other",
};

const CATEGORY_ORDER = ["license", "insurance", "coaching", "goal", "other"] as const;

function daysUntil(dueOn: string | null): number | null {
  if (!dueOn) return null;
  const due = new Date(`${dueOn}T00:00:00Z`).getTime();
  if (Number.isNaN(due)) return null;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - start) / 86_400_000);
}

/**
 * Urgency is derived from the deadline itself rather than stored, so a fixture cannot
 * claim something is fine when the date says otherwise. Text carries it as well as
 * colour — a deadline a clinician can only see if they can distinguish amber from
 * grey is not a deadline they can act on.
 */
function deadlineTone(days: number | null): { tone: string; label: string } {
  if (days === null) return { tone: "none", label: "No deadline" };
  if (days < 0) return { tone: "overdue", label: `Overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}` };
  if (days === 0) return { tone: "overdue", label: "Due today" };
  if (days <= 30) return { tone: "soon", label: `Due in ${days} ${days === 1 ? "day" : "days"}` };
  return { tone: "ok", label: `Due in ${days} days` };
}

function ItemRow({ item }: { item: HrRecordItem }) {
  const days = daysUntil(item.dueOn);
  const deadline = deadlineTone(days);
  return (
    <li className="hr-item" data-hr-category={item.category} data-hr-deadline={deadline.tone}>
      <div className="hr-item-main">
        <strong>{item.title}</strong>
        {item.detail && <p>{item.detail}</p>}
      </div>
      <div className="hr-item-meta">
        <span className="hr-item-deadline">{deadline.label}</span>
        {item.dueOn && <span className="hr-item-date">{item.dueOn}</span>}
      </div>
    </li>
  );
}

function RecordDetail({ record, emptyMessage }: { record: HrRecord | null; emptyMessage: string }) {
  const grouped = useMemo(() => {
    const map = new Map<string, HrRecordItem[]>();
    for (const item of record?.items ?? []) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [record]);

  if (!record) {
    return <div className="hr-empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="hr-record">
      <div className="hr-record-header">
        <div>
          <span className="hr-record-eyebrow">Employment</span>
          <strong>{record.employmentType || "Not recorded"}</strong>
        </div>
        {record.startedOn && (
          <div>
            <span className="hr-record-eyebrow">Started</span>
            <strong>{record.startedOn}</strong>
          </div>
        )}
      </div>

      {record.items.length === 0 ? (
        <div className="hr-empty-state">
          Nothing has been assigned to this record yet. The office manager or owner assigns
          what it holds.
        </div>
      ) : (
        CATEGORY_ORDER.filter((category) => grouped.has(category)).map((category) => (
          <section key={category} className="hr-category" data-hr-section={category}>
            <h3>{CATEGORY_LABELS[category] ?? category}</h3>
            <ul className="hr-item-list">
              {grouped.get(category)!.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export default function HRStaffWorkspace() {
  const [tab, setTab] = useState<"mine" | "people">("mine");
  const [own, setOwn] = useState<HrRecord | null>(null);
  const [canReadOthers, setCanReadOthers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [directory, setDirectory] = useState<HrDirectoryEntry[] | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadOwn = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.hr.mine();
      setOwn(result.record);
      setCanReadOthers(result.canReadOthers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your HR record.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOwn();
  }, [loadOwn]);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError("");
    try {
      const entries = await api.hr.directory();
      setDirectory(entries);
      setSelectedUserId((current) => current ?? entries[0]?.userId ?? null);
    } catch (err) {
      // A refusal is reported as a refusal. Never an empty directory.
      setDirectory(null);
      setDirectoryError(
        err instanceof ApiError && err.status === 403
          ? "You do not have access to other employees' records. Access is held by the owner, the office manager, and anyone they designate as HR personnel."
          : err instanceof Error
            ? err.message
            : "Unable to load the employee directory.",
      );
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "people" && canReadOthers && directory === null && !directoryError) {
      void loadDirectory();
    }
  }, [tab, canReadOthers, directory, directoryError, loadDirectory]);

  const selected = directory?.find((entry) => entry.userId === selectedUserId) ?? null;

  return (
    <div className="practice-subworkspace hr-workspace" data-hr-workspace="">
      {/*
        The practice tracks these dates; nothing verifies them against a licensing board,
        a carrier, or a credentialing service. A renewal date that looks authoritative is
        worse than no date at all if someone stops checking the source because this screen
        showed one.
      */}
      <div data-hr-credentialing="unconfigured" className="practice-banner-notice">
        <Icon name="info" />
        <span>
          Credentialing and primary-source verification are not configured. Licensing and
          insurance dates here are what the practice recorded, not verified status.
        </span>
      </div>

      <div className="workspace-page-header">
        <div>
          <h2>HR</h2>
          <p>
            Your insurance, licensing deadlines, coachings and goals. What this record holds
            is assigned by the office manager or owner.
          </p>
        </div>
      </div>

      <div className="hr-tabs" role="tablist" aria-label="HR sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          data-hr-tab="mine"
          className={`hr-tab ${tab === "mine" ? "active" : ""}`}
          onClick={() => setTab("mine")}
        >
          <Icon name="badge" size="sm" />
          <span>My HR</span>
        </button>
        {/*
          Not rendered at all without access, rather than rendered-and-disabled. A
          visible People tab tells everyone the practice keeps records they cannot see,
          which is an invitation to ask why rather than a boundary.
        */}
        {canReadOthers && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "people"}
            data-hr-tab="people"
            className={`hr-tab ${tab === "people" ? "active" : ""}`}
            onClick={() => setTab("people")}
          >
            <Icon name="group" size="sm" />
            <span>People</span>
          </button>
        )}
      </div>

      {tab === "mine" && (
        <div className="hr-panel" data-hr-panel="mine">
          {loading ? (
            <div className="hr-loading-state">Loading your HR record…</div>
          ) : error ? (
            <div className="practice-banner-error" role="alert">
              <Icon name="error" /> {error}
              <button type="button" className="hr-retry" onClick={() => void loadOwn()}>
                Try again
              </button>
            </div>
          ) : (
            <RecordDetail
              record={own}
              emptyMessage="The practice has not set up an HR record for you yet. The office manager or owner creates it and assigns what it holds."
            />
          )}
        </div>
      )}

      {tab === "people" && canReadOthers && (
        <div className="hr-panel hr-people" data-hr-panel="people">
          {directoryLoading ? (
            <div className="hr-loading-state">Loading employee records…</div>
          ) : directoryError ? (
            <div className="practice-banner-error" role="alert" data-hr-refusal="">
              <Icon name="lock" /> {directoryError}
            </div>
          ) : (
            <div className="hr-people-grid">
              <ul className="hr-people-list" aria-label="Employees">
                {(directory ?? []).map((entry) => (
                  <li key={entry.userId}>
                    <button
                      type="button"
                      data-hr-person={entry.userId}
                      className={`hr-person ${entry.userId === selectedUserId ? "active" : ""}`}
                      onClick={() => setSelectedUserId(entry.userId)}
                    >
                      <strong>{entry.displayName}</strong>
                      <span>
                        {entry.credentials ? `${entry.credentials} · ` : ""}
                        {entry.membershipRole}
                        {entry.hrDesignated ? " · HR" : ""}
                      </span>
                      {!entry.active && <span className="hr-person-inactive">Deactivated</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hr-person-detail">
                {selected ? (
                  <RecordDetail
                    record={selected.record}
                    emptyMessage={`No HR record has been set up for ${selected.displayName} yet.`}
                  />
                ) : (
                  <div className="hr-empty-state">Select an employee to see their record.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
