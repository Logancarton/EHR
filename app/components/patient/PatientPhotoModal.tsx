"use client";

import { useState, useRef, useEffect } from "react";
import type { Patient, PatientPhotoType, PatientIdCard } from "../../domain/patient";
import {
  generateIdCardSvgDataUrl,
  SYNTHETIC_PATIENT_PORTRAITS,
} from "../../lib/patient-id-card-generator";
import { api } from "../../lib/api-client";
import { refreshPatientRoster } from "../../lib/patient-roster";
import {
  WORKSPACE_PATIENT_UPDATED_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { formatDateOfBirth } from "../../domain/patient-administration";

/**
 * The photo spot only ever reads identity and photo fields. Asking for a whole
 * `Patient` made callers that legitimately hold only demographics (the information
 * drawer, for one) fabricate empty diagnoses/meds arrays to satisfy the type.
 */
export type PatientPhotoSubject = Pick<Patient, "id" | "name" | "dob"> &
  Partial<Pick<Patient, "initials" | "age" | "mrn" | "photoUrl" | "photoType" | "idCard">>;

/**
 * Only an ID card that names a document or a number is an ID on file. The modal
 * used to fill a missing card with a fixture license ("742 Evergreen Terr") and
 * saved it back to the chart with the photo choice.
 */
function recordedIdCard(card: PatientIdCard | undefined): PatientIdCard | undefined {
  return card && (card.documentType || card.licenseNumber) ? card : undefined;
}

function expiryStatus(expirationDate: string | undefined): string {
  if (!expirationDate) return "";
  const parsed = Date.parse(expirationDate);
  if (!Number.isFinite(parsed)) return "";
  return parsed < Date.now() ? " (Expired)" : " (Not expired)";
}

export interface PatientPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientPhotoSubject;
  onPhotoUpdated?: (updatedPatient: Patient) => void;
}

export default function PatientPhotoModal({
  isOpen,
  onClose,
  patient,
  onPhotoUpdated,
}: PatientPhotoModalProps) {
  const [activeTab, setActiveTab] = useState<"license" | "photo">(
    patient.photoType === "custom" || patient.photoType === "headshot" ? "photo" : "license"
  );
  const [selectedPhotoType, setSelectedPhotoType] = useState<PatientPhotoType>(
    patient.photoType || "license"
  );

  const [idCardData, setIdCardData] = useState<PatientIdCard | undefined>(
    recordedIdCard(patient.idCard)
  );

  const [personalPhotoUrl, setPersonalPhotoUrl] = useState<string>(
    patient.photoType !== "license" && patient.photoUrl
      ? patient.photoUrl
      : SYNTHETIC_PATIENT_PORTRAITS[patient.id] || SYNTHETIC_PATIENT_PORTRAITS["maya-chen"]
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize with patient prop when opened
  useEffect(() => {
    if (isOpen) {
      const type = patient.photoType || "license";
      setSelectedPhotoType(type);
      setActiveTab(type === "license" ? "license" : "photo");
      setIdCardData(recordedIdCard(patient.idCard));
      setPersonalPhotoUrl(
        patient.photoType !== "license" && patient.photoUrl
          ? patient.photoUrl
          : SYNTHETIC_PATIENT_PORTRAITS[patient.id] || SYNTHETIC_PATIENT_PORTRAITS["maya-chen"]
      );
      setErrorMsg(null);
    }
  }, [isOpen, patient]);

  if (!isOpen) return null;

  const cardSvgUrl = idCardData ? generateIdCardSvgDataUrl(patient.name, patient.dob, idCardData) : null;

  // File upload handler
  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select a valid image file (PNG, JPG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setPersonalPhotoUrl(result);
        setSelectedPhotoType("custom");
        setActiveTab("photo");
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      // Determine final photo URL based on selected mode
      // Without an ID on file there is no ID photo to show, so the portrait is used.
      const photoType: PatientPhotoType = selectedPhotoType === "license" && !idCardData ? "headshot" : selectedPhotoType;
      let finalPhotoUrl = personalPhotoUrl;
      if (photoType === "license" && cardSvgUrl) {
        finalPhotoUrl = SYNTHETIC_PATIENT_PORTRAITS[patient.id] || cardSvgUrl;
      }

      // The ID card is the recorded one, unchanged; this dialog only chooses the photo.
      const updates = {
        photoUrl: finalPhotoUrl,
        photoType,
        ...(idCardData ? { idCard: idCardData } : {}),
      };

      const updatedRecord = await api.patients.update(patient.id, updates);
      await refreshPatientRoster();

      // Dispatch event for any other components listening
      dispatchWorkspaceEvent(WORKSPACE_PATIENT_UPDATED_EVENT, {
        patientId: patient.id,
        patient: updatedRecord as unknown as Patient,
      });

      if (onPhotoUpdated) {
        onPhotoUpdated(updatedRecord as unknown as Patient);
      }

      onClose();
    } catch (err) {
      console.error("Failed to save patient photo:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to save photo changes.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop patient-photo-modal-backdrop" onClick={onClose}>
      <div
        className="modal-content patient-photo-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-modal-title"
      >
        {/* Header */}
        <div className="patient-photo-modal-header">
          <div className="photo-modal-title-group">
            <div className="photo-modal-badge-icon">
              <Icon name="badge" />
            </div>
            <div>
              <h2 id="photo-modal-title">Patient Identification & Photo</h2>
              <p className="photo-modal-subtitle">
                {patient.name} · DOB: {formatDateOfBirth(patient.dob)} · MRN: {patient.mrn}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="patient-photo-tabs">
          <button
            type="button"
            className={`photo-tab-btn ${activeTab === "license" ? "active" : ""}`}
            onClick={() => setActiveTab("license")}
          >
            <Icon name="badge" />
            <span>Driver&apos;s License / State ID</span>
            {selectedPhotoType === "license" && (
              <span className="photo-tab-active-pill">Active Spot</span>
            )}
          </button>
          <button
            type="button"
            className={`photo-tab-btn ${activeTab === "photo" ? "active" : ""}`}
            onClick={() => setActiveTab("photo")}
          >
            <Icon name="face" />
            <span>Patient Portrait / Photo</span>
            {selectedPhotoType !== "license" && (
              <span className="photo-tab-active-pill">Active Spot</span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="patient-photo-modal-body">
          {errorMsg && (
            <div className="photo-modal-error">
              <Icon name="error" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === "license" ? (
            /* Government ID View — recorded evidence only */
            !idCardData || !cardSvgUrl ? (
              <div className="license-view-tab">
                <div className="photo-modal-notice" role="status">
                  <Icon name="badge" />
                  <span>
                    No government ID is on file for this patient. Record it through Intake&apos;s
                    Government ID step; until then the chart photo uses the patient portrait.
                  </span>
                </div>
              </div>
            ) : (
            <div className="license-view-tab">
              <div className="license-card-hero">
                <div className="license-card-frame">
                  <img
                    src={cardSvgUrl}
                    alt={`${patient.name} ${idCardData.documentType || "government ID"}`}
                    className="license-card-svg"
                  />
                </div>
                <div className="license-quick-actions">
                  <button
                    type="button"
                    className={`btn-select-photo-type ${
                      selectedPhotoType === "license" ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedPhotoType("license")}
                  >
                    <Icon
                      name={
                        selectedPhotoType === "license"
                          ? "check_circle"
                          : "radio_button_unchecked"
                      }
                    />
                    <span>
                      {selectedPhotoType === "license"
                        ? "Currently Set as Picture Spot"
                        : "Use ID Photo as Picture Spot"}
                    </span>
                  </button>
                </div>
              </div>

              {/* ID Metadata Breakdown */}
              <div className="license-details-grid">
                <div className="license-detail-item">
                  <span className="detail-label">Document Type</span>
                  <span className="detail-value font-semibold">
                    {idCardData.documentType || "Not recorded"}{idCardData.state ? ` (${idCardData.state})` : ""}
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Document Number</span>
                  <span className="detail-value font-mono font-semibold">
                    {idCardData.licenseNumber || "Not recorded"}
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Expiration Date</span>
                  <span className="detail-value font-semibold">
                    {idCardData.expirationDate ? `${idCardData.expirationDate}${expiryStatus(idCardData.expirationDate)}` : "Not recorded"}
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Issue Date</span>
                  <span className="detail-value">{idCardData.issueDate || "Not recorded"}</span>
                </div>
                <div className="license-detail-item col-span-2">
                  <span className="detail-label">Residential Address</span>
                  <span className="detail-value">{idCardData.address || "Not recorded"}</span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Class / Endorsements</span>
                  <span className="detail-value">
                    {idCardData.classType ? `Class ${idCardData.classType}` : "Not recorded"}{idCardData.donor ? " · Organ Donor" : ""}
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Reviewed</span>
                  <span className="detail-value text-xs text-slate-600">
                    {idCardData.verified
                      ? [idCardData.verifiedBy, idCardData.verifiedAt].filter(Boolean).join(" · ") || "Yes"
                      : "Not yet reviewed"}
                  </span>
                </div>
              </div>
            </div>
            )
          ) : (
            /* Patient Portrait / Photo View */
            <div className="photo-view-tab">
              <div className="photo-hero-layout">
                {/* Current Photo Preview */}
                <div className="photo-preview-box">
                  <div className="photo-preview-circle">
                    <img
                      src={personalPhotoUrl}
                      alt={`${patient.name} portrait`}
                      className="photo-preview-image"
                    />
                  </div>
                  <button
                    type="button"
                    className={`btn-select-photo-type ${
                      selectedPhotoType !== "license" ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedPhotoType("headshot")}
                  >
                    <Icon
                      name={
                        selectedPhotoType !== "license"
                          ? "check_circle"
                          : "radio_button_unchecked"
                      }
                    />
                    <span>
                      {selectedPhotoType !== "license"
                        ? "Currently Set as Picture Spot"
                        : "Use Personal Photo as Picture Spot"}
                    </span>
                  </button>
                </div>

                {/* Upload & Replacement Controls */}
                <div className="photo-upload-controls">
                  <div
                    className={`photo-dropzone ${dragActive ? "drag-active" : ""}`}
                    onDragEnter={() => setDragActive(true)}
                    onDragLeave={() => setDragActive(false)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFile(e.target.files[0]);
                        }
                      }}
                    />
                    <Icon name="cloud_upload" className="dropzone-icon" />
                    <p className="dropzone-title">
                      Upload Custom Picture or Photo
                    </p>
                    <p className="dropzone-hint">
                      Drag &amp; drop an image file here, or{" "}
                      <span className="dropzone-browse">browse your files</span>
                    </p>
                    <p className="dropzone-sub">Supports PNG, JPG, or WebP</p>
                  </div>

                  {/* Preset Demo Portraits Selection */}
                  <div className="preset-portraits-section">
                    <label className="preset-label">
                      Or select from verified clinic demo portraits:
                    </label>
                    <div className="preset-portraits-grid">
                      {Object.entries(SYNTHETIC_PATIENT_PORTRAITS).map(
                        ([key, portraitUrl]) => {
                          const isCurrent = personalPhotoUrl === portraitUrl;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`preset-thumb-btn ${
                                isCurrent ? "is-active" : ""
                              }`}
                              onClick={() => {
                                setPersonalPhotoUrl(portraitUrl);
                                setSelectedPhotoType("headshot");
                              }}
                              title={`Choose portrait ${key}`}
                            >
                              <img
                                src={portraitUrl}
                                alt={`Demo portrait ${key}`}
                                className="preset-thumb-img"
                              />
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="patient-photo-modal-footer">
          <div className="modal-footer-hint">
            <Icon name="info" />
            <span>
              {selectedPhotoType === "license"
                ? idCardData
                  ? "The picture spot will show the photo from the patient's ID on file."
                  : "No ID is on file, so the picture spot will show the patient portrait."
                : "The picture spot will show the patient's personal portrait photo."}
            </span>
          </div>
          <div className="modal-footer-buttons">
            {isSaving ? (
              <Button
                variant="secondary"
                onClick={onClose}
                disabled
                disabledReason="The photo update is still saving."
              >
                Cancel
              </Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleSave}
              loading={isSaving}
              loadingLabel="Updating..."
              icon="check"
            >
              Save Picture Spot
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
