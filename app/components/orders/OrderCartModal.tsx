"use client";

import { useState, useMemo, useEffect } from "react";
import { type Patient } from "../../domain/patient";
import {
  type ClinicalOrder,
  type MedicationOrder,
  type LabOrder,
  type Pharmacy,
  type DrugCatalogItem,
  type LabCatalogItem,
  psychiatricDrugCatalog,
  psychiatricLabCatalog,
  standardPharmacies,
  type ProviderAuth,
} from "../../domain/orders";
import { screenDrugInteractions } from "../../lib/drug-interaction-engine";
import {
  transmitStagedOrders,
  type MultiOrderTransmissionReceipt,
} from "../../lib/order-service";

type ModalTab = "cart" | "prescribe" | "labs";

export default function OrderCartModal({
  isOpen,
  onClose,
  patient,
  stagedOrders,
  onUpdateStagedOrders,
  onOrderTransmitted,
  initialTab = "cart",
  prefillLab,
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  stagedOrders: ClinicalOrder[];
  onUpdateStagedOrders: (orders: ClinicalOrder[]) => void;
  onOrderTransmitted: (receipt: MultiOrderTransmissionReceipt) => void;
  initialTab?: ModalTab;
  prefillLab?: string;
}) {
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);

  // Synchronize initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (prefillLab) {
        // Pre-select the lab in the lab composer if provided
        const found = psychiatricLabCatalog.find((l) =>
          l.testName.toLowerCase().includes(prefillLab.toLowerCase()) ||
          prefillLab.toLowerCase().includes(l.testName.toLowerCase())
        );
        if (found) {
          setSelectedLabId(found.id);
        }
      }
    }
  }, [isOpen, initialTab, prefillLab]);

  // --- PRESCRIPTION COMPOSER STATE ---
  const [selectedDrugId, setSelectedDrugId] = useState<string>("drug-bupropion");
  const activeDrug = useMemo(
    () => psychiatricDrugCatalog.find((d) => d.id === selectedDrugId) || psychiatricDrugCatalog[0],
    [selectedDrugId]
  );

  const [strength, setStrength] = useState<string>(activeDrug.defaultStrength);
  const [form, setForm] = useState<string>(activeDrug.defaultForm);
  const [route, setRoute] = useState<string>(activeDrug.defaultRoute);
  const [frequency, setFrequency] = useState<string>(activeDrug.defaultFrequency);
  const [sig, setSig] = useState<string>(activeDrug.defaultSig);
  const [quantity, setQuantity] = useState<number>(activeDrug.defaultQuantity);
  const [daysSupply, setDaysSupply] = useState<number>(activeDrug.defaultDaysSupply);
  const [refills, setRefills] = useState<number>(activeDrug.defaultRefills);
  const [substitutionAllowed, setSubstitutionAllowed] = useState<boolean>(true);
  const [rxIndication, setRxIndication] = useState<string>(
    patient.diagnoses[0] || "Major depressive disorder"
  );
  const [pharmacy, setPharmacy] = useState<Pharmacy>(standardPharmacies[0]);

  // Update fields when drug selection changes
  const handleSelectDrug = (drug: DrugCatalogItem) => {
    setSelectedDrugId(drug.id);
    setStrength(drug.defaultStrength);
    setForm(drug.defaultForm);
    setRoute(drug.defaultRoute);
    setFrequency(drug.defaultFrequency);
    setSig(drug.defaultSig);
    setQuantity(drug.defaultQuantity);
    setDaysSupply(drug.defaultDaysSupply);
    setRefills(drug.deaSchedule === "C-II" ? 0 : drug.defaultRefills);
  };

  // Live drug-drug interaction alerts for the candidate Rx against current patient meds
  const interactionAlerts = useMemo(() => {
    return screenDrugInteractions(activeDrug.name, patient.meds);
  }, [activeDrug, patient.meds]);

  // --- LAB REQUISITION COMPOSER STATE ---
  const [selectedLabId, setSelectedLabId] = useState<string>("lab-fasting-metabolic");
  const activeLabItem = useMemo(
    () => psychiatricLabCatalog.find((l) => l.id === selectedLabId) || psychiatricLabCatalog[0],
    [selectedLabId]
  );

  const [labPriority, setLabPriority] = useState<"Routine" | "STAT" | "Next Visit" | "Protocol Surveillance">(
    activeLabItem.defaultPriority
  );
  const [labFasting, setLabFasting] = useState<boolean>(activeLabItem.fastingRequired);
  const [labIndication, setLabIndication] = useState<string>(
    patient.diagnoses[0] || "Psychiatric Protocol Surveillance"
  );
  const [targetFacility, setTargetFacility] = useState<"Quest Diagnostics" | "Labcorp" | "In-House STAT Lab">(
    "Quest Diagnostics"
  );

  useEffect(() => {
    setLabPriority(activeLabItem.defaultPriority);
    setLabFasting(activeLabItem.fastingRequired);
  }, [activeLabItem]);

  // --- CART & AUTHORIZATION STATE ---
  const [attestationChecked, setAttestationChecked] = useState(false);
  const [epcsPin, setEpcsPin] = useState("1984");
  const [epcsToken, setEpcsToken] = useState("492-108");
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [transmissionReceipt, setTransmissionReceipt] = useState<MultiOrderTransmissionReceipt | null>(null);
  const [showEdiModal, setShowEdiModal] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);

  // Controlled substance check across staged cart
  const hasControlledInCart = useMemo(() => {
    return stagedOrders.some(
      (o) => o.type === "medication" && (o.requiresEpcs || o.deaSchedule !== "None")
    );
  }, [stagedOrders]);

  // Action: Add composed medication order to cart
  const handleStageMedication = () => {
    const isControlled = activeDrug.deaSchedule !== "None";
    const newMedOrder: MedicationOrder = {
      id: `ord-rx-${Date.now()}`,
      patientId: patient.id,
      type: "medication",
      medication: `${activeDrug.name.split(" (")[0]} ${strength}`,
      genericName: activeDrug.genericName,
      strength,
      form,
      route,
      frequency,
      sig,
      dispenseQuantity: quantity,
      daysSupply,
      refills: activeDrug.deaSchedule === "C-II" ? 0 : refills,
      substitutionAllowed,
      indication: rxIndication,
      deaSchedule: activeDrug.deaSchedule,
      requiresEpcs: isControlled,
      pharmacy,
      status: "staged",
      prescribedBy: "Dr. Logan Carton, MD (NPI: 1841295031)",
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };

    onUpdateStagedOrders([...stagedOrders, newMedOrder]);
    setActiveTab("cart");
  };

  // Action: Add composed lab order to cart
  const handleStageLab = () => {
    const newLabOrder: LabOrder = {
      id: `ord-lab-${Date.now()}`,
      patientId: patient.id,
      type: "lab",
      testName: activeLabItem.testName,
      loincCode: activeLabItem.loincCode,
      specimen: activeLabItem.specimen,
      priority: labPriority,
      fastingRequired: labFasting,
      clinicalRationale: activeLabItem.description,
      indication: labIndication,
      targetFacility,
      status: "staged",
      orderedBy: "Dr. Logan Carton, MD (NPI: 1841295031)",
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };

    onUpdateStagedOrders([...stagedOrders, newLabOrder]);
    setActiveTab("cart");
  };

  // Action: Remove order from cart
  const handleRemoveOrder = (orderId: string) => {
    onUpdateStagedOrders(stagedOrders.filter((o) => o.id !== orderId));
  };

  // Action: Authorize & Transmit Staged Orders via vendor adapters
  const handleAuthorizeAndTransmit = async () => {
    if (!attestationChecked) return;
    if (hasControlledInCart && (!epcsPin || epcsPin.length < 4)) {
      alert("EPCS regulations mandate a valid 4-digit master PIN for controlled substances.");
      return;
    }

    setIsTransmitting(true);

    const auth: ProviderAuth = {
      providerName: "Dr. Logan Carton, MD",
      npi: "1841295031",
      deaNumber: "BC1049281",
      stateLicense: "C194820",
      epcsPin,
      otpToken: epcsToken,
    };

    try {
      const receipt = await transmitStagedOrders(patient, stagedOrders, auth);
      setTransmissionReceipt(receipt);
      onOrderTransmitted(receipt);
      // Empty staged cart
      onUpdateStagedOrders([]);
    } catch (err) {
      alert(`Transmission failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTransmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="order-cart-modal" onClick={(e) => e.stopPropagation()}>
        {/* MODAL TOP HEADER */}
        <div className="order-modal-header">
          <div className="modal-header-left">
            <span className="order-cart-icon-badge">📋</span>
            <div>
              <div className="order-header-title-row">
                <h2>Clinical Orders &amp; E-Prescribing</h2>
                <span className="patient-pill-meta">
                  {patient.name} · MRN {patient.mrn} · DOB {patient.dob}
                </span>
              </div>
              <p className="order-modal-subtitle">
                Vendor-Neutral Surescripts &amp; Quest Requisition Gate · 21 CFR §1311 EPCS Compliant
              </p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* TAB NAVIGATION */}
        <div className="order-tab-nav">
          <button
            type="button"
            className={`order-tab-btn ${activeTab === "cart" ? "active" : ""}`}
            onClick={() => setActiveTab("cart")}
          >
            🛒 Staged Cart ({stagedOrders.length})
          </button>
          <button
            type="button"
            className={`order-tab-btn ${activeTab === "prescribe" ? "active" : ""}`}
            onClick={() => setActiveTab("prescribe")}
          >
            ＋ Prescribe Medication (Rx)
          </button>
          <button
            type="button"
            className={`order-tab-btn ${activeTab === "labs" ? "active" : ""}`}
            onClick={() => setActiveTab("labs")}
          >
            ＋ Order Diagnostic Labs
          </button>
        </div>

        {/* TAB 1: STAGED CART & LEGAL ATTESTATION GATE */}
        {activeTab === "cart" && (
          <div className="order-cart-body">
            {transmissionReceipt ? (
              /* TRANSMISSION CONFIRMATION VIEW */
              <div className="transmission-success-view">
                <div className="success-icon-seal">✓</div>
                <h3>Orders Authorized &amp; Dispatched Electronically</h3>
                <p className="receipt-summary-text">{transmissionReceipt.summaryText}</p>
                <div className="receipt-details-box">
                  <div className="receipt-row">
                    <strong>Authorized By:</strong>
                    <span>Dr. Logan Carton, MD (NPI: 1841295031 · DEA: BC1049281)</span>
                  </div>
                  <div className="receipt-row">
                    <strong>Timestamp:</strong>
                    <span>{transmissionReceipt.timestamp}</span>
                  </div>
                  {transmissionReceipt.prescriptionResult && (
                    <>
                      <div className="receipt-row">
                        <strong>Surescripts NCPDP Trans ID:</strong>
                        <span className="mono-code">{transmissionReceipt.prescriptionResult.transmissionId}</span>
                      </div>
                      <div className="receipt-row">
                        <strong>Community Pharmacy:</strong>
                        <span>
                          {transmissionReceipt.prescriptionResult.pharmacyRouting.pharmacyName} (NCPDP {transmissionReceipt.prescriptionResult.pharmacyRouting.ncpdpId})
                        </span>
                      </div>
                    </>
                  )}
                  {transmissionReceipt.labResult && (
                    <>
                      <div className="receipt-row">
                        <strong>Quest Electronic Requisition #:</strong>
                        <span className="mono-code">{transmissionReceipt.labResult.requisitionNumber}</span>
                      </div>
                      <div className="receipt-row">
                        <strong>Laboratory Facility:</strong>
                        <span>{transmissionReceipt.labResult.facilityName}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="transmission-action-buttons">
                  {transmissionReceipt.labResult && (
                    <button
                      type="button"
                      className="btn-view-slip"
                      onClick={() => setShowSlipModal(true)}
                    >
                      📄 View Requisition Slip
                    </button>
                  )}
                  {transmissionReceipt.prescriptionResult && (
                    <button
                      type="button"
                      className="btn-view-edi"
                      onClick={() => setShowEdiModal(true)}
                    >
                      📑 View Surescripts EDI Message
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setTransmissionReceipt(null);
                      onClose();
                    }}
                  >
                    Done &amp; Return to Chart
                  </button>
                </div>
              </div>
            ) : stagedOrders.length === 0 ? (
              /* EMPTY CART VIEW */
              <div className="order-cart-empty">
                <div className="empty-cart-icon">🛒</div>
                <h3>No Clinical Orders Staged</h3>
                <p>
                  Stage medication prescriptions or diagnostic laboratory orders to review interactions,
                  verify pharmacy routing, and authorize transmission in a single batch.
                </p>
                <div className="empty-cart-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setActiveTab("prescribe")}
                  >
                    ＋ Prescribe Medication
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("labs")}
                  >
                    ＋ Order Diagnostic Labs
                  </button>
                </div>
              </div>
            ) : (
              /* ACTIVE STAGED ORDERS LIST & SIGN-OFF GATE */
              <div className="order-cart-content">
                <div className="staged-list-header">
                  <strong>Staged for Authorization ({stagedOrders.length})</strong>
                  <span>Requires Clinician Attestation before Transmission</span>
                </div>

                <div className="staged-orders-list">
                  {stagedOrders.map((order) => (
                    <div key={order.id} className={`staged-order-card type-${order.type}`}>
                      <div className="order-card-header">
                        <div className="order-type-badge-row">
                          <span className={`order-type-pill ${order.type}`}>
                            {order.type === "medication" ? "Rx Prescription" : "Lab Requisition"}
                          </span>
                          {order.type === "medication" && order.deaSchedule !== "None" && (
                            <span className="epcs-schedule-badge">
                              🔒 EPCS {order.deaSchedule}
                            </span>
                          )}
                          {order.type === "lab" && order.fastingRequired && (
                            <span className="fasting-badge">⏳ Fasting Required</span>
                          )}
                          <strong className="order-card-title">
                            {order.type === "medication" ? order.medication : order.testName}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="btn-remove-order"
                          onClick={() => handleRemoveOrder(order.id)}
                          title="Remove this order"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="order-card-details">
                        {order.type === "medication" ? (
                          <>
                            <div className="order-detail-line">
                              <strong>Sig:</strong> {order.sig}
                            </div>
                            <div className="order-meta-grid">
                              <span><strong>Dispense:</strong> #{order.dispenseQuantity}</span>
                              <span><strong>Days Supply:</strong> {order.daysSupply} days</span>
                              <span><strong>Refills:</strong> {order.refills}</span>
                              <span><strong>Pharmacy:</strong> {order.pharmacy.name}</span>
                              <span><strong>Indication:</strong> {order.indication}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="order-detail-line">
                              <strong>LOINC:</strong> {order.loincCode} · <strong>Specimen:</strong> {order.specimen}
                            </div>
                            <div className="order-meta-grid">
                              <span><strong>Priority:</strong> {order.priority}</span>
                              <span><strong>Destination:</strong> {order.targetFacility}</span>
                              <span><strong>Rationale:</strong> {order.clinicalRationale}</span>
                              <span><strong>Indication:</strong> {order.indication}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* EPCS CONTROLLED SUBSTANCE TWO-FACTOR GATE */}
                {hasControlledInCart && (
                  <div className="epcs-security-box">
                    <div className="epcs-header">
                      <span className="lock-icon">🔒</span>
                      <div>
                        <strong>DEA EPCS Two-Factor Authentication Required (21 CFR §1311)</strong>
                        <p>Schedule II/IV Controlled Substances detected. Master PIN and cryptographic token required.</p>
                      </div>
                    </div>
                    <div className="epcs-inputs-row">
                      <div className="epcs-field">
                        <label>Prescriber DEA Number</label>
                        <input type="text" value="BC1049281" readOnly disabled />
                      </div>
                      <div className="epcs-field">
                        <label>Provider Master PIN</label>
                        <input
                          type="password"
                          value={epcsPin}
                          onChange={(e) => setEpcsPin(e.target.value)}
                          placeholder="4-digit PIN"
                        />
                      </div>
                      <div className="epcs-field">
                        <label>FIDO2 / VIP 6-Digit Token</label>
                        <input
                          type="text"
                          value={epcsToken}
                          onChange={(e) => setEpcsToken(e.target.value)}
                          placeholder="000-000"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* LEGAL ATTESTATION SIGNATURE GATE (D-008) */}
                <div className="order-attestation-block">
                  <label className="attestation-checkbox-label">
                    <input
                      type="checkbox"
                      checked={attestationChecked}
                      onChange={(e) => setAttestationChecked(e.target.checked)}
                    />
                    <span>
                      <strong>Attestation of Prescribing Practitioner:</strong> I certify that I am Dr. Logan Carton, MD
                      (NPI: 1841295031) and that the medication orders and diagnostic laboratory requisitions above
                      are clinically indicated and appropriate for this patient.
                    </span>
                  </label>
                </div>

                {/* BOTTOM ACTION BAR */}
                <div className="order-cart-footer">
                  <div className="footer-info">
                    <span>{stagedOrders.length} item(s) staged</span>
                    <small>Surescripts NCPDP SCRIPT &amp; Quest Quanum Adapters Active</small>
                  </div>
                  <div className="footer-actions">
                    <button type="button" onClick={onClose}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary btn-transmit-orders"
                      disabled={!attestationChecked || isTransmitting}
                      onClick={handleAuthorizeAndTransmit}
                    >
                      {isTransmitting ? "Authorizing & Transmitting..." : "Authorize & Transmit Orders ➔"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PRESCRIPTION COMPOSER */}
        {activeTab === "prescribe" && (
          <div className="order-composer-body">
            {/* FAST DRUG PICKER CHIPS */}
            <div className="composer-section">
              <label className="composer-label">Select Psychiatric Medication</label>
              <div className="drug-chips-scroll">
                {psychiatricDrugCatalog.map((drug) => (
                  <button
                    key={drug.id}
                    type="button"
                    className={`drug-chip ${selectedDrugId === drug.id ? "selected" : ""}`}
                    onClick={() => handleSelectDrug(drug)}
                  >
                    <span>{drug.name}</span>
                    {drug.deaSchedule !== "None" && (
                      <small className="dea-mini-pill">{drug.deaSchedule}</small>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* LIVE DRUG-DRUG INTERACTION ALERT BANNER */}
            {interactionAlerts.length > 0 && (
              <div className="interaction-alerts-container">
                {interactionAlerts.map((alert) => (
                  <div key={alert.id} className={`interaction-alert-box severity-${alert.severity}`}>
                    <div className="alert-top">
                      <span className="alert-icon">⚠️</span>
                      <strong>{alert.title}</strong>
                    </div>
                    <p className="alert-mechanism">{alert.mechanism}</p>
                    <div className="alert-action">
                      <strong>Clinical Action:</strong> {alert.clinicalAction}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* FORMULARY FORM INPUTS */}
            <div className="composer-grid">
              {/* Strength Selector */}
              <div className="composer-field">
                <label>Dose / Strength</label>
                <div className="option-pills">
                  {activeDrug.availableStrengths.map((str) => (
                    <button
                      key={str}
                      type="button"
                      className={`pill-btn ${strength === str ? "active" : ""}`}
                      onClick={() => setStrength(str)}
                    >
                      {str}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulation */}
              <div className="composer-field">
                <label>Formulation &amp; Route</label>
                <div className="option-pills">
                  {activeDrug.forms.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`pill-btn ${form === f ? "active" : ""}`}
                      onClick={() => setForm(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frequency */}
              <div className="composer-field full-width">
                <label>Dosing Frequency</label>
                <div className="option-pills">
                  {activeDrug.frequencies.map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      className={`pill-btn ${frequency === freq ? "active" : ""}`}
                      onClick={() => {
                        setFrequency(freq);
                        setSig(`Take 1 ${form.toLowerCase()} (${strength}) by mouth ${freq.toLowerCase()}.`);
                      }}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sig Instructions */}
              <div className="composer-field full-width">
                <label>Prescription Sig (Directions to Patient)</label>
                <input
                  type="text"
                  value={sig}
                  onChange={(e) => setSig(e.target.value)}
                  placeholder="e.g. Take 1 tablet by mouth daily in morning"
                />
              </div>

              {/* Quantity, Days Supply, Refills */}
              <div className="composer-field">
                <label>Dispense Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>

              <div className="composer-field">
                <label>Days Supply</label>
                <input
                  type="number"
                  value={daysSupply}
                  onChange={(e) => setDaysSupply(Number(e.target.value))}
                />
              </div>

              <div className="composer-field">
                <label>Refills</label>
                <input
                  type="number"
                  value={refills}
                  disabled={activeDrug.deaSchedule === "C-II"}
                  onChange={(e) => setRefills(Number(e.target.value))}
                />
                {activeDrug.deaSchedule === "C-II" && (
                  <small className="field-hint danger">0 refills permitted for Schedule II (DEA)</small>
                )}
              </div>

              {/* Indication Link */}
              <div className="composer-field">
                <label>Clinical Indication (ICD-10)</label>
                <select
                  value={rxIndication}
                  onChange={(e) => setRxIndication(e.target.value)}
                >
                  {patient.diagnoses.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="F41.1 - Generalized anxiety disorder">F41.1 - Generalized anxiety disorder</option>
                  <option value="F90.2 - ADHD, combined presentation">F90.2 - ADHD, combined presentation</option>
                  <option value="F33.1 - Major depressive disorder">F33.1 - Major depressive disorder</option>
                  <option value="F31.9 - Bipolar disorder">F31.9 - Bipolar disorder</option>
                </select>
              </div>

              {/* Destination Pharmacy */}
              <div className="composer-field full-width">
                <label>Community Pharmacy</label>
                <select
                  value={pharmacy.id}
                  onChange={(e) => {
                    const found = standardPharmacies.find((p) => p.id === e.target.value);
                    if (found) setPharmacy(found);
                  }}
                >
                  {standardPharmacies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.address} ({p.distance}) {p.epcsEnabled ? "✓ EPCS Certified" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* STAGE ACTION BAR */}
            <div className="composer-footer">
              <button type="button" onClick={() => setActiveTab("cart")}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleStageMedication}
              >
                ＋ Stage Prescription to Cart
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: LAB REQUISITION COMPOSER */}
        {activeTab === "labs" && (
          <div className="order-composer-body">
            {/* PROTOCOL BUNDLE SELECTION */}
            <div className="composer-section">
              <label className="composer-label">Select Diagnostic Lab or Protocol Bundle</label>
              <div className="lab-catalog-list">
                {psychiatricLabCatalog.map((lab) => (
                  <div
                    key={lab.id}
                    className={`lab-catalog-card ${selectedLabId === lab.id ? "selected" : ""}`}
                    onClick={() => setSelectedLabId(lab.id)}
                  >
                    <div className="lab-card-top">
                      <strong>{lab.testName}</strong>
                      <span className="lab-cat-tag">{lab.category}</span>
                    </div>
                    <p className="lab-card-desc">{lab.description}</p>
                    <div className="lab-card-meta">
                      <span>LOINC {lab.loincCode}</span>
                      <span>{lab.specimen}</span>
                      {lab.fastingRequired && <span className="fasting-pill">⏳ Fasting</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* LAB CONFIGURATION */}
            <div className="composer-grid">
              <div className="composer-field">
                <label>Order Priority</label>
                <div className="option-pills">
                  {(["Routine", "STAT", "Next Visit", "Protocol Surveillance"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`pill-btn ${labPriority === p ? "active" : ""}`}
                      onClick={() => setLabPriority(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="composer-field">
                <label>Fasting Requirement</label>
                <div className="option-pills">
                  <button
                    type="button"
                    className={`pill-btn ${labFasting ? "active" : ""}`}
                    onClick={() => setLabFasting(true)}
                  >
                    Yes (10–12hr Fast)
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${!labFasting ? "active" : ""}`}
                    onClick={() => setLabFasting(false)}
                  >
                    No (Non-Fasting)
                  </button>
                </div>
              </div>

              <div className="composer-field">
                <label>Clinical Indication</label>
                <select
                  value={labIndication}
                  onChange={(e) => setLabIndication(e.target.value)}
                >
                  {patient.diagnoses.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="Periodic Metabolic Monitoring Protocol">Periodic Metabolic Monitoring Protocol</option>
                  <option value="Baseline Psychopharmacology Workup">Baseline Psychopharmacology Workup</option>
                  <option value="Therapeutic Drug Monitoring (Narrow Index)">Therapeutic Drug Monitoring (Narrow Index)</option>
                </select>
              </div>

              <div className="composer-field">
                <label>Target Diagnostic Facility</label>
                <select
                  value={targetFacility}
                  onChange={(e) =>
                    setTargetFacility(e.target.value as "Quest Diagnostics" | "Labcorp" | "In-House STAT Lab")
                  }
                >
                  <option value="Quest Diagnostics">Quest Diagnostics (Quanum Connect E-Order)</option>
                  <option value="Labcorp">Labcorp (Beacon HL7 E-Order)</option>
                  <option value="In-House STAT Lab">In-House STAT Clinic Laboratory</option>
                </select>
              </div>
            </div>

            {/* STAGE ACTION BAR */}
            <div className="composer-footer">
              <button type="button" onClick={() => setActiveTab("cart")}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleStageLab}
              >
                ＋ Stage Lab Requisition to Cart
              </button>
            </div>
          </div>
        )}

        {/* SUB-MODAL: REQUISITION SLIP PREVIEW */}
        {showSlipModal && transmissionReceipt?.labResult && (
          <div className="submodal-backdrop" onClick={() => setShowSlipModal(false)}>
            <div className="slip-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="slip-modal-header">
                <h3>Electronic Lab Requisition Slip</h3>
                <button type="button" onClick={() => setShowSlipModal(false)}>✕</button>
              </div>
              <div className="printable-requisition-slip">
                <div className="slip-header-grid">
                  <div>
                    <h2 className="slip-clinic-title">Bay Psychiatric Medical Group</h2>
                    <p>Dr. Logan Carton, MD · NPI 1841295031 · (415) 555-0199</p>
                  </div>
                  <div className="slip-barcode-col">
                    <div className="barcode-mock">
                      {transmissionReceipt.labResult.requisitionSlip.barcode}
                    </div>
                    <strong>REQ: {transmissionReceipt.labResult.requisitionNumber}</strong>
                  </div>
                </div>

                <div className="slip-meta-table">
                  <div><strong>Patient:</strong> {patient.name}</div>
                  <div><strong>DOB:</strong> {patient.dob} ({patient.age}y)</div>
                  <div><strong>MRN:</strong> {patient.mrn}</div>
                  <div><strong>Facility:</strong> {transmissionReceipt.labResult.facilityName}</div>
                </div>

                <div className="slip-tests-table">
                  <h4>ORDERED TESTS</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Test Name</th>
                        <th>LOINC</th>
                        <th>Specimen</th>
                        <th>Prep</th>
                        <th>Indication</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transmissionReceipt.labResult.requisitionSlip.tests.map((t, idx) => (
                        <tr key={idx}>
                          <td><strong>{t.testName}</strong></td>
                          <td>{t.loincCode}</td>
                          <td>{t.specimen}</td>
                          <td>{t.fasting ? "12h Fasting" : "Routine"}</td>
                          <td>{t.icd10}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="slip-instructions">
                  <strong>Patient Instructions:</strong>
                  <p>{transmissionReceipt.labResult.requisitionSlip.specimenCollectionInstructions}</p>
                </div>
              </div>
              <div className="slip-actions">
                <button type="button" onClick={() => window.print()}>🖨 Print Slip</button>
                <button type="button" className="primary" onClick={() => setShowSlipModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL: SURESCRIPTS EDI MESSAGE PREVIEW */}
        {showEdiModal && transmissionReceipt?.prescriptionResult && (
          <div className="submodal-backdrop" onClick={() => setShowEdiModal(false)}>
            <div className="slip-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="slip-modal-header">
                <h3>Surescripts NCPDP SCRIPT Payload</h3>
                <button type="button" onClick={() => setShowEdiModal(false)}>✕</button>
              </div>
              <pre className="edi-code-block">
                {transmissionReceipt.prescriptionResult.ediMessagePreview}
              </pre>
              <div className="slip-actions">
                <button type="button" className="primary" onClick={() => setShowEdiModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
