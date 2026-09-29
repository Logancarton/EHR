"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../lib/api-client";
import type {
  IntakeSelfServicePackage,
  IntakeSelfServiceSubmission,
} from "../../domain/intake";

interface SignatureState {
  method: "drawn_canvas" | "typed_attestation";
  drawnDataUrl?: string;
  typedName?: string;
  attestationAccepted: boolean;
  signed: boolean;
}

export default function IntakeSelfServicePortal() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  // Package & loading state
  const [pkg, setPkg] = useState<IntakeSelfServicePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Identity verification (DOB gate)
  const [dobInput, setDobInput] = useState("");
  const [dobError, setDobError] = useState<string | null>(null);
  const [verifyingDob, setVerifyingDob] = useState(false);

  // Current tab/step in the wizard: 0: Contact, 1: Consents, 2: Assessments, 3: Review
  const [activeStep, setActiveStep] = useState(0);

  // Contact form state
  const [mobilePhone, setMobilePhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");

  // Consents state: key = templateId
  const [signatures, setSignatures] = useState<Record<string, SignatureState>>({});
  const [activeConsentIndex, setActiveConsentIndex] = useState(0);

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastCoordRef = useRef<{ x: number; y: number } | null>(null);

  // Assessments state: key = instrument ("phq-9" | "gad-7"), value = responses { [questionId]: value }
  const [assessmentResponses, setAssessmentResponses] = useState<Record<string, Record<number, number>>>({
    "phq-9": {},
    "gad-7": {},
  });

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    confirmationCode: string;
    completedAt: string;
    signedConsentsCount: number;
    completedAssessmentsCount: number;
  } | null>(null);

  // Load package
  const loadPackage = useCallback(
    async (dob?: string) => {
      if (!token) {
        setError("Missing invitation token. Please use the personalized link provided in your clinic invitation email or text message.");
        setLoading(false);
        return;
      }
      try {
        setError(null);
        setDobError(null);
        const data = await api.intake.selfService.getPackage(token, dob);
        setPkg(data);

        // Pre-fill contact info
        setMobilePhone(data.subject.phone || "");
        setEmail(data.subject.email || "");
        setEmergencyContactName(data.subject.emergencyContactName || "");
        setEmergencyContactPhone(data.subject.emergencyContactPhone || "");
        setEmergencyContactRelationship(data.subject.emergencyContactRelationship || "");

        // Initialize signatures
        const initialSigs: Record<string, SignatureState> = {};
        for (const t of data.consentTemplates) {
          initialSigs[t.id] = {
            method: "typed_attestation",
            typedName: data.subject.displayName,
            attestationAccepted: t.signed,
            signed: t.signed,
          };
        }
        setSignatures(initialSigs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load intake package.";
        if (dob) {
          setDobError(msg);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
        setVerifyingDob(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void loadPackage();
  }, [loadPackage]);

  // Handle DOB Gate Verification
  async function handleVerifyDob(e: React.FormEvent) {
    e.preventDefault();
    if (!dobInput.trim()) {
      setDobError("Please enter your birth date.");
      return;
    }
    setVerifyingDob(true);
    setDobError(null);
    await loadPackage(dobInput.trim());
  }

  // Canvas drawing handlers
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const coords = getCanvasCoords(e);
    lastCoordRef.current = coords;
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastCoordRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const coords = getCanvasCoords(e);
    ctx.beginPath();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(lastCoordRef.current.x, lastCoordRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastCoordRef.current = coords;
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastCoordRef.current = null;

    if (canvasRef.current && pkg && pkg.consentTemplates[activeConsentIndex]) {
      const activeTemplate = pkg.consentTemplates[activeConsentIndex];
      const dataUrl = canvasRef.current.toDataURL("image/png");
      setSignatures((prev) => ({
        ...prev,
        [activeTemplate.id]: {
          ...prev[activeTemplate.id],
          drawnDataUrl: dataUrl,
          signed: true,
        },
      }));
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !pkg || !pkg.consentTemplates[activeConsentIndex]) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    const activeTemplate = pkg.consentTemplates[activeConsentIndex];
    setSignatures((prev) => ({
      ...prev,
      [activeTemplate.id]: {
        ...prev[activeTemplate.id],
        drawnDataUrl: undefined,
        signed: false,
      },
    }));
  };

  // Assessment question change
  const setQuestionAnswer = (instrument: "phq-9" | "gad-7", qId: number, val: number) => {
    setAssessmentResponses((prev) => ({
      ...prev,
      [instrument]: {
        ...prev[instrument],
        [qId]: val,
      },
    }));
  };

  // Submit complete package
  async function handleSubmit() {
    if (!token || !pkg) return;
    setSubmitting(true);
    setError(null);

    try {
      const consentsPayload = pkg.consentTemplates.map((t) => {
        const sig = signatures[t.id];
        return {
          templateId: t.id,
          templateVersion: t.version,
          signerName: sig?.typedName?.trim() || pkg.subject.displayName,
          signerRelationship: "self" as const,
          method: sig?.method || ("typed_attestation" as const),
          signatureData: sig?.method === "drawn_canvas" ? sig.drawnDataUrl : undefined,
          attestationStatement:
            sig?.method === "typed_attestation"
              ? `I, ${sig.typedName || pkg.subject.displayName}, confirm this digital attestation constitutes my legal signature.`
              : undefined,
        };
      });

      const assessmentsPayload = pkg.assessmentInstruments.map((inst) => ({
        instrument: inst.type,
        responses: assessmentResponses[inst.type] || {},
      }));

      const payload: IntakeSelfServiceSubmission = {
        token,
        dobVerification: pkg.subject.dobVerificationRequired ? dobInput.trim() : undefined,
        contact: {
          mobilePhone: mobilePhone.trim() || undefined,
          email: email.trim() || undefined,
          emergencyContactName: emergencyContactName.trim() || undefined,
          emergencyContactPhone: emergencyContactPhone.trim() || undefined,
          emergencyContactRelationship: emergencyContactRelationship.trim() || undefined,
        },
        consents: consentsPayload,
        assessments: assessmentsPayload,
      };

      const result = await api.intake.selfService.submitPackage(payload);
      setSubmissionResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit intake packet. Please check your inputs.");
    } finally {
      setSubmitting(false);
    }
  }

  // Calculations for review / step completion
  const contactStepComplete = Boolean(mobilePhone.trim() && email.trim());
  const consentsStepComplete =
    pkg?.consentTemplates.every((t) => {
      const sig = signatures[t.id];
      if (!sig) return false;
      if (sig.method === "drawn_canvas") return Boolean(sig.drawnDataUrl);
      return Boolean(sig.typedName?.trim() && sig.attestationAccepted);
    }) ?? false;

  const assessmentsStepComplete =
    pkg?.assessmentInstruments.every((inst) => {
      const resps = assessmentResponses[inst.type] || {};
      return inst.questions.every((q) => resps[q.id] !== undefined);
    }) ?? false;

  // Render Loading
  if (loading) {
    return (
      <div className="portal-body">
        <header className="portal-header">
          <div className="portal-brand">
            <div className="portal-brand-logo">CB</div>
            <div className="portal-brand-text">
              <h1>Clinical Bond</h1>
              <p>Patient Self-Service Intake</p>
            </div>
          </div>
        </header>
        <div className="portal-container" style={{ textAlign: "center", paddingTop: "80px" }}>
          <p style={{ color: "var(--portal-text-secondary)", fontSize: "16px" }}>Loading your intake package…</p>
        </div>
      </div>
    );
  }

  // Render Top-level Error
  if (error && !pkg) {
    return (
      <div className="portal-body">
        <header className="portal-header">
          <div className="portal-brand">
            <div className="portal-brand-logo">CB</div>
            <div className="portal-brand-text">
              <h1>Clinical Bond</h1>
              <p>Patient Self-Service Intake</p>
            </div>
          </div>
        </header>
        <div className="portal-container" style={{ maxWidth: "600px" }}>
          <div className="portal-card" style={{ borderColor: "var(--portal-danger)", textAlign: "center" }}>
            <div style={{ color: "var(--portal-danger)", fontSize: "40px", marginBottom: "12px" }}>⚠️</div>
            <h2 style={{ fontSize: "20px", margin: "0 0 8px", color: "var(--portal-text-primary)" }}>Unable to Open Intake Packet</h2>
            <p style={{ color: "var(--portal-text-secondary)", fontSize: "14px", lineHeight: "1.6" }}>{error}</p>
            <p style={{ color: "var(--portal-text-muted)", fontSize: "13px", marginTop: "16px" }}>
              If you believe this is an error, please contact your clinician&apos;s office directly to request a new link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render Already Completed (or Success)
  if (submissionResult || pkg?.status === "completed") {
    const confirmation = submissionResult?.confirmationCode || "CONFIRMED";
    const dateStr = submissionResult?.completedAt
      ? new Date(submissionResult.completedAt).toLocaleString()
      : "Recorded in your clinic record";

    return (
      <div className="portal-body">
        <header className="portal-header">
          <div className="portal-brand">
            <div className="portal-brand-logo">CB</div>
            <div className="portal-brand-text">
              <h1>Clinical Bond</h1>
              <p>Patient Self-Service Intake</p>
            </div>
          </div>
          <div className="portal-security-badge">
            <span>🔒</span> Verified & Sealed
          </div>
        </header>

        <div className="portal-container" style={{ maxWidth: "680px" }}>
          <div className="portal-card portal-receipt">
            <div className="portal-receipt-seal">✓</div>
            <h2 style={{ fontSize: "24px", margin: "0 0 8px", color: "var(--portal-text-primary)" }}>
              Intake Completed Successfully!
            </h2>
            <p style={{ color: "var(--portal-text-secondary)", fontSize: "15px", margin: "0" }}>
              Thank you, <strong>{pkg?.subject.displayName}</strong>. Your forms, signed consents, and clinical questionnaires have been securely received.
            </p>

            <div>
              <span className="portal-receipt-code" id="receipt-confirmation-code">{confirmation}</span>
            </div>

            <div className="portal-receipt-details">
              <strong>Submission Summary</strong>
              <ul>
                <li>Timestamp: {dateStr}</li>
                <li>Digital Consents Signed: {submissionResult?.signedConsentsCount ?? pkg?.consentTemplates.length ?? 0}</li>
                <li>Clinical Screenings Completed: {submissionResult?.completedAssessmentsCount ?? pkg?.assessmentInstruments.length ?? 0}</li>
                <li>Transferred directly to clinical intake queue</li>
              </ul>
            </div>

            {pkg?.appointment ? (
              <div style={{ marginTop: "24px", padding: "16px", background: "var(--portal-primary-light)", borderRadius: "8px", textAlign: "left" }}>
                <strong style={{ color: "var(--portal-primary-hover)", display: "block", marginBottom: "4px" }}>
                  Upcoming Appointment
                </strong>
                <p style={{ margin: 0, fontSize: "14px", color: "var(--portal-text-primary)" }}>
                  {pkg.appointment.visitType} on <strong>{pkg.appointment.date}</strong> at <strong>{pkg.appointment.time}</strong>
                  {pkg.appointment.providerName ? ` with ${pkg.appointment.providerName}` : ""}.
                </p>
              </div>
            ) : null}

            <p style={{ fontSize: "13px", color: "var(--portal-text-muted)", marginTop: "28px" }}>
              You may now safely close this browser window.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render DOB Gate
  if (pkg?.subject.dobVerificationRequired && !pkg.subject.dobVerified) {
    return (
      <div className="portal-body">
        <header className="portal-header">
          <div className="portal-brand">
            <div className="portal-brand-logo">CB</div>
            <div className="portal-brand-text">
              <h1>Clinical Bond</h1>
              <p>Patient Self-Service Intake</p>
            </div>
          </div>
          <div className="portal-security-badge">
            <span>🔒</span> HIPAA Protected
          </div>
        </header>

        <div className="portal-container" style={{ maxWidth: "520px" }}>
          <div className="portal-card">
            <div className="portal-card-header">
              <h2 className="portal-card-title">Identity Verification Required</h2>
              <p className="portal-card-subtitle">
                For your privacy and security under federal HIPAA standards, please confirm your date of birth before accessing your clinical intake packet.
              </p>
            </div>

            {dobError ? (
              <div
                style={{
                  background: "var(--portal-danger-light)",
                  color: "var(--portal-danger)",
                  padding: "12px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  fontSize: "13px",
                }}
              >
                {dobError}
              </div>
            ) : null}

            <form onSubmit={handleVerifyDob}>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="patient-dob-input">
                  Your Date of Birth (YYYY-MM-DD)
                </label>
                <input
                  id="patient-dob-input"
                  type="date"
                  className="portal-input"
                  value={dobInput}
                  onChange={(e) => setDobInput(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  required
                />
              </div>

              <button
                id="verify-dob-btn"
                type="submit"
                className="portal-btn portal-btn-primary portal-btn-block"
                disabled={verifyingDob || !dobInput}
              >
                {verifyingDob ? "Verifying…" : "Unlock My Intake Packet →"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!pkg) return null;

  // Calculate questionnaire scores
  const phq9Answers = assessmentResponses["phq-9"] || {};
  const phq9Score = Object.values(phq9Answers).reduce((a, b) => a + b, 0);
  const phq9Item9Danger = (phq9Answers[9] || 0) > 0;

  const gad7Answers = assessmentResponses["gad-7"] || {};
  const gad7Score = Object.values(gad7Answers).reduce((a, b) => a + b, 0);

  return (
    <div className="portal-body">
      {/* Header */}
      <header className="portal-header">
        <div className="portal-brand">
          <div className="portal-brand-logo">CB</div>
          <div className="portal-brand-text">
            <h1>Clinical Bond</h1>
            <p>Patient Self-Service Portal</p>
          </div>
        </div>
        <div className="portal-security-badge">
          <span>🔒</span> 256-Bit Encrypted
        </div>
      </header>

      <main className="portal-container">
        {/* Hero Card */}
        <section className="portal-hero">
          <h2 className="portal-hero-title">Welcome, {pkg.subject.displayName}</h2>
          <p className="portal-hero-desc">
            Please review and complete your prospective intake packet prior to your initial visit. All information is securely transmitted to your confidential medical record.
          </p>
          {pkg.appointment ? (
            <div className="portal-appointment-pill">
              <span>📅</span>
              <span>
                {pkg.appointment.visitType} on {pkg.appointment.date} at {pkg.appointment.time}
                {pkg.appointment.providerName ? ` with ${pkg.appointment.providerName}` : ""}
              </span>
            </div>
          ) : null}
        </section>

        {/* Wizard Step Progress Bar */}
        <nav className="portal-progress-bar" aria-label="Intake progress">
          <div
            className={`portal-progress-step ${activeStep >= 0 ? (activeStep > 0 ? "completed" : "active") : ""}`}
            title="Step 1: Contact Details"
          />
          <div
            className={`portal-progress-step ${activeStep >= 1 ? (activeStep > 1 ? "completed" : "active") : ""}`}
            title="Step 2: Legal Consents"
          />
          <div
            className={`portal-progress-step ${activeStep >= 2 ? (activeStep > 2 ? "completed" : "active") : ""}`}
            title="Step 3: Clinical Questionnaires"
          />
          <div
            className={`portal-progress-step ${activeStep >= 3 ? "active" : ""}`}
            title="Step 4: Review & Submit"
          />
        </nav>

        {error ? (
          <div
            style={{
              background: "var(--portal-danger-light)",
              color: "var(--portal-danger)",
              padding: "14px",
              borderRadius: "8px",
              marginBottom: "20px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        ) : null}

        {/* STEP 0: CONTACT DETAILS */}
        {activeStep === 0 && (
          <section className="portal-card" aria-labelledby="contact-heading">
            <div className="portal-card-header">
              <h3 id="contact-heading" className="portal-card-title">1. Contact & Emergency Information</h3>
              <p className="portal-card-subtitle">
                Confirm how the clinic should reach you and who we should notify in case of emergency.
              </p>
            </div>

            <div className="portal-grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="input-mobile-phone">
                  Mobile / Callback Phone *
                </label>
                <input
                  id="input-mobile-phone"
                  type="tel"
                  className="portal-input"
                  value={mobilePhone}
                  onChange={(e) => setMobilePhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  required
                />
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="input-email">
                  Email Address *
                </label>
                <input
                  id="input-email"
                  type="email"
                  className="portal-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: "16px", marginBottom: "8px" }}>
              <strong style={{ fontSize: "14px", color: "var(--portal-text-primary)" }}>Emergency Contact</strong>
            </div>

            <div className="portal-grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="input-em-name">
                  Contact Full Name
                </label>
                <input
                  id="input-em-name"
                  type="text"
                  className="portal-input"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="input-em-phone">
                  Contact Phone Number
                </label>
                <input
                  id="input-em-phone"
                  type="tel"
                  className="portal-input"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="input-em-rel">
                Relationship to You
              </label>
              <input
                id="input-em-rel"
                type="text"
                className="portal-input"
                value={emergencyContactRelationship}
                onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                placeholder="e.g. Spouse, Parent, Sibling, Friend"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
              <button
                id="step-contact-next-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                disabled={!contactStepComplete}
                onClick={() => setActiveStep(1)}
              >
                Continue to Consents →
              </button>
            </div>
          </section>
        )}

        {/* STEP 1: CONSENTS */}
        {activeStep === 1 && (
          <section className="portal-card" aria-labelledby="consents-heading">
            <div className="portal-card-header">
              <h3 id="consents-heading" className="portal-card-title">2. Practice Policies & Consents</h3>
              <p className="portal-card-subtitle">
                Please review each agreement and provide your electronic signature. All items are required for care.
              </p>
            </div>

            {pkg.consentTemplates.map((template, idx) => {
              const sig = signatures[template.id] || {
                method: "typed_attestation",
                typedName: pkg.subject.displayName,
                attestationAccepted: false,
                signed: false,
              };
              const isCurrent = activeConsentIndex === idx;

              return (
                <div key={template.id} className="portal-consent-item">
                  <div
                    className="portal-consent-header"
                    onClick={() => setActiveConsentIndex(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <div>
                      <h4>{template.title}</h4>
                      <span style={{ fontSize: "12px", color: "var(--portal-text-muted)" }}>
                        Version {template.version} • {template.category.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      {sig.signed ? (
                        <span className="portal-signed-badge">✓ Signed</span>
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--portal-warning)", fontWeight: 600 }}>
                          Signature Needed
                        </span>
                      )}
                    </div>
                  </div>

                  {isCurrent && (
                    <div className="portal-consent-body">
                      <div className="portal-consent-terms">
                        {template.bodyText || "Standard terms and clinical agreements apply. By signing below, you agree to treatment, clinical privacy practices, telehealth guidelines, and practice financial policies."}
                      </div>

                      {/* Signature Mode Selector */}
                      <div className="portal-sig-mode-tabs">
                        <button
                          type="button"
                          className={`portal-sig-mode-tab ${sig.method === "typed_attestation" ? "active" : ""}`}
                          onClick={() =>
                            setSignatures((prev) => ({
                              ...prev,
                              [template.id]: { ...prev[template.id], method: "typed_attestation" },
                            }))
                          }
                        >
                          Type Legal Name
                        </button>
                        <button
                          type="button"
                          className={`portal-sig-mode-tab ${sig.method === "drawn_canvas" ? "active" : ""}`}
                          onClick={() =>
                            setSignatures((prev) => ({
                              ...prev,
                              [template.id]: { ...prev[template.id], method: "drawn_canvas" },
                            }))
                          }
                        >
                          Draw Signature
                        </button>
                      </div>

                      {sig.method === "typed_attestation" ? (
                        <div>
                          <div className="portal-form-group">
                            <label className="portal-label" htmlFor={`typed-sig-${template.id}`}>
                              Full Legal Name (Electronic Signature)
                            </label>
                            <input
                              id={`typed-sig-${template.id}`}
                              type="text"
                              className="portal-input"
                              value={sig.typedName || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSignatures((prev) => ({
                                  ...prev,
                                  [template.id]: {
                                    ...prev[template.id],
                                    typedName: val,
                                    signed: Boolean(val.trim() && prev[template.id]?.attestationAccepted),
                                  },
                                }));
                              }}
                              placeholder={pkg.subject.displayName}
                            />
                          </div>

                          <label
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "8px",
                              fontSize: "13px",
                              color: "var(--portal-text-secondary)",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={sig.attestationAccepted}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSignatures((prev) => ({
                                  ...prev,
                                  [template.id]: {
                                    ...prev[template.id],
                                    attestationAccepted: checked,
                                    signed: Boolean(checked && prev[template.id]?.typedName?.trim()),
                                  },
                                }));
                              }}
                            />
                            <span>
                              I understand and agree that typing my name above constitutes a binding electronic signature under federal law (ESIGN Act).
                            </span>
                          </label>
                        </div>
                      ) : (
                        <div>
                          <div className="portal-canvas-wrapper">
                            <canvas
                              ref={canvasRef}
                              width={540}
                              height={140}
                              className="portal-sig-canvas"
                              onPointerDown={startDrawing}
                              onPointerMove={draw}
                              onPointerUp={stopDrawing}
                              onPointerLeave={stopDrawing}
                            />
                            <button
                              type="button"
                              className="portal-canvas-clear"
                              onClick={clearCanvas}
                            >
                              Clear
                            </button>
                          </div>
                          <span style={{ fontSize: "12px", color: "var(--portal-text-muted)" }}>
                            Sign using your finger, stylus, or mouse above.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button
                type="button"
                className="portal-btn portal-btn-secondary"
                onClick={() => setActiveStep(0)}
              >
                ← Back
              </button>
              <button
                id="step-consents-next-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                disabled={!consentsStepComplete}
                onClick={() => setActiveStep(2)}
              >
                Continue to Questionnaires →
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: ASSESSMENTS */}
        {activeStep === 2 && (
          <section className="portal-card" aria-labelledby="assessments-heading">
            <div className="portal-card-header">
              <h3 id="assessments-heading" className="portal-card-title">3. Standard Clinical Screening Questionnaires</h3>
              <p className="portal-card-subtitle">
                Over the last 2 weeks, how often have you been bothered by any of the following problems?
              </p>
            </div>

            {pkg.assessmentInstruments.map((instrument) => {
              const responses = assessmentResponses[instrument.type] || {};
              const currentScore = Object.values(responses).reduce((a, b) => a + b, 0);

              return (
                <div key={instrument.type} className="portal-instrument-card">
                  <div className="portal-instrument-intro">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4>{instrument.title}</h4>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--portal-primary)" }}>
                        Current Score: {currentScore} / {instrument.maxScore}
                      </span>
                    </div>
                    <p>{instrument.description}</p>
                  </div>

                  {instrument.questions.map((q) => {
                    const selectedVal = responses[q.id];

                    return (
                      <div key={q.id} className="portal-question-row">
                        <div className="portal-question-text">
                          {q.id}. {q.text}
                        </div>
                        <div className="portal-options-matrix">
                          {q.options.map((opt) => {
                            const isSelected = selectedVal === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                className={`portal-option-pill ${isSelected ? "selected" : ""}`}
                                onClick={() => setQuestionAnswer(instrument.type, q.id, opt.value)}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {instrument.type === "phq-9" && phq9Item9Danger ? (
                    <div className="portal-crisis-alert" role="alert">
                      <span style={{ fontSize: "20px" }}>🚨</span>
                      <div>
                        <strong>Crisis & Safety Resources Available 24/7</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: "1.5" }}>
                          If you are having thoughts of suicide or self-harm, confidential support is available right now.
                          Call or text <strong>988</strong> to connect with the Suicide & Crisis Lifeline, or dial <strong>911</strong> in an emergency.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button
                type="button"
                className="portal-btn portal-btn-secondary"
                onClick={() => setActiveStep(1)}
              >
                ← Back
              </button>
              <button
                id="step-assessments-next-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                disabled={!assessmentsStepComplete}
                onClick={() => setActiveStep(3)}
              >
                Review & Submit →
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: REVIEW & SUBMIT */}
        {activeStep === 3 && (
          <section className="portal-card" aria-labelledby="review-heading">
            <div className="portal-card-header">
              <h3 id="review-heading" className="portal-card-title">4. Review & Final Submission</h3>
              <p className="portal-card-subtitle">
                Please verify your information before submitting. Your packet will be directly routed to your clinical care team.
              </p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Contact Details</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => setActiveStep(0)}
                >
                  Edit
                </button>
              </div>
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", fontSize: "13px" }}>
                <div><strong>Phone:</strong> {mobilePhone}</div>
                <div><strong>Email:</strong> {email}</div>
                {emergencyContactName ? (
                  <div><strong>Emergency Contact:</strong> {emergencyContactName} ({emergencyContactRelationship || "Contact"}) - {emergencyContactPhone}</div>
                ) : null}
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Signed Consents</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => setActiveStep(1)}
                >
                  Edit
                </button>
              </div>
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", fontSize: "13px" }}>
                {pkg.consentTemplates.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span>{t.title} (v{t.version})</span>
                    <span style={{ color: "var(--portal-success)", fontWeight: 600 }}>✓ Ready</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Clinical Screenings</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => setActiveStep(2)}
                >
                  Edit
                </button>
              </div>
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>PHQ-9 Depression Screener</span>
                  <span style={{ fontWeight: 600 }}>Score: {phq9Score} / 27</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>GAD-7 Anxiety Screener</span>
                  <span style={{ fontWeight: 600 }}>Score: {gad7Score} / 21</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button
                type="button"
                className="portal-btn portal-btn-secondary"
                disabled={submitting}
                onClick={() => setActiveStep(2)}
              >
                ← Back
              </button>
              <button
                id="submit-intake-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                disabled={submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? "Transmitting Packet…" : "Submit Completed Intake Packet ✓"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
