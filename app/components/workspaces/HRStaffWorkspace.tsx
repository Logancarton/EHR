"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { api } from "../../lib/api-client";
import { ApiError } from "../../lib/api-error";
import type { HrItemCategory, HrRecord, HrRecordItem } from "../../server/repositories/hr-repository";
import type { HrDirectoryEntry, HrItemStatus } from "../../server/services/hr-service";

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
 *
 * Assignment follows the same discipline. Which controls exist is decided by
 * `canAssign` and `canDesignate` from the server, not by anything this component
 * infers about the viewer, so a control never appears for an act the next request
 * would refuse. Designating is separated from assigning because they are different
 * authorities: a designated HR administrator assigns material, but only an owner or
 * manager grants HR access. And nothing here reports success from local state — every
 * write re-reads the directory, so what the screen shows is what was stored.
 */

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  license: "Licensing",
  coaching: "Coaching",
  goal: "Goals",
  other: "Other",
};

const CATEGORY_ORDER = ["license", "insurance", "coaching", "goal", "other"] as const;

/**
 * The categories an assignment form offers, in the order the owner named them. Kept
 * beside `CATEGORY_ORDER` rather than derived from it: what can be assigned and how
 * existing material is grouped are two decisions that may legitimately diverge.
 */
const ASSIGNABLE_CATEGORIES: readonly HrItemCategory[] = [
  "license",
  "insurance",
  "coaching",
  "goal",
  "other",
];

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  attention: "Needs attention",
  in_progress: "In progress",
  scheduled: "Scheduled",
  completed: "Completed",
};

const ASSIGNABLE_STATUSES: readonly HrItemStatus[] = [
  "active",
  "attention",
  "in_progress",
  "scheduled",
  "completed",
];

const EMPTY_ITEM_DRAFT = {
  category: "license" as HrItemCategory,
  title: "",
  detail: "",
  status: "active" as HrItemStatus,
  dueOn: "",
};

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
        <span className="hr-item-status" data-hr-status={item.status}>
          {STATUS_LABELS[item.status] ?? item.status}
        </span>
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

  // Which controls exist at all is the server's answer, carried here rather than
  // inferred from a role this component happens to know.
  const [canAssign, setCanAssign] = useState(false);
  const [canDesignate, setCanDesignate] = useState(false);

  const [employmentDraft, setEmploymentDraft] = useState({ employmentType: "", startedOn: "" });
  const [itemDraft, setItemDraft] = useState(EMPTY_ITEM_DRAFT);
  const [saving, setSaving] = useState<"" | "record" | "item" | "designation">("");
  const [assignError, setAssignError] = useState("");
  const [assignNotice, setAssignNotice] = useState("");

  const loadOwn = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.hr.mine();
      setOwn(result.record);
      setCanReadOthers(result.canReadOthers);
      setCanAssign(result.canAssign);
      setCanDesignate(result.canDesignate);
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
      const result = await api.hr.directory();
      setDirectory(result.entries);
      setCanAssign(result.canAssign);
      setCanDesignate(result.canDesignate);
      setSelectedUserId((current) => current ?? result.entries[0]?.userId ?? null);
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

  /**
   * Re-reads the directory after a write so the screen shows what was stored rather
   * than what was submitted. Deliberately not a local merge: an assignment that only
   * looks applied is the kind of quiet lie this surface exists to avoid.
   */
  const refreshAfterWrite = useCallback(async () => {
    try {
      const result = await api.hr.directory();
      setDirectory(result.entries);
      setCanAssign(result.canAssign);
      setCanDesignate(result.canDesignate);
    } catch {
      // The write itself already reported its own outcome; a failed re-read must not
      // be presented as a failed assignment.
      setAssignError(
        (current) =>
          current ||
          "Saved, but the directory could not be reloaded. Reopen People to see the current record.",
      );
    }
    // The viewer's own record may be the one that changed.
    await loadOwn();
  }, [loadOwn]);

  useEffect(() => {
    if (tab === "people" && canReadOthers && directory === null && !directoryError) {
      void loadDirectory();
    }
  }, [tab, canReadOthers, directory, directoryError, loadDirectory]);

  const selected = directory?.find((entry) => entry.userId === selectedUserId) ?? null;

  /**
   * Drafts follow the selected person. Editing Morgan's employment type and then
   * clicking Alex must not leave Morgan's text sitting in Alex's form.
   *
   * Keyed on *who is selected*, not on what their record currently says. Every write
   * re-reads the directory, so a content-keyed reset would fire on the refresh the
   * write itself triggered and wipe the outcome message before anyone could read it.
   */
  const draftsLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (draftsLoadedFor.current === selectedUserId) return;
    draftsLoadedFor.current = selectedUserId;
    const entry = directory?.find((item) => item.userId === selectedUserId) ?? null;
    setEmploymentDraft({
      employmentType: entry?.record?.employmentType ?? "",
      startedOn: entry?.record?.startedOn ?? "",
    });
    setItemDraft(EMPTY_ITEM_DRAFT);
    setAssignError("");
    setAssignNotice("");
  }, [selectedUserId, directory]);

  const failureMessage = (err: unknown, fallback: string) =>
    err instanceof ApiError && err.status === 403
      ? err.message
      : err instanceof Error
        ? err.message
        : fallback;

  const submitEmployment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving("record");
    setAssignError("");
    setAssignNotice("");
    try {
      await api.hr.assignRecord({
        userId: selected.userId,
        employmentType: employmentDraft.employmentType,
        startedOn: employmentDraft.startedOn || null,
      });
      setAssignNotice(
        selected.record
          ? `Updated ${selected.displayName}'s employment details.`
          : `Created an HR record for ${selected.displayName}.`,
      );
      await refreshAfterWrite();
    } catch (err) {
      setAssignError(failureMessage(err, "The HR record could not be saved."));
    } finally {
      setSaving("");
    }
  };

  const submitItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving("item");
    setAssignError("");
    setAssignNotice("");
    try {
      const { item } = await api.hr.assignItem({
        userId: selected.userId,
        category: itemDraft.category,
        title: itemDraft.title,
        detail: itemDraft.detail,
        status: itemDraft.status,
        dueOn: itemDraft.dueOn || null,
      });
      setAssignNotice(`Assigned "${item.title}" to ${selected.displayName}.`);
      setItemDraft(EMPTY_ITEM_DRAFT);
      await refreshAfterWrite();
    } catch (err) {
      setAssignError(failureMessage(err, "The item could not be assigned."));
    } finally {
      setSaving("");
    }
  };

  const toggleDesignation = async () => {
    if (!selected) return;
    const next = !selected.hrDesignated;
    setSaving("designation");
    setAssignError("");
    setAssignNotice("");
    try {
      await api.hr.setDesignation(selected.userId, next);
      setAssignNotice(
        next
          ? `${selected.displayName} is now HR personnel and can read every employee record.`
          : `${selected.displayName} no longer has access to other employees' records.`,
      );
      await refreshAfterWrite();
    } catch (err) {
      setAssignError(failureMessage(err, "The HR designation could not be changed."));
    } finally {
      setSaving("");
    }
  };

  const inheritsHrAccess =
    selected?.membershipRole === "owner" || selected?.membershipRole === "manager";

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
                  <>
                    <RecordDetail
                      record={selected.record}
                      emptyMessage={`No HR record has been set up for ${selected.displayName} yet.`}
                    />

                    {/*
                      Offered only because the server said this viewer may assign. The
                      same request is checked again server-side; this decides what is
                      worth showing, not what is allowed.
                    */}
                    {canAssign && (
                      <div className="hr-assign" data-hr-assign={selected.userId}>
                        {assignError && (
                          <div className="practice-banner-error" role="alert" data-hr-assign-error="">
                            <Icon name="error" /> {assignError}
                          </div>
                        )}
                        {assignNotice && !assignError && (
                          <div className="hr-assign-notice" role="status" data-hr-assign-notice="">
                            <Icon name="check_circle" size="sm" /> {assignNotice}
                          </div>
                        )}

                        <form className="hr-assign-form" onSubmit={submitEmployment}>
                          <h3>
                            {selected.record
                              ? "Employment details"
                              : `Set up an HR record for ${selected.displayName}`}
                          </h3>
                          {!selected.record && (
                            <p className="hr-assign-help">
                              A record has to exist before insurance, licensing deadlines,
                              coachings or goals can be assigned to it.
                            </p>
                          )}
                          <div className="hr-assign-row">
                            <label className="hr-field">
                              <span>Employment type</span>
                              <input
                                type="text"
                                data-hr-field="employmentType"
                                value={employmentDraft.employmentType}
                                maxLength={200}
                                placeholder="1.0 FTE — Psychiatric nurse practitioner"
                                onChange={(event) =>
                                  setEmploymentDraft((draft) => ({
                                    ...draft,
                                    employmentType: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="hr-field hr-field-date">
                              <span>Started on</span>
                              <input
                                type="date"
                                data-hr-field="startedOn"
                                value={employmentDraft.startedOn}
                                onChange={(event) =>
                                  setEmploymentDraft((draft) => ({
                                    ...draft,
                                    startedOn: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <button
                            type="submit"
                            className="hr-assign-submit"
                            data-hr-action="save-record"
                            disabled={saving !== ""}
                          >
                            {saving === "record"
                              ? "Saving…"
                              : selected.record
                                ? "Save employment details"
                                : "Create HR record"}
                          </button>
                        </form>

                        {/*
                          Assigning into a record that does not exist yet is refused by
                          the server, so the form is not offered until it does — the
                          two acts stay separate and separately audited.
                        */}
                        {selected.record && (
                          <form className="hr-assign-form" onSubmit={submitItem}>
                            <h3>Assign to this record</h3>
                            <div className="hr-assign-row">
                              <label className="hr-field">
                                <span>Category</span>
                                <select
                                  data-hr-field="category"
                                  value={itemDraft.category}
                                  onChange={(event) =>
                                    setItemDraft((draft) => ({
                                      ...draft,
                                      category: event.target.value as HrItemCategory,
                                    }))
                                  }
                                >
                                  {ASSIGNABLE_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                      {CATEGORY_LABELS[category] ?? category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="hr-field hr-field-wide">
                                <span>Title</span>
                                <input
                                  type="text"
                                  required
                                  maxLength={200}
                                  data-hr-field="title"
                                  value={itemDraft.title}
                                  placeholder="Nurse practitioner license renewal"
                                  onChange={(event) =>
                                    setItemDraft((draft) => ({ ...draft, title: event.target.value }))
                                  }
                                />
                              </label>
                            </div>
                            <label className="hr-field">
                              <span>Detail</span>
                              <textarea
                                rows={2}
                                maxLength={1000}
                                data-hr-field="detail"
                                value={itemDraft.detail}
                                placeholder="What this covers, and what the employee needs to do."
                                onChange={(event) =>
                                  setItemDraft((draft) => ({ ...draft, detail: event.target.value }))
                                }
                              />
                            </label>
                            <div className="hr-assign-row">
                              <label className="hr-field">
                                <span>Status</span>
                                <select
                                  data-hr-field="status"
                                  value={itemDraft.status}
                                  onChange={(event) =>
                                    setItemDraft((draft) => ({
                                      ...draft,
                                      status: event.target.value as HrItemStatus,
                                    }))
                                  }
                                >
                                  {ASSIGNABLE_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {STATUS_LABELS[status] ?? status}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="hr-field hr-field-date">
                                <span>Due on (optional)</span>
                                <input
                                  type="date"
                                  data-hr-field="dueOn"
                                  value={itemDraft.dueOn}
                                  onChange={(event) =>
                                    setItemDraft((draft) => ({ ...draft, dueOn: event.target.value }))
                                  }
                                />
                              </label>
                            </div>
                            <button
                              type="submit"
                              className="hr-assign-submit"
                              data-hr-action="assign-item"
                              disabled={saving !== "" || itemDraft.title.trim() === ""}
                            >
                              {saving === "item" ? "Assigning…" : "Assign to record"}
                            </button>
                          </form>
                        )}

                        {/*
                          A narrower authority than assigning: owners and managers only.
                          A designated HR administrator sees the forms above and not
                          this, so HR access cannot propagate without an administrator.
                        */}
                        {canDesignate && (
                          <div className="hr-assign-form hr-designation" data-hr-designation="">
                            <h3>HR access</h3>
                            {inheritsHrAccess ? (
                              <p className="hr-assign-help">
                                {selected.displayName} is an organization {selected.membershipRole} and
                                already reads every employee record. Change their organization role to
                                change that.
                              </p>
                            ) : (
                              <>
                                <p className="hr-assign-help">
                                  {selected.hrDesignated
                                    ? `${selected.displayName} is designated HR personnel and can read every employee's record.`
                                    : `${selected.displayName} can see only their own record.`}{" "}
                                  The designation grants access to personnel data and nothing else — not
                                  organization administration, not financials.
                                </p>
                                <button
                                  type="button"
                                  className="hr-assign-submit hr-designation-toggle"
                                  data-hr-action="toggle-designation"
                                  data-hr-designated={selected.hrDesignated ? "true" : "false"}
                                  disabled={saving !== ""}
                                  onClick={() => void toggleDesignation()}
                                >
                                  {saving === "designation"
                                    ? "Saving…"
                                    : selected.hrDesignated
                                      ? "Revoke HR designation"
                                      : "Designate as HR personnel"}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
