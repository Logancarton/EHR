"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../lib/api-client";
import type {
  IntakeSelfServicePackage,
  IntakeSelfServiceSubmission,
} from "../../domain/intake";
import { SAFETY_PLAN_SECTIONS, type SafetyPlanAnswers, type SafetyPlanSectionId } from "../../domain/patient-form-requests";

type PortalStep = "contact" | "consents" | "releases" | "assessments" | "safety-plan" | "review";

const STEP_TITLES: Record<PortalStep, string> = {
  contact: "Contact Details",
  consents: "Consents",
  releases: "Releases of Information",
  assessments: "Questionnaires",
  "safety-plan": "Safety Plan",
  review: "Review & Submit",
};

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

  // The patient's own safety plan, when one was requested.
  const [safetyPlan, setSafetyPlan] = useState<SafetyPlanAnswers>({});
  // Typed signatures on requested releases of information, by release id.
  const [releaseSignatures, setReleaseSignatures] = useState<Record<string, { name: string; attested: boolean }>>({});

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
  const setQuestionAnswer = (instrument: IntakeSelfServicePackage["assessmentInstruments"][number]["type"], qId: number, val: number) => {
    setAssessmentResponses((prev) => ({
      ...prev,
      [instrument]: {
        ...prev[instrument],
        [qId]: val,
      },
    }));
  };

  // Forms a clinician sent from a chart show only what was asked for: no contact
  // step, and no consent or questionnaire step when none was requested.
  const isChartRequest = pkg?.purpose === "chart-request";
  const steps: PortalStep[] = isChartRequest
    ? [
        ...((pkg?.consentTemplates.length ?? 0) > 0 ? (["consents"] as const) : []),
        ...((pkg?.releases?.length ?? 0) > 0 ? (["releases"] as const) : []),
        ...((pkg?.assessmentInstruments.length ?? 0) > 0 ? (["assessments"] as const) : []),
        ...(pkg?.safetyPlanRequested ? (["safety-plan"] as const) : []),
        "review",
      ]
    : ["contact", "consents", "assessments", "review"];
  const currentStep = steps[Math.min(activeStep, steps.length - 1)];
  const stepNumber = (step: PortalStep) => steps.indexOf(step) + 1;
  const goToStep = (step: PortalStep) => setActiveStep(Math.max(0, steps.indexOf(step)));
  const nextStep = (step: PortalStep) => steps[steps.indexOf(step) + 1];
  const previousStep = (step: PortalStep) => steps[steps.indexOf(step) - 1];
  const continueLabel = (step: PortalStep | undefined) =>
    step === "review" || !step ? "Review & Submit →" : `Continue to ${STEP_TITLES[step]} →`;
  const portalSubtitle = isChartRequest ? "Forms from your care team" : "Patient Self-Service Intake";

  useEffect(() => {
    if (!pkg) return;
    document.title = `${isChartRequest ? "Forms from Your Care Team" : "Patient Intake"} — Clinical Bond`;
  }, [pkg, isChartRequest]);

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
        // Forms sent from a chart do not ask for contact details.
        contact: isChartRequest ? undefined : {
          mobilePhone: mobilePhone.trim() || undefined,
          email: email.trim() || undefined,
          emergencyContactName: emergencyContactName.trim() || undefined,
          emergencyContactPhone: emergencyContactPhone.trim() || undefined,
          emergencyContactRelationship: emergencyContactRelationship.trim() || undefined,
        },
        consents: consentsPayload,
        assessments: assessmentsPayload,
        safetyPlan: pkg.safetyPlanRequested ? safetyPlan : undefined,
        releases: (pkg.releases ?? []).map((release) => ({
          releaseId: release.id,
          signerName: releaseSignatures[release.id]?.name?.trim() || "",
          attested: Boolean(releaseSignatures[release.id]?.attested),
        })),
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

  // Signing a release is the patient's choice, so this step never blocks the rest.
  const releaseReady = (id: string) => Boolean(releaseSignatures[id]?.name?.trim() && releaseSignatures[id]?.attested);
  const safetyPlanStepComplete = SAFETY_PLAN_SECTIONS.some((section) => safetyPlan[section.id]?.trim());

  // Render Loading
  if (loading) {
    return (
      <div className="portal-body">
        <header className="portal-header">
          <div className="portal-brand">
            <div className="portal-brand-logo">CB</div>
            <div className="portal-brand-text">
              <h1>Clinical Bond</h1>
              <p>{portalSubtitle}</p>
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
              <p>{portalSubtitle}</p>
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
              <p>{portalSubtitle}</p>
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
              {isChartRequest ? "Forms Received" : "Intake Completed Successfully!"}
            </h2>
            <p style={{ color: "var(--portal-text-secondary)", fontSize: "15px", margin: "0" }}>
              Thank you, <strong>{pkg?.subject.displayName}</strong>. {isChartRequest ? "Your care team has received your answers." : "Your forms, signed consents, and clinical questionnaires have been securely received."}
            </p>

            <div>
              <span className="portal-receipt-code" id="receipt-confirmation-code">{confirmation}</span>
            </div>

            <div className="portal-receipt-details">
              <strong>Submission Summary</strong>
              <ul>
                <li>Timestamp: {dateStr}</li>
                {!isChartRequest || (pkg?.consentTemplates.length ?? 0) > 0 ? (
                  <li>Digital Consents Signed: {submissionResult?.signedConsentsCount ?? pkg?.consentTemplates.length ?? 0}</li>
                ) : null}
                {!isChartRequest || (pkg?.assessmentInstruments.length ?? 0) > 0 ? (
                  <li>Clinical Screenings Completed: {submissionResult?.completedAssessmentsCount ?? pkg?.assessmentInstruments.length ?? 0}</li>
                ) : null}
                {pkg?.safetyPlanRequested ? <li>Safety plan received</li> : null}
                {(pkg?.releases?.length ?? 0) > 0 ? (
                  <li>Releases of information signed: {(pkg?.releases ?? []).filter((release) => releaseReady(release.id)).length} of {pkg?.releases?.length}</li>
                ) : null}
                <li>{isChartRequest ? "Sent to your care team's message inbox" : "Transferred directly to clinical intake queue"}</li>
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

            {(assessmentResponses["phq-9"]?.[9] ?? 0) > 0 ? (
              <div className="portal-crisis-alert" role="alert" style={{ marginTop: "24px", textAlign: "left" }}>
                <span style={{ fontSize: "20px" }}>🚨</span>
                <div>
                  <strong>If you are thinking about suicide or hurting yourself, please reach out now</strong>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: "1.5" }}>
                    Your care team will review your answers, but they may not see them right away.
                    Call or text <strong>988</strong> for the Suicide & Crisis Lifeline at any time, or dial <strong>911</strong> in an emergency.
                  </p>
                </div>
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
              <p>{portalSubtitle}</p>
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
                For your privacy and security under federal HIPAA standards, please confirm your date of birth before accessing your {isChartRequest ? "forms" : "clinical intake packet"}.
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
                {verifyingDob ? "Verifying…" : isChartRequest ? "Open My Forms →" : "Unlock My Intake Packet →"}
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
  const phq9Item9Danger = (phq9Answers[9] || 0) > 0;

  return (
    <div className="portal-body">
      {/* Header */}
      <header className="portal-header">
        <div className="portal-brand">
          <div className="portal-brand-logo">CB</div>
          <div className="portal-brand-text">
            <h1>Clinical Bond</h1>
            <p>{portalSubtitle}</p>
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
            {isChartRequest
              ? "Your care team asked you to complete the forms below. Your answers go to your confidential medical record."
              : "Please review and complete your prospective intake packet prior to your initial visit. All information is securely transmitted to your confidential medical record."}
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
        <nav className="portal-progress-bar" aria-label="Progress">
          {steps.map((step, index) => (
            <div
              key={step}
              className={`portal-progress-step ${activeStep >= index ? (activeStep > index ? "completed" : "active") : ""}`}
              title={`Step ${index + 1}: ${STEP_TITLES[step]}`}
            />
          ))}
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
        {currentStep === "contact" && (
          <section className="portal-card" aria-labelledby="contact-heading">
            <div className="portal-card-header">
              <h3 id="contact-heading" className="portal-card-title">{stepNumber("contact")}. Contact & Emergency Information</h3>
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
                onClick={() => goToStep("consents")}
              >
                Continue to Consents →
              </button>
            </div>
          </section>
        )}

        {/* STEP 1: CONSENTS */}
        {currentStep === "consents" && (
          <section className="portal-card" aria-labelledby="consents-heading">
            <div className="portal-card-header">
              <h3 id="consents-heading" className="portal-card-title">{stepNumber("consents")}. {isChartRequest ? "Consents to Sign" : "Practice Policies & Consents"}</h3>
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
              {previousStep("consents") ? (
                <button
                  type="button"
                  className="portal-btn portal-btn-secondary"
                  onClick={() => goToStep(previousStep("consents"))}
                >
                  ← Back
                </button>
              ) : <span />}
              <button
                id="step-consents-next-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                disabled={!consentsStepComplete}
                onClick={() => goToStep(nextStep("consents"))}
              >
                {continueLabel(nextStep("consents"))}
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: ASSESSMENTS */}
        {currentStep === "releases" && (
          <section className="portal-card" aria-labelledby="releases-heading">
            <div className="portal-card-header">
              <h3 id="releases-heading" className="portal-card-title">{stepNumber("releases")}. Releases of Information</h3>
              <p className="portal-card-subtitle">
                Read each authorization. Signing is your choice; your care does not depend on it.
              </p>
            </div>

            {(pkg.releases ?? []).map((release) => {
              const signature = releaseSignatures[release.id] ?? { name: pkg.subject.displayName, attested: false };
              const update = (patch: Partial<{ name: string; attested: boolean }>) =>
                setReleaseSignatures((prev) => ({ ...prev, [release.id]: { ...signature, ...patch } }));
              return (
                <div key={release.id} className="portal-instrument-card">
                  <div className="portal-instrument-intro">
                    <h4>{release.title}</h4>
                  </div>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px", lineHeight: 1.5, margin: "0 0 12px", background: "#f8fafc", padding: "12px", borderRadius: "8px" }}>
                    {release.text}
                  </pre>
                  {release.signed ? (
                    <p style={{ color: "var(--portal-success)", fontWeight: 600 }}>✓ Already signed</p>
                  ) : (
                    <>
                      <div className="portal-form-group">
                        <label className="portal-label" htmlFor={`release-name-${release.id}`}>Full legal name (electronic signature)</label>
                        <input
                          id={`release-name-${release.id}`}
                          type="text"
                          className="portal-input"
                          value={signature.name}
                          onChange={(event) => update({ name: event.target.value })}
                        />
                      </div>
                      <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px" }}>
                        <input type="checkbox" checked={signature.attested} onChange={(event) => update({ attested: event.target.checked })} />
                        <span>I have read this authorization and agree that typing my name above is my electronic signature.</span>
                      </label>
                    </>
                  )}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              {previousStep("releases") ? (
                <button type="button" className="portal-btn portal-btn-secondary" onClick={() => goToStep(previousStep("releases"))}>
                  ← Back
                </button>
              ) : <span />}
              <button
                id="step-releases-next-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                onClick={() => goToStep(nextStep("releases"))}
              >
                {continueLabel(nextStep("releases"))}
              </button>
            </div>
          </section>
        )}

        {currentStep === "assessments" && (
          <section className="portal-card" aria-labelledby="assessments-heading">
            <div className="portal-card-header">
              <h3 id="assessments-heading" className="portal-card-title">{stepNumber("assessments")}. {isChartRequest ? "Questionnaires" : "Standard Clinical Screening Questionnaires"}</h3>
              <p className="portal-card-subtitle">
                {isChartRequest
                  ? "Answer each question for the time period its questionnaire describes."
                  : "Over the last 2 weeks, how often have you been bothered by any of the following problems?"}
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
              {previousStep("assessments") ? (
                <button
                  type="button"
                  className="portal-btn portal-btn-secondary"
                  onClick={() => goToStep(previousStep("assessments"))}
                >
                  ← Back
                </button>
              ) : <span />}
              <button
                id="step-assessments-next-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                disabled={!assessmentsStepComplete}
                onClick={() => goToStep(nextStep("assessments"))}
              >
                {continueLabel(nextStep("assessments"))}
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: REVIEW & SUBMIT */}
        {currentStep === "safety-plan" && (
          <section className="portal-card" aria-labelledby="safety-plan-heading">
            <div className="portal-card-header">
              <h3 id="safety-plan-heading" className="portal-card-title">{stepNumber("safety-plan")}. My Safety Plan</h3>
              <p className="portal-card-subtitle">
                Write in your own words. Fill in what you can; your care team will go over it with you.
              </p>
            </div>

            <div className="portal-crisis-alert" role="note" style={{ marginBottom: "20px" }}>
              <span style={{ fontSize: "20px" }}>🚨</span>
              <div>
                <strong>If you are in crisis right now, don&apos;t wait for this form</strong>
                <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: "1.5" }}>
                  Call or text <strong>988</strong> for the Suicide & Crisis Lifeline at any time, or dial <strong>911</strong> in an emergency.
                </p>
              </div>
            </div>

            {SAFETY_PLAN_SECTIONS.map((section, index) => (
              <div key={section.id} className="portal-form-group">
                <label className="portal-label" htmlFor={`safety-plan-${section.id}`}>
                  {index + 1}. {section.title}
                </label>
                <p style={{ margin: "0 0 6px", fontSize: "13px", color: "var(--portal-text-secondary)" }}>{section.prompt}</p>
                <textarea
                  id={`safety-plan-${section.id}`}
                  className="portal-input"
                  rows={3}
                  value={safetyPlan[section.id] ?? ""}
                  onChange={(event) =>
                    setSafetyPlan((prev) => ({ ...prev, [section.id as SafetyPlanSectionId]: event.target.value }))
                  }
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              {previousStep("safety-plan") ? (
                <button
                  type="button"
                  className="portal-btn portal-btn-secondary"
                  onClick={() => goToStep(previousStep("safety-plan"))}
                >
                  ← Back
                </button>
              ) : <span />}
              <button
                id="step-safety-plan-next-btn"
                type="button"
                className="portal-btn portal-btn-primary"
                disabled={!safetyPlanStepComplete}
                title={safetyPlanStepComplete ? undefined : "Fill in at least one section."}
                onClick={() => goToStep("review")}
              >
                Review & Submit →
              </button>
            </div>
          </section>
        )}

        {currentStep === "review" && (
          <section className="portal-card" aria-labelledby="review-heading">
            <div className="portal-card-header">
              <h3 id="review-heading" className="portal-card-title">{stepNumber("review")}. Review & Final Submission</h3>
              <p className="portal-card-subtitle">
                Please verify your information before submitting. Your packet will be directly routed to your clinical care team.
              </p>
            </div>

            {steps.includes("contact") ? (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Contact Details</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => goToStep("contact")}
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
            ) : null}

            {steps.includes("consents") ? (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Signed Consents</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => goToStep("consents")}
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
            ) : null}

            {steps.includes("releases") ? (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Releases of Information</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => goToStep("releases")}
                >
                  Edit
                </button>
              </div>
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", fontSize: "13px" }}>
                {(pkg.releases ?? []).map((release) => (
                  <div key={release.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span>{release.title}</span>
                    {releaseReady(release.id) ? (
                      <span style={{ color: "var(--portal-success)", fontWeight: 600 }}>✓ Ready</span>
                    ) : (
                      <span style={{ color: "var(--portal-text-muted)", fontWeight: 600 }}>Not signed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            ) : null}

            {steps.includes("safety-plan") ? (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Safety Plan</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => goToStep("safety-plan")}
                >
                  Edit
                </button>
              </div>
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", fontSize: "13px" }}>
                {SAFETY_PLAN_SECTIONS.filter((section) => safetyPlan[section.id]?.trim()).length} of {SAFETY_PLAN_SECTIONS.length} sections filled in
              </div>
            </div>
            ) : null}

            {steps.includes("assessments") ? (
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong style={{ fontSize: "15px", color: "var(--portal-text-primary)" }}>Clinical Screenings</strong>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--portal-primary)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                  onClick={() => goToStep("assessments")}
                >
                  Edit
                </button>
              </div>
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", fontSize: "13px" }}>
                {pkg.assessmentInstruments.map((instrument) => (
                  <div key={instrument.type} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span>{instrument.title}</span>
                    <span style={{ fontWeight: 600 }}>
                      Score: {Object.values(assessmentResponses[instrument.type] || {}).reduce((a, b) => a + b, 0)} / {instrument.maxScore}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button
                type="button"
                className="portal-btn portal-btn-secondary"
                disabled={submitting}
                onClick={() => goToStep(previousStep("review"))}
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
                {submitting ? "Sending…" : isChartRequest ? "Submit My Forms ✓" : "Submit Completed Intake Packet ✓"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
