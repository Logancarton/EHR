"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { api } from "../../lib/api-client";
import { formatCents } from "../../domain/billing-setup";
import type { Superbill } from "../../domain/superbill";

/**
 * The superbill, as a printable document (BILL-3, D-101).
 *
 * Rendered in a portal at the document root so printing can show this page alone:
 * while it is open, `<html data-print-document="superbill">` tells the print
 * stylesheet to hide the application behind it. The browser's own "Save as PDF"
 * is the export path, so no PDF dependency is added.
 *
 * Anything the records do not hold prints as "Not recorded" and is listed at the
 * top, so a superbill with a gap is visibly incomplete rather than plausibly
 * finished. The patient's identity is in the document header, which is what a
 * detached view of a chart must carry.
 */

function Value({ value }: { value: string }) {
  return value.trim() ? <>{value}</> : <span className="superbill-missing">Not recorded</span>;
}

export default function SuperbillDocument({ chargeId, onClose }: { chargeId: string; onClose: () => void }) {
  const [superbill, setSuperbill] = useState<Superbill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setSuperbill(null);
    setError(null);
    api.billing
      .superbill(chargeId)
      .then((document) => {
        // A late answer for a different charge must not paint into this one.
        if (!cancelled && document.chargeId === chargeId) setSuperbill(document);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "The superbill could not be produced.");
      });
    return () => {
      cancelled = true;
    };
  }, [chargeId]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-print-document", "superbill");
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      root.removeAttribute("data-print-document");
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const body = (
    <div className="superbill-overlay" role="dialog" aria-modal="true" aria-label="Superbill">
      <div className="superbill-toolbar">
        <strong>Superbill</strong>
        <span className="billing-unavailable-note">
          For the patient to submit to their insurer. Nothing is sent from here.
        </span>
        <div className="superbill-toolbar-actions">
          {superbill ? (
            <Button size="sm" icon="print" onClick={() => window.print()}>Print / Save PDF</Button>
          ) : (
            <Button size="sm" icon="print" disabled disabledReason="The superbill has not loaded.">Print / Save PDF</Button>
          )}
          <button ref={closeRef} type="button" className="superbill-close" aria-label="Close superbill" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div className="superbill-scroll">
        {error && (
          <div className="ui-state ui-state-error" role="alert"><Icon name="error" /><p>{error}</p></div>
        )}
        {!error && !superbill && <p className="superbill-loading" role="status">Preparing the superbill…</p>}
        {superbill && (
          <article className="superbill-page" data-superbill-charge={superbill.chargeId}>
            {superbill.missing.length > 0 && (
              <div className="superbill-gaps" role="note">
                <strong>Not recorded, printed blank:</strong> {superbill.missing.join(" · ")}
              </div>
            )}

            <header className="superbill-header">
              <div>
                <h1><Value value={superbill.practice.legalName} /></h1>
                {superbill.practice.address.length > 0
                  ? superbill.practice.address.map((line) => <div key={line}>{line}</div>)
                  : <div><Value value="" /></div>}
                <div>Phone: <Value value={superbill.practice.phone} /></div>
              </div>
              <dl className="superbill-ids">
                <div><dt>Tax ID</dt><dd><Value value={superbill.practice.taxId} /></dd></div>
                <div><dt>Group NPI</dt><dd><Value value={superbill.practice.groupNpi} /></dd></div>
                <div><dt>Statement</dt><dd>{superbill.chargeId.slice(0, 16)}</dd></div>
              </dl>
            </header>

            <h2 className="superbill-title">Superbill — statement of services</h2>

            <section className="superbill-parties">
              <div>
                <h3>Patient</h3>
                <div><strong>{superbill.patient.name}</strong></div>
                <div>DOB {superbill.patient.dob} · MRN {superbill.patient.mrn}</div>
                {superbill.patient.address.length > 0
                  ? superbill.patient.address.map((line) => <div key={line}>{line}</div>)
                  : <div>Address: <Value value="" /></div>}
              </div>
              <div>
                <h3>Insurance</h3>
                {superbill.coverage ? (
                  <>
                    <div><strong><Value value={superbill.coverage.payerName} /></strong></div>
                    {superbill.coverage.basis !== "self-pay-recorded" && (
                      <>
                        <div>Member ID: <Value value={superbill.coverage.memberId} /></div>
                        <div>Group: <Value value={superbill.coverage.groupNumber} /></div>
                        <div>
                          Subscriber:{" "}
                          {superbill.coverage.relationship === "self" && !superbill.coverage.subscriberName
                            ? "Patient (self)"
                            : <><Value value={superbill.coverage.subscriberName} />{superbill.coverage.relationship ? ` (${superbill.coverage.relationship})` : ""}</>}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div><Value value="" /></div>
                )}
              </div>
              <div>
                <h3>Rendering provider</h3>
                <div><strong>{superbill.renderingProvider.name}</strong>{superbill.renderingProvider.credentials ? `, ${superbill.renderingProvider.credentials}` : ""}</div>
                <div>NPI: <Value value={superbill.renderingProvider.npi} /></div>
                <div>License: <Value value={[superbill.renderingProvider.licenseNumber, superbill.renderingProvider.licenseState].filter(Boolean).join(" · ")} /></div>
              </div>
            </section>

            <section>
              <h3>Diagnoses (ICD-10-CM)</h3>
              <ol className="superbill-diagnoses">
                {superbill.diagnoses.map((diagnosis) => (
                  <li key={diagnosis.pointer}><strong>{diagnosis.pointer}.</strong> {diagnosis.code} — {diagnosis.display}</li>
                ))}
              </ol>
            </section>

            <table className="superbill-lines">
              <thead>
                <tr>
                  <th>Date of service</th><th>POS</th><th>CPT</th><th>Modifiers</th><th>Description</th>
                  <th>Dx pointer</th><th>Units</th><th className="superbill-amount">Fee</th>
                </tr>
              </thead>
              <tbody>
                {superbill.lines.map((line, index) => (
                  <tr key={`${line.code}-${index}`}>
                    <td>{line.serviceDate}</td>
                    <td>{line.placeOfService ?? <span className="superbill-missing">—</span>}</td>
                    <td>{line.code}</td>
                    <td>{line.modifiers.join(", ") || "—"}</td>
                    <td>{line.description}</td>
                    <td>{line.diagnosisPointers.join("")}</td>
                    <td>{line.units}</td>
                    <td className="superbill-amount">
                      {line.feeCents === null ? <span className="superbill-missing">No fee set</span> : formatCents(line.feeCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7}>Total charges</td>
                  <td className="superbill-amount">
                    {superbill.totalCents === null ? <span className="superbill-missing">Not computable</span> : formatCents(superbill.totalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <footer className="superbill-footer">
              <p>
                Services were rendered as described and documented in the signed clinical record
                (record hash {superbill.encounterSnapshotSha256.slice(0, 12)}…). Fees are the practice&apos;s own charges;
                any amount paid, allowed or reimbursed is not shown here.
              </p>
              <div className="superbill-signature">
                <span>Provider signature</span>
                <span>Date</span>
              </div>
              <p className="superbill-generated">
                Generated {new Date(superbill.generatedAt).toLocaleString()} by {superbill.generatedByName}.
              </p>
            </footer>
          </article>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
