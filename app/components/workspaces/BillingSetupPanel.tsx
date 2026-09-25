"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import AsyncSection from "../ui/AsyncSection";
import { api } from "../../lib/api-client";
import { ApiError } from "../../lib/api-error";
import { builtInTemplates } from "../../lib/encounter-engine";
import {
  formatCents,
  parseMoneyToCents,
  type BillingSetupView,
  type ChargeTemplate,
  type ProviderBillingIdentity,
} from "../../domain/billing-setup";

/**
 * Practice billing setup (BILL-1, BILL-2; D-101).
 *
 * Where a practice says how its visits are billed: one charge template per note
 * template, its own fee for each code, and who it is on paper. Owners and managers
 * edit; anyone with financial access reads. Every value is the practice's own and
 * is labelled that way — nothing here is verified against a registry or a payer.
 */

type Busy = string | null;

function noteTemplateName(id: string) {
  return builtInTemplates.find((template) => template.id === id)?.name ?? id;
}

function TemplateRow({
  template,
  canEdit,
  busy,
  onSave,
}: {
  template: ChargeTemplate;
  canEdit: boolean;
  busy: boolean;
  onSave: (next: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(template);
  useEffect(() => setForm(template), [template]);

  if (!editing) {
    return (
      <tr data-charge-template={template.id}>
        <td>
          <strong>{template.name}</strong>
          <div className="patient-cell-mrn">Note: {noteTemplateName(template.noteTemplateId)}</div>
        </td>
        <td><span className="cpt-chip">{template.primaryCode}</span></td>
        <td>{template.addOnPolicy === "psychotherapy-time" ? "Psychotherapy add-on by time" : "None"}</td>
        <td>
          {template.placeOfServiceInPerson || "—"} in person · {template.placeOfServiceTelehealth || "—"} telehealth
          {template.telehealthModifier ? ` · modifier ${template.telehealthModifier}` : ""}
        </td>
        <td>{template.active ? "Active" : "Inactive"}</td>
        <td>
          {canEdit && (
            <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </td>
      </tr>
    );
  }

  const set = (field: keyof ChargeTemplate) => (value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <tr data-charge-template={template.id} className="billing-setup-editing">
      <td>
        <input aria-label="Template name" value={form.name} onChange={(event) => set("name")(event.target.value)} />
      </td>
      <td>
        <input aria-label="Primary code" value={form.primaryCode} maxLength={6} onChange={(event) => set("primaryCode")(event.target.value)} />
      </td>
      <td>
        <select aria-label="Add-on policy" value={form.addOnPolicy} onChange={(event) => set("addOnPolicy")(event.target.value)}>
          <option value="none">None</option>
          <option value="psychotherapy-time">Psychotherapy add-on by time</option>
        </select>
      </td>
      <td className="billing-setup-pos">
        <input aria-label="In-person place of service" value={form.placeOfServiceInPerson} maxLength={2}
          onChange={(event) => set("placeOfServiceInPerson")(event.target.value)} />
        <input aria-label="Telehealth place of service" value={form.placeOfServiceTelehealth} maxLength={2}
          onChange={(event) => set("placeOfServiceTelehealth")(event.target.value)} />
        <input aria-label="Telehealth modifier" value={form.telehealthModifier} maxLength={2}
          onChange={(event) => set("telehealthModifier")(event.target.value)} />
      </td>
      <td>
        <label className="billing-setup-check">
          <input type="checkbox" checked={form.active} onChange={(event) => set("active")(event.target.checked)} /> Active
        </label>
      </td>
      <td className="billing-setup-row-actions">
        <Button size="sm" icon="check" loading={busy}
          onClick={() => {
            onSave({ ...form, id: template.id, expectedVersion: template.version });
            setEditing(false);
          }}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={() => { setForm(template); setEditing(false); }}>
          Cancel
        </Button>
      </td>
    </tr>
  );
}

function ProviderRow({
  provider,
  canEdit,
  busy,
  onSave,
}: {
  provider: ProviderBillingIdentity;
  canEdit: boolean;
  busy: boolean;
  onSave: (next: Record<string, unknown>) => void;
}) {
  const [npi, setNpi] = useState(provider.npi);
  const [licenseNumber, setLicenseNumber] = useState(provider.licenseNumber);
  const [licenseState, setLicenseState] = useState(provider.licenseState);
  const [taxonomyCode, setTaxonomyCode] = useState(provider.taxonomyCode);
  const dirty =
    npi !== provider.npi ||
    licenseNumber !== provider.licenseNumber ||
    licenseState !== provider.licenseState ||
    taxonomyCode !== provider.taxonomyCode;

  return (
    <tr data-billing-provider={provider.userId}>
      <td>
        <strong>{provider.displayName}</strong>
        {provider.credentials && <div className="patient-cell-mrn">{provider.credentials}</div>}
      </td>
      <td><input aria-label={`NPI for ${provider.displayName}`} value={npi} maxLength={10} disabled={!canEdit} onChange={(event) => setNpi(event.target.value)} placeholder="Not recorded" /></td>
      <td><input aria-label={`Taxonomy for ${provider.displayName}`} value={taxonomyCode} maxLength={10} disabled={!canEdit} onChange={(event) => setTaxonomyCode(event.target.value)} /></td>
      <td className="billing-setup-pos">
        <input aria-label={`License number for ${provider.displayName}`} value={licenseNumber} disabled={!canEdit} onChange={(event) => setLicenseNumber(event.target.value)} />
        <input aria-label={`License state for ${provider.displayName}`} value={licenseState} maxLength={2} disabled={!canEdit} onChange={(event) => setLicenseState(event.target.value)} />
      </td>
      <td>
        {canEdit && (dirty ? (
          <Button size="sm" icon="check" loading={busy}
            onClick={() => onSave({ userId: provider.userId, npi, licenseNumber, licenseState, taxonomyCode })}>
            Save
          </Button>
        ) : (
          <Button size="sm" icon="check" disabled disabledReason="Nothing changed yet.">
            Save
          </Button>
        ))}
      </td>
    </tr>
  );
}

export default function BillingSetupPanel() {
  const [setup, setSetup] = useState<BillingSetupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fee, setFee] = useState({ code: "", modifier: "", description: "", amount: "" });
  const [profile, setProfile] = useState<BillingSetupView["profile"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.billing.setup();
      setSetup(next);
      setProfile(next.profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Billing setup could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(key: string, operation: string, body: Record<string, unknown>, label: string) {
    setBusy(key);
    setActionError(null);
    setNotice(null);
    try {
      const next = await api.billing.saveSetup(operation, body);
      setSetup(next);
      setProfile(next.profile);
      setNotice(`${label} saved.`);
      return true;
    } catch (caught) {
      // The server refused; nothing on screen claims otherwise.
      setActionError(caught instanceof ApiError || caught instanceof Error ? caught.message : `${label} failed.`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitFee(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyToCents(fee.amount);
    if (amountCents === null) {
      setActionError("Enter the fee in dollars, e.g. 185.00.");
      return;
    }
    const saved = await save("fee", "save-fee", { ...fee, amountCents }, `Fee for ${fee.code}`);
    if (saved) setFee({ code: "", modifier: "", description: "", amount: "" });
  }

  const canEdit = setup?.canEdit ?? false;
  const templates = setup?.chargeTemplates ?? [];
  const covered = new Set(templates.filter((template) => template.active).map((template) => template.noteTemplateId));
  const uncovered = builtInTemplates.filter((template) => !covered.has(template.id));

  return (
    <div className="billing-setup" data-billing-setup="practice">
      {!canEdit && setup && (
        <div className="billing-transport-notice" role="note">
          <Icon name="lock" />
          <span>Read only. A practice owner or manager changes charge templates, fees and billing identity.</span>
        </div>
      )}
      {actionError && (
        <div className="ui-state ui-state-error" role="alert"><Icon name="error" /><p>{actionError}</p></div>
      )}
      {notice && <div className="ui-state ui-state-empty" role="status"><p>{notice}</p></div>}

      <AsyncSection loading={loading} error={error} isEmpty={false} hasLoadedOnce={Boolean(setup)} loadingMessage="Loading billing setup…" emptyMessage="" onRetry={() => void load()}>
        <section className="billing-setup-section" aria-labelledby="billing-setup-templates">
          <div className="billing-toolbar">
            <div>
              <strong id="billing-setup-templates">Charge templates</strong>
              <span className="billing-unavailable-note">
                How each kind of visit is billed. The codes on a charge are always the ones the clinician
                attested; a template adds the place of service and the telehealth modifier around them.
              </span>
            </div>
            {canEdit && uncovered.length > 0 && (
              <Button size="sm" icon="library_add" loading={busy === "starters"}
                onClick={() => void save("starters", "create-starter-templates", {}, "Starter templates")}>
                Create from note templates ({uncovered.length})
              </Button>
            )}
          </div>
          {templates.length === 0 ? (
            <p className="billing-unavailable-note">
              No charge templates yet. Charges will carry no place of service or telehealth modifier until one exists.
            </p>
          ) : (
            <table className="billing-table">
              <thead>
                <tr><th>Template</th><th>Code</th><th>Add-on</th><th>Place of service</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <TemplateRow key={template.id} template={template} canEdit={canEdit}
                    busy={busy === template.id}
                    onSave={(next) => void save(template.id, "save-charge-template", next, `"${template.name}"`)} />
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="billing-setup-section" aria-labelledby="billing-setup-fees">
          <div className="billing-toolbar">
            <div>
              <strong id="billing-setup-fees">Fee schedule</strong>
              <span className="billing-unavailable-note">
                The practice&apos;s own price per code. A code with no fee shows no amount on a charge — never $0.00.
                What a payer allows or pays is not known here.
              </span>
            </div>
          </div>
          {(setup?.feeSchedule.length ?? 0) === 0 ? (
            <p className="billing-unavailable-note">No fees set.</p>
          ) : (
            <table className="billing-table">
              <thead><tr><th>Code</th><th>Modifier</th><th>Description</th><th>Fee</th><th /></tr></thead>
              <tbody>
                {setup!.feeSchedule.map((entry) => (
                  <tr key={`${entry.code}-${entry.modifier}`} data-fee-code={entry.code}>
                    <td><span className="cpt-chip">{entry.code}</span></td>
                    <td>{entry.modifier || "Any"}</td>
                    <td>{entry.description || "—"}</td>
                    <td><strong>{formatCents(entry.amountCents)}</strong></td>
                    <td>
                      {canEdit && (
                        <Button size="sm" variant="secondary" icon="delete" loading={busy === `rm-${entry.code}-${entry.modifier}`}
                          onClick={() => void save(`rm-${entry.code}-${entry.modifier}`, "remove-fee",
                            { code: entry.code, modifier: entry.modifier }, `Removal of ${entry.code}`)}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && (
            <form className="billing-setup-fee-form" onSubmit={(event) => void submitFee(event)}>
              <input aria-label="Fee code" placeholder="Code, e.g. 99214" value={fee.code} maxLength={6}
                onChange={(event) => setFee({ ...fee, code: event.target.value })} required />
              <input aria-label="Fee modifier" placeholder="Modifier (optional)" value={fee.modifier} maxLength={2}
                onChange={(event) => setFee({ ...fee, modifier: event.target.value })} />
              <input aria-label="Fee description" placeholder="Description" value={fee.description}
                onChange={(event) => setFee({ ...fee, description: event.target.value })} />
              <input aria-label="Fee amount" placeholder="$0.00" value={fee.amount} inputMode="decimal"
                onChange={(event) => setFee({ ...fee, amount: event.target.value })} required />
              <Button size="sm" icon="add" type="submit" loading={busy === "fee"}>Set fee</Button>
            </form>
          )}
        </section>

        <section className="billing-setup-section" aria-labelledby="billing-setup-identity">
          <div className="billing-toolbar">
            <div>
              <strong id="billing-setup-identity">Practice billing identity</strong>
              <span className="billing-unavailable-note">
                Printed on superbills as recorded by the practice. Not verified against the NPI registry or the IRS.
              </span>
            </div>
          </div>
          {profile && (
            <form
              className="billing-setup-profile"
              onSubmit={(event) => {
                event.preventDefault();
                void save("profile", "save-profile", { ...profile }, "Practice billing identity");
              }}
            >
              {([
                ["legalName", "Legal name"],
                ["addressLine1", "Address"],
                ["addressLine2", "Address line 2"],
                ["city", "City"],
                ["state", "State"],
                ["postalCode", "ZIP"],
                ["phone", "Phone"],
                ["taxId", "Tax ID (EIN)"],
                ["groupNpi", "Group NPI"],
              ] as const).map(([field, label]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input value={profile[field]} disabled={!canEdit}
                    onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} />
                </label>
              ))}
              {canEdit && (
                <div className="billing-setup-profile-actions">
                  <Button size="sm" icon="check" type="submit" loading={busy === "profile"}>Save identity</Button>
                </div>
              )}
            </form>
          )}

          <table className="billing-table">
            <thead><tr><th>Rendering provider</th><th>NPI</th><th>Taxonomy</th><th>License · state</th><th /></tr></thead>
            <tbody>
              {(setup?.providers ?? []).map((provider) => (
                <ProviderRow key={provider.userId} provider={provider} canEdit={canEdit}
                  busy={busy === `provider-${provider.userId}`}
                  onSave={(next) => void save(`provider-${provider.userId}`, "save-provider", next, `${provider.displayName}'s identifiers`)} />
              ))}
            </tbody>
          </table>
        </section>
      </AsyncSection>
    </div>
  );
}
