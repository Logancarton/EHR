"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type CareNetworkMember,
  type ContactConsentScope,
  type CoveragePolicy,
  type PatientPharmacy,
  type PatientAdministrativeRecord,
  type PatientContact,
  type PatientIdentity,
  type RelatedPerson,
  CARE_NETWORK_ROLES,
  CONTACT_CONSENT_SCOPES,
  COVERAGE_TYPES,
  SUBSCRIBER_RELATIONSHIPS,
  PATIENT_RECORD_STATUSES,
  PREFERRED_CONTACT_METHODS,
  RELATED_PERSON_ROLES,
  ageFromDateOfBirth,
  careNetworkRoleLabel,
  consentScopeLabel,
  coveragePriorityLabel,
  relatedPersonRoleLabel,
} from "../../domain/patient-administration";
import { api } from "../../lib/api-client";
import { refreshPatientRoster } from "../../lib/patient-roster";
import type { SaveStatus } from "../../lib/ui-system";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Button from "../ui/Button";
import SaveStateIndicator from "../ui/SaveStateIndicator";
import StatusBadge from "../ui/StatusBadge";

/**
 * The patient's administrative record, in one place.
 *
 * Deliberately not folded into the clinical Overview: demographics, coverage and who
 * may be told what are front-office work with a different rhythm and a different
 * audience from the chart. It opens beside the chart rather than replacing it, so
 * the clinician does not lose the patient they were reading.
 *
 * Nothing here claims to be saved before the server says so — every section reports
 * its own save state and a failure stays on screen with a way to try again.
 */

type Section = "identity" | "contact" | "people" | "network" | "coverage" | "pharmacy";

const SECTIONS: ReadonlyArray<{ id: Section; label: string; icon: string }> = [
  { id: "identity", label: "Identity", icon: "badge" },
  { id: "contact", label: "Contact", icon: "call" },
  { id: "people", label: "Related people", icon: "group" },
  { id: "network", label: "Care network", icon: "diversity_3" },
  { id: "coverage", label: "Coverage", icon: "shield" },
  { id: "pharmacy", label: "Pharmacy", icon: "local_pharmacy" },
];

const CONSENT_TONE: Record<ContactConsentScope, "neutral" | "info" | "success" | "warning"> = {
  none: "warning",
  scheduling: "neutral",
  clinical: "info",
  full: "success",
};

export default function PatientInformationDrawer({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<PatientAdministrativeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("identity");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRecord(await api.patientAdministration.get(patientId));
    } catch (cause) {
      setRecord(null);
      setLoadError(cause instanceof Error ? cause.message : "The patient record could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes, like every other layered surface in the workspace.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <aside className="patient-info-drawer" aria-label={`Patient information for ${patientName}`}>
      <header className="patient-info-header">
        <div>
          <span className="eyebrow">Patient information</span>
          <h2>{patientName}</h2>
        </div>
        <Button variant="icon" icon="close" aria-label="Close patient information" onClick={onClose} />
      </header>

      <nav className="patient-info-tabs" role="group" aria-label="Patient information sections">
        {SECTIONS.map(({ id, label, icon }) => (
          <Button key={id} size="sm" icon={icon} pressed={section === id} onClick={() => setSection(id)}>
            {label}
          </Button>
        ))}
      </nav>

      <div className="patient-info-body">
        <AsyncSection
          loading={loading}
          error={loadError}
          isEmpty={!record}
          hasLoadedOnce={Boolean(record)}
          loadingMessage="Loading the patient record…"
          emptyMessage="This patient record could not be read."
          onRetry={() => void load()}
        >
          {record && section === "identity" && (
            <IdentitySection patientId={patientId} identity={record.identity} onSaved={load} />
          )}
          {record && section === "contact" && (
            <ContactSection patientId={patientId} contact={record.contact} onSaved={load} />
          )}
          {record && section === "people" && (
            <RelatedPeopleSection patientId={patientId} people={record.relatedPeople} onSaved={load} />
          )}
          {record && section === "network" && (
            <CareNetworkSection patientId={patientId} members={record.careNetwork} onSaved={load} />
          )}
          {record && section === "coverage" && (
            <CoverageSection patientId={patientId} policies={record.coverage} onSaved={load} />
          )}
          {record && section === "pharmacy" && (
            <PharmacySection patientId={patientId} pharmacies={record.pharmacies} onSaved={load} />
          )}
        </AsyncSection>
      </div>
    </aside>
  );
}

/**
 * Shared save plumbing.
 *
 * `status` is null until the section has actually been touched: a freshly opened form
 * has neither saved nor failed anything, and a green "Saved" badge on arrival would
 * be claiming a write that never happened.
 */
function useSectionSave(onSaved: () => Promise<void> | void) {
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [savedAt, setSavedAt] = useState<string | undefined>();

  const save = useCallback(
    async (write: () => Promise<unknown>) => {
      setStatus("saving");
      setError(undefined);
      try {
        await write();
        setSavedAt(new Date().toISOString());
        setStatus("saved");
        await onSaved();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The server did not confirm this save.");
        setStatus("failed");
        return false;
      }
    },
    [onSaved],
  );

  return { status, error, savedAt, save, markDirty: () => setStatus("unsaved") };
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="patient-info-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function IdentitySection({
  patientId,
  identity,
  onSaved,
}: {
  patientId: string;
  identity: PatientIdentity;
  onSaved: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(identity);
  const { status, error, savedAt, save, markDirty } = useSectionSave(onSaved);
  useEffect(() => setDraft(identity), [identity]);

  const set = <K extends keyof PatientIdentity>(key: K, value: PatientIdentity[K]) => {
    markDirty();
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const age = ageFromDateOfBirth(draft.dob);
  const nameMissing = !draft.legalName.trim();

  return (
    <form
      className="patient-info-section"
      onSubmit={(event) => {
        event.preventDefault();
        void save(() =>
          api.patients
            .update(patientId, {
              name: draft.legalName,
              pronouns: draft.pronouns,
              mrn: draft.mrn,
              dob: draft.dob,
              identity: draft,
            })
            // The roster shows the name and MRN, so it re-reads rather than drifting.
            .then(refreshPatientRoster),
        );
      }}
    >
      <div className="patient-info-section-head">
        <h3>Identity</h3>
        {status && <SaveStateIndicator status={status} savedAt={savedAt} error={error} />}
      </div>
      {status === "failed" && error && <InlineError message={error} />}

      <div className="patient-info-grid">
        <Field label="Legal name">
          <input value={draft.legalName} onChange={(e) => set("legalName", e.target.value)} required />
        </Field>
        <Field label="Preferred name" hint="What the patient is actually called, when it differs.">
          <input value={draft.preferredName || ""} onChange={(e) => set("preferredName", e.target.value)} />
        </Field>
        <Field label="Date of birth" hint={age === undefined ? "Age is derived from this." : `Age ${age}`}>
          <input value={draft.dob} onChange={(e) => set("dob", e.target.value)} />
        </Field>
        <Field label="MRN">
          <input value={draft.mrn} onChange={(e) => set("mrn", e.target.value)} />
        </Field>
        <Field label="Pronouns">
          <input value={draft.pronouns} onChange={(e) => set("pronouns", e.target.value)} />
        </Field>
        <Field label="Sex at birth" hint="Recorded where clinically or operationally required.">
          <input value={draft.sexAtBirth || ""} onChange={(e) => set("sexAtBirth", e.target.value)} />
        </Field>
        <Field label="Gender identity">
          <input value={draft.genderIdentity || ""} onChange={(e) => set("genderIdentity", e.target.value)} />
        </Field>
        <Field label="Preferred language">
          <input value={draft.preferredLanguage || ""} onChange={(e) => set("preferredLanguage", e.target.value)} />
        </Field>
        <Field label="Time zone" hint="Used for telehealth and reminder timing.">
          <input value={draft.timeZone || ""} onChange={(e) => set("timeZone", e.target.value)} />
        </Field>
        <Field label="Record status">
          <select
            value={draft.recordStatus}
            onChange={(e) => set("recordStatus", e.target.value as PatientIdentity["recordStatus"])}
          >
            {PATIENT_RECORD_STATUSES.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="patient-info-actions">
        {nameMissing ? (
          <Button variant="primary" disabled disabledReason="A chart needs a legal name.">
            Save identity
          </Button>
        ) : (
          <Button type="submit" variant="primary" loading={status === "saving"} loadingLabel="Saving…">
            Save identity
          </Button>
        )}
      </div>
    </form>
  );
}

function ContactSection({
  patientId,
  contact,
  onSaved,
}: {
  patientId: string;
  contact: PatientContact;
  onSaved: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(contact);
  const { status, error, savedAt, save, markDirty } = useSectionSave(onSaved);
  useEffect(() => setDraft(contact), [contact]);

  const set = <K extends keyof PatientContact>(key: K, value: PatientContact[K]) => {
    markDirty();
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      className="patient-info-section"
      onSubmit={(event) => {
        event.preventDefault();
        void save(() => api.patients.update(patientId, { contact: draft }));
      }}
    >
      <div className="patient-info-section-head">
        <h3>Contact</h3>
        {status && <SaveStateIndicator status={status} savedAt={savedAt} error={error} />}
      </div>
      {status === "failed" && error && <InlineError message={error} />}

      <div className="patient-info-grid">
        <Field label="Mobile phone">
          <input value={draft.mobilePhone || ""} onChange={(e) => set("mobilePhone", e.target.value)} />
        </Field>
        <Field label="Alternate phone">
          <input value={draft.alternatePhone || ""} onChange={(e) => set("alternatePhone", e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" value={draft.email || ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Preferred contact method">
          <select
            value={draft.preferredContactMethod || ""}
            onChange={(e) =>
              set("preferredContactMethod", (e.target.value || undefined) as PatientContact["preferredContactMethod"])
            }
          >
            <option value="">Not recorded</option>
            {PREFERRED_CONTACT_METHODS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="Address">
          <input value={draft.addressLine1 || ""} onChange={(e) => set("addressLine1", e.target.value)} />
        </Field>
        <Field label="Address line 2">
          <input value={draft.addressLine2 || ""} onChange={(e) => set("addressLine2", e.target.value)} />
        </Field>
        <Field label="City">
          <input value={draft.city || ""} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="State">
          <input value={draft.state || ""} onChange={(e) => set("state", e.target.value)} />
        </Field>
        <Field label="Postal code">
          <input value={draft.postalCode || ""} onChange={(e) => set("postalCode", e.target.value)} />
        </Field>
      </div>

      <fieldset className="patient-info-permissions">
        <legend>Communication permissions</legend>
        <p className="patient-info-note">
          Leaving a voicemail or texting about psychiatric care is a disclosure. “Not asked” is
          recorded as its own answer rather than assumed either way.
        </p>
        {([
          ["allowVoicemail", "Voicemail"],
          ["allowSms", "Text message"],
          ["allowEmail", "Email"],
        ] as const).map(([key, label]) => (
          <div className="patient-info-permission" key={key}>
            <span>{label}</span>
            <div role="group" aria-label={`${label} permission`}>
              {([
                [true, "Allowed"],
                [false, "Not allowed"],
                [undefined, "Not asked"],
              ] as const).map(([value, optionLabel]) => (
                <Button
                  key={String(value)}
                  size="sm"
                  pressed={draft[key] === value}
                  onClick={() => set(key, value)}
                >
                  {optionLabel}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <Field label="Contact notes">
        <textarea rows={2} value={draft.contactNotes || ""} onChange={(e) => set("contactNotes", e.target.value)} />
      </Field>

      <div className="patient-info-actions">
        <Button type="submit" variant="primary" loading={status === "saving"} loadingLabel="Saving…">
          Save contact
        </Button>
      </div>
    </form>
  );
}

function RelatedPeopleSection({
  patientId,
  people,
  onSaved,
}: {
  patientId: string;
  people: RelatedPerson[];
  onSaved: () => Promise<void> | void;
}) {
  const { status, error, savedAt, save } = useSectionSave(onSaved);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    role: "emergency-contact" as RelatedPerson["role"],
    name: "",
    relationship: "",
    phone: "",
    consentScope: "none" as ContactConsentScope,
  });

  return (
    <section className="patient-info-section">
      <div className="patient-info-section-head">
        <h3>Related people</h3>
        {status && <SaveStateIndicator status={status} savedAt={savedAt} error={error} />}
      </div>
      {status === "failed" && error && <InlineError message={error} />}

      <p className="patient-info-note">
        Each person carries their own disclosure scope. Being the right person to call about a
        missed appointment does not make someone the right person to discuss a diagnosis with.
      </p>

      <ul className="patient-info-list">
        {people.length === 0 && <li className="patient-info-empty">No related people recorded yet.</li>}
        {people.map((person) => (
          <li key={person.id}>
            <div className="patient-info-list-main">
              <strong>{person.name}</strong>
              <small>
                {relatedPersonRoleLabel(person.role)}
                {person.relationship ? ` · ${person.relationship}` : ""}
                {person.phone ? ` · ${person.phone}` : ""}
              </small>
            </div>
            <StatusBadge tone={CONSENT_TONE[person.consentScope]} shape="pill">
              {consentScopeLabel(person.consentScope)}
            </StatusBadge>
            <Button
              size="sm"
              onClick={() =>
                void save(() =>
                  api.patientAdministration.saveRelatedPerson(patientId, { status: "inactive" }, person.id),
                )
              }
            >
              Retire
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="patient-info-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(async () => {
              await api.patientAdministration.saveRelatedPerson(patientId, draft);
              setAdding(false);
              setDraft({ role: "emergency-contact", name: "", relationship: "", phone: "", consentScope: "none" });
            });
          }}
        >
          <Field label="Name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </Field>
          <Field label="Role">
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as RelatedPerson["role"] })}
            >
              {RELATED_PERSON_ROLES.map((role) => (
                <option key={role} value={role}>{relatedPersonRoleLabel(role)}</option>
              ))}
            </select>
          </Field>
          <Field label="Relationship">
            <input
              value={draft.relationship}
              placeholder="Mother, sister, case manager…"
              onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </Field>
          <Field label="May be told">
            <select
              value={draft.consentScope}
              onChange={(e) => setDraft({ ...draft, consentScope: e.target.value as ContactConsentScope })}
            >
              {CONTACT_CONSENT_SCOPES.map((scope) => (
                <option key={scope} value={scope}>{consentScopeLabel(scope)}</option>
              ))}
            </select>
          </Field>
          <div className="patient-info-actions">
            {draft.name.trim() ? (
              <Button type="submit" variant="primary" loading={status === "saving"} loadingLabel="Saving…">
                Add person
              </Button>
            ) : (
              <Button variant="primary" disabled disabledReason="Enter a name first.">
                Add person
              </Button>
            )}
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button icon="person_add" onClick={() => setAdding(true)}>
          Add related person
        </Button>
      )}
    </section>
  );
}

function CoverageSection({
  patientId,
  policies,
  onSaved,
}: {
  patientId: string;
  policies: CoveragePolicy[];
  onSaved: () => Promise<void> | void;
}) {
  const { status, error, savedAt, save } = useSectionSave(onSaved);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    payerName: "",
    planName: "",
    memberId: "",
    groupNumber: "",
    subscriberName: "",
    subscriberDob: "",
    relationship: "self",
    coverageType: "commercial",
    coveragePriority: 1,
    isSelfPay: false,
  });

  const active = policies.filter((policy) => policy.status === "active");

  return (
    <section className="patient-info-section">
      <div className="patient-info-section-head">
        <h3>Coverage</h3>
        {status && <SaveStateIndicator status={status} savedAt={savedAt} error={error} />}
      </div>
      {status === "failed" && error && <InlineError message={error} />}

      <p className="patient-info-note">
        Which policy is primary decides where a claim goes first. Self-pay is recorded as its own
        coverage state rather than as an empty list, so “paying privately” and “nobody has entered
        insurance yet” stay distinguishable.
      </p>

      <ul className="patient-info-list">
        {policies.length === 0 && <li className="patient-info-empty">No coverage recorded yet.</li>}
        {policies.map((policy) => (
          <li key={policy.id}>
            <div className="patient-info-list-main">
              <strong>{policy.isSelfPay ? "Self-pay" : policy.payerName}</strong>
              <small>
                {policy.planName ? `${policy.planName} · ` : ""}
                {policy.memberId ? `Member ${policy.memberId}` : "No member id"}
                {policy.groupNumber ? ` · Group ${policy.groupNumber}` : ""}
                {policy.subscriberName ? ` · Subscriber ${policy.subscriberName}` : ""}
              </small>
            </div>
            <StatusBadge
              tone={policy.status === "active" ? (policy.priority <= 1 ? "success" : "info") : "neutral"}
              shape="pill"
              icon={policy.status === "active" ? "shield" : "history"}
            >
              {policy.status === "active" ? coveragePriorityLabel(policy.priority) : policy.status}
            </StatusBadge>
            {policy.status === "active" && (
              <Button
                size="sm"
                onClick={() =>
                  void save(() =>
                    api.patientAdministration.saveCoverage(
                      patientId,
                      { status: "terminated", terminationDate: new Date().toISOString().slice(0, 10) },
                      policy.id,
                    ),
                  )
                }
              >
                Terminate
              </Button>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="patient-info-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(async () => {
              await api.patientAdministration.saveCoverage(patientId, {
                ...draft,
                // A self-pay record needs no payer typed in to be meaningful.
                payerName: draft.isSelfPay ? draft.payerName || "Self-pay" : draft.payerName,
              });
              setAdding(false);
              setDraft({
                payerName: "",
                planName: "",
                memberId: "",
                groupNumber: "",
                subscriberName: "",
                subscriberDob: "",
                relationship: "self",
                coverageType: "commercial",
                coveragePriority: active.length + 1,
                isSelfPay: false,
              });
            });
          }}
        >
          <div className="patient-info-actions">
            <Button
              size="sm"
              pressed={!draft.isSelfPay}
              onClick={() => setDraft({ ...draft, isSelfPay: false, coverageType: "commercial" })}
            >
              Insurance
            </Button>
            <Button
              size="sm"
              pressed={draft.isSelfPay}
              onClick={() => setDraft({ ...draft, isSelfPay: true, coverageType: "self-pay" })}
            >
              Self-pay
            </Button>
          </div>

          {!draft.isSelfPay && (
            <>
              <Field label="Payer">
                <input
                  value={draft.payerName}
                  onChange={(e) => setDraft({ ...draft, payerName: e.target.value })}
                  required
                />
              </Field>
              <Field label="Plan">
                <input value={draft.planName} onChange={(e) => setDraft({ ...draft, planName: e.target.value })} />
              </Field>
              <div className="patient-info-grid">
                <Field label="Member ID">
                  <input value={draft.memberId} onChange={(e) => setDraft({ ...draft, memberId: e.target.value })} />
                </Field>
                <Field label="Group number">
                  <input
                    value={draft.groupNumber}
                    onChange={(e) => setDraft({ ...draft, groupNumber: e.target.value })}
                  />
                </Field>
                <Field label="Subscriber">
                  <input
                    value={draft.subscriberName}
                    onChange={(e) => setDraft({ ...draft, subscriberName: e.target.value })}
                  />
                </Field>
                <Field label="Subscriber DOB" hint="Required by most payers when the subscriber is not the patient.">
                  <input
                    value={draft.subscriberDob}
                    onChange={(e) => setDraft({ ...draft, subscriberDob: e.target.value })}
                  />
                </Field>
                <Field label="Relationship to subscriber">
                  <select
                    value={draft.relationship}
                    onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
                  >
                    {SUBSCRIBER_RELATIONSHIPS.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Coverage type">
                  <select
                    value={draft.coverageType}
                    onChange={(e) => setDraft({ ...draft, coverageType: e.target.value })}
                  >
                    {COVERAGE_TYPES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}

          <Field label="Billing order" hint="1 is billed first.">
            <select
              value={String(draft.coveragePriority)}
              onChange={(e) => setDraft({ ...draft, coveragePriority: Number(e.target.value) })}
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>{coveragePriorityLabel(value)}</option>
              ))}
            </select>
          </Field>

          <div className="patient-info-actions">
            {draft.isSelfPay || draft.payerName.trim() ? (
              <Button type="submit" variant="primary" loading={status === "saving"} loadingLabel="Saving…">
                Add coverage
              </Button>
            ) : (
              <Button variant="primary" disabled disabledReason="Enter a payer, or mark this self-pay.">
                Add coverage
              </Button>
            )}
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button icon="add" onClick={() => setAdding(true)}>
          Add coverage
        </Button>
      )}
    </section>
  );
}

function PharmacySection({
  patientId,
  pharmacies,
  onSaved,
}: {
  patientId: string;
  pharmacies: PatientPharmacy[];
  onSaved: () => Promise<void> | void;
}) {
  const { status, error, savedAt, save } = useSectionSave(onSaved);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", ncpdpId: "", phone: "", addressLine1: "", city: "", state: "" });

  return (
    <section className="patient-info-section">
      <div className="patient-info-section-head">
        <h3>Pharmacy</h3>
        {status && <SaveStateIndicator status={status} savedAt={savedAt} error={error} />}
      </div>
      {status === "failed" && error && <InlineError message={error} />}

      <p className="patient-info-note">
        The preferred pharmacy is where new prescriptions are sent. Alternates stay on the chart so a
        patient who splits a controlled substance and a maintenance refill between two pharmacies does
        not have to be re-entered each time.
      </p>

      <ul className="patient-info-list">
        {pharmacies.length === 0 && <li className="patient-info-empty">No pharmacy recorded yet.</li>}
        {pharmacies.map((pharmacy, index) => (
          <li key={pharmacy.pharmacyId}>
            <div className="patient-info-list-main">
              <strong>{pharmacy.name}</strong>
              <small>
                {pharmacy.addressLine1 ? `${pharmacy.addressLine1}` : "No address"}
                {pharmacy.city ? `, ${pharmacy.city}` : ""}
                {pharmacy.phone ? ` · ${pharmacy.phone}` : ""}
                {pharmacy.ncpdpId ? ` · NCPDP ${pharmacy.ncpdpId}` : ""}
              </small>
            </div>
            {index === 0 ? (
              <StatusBadge tone="success" shape="pill" icon="local_pharmacy">Preferred</StatusBadge>
            ) : (
              <Button
                size="sm"
                onClick={() =>
                  // Promoting one pharmacy demotes the current preferred in the same
                  // action, so the chart never holds two "send here first" entries.
                  void save(async () => {
                    const current = pharmacies[0];
                    await api.patientAdministration.savePharmacy(patientId, { priority: 1 }, pharmacy.pharmacyId);
                    if (current) {
                      await api.patientAdministration.savePharmacy(patientId, { priority: 2 }, current.pharmacyId);
                    }
                  })
                }
              >
                Make preferred
              </Button>
            )}
            <Button
              size="sm"
              onClick={() =>
                void save(() =>
                  api.patientAdministration.savePharmacy(patientId, { status: "inactive" }, pharmacy.pharmacyId),
                )
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="patient-info-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(async () => {
              await api.patientAdministration.savePharmacy(patientId, {
                ...draft,
                priority: pharmacies.length === 0 ? 1 : pharmacies.length + 1,
              });
              setAdding(false);
              setDraft({ name: "", ncpdpId: "", phone: "", addressLine1: "", city: "", state: "" });
            });
          }}
        >
          <Field label="Pharmacy name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </Field>
          <div className="patient-info-grid">
            <Field label="Phone">
              <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </Field>
            <Field label="NCPDP ID" hint="The directory identifier, when known. Not our key for this pharmacy.">
              <input value={draft.ncpdpId} onChange={(e) => setDraft({ ...draft, ncpdpId: e.target.value })} />
            </Field>
            <Field label="Address">
              <input
                value={draft.addressLine1}
                onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
              />
            </Field>
            <Field label="City">
              <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
            </Field>
          </div>
          <div className="patient-info-actions">
            {draft.name.trim() ? (
              <Button type="submit" variant="primary" loading={status === "saving"} loadingLabel="Saving…">
                Add pharmacy
              </Button>
            ) : (
              <Button variant="primary" disabled disabledReason="Enter a pharmacy name first.">
                Add pharmacy
              </Button>
            )}
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button icon="add" onClick={() => setAdding(true)}>
          Add pharmacy
        </Button>
      )}
    </section>
  );
}

function CareNetworkSection({
  patientId,
  members,
  onSaved,
}: {
  patientId: string;
  members: CareNetworkMember[];
  onSaved: () => Promise<void> | void;
}) {
  const { status, error, savedAt, save } = useSectionSave(onSaved);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    role: "pcp" as CareNetworkMember["role"],
    name: "",
    organization: "",
    phone: "",
  });

  return (
    <section className="patient-info-section">
      <div className="patient-info-section-head">
        <h3>Care network</h3>
        {status && <SaveStateIndicator status={status} savedAt={savedAt} error={error} />}
      </div>
      {status === "failed" && error && <InlineError message={error} />}

      <p className="patient-info-note">
        Clinicians outside this practice who are involved in this patient&apos;s care. This is the
        foundation for coordination and record exchange.
      </p>

      <ul className="patient-info-list">
        {members.length === 0 && <li className="patient-info-empty">No outside clinicians recorded yet.</li>}
        {members.map((member) => (
          <li key={member.id}>
            <div className="patient-info-list-main">
              <strong>{member.name}</strong>
              <small>
                {careNetworkRoleLabel(member.role)}
                {member.organization ? ` · ${member.organization}` : ""}
                {member.phone ? ` · ${member.phone}` : ""}
              </small>
            </div>
            <Button
              size="sm"
              onClick={() =>
                void save(() =>
                  api.patientAdministration.saveCareNetworkMember(patientId, { status: "inactive" }, member.id),
                )
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="patient-info-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(async () => {
              await api.patientAdministration.saveCareNetworkMember(patientId, draft);
              setAdding(false);
              setDraft({ role: "pcp", name: "", organization: "", phone: "" });
            });
          }}
        >
          <Field label="Name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </Field>
          <Field label="Role">
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as CareNetworkMember["role"] })}
            >
              {CARE_NETWORK_ROLES.map((role) => (
                <option key={role} value={role}>{careNetworkRoleLabel(role)}</option>
              ))}
            </select>
          </Field>
          <Field label="Organization">
            <input
              value={draft.organization}
              onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </Field>
          <div className="patient-info-actions">
            {draft.name.trim() ? (
              <Button type="submit" variant="primary" loading={status === "saving"} loadingLabel="Saving…">
                Add clinician
              </Button>
            ) : (
              <Button variant="primary" disabled disabledReason="Enter a name first.">
                Add clinician
              </Button>
            )}
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button icon="add" onClick={() => setAdding(true)}>
          Add clinician
        </Button>
      )}
    </section>
  );
}

