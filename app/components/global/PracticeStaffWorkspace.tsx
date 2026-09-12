"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

/**
 * Who works at this practice, and who administers it.
 *
 * Ownership was previously reachable only by writing to the database: the
 * migration picked an owner and nothing in the product could move it. That is
 * also a lockout — ownership gates the practice's shared layouts, so an
 * organization that lost its only owner had no way back through the app.
 *
 * Three different things are deliberately kept apart here, because they answer
 * different questions and are governed by different rules:
 *
 *   Clinical role   — what someone may do to a chart.
 *   Practice role   — who sets the shared defaults. Only an owner moves it.
 *   Account/status  — whether they can sign in at all, and whether this practice
 *                     still admits them.
 *
 * The server owns every rule. This screen surfaces its refusals verbatim rather
 * than trying to predict them, so a guard added later cannot be quietly missed.
 */

type Member = {
  userId: string;
  displayName: string;
  credentials?: string;
  role: string;
  active: boolean;
  status: "active" | "suspended" | "revoked";
  patientAccessScope: "organization" | "assigned";
  membershipRole: "owner" | "manager" | "member";
};

type ActivationLink = { userId: string; displayName: string; token: string; expiresAt: string };

const MEMBERSHIP_ROLES: Array<{ value: Member["membershipRole"]; label: string; hint: string }> = [
  { value: "owner", label: "Owner", hint: "Sets the practice's default layouts and can move ownership" },
  { value: "manager", label: "Manager", hint: "Sets the practice's default layouts" },
  { value: "member", label: "Member", hint: "Uses the practice's defaults, cannot change them" },
];

const CLINICAL_ROLES: Array<{ value: string; label: string }> = [
  { value: "provider", label: "Provider" },
  { value: "clinical_assistant", label: "Clinical assistant" },
  { value: "staff", label: "Staff" },
];

const CLINICAL_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  CLINICAL_ROLES.map((role) => [role.value, role.label]),
);

const MEMBERSHIP_STATUSES: Member["status"][] = ["active", "suspended", "revoked"];

export default function PracticeStaffWorkspace() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [activation, setActivation] = useState<ActivationLink | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    displayName: "",
    credentials: "",
    role: "provider",
    patientAccessScope: "assigned" as Member["patientAccessScope"],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rosterResponse, meResponse] = await Promise.all([
        fetch("/api/organization/members"),
        fetch("/api/auth/me"),
      ]);
      if (!rosterResponse.ok) {
        const body = await rosterResponse.json().catch(() => null);
        setError(
          rosterResponse.status === 403
            ? "You do not have permission to manage this practice's people."
            : body?.error ?? "Could not load the practice roster.",
        );
        setMembers([]);
        return;
      }
      const body = await rosterResponse.json();
      setMembers(Array.isArray(body?.members) ? body.members : []);
      const me = await meResponse.json().catch(() => null);
      setViewerId(me?.user?.userId ?? null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const viewerIsOwner = members.some(
    (member) => member.userId === viewerId && member.membershipRole === "owner",
  );
  const activeOwners = members.filter(
    (member) => member.membershipRole === "owner" && member.status === "active",
  );

  /**
   * One path for every membership edit. The API deliberately refuses to bundle
   * these — activation is a change to the user record, status and scope to the
   * membership — so each call carries exactly one intent.
   */
  async function patchMember(member: Member, body: Record<string, unknown>, success: string) {
    setBusyId(member.userId);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/organization/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, ...body }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "That change was refused.");
        return null;
      }
      setNotice(success);
      await load();
      return payload;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function issueActivation(member: Member) {
    const payload = await patchMember(
      member,
      { issueActivationToken: true },
      `Activation link issued for ${member.displayName}.`,
    );
    if (payload?.token) {
      setActivation({
        userId: member.userId,
        displayName: member.displayName,
        token: payload.token,
        expiresAt: payload.expiresAt,
      });
    }
  }

  async function addPerson() {
    const displayName = draft.displayName.trim();
    if (!displayName) return;
    setBusyId("new");
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/organization/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          credentials: draft.credentials.trim() || undefined,
          role: draft.role,
          patientAccessScope: draft.patientAccessScope,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "Could not add that person.");
        return;
      }
      setNotice(`${displayName} was added. Issue an activation link so they can set a password.`);
      setDraft({ displayName: "", credentials: "", role: "provider", patientAccessScope: "assigned" });
      setAdding(false);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="staff-state">Loading the practice roster…</p>;

  if (error && members.length === 0) {
    return (
      <div className="staff-state staff-state-error">
        <Icon name="error" />
        <p>{error}</p>
        <Button size="sm" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="practice-staff">
      <div className="staff-intro">
        <div>
          <h2>People</h2>
          <p>
            Clinical role decides what someone may do to a chart. Practice role decides who
            sets the shared defaults everyone can return to.
          </p>
        </div>
        <Button className="staff-add-btn" size="sm" icon="person_add" onClick={() => setAdding((open) => !open)}>
          <Icon name={adding ? "close" : "person_add"} size="sm" />
          {adding ? "Cancel" : "Add someone"}
        </Button>
      </div>

      {adding && (
        <form
          className="staff-add-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addPerson();
          }}
        >
          <label>
            <span>Name</span>
            <input
              value={draft.displayName}
              maxLength={200}
              required
              placeholder="Alex Rivera"
              onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
            />
          </label>
          <label>
            <span>Credentials</span>
            <input
              value={draft.credentials}
              maxLength={120}
              placeholder="MD, PMHNP-BC"
              onChange={(event) => setDraft({ ...draft, credentials: event.target.value })}
            />
          </label>
          <label>
            <span>Clinical role</span>
            <select
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
            >
              {CLINICAL_ROLES.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Patient access</span>
            <select
              value={draft.patientAccessScope}
              onChange={(event) =>
                setDraft({ ...draft, patientAccessScope: event.target.value as Member["patientAccessScope"] })
              }
            >
              {/* Defaults to assigned-only: the narrower reach is the safer thing
                  to hand someone before anyone has decided what they need. */}
              <option value="assigned">Assigned patients only</option>
              <option value="organization">Whole practice</option>
            </select>
          </label>
          {draft.displayName.trim() ? (
            <Button type="submit" variant="primary" loading={busyId === "new"} loadingLabel="Adding…">
              Add to practice
            </Button>
          ) : (
            <Button variant="primary" disabled disabledReason="Enter the person&apos;s name first.">
              Add to practice
            </Button>
          )}
        </form>
      )}

      {error && <p className="staff-banner staff-banner-error">{error}</p>}
      {notice && <p className="staff-banner staff-banner-ok">{notice}</p>}

      {activation && (
        <div className="staff-activation" role="status">
          <div>
            <strong>Activation link for {activation.displayName}</strong>
            {/* Shown once by design: the server stores only a hash, so there is no
                way to retrieve it again — reissuing is the recovery path. */}
            <small>
              Hand this over directly. It is shown once and expires{" "}
              {new Date(activation.expiresAt).toLocaleString()}.
            </small>
          </div>
          <code>{activation.token}</code>
          <div className="staff-activation-actions">
            <Button
              size="sm"
              icon="content_copy"
              onClick={() => {
                void navigator.clipboard?.writeText(activation.token);
                setNotice("Activation link copied.");
              }}
            >
              Copy
            </Button>
            <Button size="sm" onClick={() => setActivation(null)}>Done</Button>
          </div>
        </div>
      )}

      {activeOwners.length === 1 && (
        <p className="staff-banner staff-banner-warn">
          <Icon name="info" size="sm" />
          {activeOwners[0].displayName} is this practice&apos;s only owner. Add a second
          before changing or deactivating that account.
        </p>
      )}

      <div className="staff-table-scroll">
        <table className="staff-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Clinical role</th>
              <th scope="col">Patient access</th>
              <th scope="col">Membership</th>
              <th scope="col">Practice role</th>
              <th scope="col">Account</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const busy = busyId === member.userId;
              return (
                <tr key={member.userId} className={member.status !== "active" ? "is-inactive" : ""}>
                  <th scope="row">
                    <strong>{member.displayName}</strong>
                    {member.credentials && <small>{member.credentials}</small>}
                  </th>
                  <td>{CLINICAL_ROLE_LABELS[member.role] ?? member.role}</td>
                  <td>
                    <select
                      value={member.patientAccessScope}
                      disabled={busy}
                      aria-label={`Patient access for ${member.displayName}`}
                      onChange={(event) =>
                        void patchMember(
                          member,
                          { patientAccessScope: event.target.value },
                          `${member.displayName}'s patient access updated.`,
                        )
                      }
                    >
                      <option value="assigned">Assigned patients</option>
                      <option value="organization">Whole practice</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className={`staff-status status-${member.status}`}
                      value={member.status}
                      disabled={busy}
                      aria-label={`Membership status for ${member.displayName}`}
                      onChange={(event) =>
                        void patchMember(
                          member,
                          { status: event.target.value },
                          `${member.displayName} is now ${event.target.value} in this practice.`,
                        )
                      }
                    >
                      {MEMBERSHIP_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {viewerIsOwner ? (
                      <select
                        value={member.membershipRole}
                        disabled={busy}
                        aria-label={`Practice role for ${member.displayName}`}
                        onChange={(event) =>
                          void patchMember(
                            member,
                            { membershipRole: event.target.value },
                            `${member.displayName} is now ${event.target.value}.`,
                          )
                        }
                      >
                        {MEMBERSHIP_ROLES.map((role) => (
                          <option key={role.value} value={role.value} title={role.hint}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`staff-role role-${member.membershipRole}`}>
                        {MEMBERSHIP_ROLES.find((role) => role.value === member.membershipRole)?.label}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="staff-account-actions">
                      <Button
                        size="sm"
                        icon="key"
                        busy={busy}
                        title="Issue a single-use link so they can set their own password"
                        onClick={() => void issueActivation(member)}
                      >
                        Activation link
                      </Button>
                      <Button
                        variant={member.active ? "destructive" : "secondary"}
                        size="sm"
                        icon={member.active ? "lock" : "lock_open"}
                        busy={busy}
                        title={
                          member.active
                            ? "Disable sign-in for this account"
                            : "Allow this account to sign in again"
                        }
                        onClick={() =>
                          void patchMember(
                            member,
                            { active: !member.active },
                            member.active
                              ? `${member.displayName} can no longer sign in.`
                              : `${member.displayName} can sign in again.`,
                          )
                        }
                      >
                        {member.active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!viewerIsOwner && (
        <p className="staff-footnote">
          Only a practice owner can change who owns or manages the practice.
        </p>
      )}
    </div>
  );
}
