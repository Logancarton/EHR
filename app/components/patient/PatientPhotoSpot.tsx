"use client";

import { useState } from "react";
import type { Patient, PatientPhotoType, PatientIdCard } from "../../domain/patient";
import Icon from "../ui/Icon";

export interface PatientPhotoSpotProps {
  patient: Pick<Patient, "id" | "name"> & {
    initials?: string;
    dob?: string;
    photoUrl?: string;
    photoType?: PatientPhotoType;
    idCard?: PatientIdCard;
  };
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  editable?: boolean;
  onOpenModal?: () => void;
  showBadge?: boolean;
}

export default function PatientPhotoSpot({
  patient,
  size = "md",
  className = "",
  editable = true,
  onOpenModal,
  showBadge = true,
}: PatientPhotoSpotProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const photoType = patient.photoType || "license";
  const initials = patient.initials || (patient.name ? patient.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "PT");
  const hasPhoto = Boolean(patient.photoUrl && !imageFailed);

  const sizeClass = {
    sm: "patient-photo-spot-sm",
    md: "patient-photo-spot-md",
    lg: "patient-photo-spot-lg",
    xl: "patient-photo-spot-xl",
  }[size];

  const tooltip = editable
    ? `${patient.name} (${photoType === "license" ? "Driver's License on file" : "Personal photo"}) — Click to view or replace`
    : patient.name;

  const content = (
    <div className={`patient-photo-spot-inner ${sizeClass}`}>
      {hasPhoto ? (
        <img
          src={patient.photoUrl}
          alt={patient.name}
          className="patient-photo-img"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="patient-photo-fallback" aria-label={patient.name}>
          {initials}
        </div>
      )}

      {showBadge && (
        <div
          className={`patient-photo-badge ${photoType === "license" ? "badge-license" : "badge-photo"}`}
          title={photoType === "license" ? "Government Driver's License / State ID" : "Patient portrait photo"}
        >
          <Icon name={photoType === "license" ? "badge" : "face"} />
        </div>
      )}

      {editable && onOpenModal && (
        <div className="patient-photo-overlay" aria-hidden="true">
          <Icon name="photo_camera" />
        </div>
      )}
    </div>
  );

  if (editable && onOpenModal) {
    return (
      <button
        type="button"
        className={`patient-photo-spot-btn ${className}`}
        onClick={onOpenModal}
        title={tooltip}
        aria-label={tooltip}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`patient-photo-spot-wrapper ${className}`} title={tooltip}>
      {content}
    </div>
  );
}
