"use client";

import { useState, useRef, useEffect } from "react";
import type { Patient, PatientPhotoType, PatientIdCard } from "../../domain/patient";
import {
  generateIdCardSvgDataUrl,
  SYNTHETIC_PATIENT_PROFILES,
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

/**
 * The photo spot only ever reads identity and photo fields. Asking for a whole
 * `Patient` made callers that legitimately hold only demographics (the information
 * drawer, for one) fabricate empty diagnoses/meds arrays to satisfy the type.
 */
export type PatientPhotoSubject = Pick<Patient, "id" | "name" | "dob"> &
  Partial<Pick<Patient, "initials" | "age" | "mrn" | "photoUrl" | "photoType" | "idCard">>;

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
  // Find baseline synthetic profile or patient data
  const baseProfile = SYNTHETIC_PATIENT_PROFILES[patient.id] || {
    photoUrl: patient.photoUrl || SYNTHETIC_PATIENT_PORTRAITS["maya-chen"],
    photoType: patient.photoType || "license",
    idCard: patient.idCard || {
      documentType: "Driver's License" as const,
      licenseNumber: "D9482710",
      state: "CA",
      expirationDate: "05/18/2028",
      issueDate: "05/18/2023",
      classType: "C",
      realIdCompliant: true,
      donor: true,
      address: "742 Evergreen Terr, San Francisco, CA 94110",
      height: "5'-06\"",
      eyes: "BRN",
      hair: "BLK",
      sex: "F",
      verified: true,
      verifiedAt: "2026-08-14 09:15 AM",
      verifiedBy: "Intake Coordinator (Staff ID #8841)",
    },
  };

  const [activeTab, setActiveTab] = useState<"license" | "photo">(
    patient.photoType === "custom" || patient.photoType === "headshot" ? "photo" : "license"
  );
  const [selectedPhotoType, setSelectedPhotoType] = useState<PatientPhotoType>(
    patient.photoType || "license"
  );

  const [idCardData, setIdCardData] = useState<PatientIdCard>(
    patient.idCard || baseProfile.idCard
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
      setIdCardData(patient.idCard || baseProfile.idCard);
      setPersonalPhotoUrl(
        patient.photoType !== "license" && patient.photoUrl
          ? patient.photoUrl
          : SYNTHETIC_PATIENT_PORTRAITS[patient.id] || SYNTHETIC_PATIENT_PORTRAITS["maya-chen"]
      );
      setErrorMsg(null);
    }
  }, [isOpen, patient]);

  if (!isOpen) return null;

  const cardSvgUrl = generateIdCardSvgDataUrl(
    patient.name,
    patient.dob,
    idCardData
  );

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
      let finalPhotoUrl = personalPhotoUrl;
      if (selectedPhotoType === "license") {
        // Use portrait photo from the license or generated license card
        finalPhotoUrl = SYNTHETIC_PATIENT_PORTRAITS[patient.id] || cardSvgUrl;
      }

      const updates = {
        photoUrl: finalPhotoUrl,
        photoType: selectedPhotoType,
        idCard: idCardData,
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
                {patient.name} · DOB: {patient.dob} · MRN: {patient.mrn}
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
            /* Driver's License View */
            <div className="license-view-tab">
              <div className="license-card-hero">
                <div className="license-card-frame">
                  <img
                    src={cardSvgUrl}
                    alt={`${patient.name} State Driver License`}
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
                        : "Use Driver's License as Picture Spot"}
                    </span>
                  </button>
                </div>
              </div>

              {/* ID Metadata Breakdown */}
              <div className="license-details-grid">
                <div className="license-detail-item">
                  <span className="detail-label">Document Type</span>
                  <span className="detail-value font-semibold">
                    {idCardData?.documentType || "Driver's License"} ({idCardData?.state || "California"})
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">License Number</span>
                  <span className="detail-value font-mono font-semibold">
                    {idCardData?.licenseNumber || "—"}
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Expiration Date</span>
                  <span className="detail-value text-emerald-600 font-semibold flex items-center gap-1">
                    <Icon name="verified" className="text-xs" />
                    {idCardData?.expirationDate || "—"} (Valid)
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Issue Date</span>
                  <span className="detail-value">{idCardData?.issueDate || "—"}</span>
                </div>
                <div className="license-detail-item col-span-2">
                  <span className="detail-label">Residential Address</span>
                  <span className="detail-value">{idCardData?.address || "—"}</span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Class / Endorsements</span>
                  <span className="detail-value">
                    Class {idCardData?.classType || "C"} · {idCardData?.donor ? "Organ Donor" : "Standard"}
                  </span>
                </div>
                <div className="license-detail-item">
                  <span className="detail-label">Verification Provenance</span>
                  <span className="detail-value text-xs text-slate-600">
                    {idCardData?.verifiedBy || "Intake Staff"}
                  </span>
                </div>
              </div>
            </div>
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
                ? "The picture spot will show the patient's verified State Driver's License."
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
