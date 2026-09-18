"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatShortDate, type ScheduleItem, type VisitType } from "../../../lib/schedule-data";
import { tentativeIntakeError } from "../../../domain/patient-administration";
import type { BookingPatientSummary } from "../../../domain/patient-administration";
import { applyConfirmedAppointment } from "../../../lib/schedule-store";
import { refreshPatientRoster } from "../../../lib/patient-roster";
import { api } from "../../../lib/api-client";
import type { ClinicalPermission } from "../../../server/auth/provider-context";

export type EventCategoryTab = "appointment" | "non-patient" | "schedule" | "break" | "time-off";

/**
 * The New Event editor: form state for all five event categories, the
 * booking roster, and submission — including patient/prospective-person
 * creation (D-076: a tentative caller gets a prospective identity, not a
 * clinical chart) and the "person saved, appointment failed, retry reuses
 * that identity" recovery path. One owner for this state; CalendarEventEditor
 * (and AppointmentEditorPanel) only render it.
 */
export function useCalendarEventEditor(options: {
  todayStr: string;
  userId: string;
  hasPermission: (permission: ClinicalPermission) => boolean;
  refresh: () => Promise<readonly ScheduleItem[]>;
  showToast: (message: string) => void;
  onPatientCreated: (id: string, name: string) => void;
}) {
  const { todayStr, userId, hasPermission, refresh, showToast, onPatientCreated } = options;

  const [roster, setRoster] = useState<BookingPatientSummary[]>([]);
  const [rosterError, setRosterError] = useState("");

  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [eventTab, setEventTab] = useState<EventCategoryTab>("appointment");

  // Form Fields
  const [bookingDate, setBookingDate] = useState(todayStr);
  const [bookingTime, setBookingTime] = useState("10:30 AM");
  const [bookingDuration, setBookingDuration] = useState("30"); // numeric text like "30"
  const [bookingType, setBookingType] = useState<VisitType>("30-min Med Check");
  const [bookingModality, setBookingModality] = useState<"in-person" | "video">("in-person");
  const [serviceLocation, setServiceLocation] = useState("Back to Life Mental Health");
  const [bookingRoom, setBookingRoom] = useState("Room 1 (Consult)");
  const [bookingComplaint, setBookingComplaint] = useState("");
  const [bookingStatus, setBookingStatus] = useState<"tentative" | "scheduled">("scheduled");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<BookingPatientSummary | null>(null);
  const [isCustomPatient, setIsCustomPatient] = useState(false);
  const [customPatientName, setCustomPatientName] = useState("");
  const [customPatientDob, setCustomPatientDob] = useState("");
  const [customPatientPhone, setCustomPatientPhone] = useState("");
  const [customPatientEmail, setCustomPatientEmail] = useState("");
  const [recurrence, setRecurrence] = useState("Does not repeat");
  const [eventNotes, setEventNotes] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("None");

  // Non-Patient specific
  const [nonPatientTitle, setNonPatientTitle] = useState("");
  const [nonPatientType, setNonPatientType] = useState("Team Case Conference");

  // Schedule specific
  const [scheduleTitle, setScheduleTitle] = useState("Clinic Working Hours");

  // Break specific
  const [breakType, setBreakType] = useState("Lunch Break");

  // Time Off specific
  const [timeOffReason, setTimeOffReason] = useState("Vacation");
  const [isAllDay, setIsAllDay] = useState(false);

  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const bookingSubmitRef = useRef(false);
  const [bookingError, setBookingError] = useState("");

  useEffect(() => {
    let active = true;
    setRoster([]);
    setRosterError("");
    void api.patients.bookingRoster()
      .then((patients) => { if (active) setRoster(patients); })
      .catch((error: unknown) => {
        if (active) setRosterError(error instanceof Error ? error.message : "Could not load the booking roster.");
      });
    return () => { active = false; };
  }, [userId]);

  function refreshBookingRoster() {
    void api.patients.bookingRoster().then(setRoster).catch((error: unknown) => {
      setRosterError(error instanceof Error ? error.message : "Could not refresh the booking roster.");
    });
  }

  // Filtered patients for booking autocomplete
  const bookingPatientSuggestions = useMemo(() => {
    if (!bookingSearchQuery.trim()) return roster.slice(0, 8);
    const q = bookingSearchQuery.toLowerCase();
    return roster
      .filter((p) => {
        const full = `${p.name} ${p.mrn} ${p.dob} ${p.contact.mobilePhone || ""} ${p.contact.email || ""}`.toLowerCase();
        return full.includes(q);
      })
      .slice(0, 8);
  }, [bookingSearchQuery, roster]);

  // Open quick booking modal pre-filled
  function handleOpenBooking(
    dateStr: string,
    timeSlot?: string,
    defaultTab: EventCategoryTab = "appointment",
  ) {
    setBookingDate(dateStr);
    if (timeSlot) {
      setBookingTime(timeSlot);
    }
    setEventTab(defaultTab);
    setSelectedPatient(null);
    setBookingSearchQuery("");
    setIsCustomPatient(false);
    setCustomPatientName("");
    setCustomPatientDob("");
    setCustomPatientPhone("");
    setCustomPatientEmail("");
    setBookingStatus("scheduled");
    setBookingComplaint("");
    setEventNotes("");
    setNonPatientTitle("");
    setBookingError("");
    setIsBookingModalOpen(true);
  }

  // Submit new booking
  async function handleSubmitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (bookingSubmitRef.current) return;
    bookingSubmitRef.current = true;
    setIsSubmittingBooking(true);
    setBookingError("");
    let createdPatientThisAttempt = false;

    const formattedDuration = bookingDuration.includes("min")
      ? bookingDuration
      : `${bookingDuration} min`;

    try {
      if (eventTab === "appointment") {
        let patient = selectedPatient;
        if (isCustomPatient) {
          const name = customPatientName.trim();
          const dob = customPatientDob.trim();
          const intakeError = tentativeIntakeError({
            name, dob, phone: customPatientPhone, email: customPatientEmail,
          });
          if (intakeError) {
            setBookingError(intakeError);
            return;
          }
          if (bookingStatus === "tentative") {
            // The front door (D-076): a first inquiry gets a prospective
            // administrative identity, not a clinical chart. Promotion to a
            // real patient — or linking to an existing one — happens
            // explicitly later from the Intake workspace.
            patient = await api.prospectivePersons.create({
              name,
              dob,
              mobilePhone: customPatientPhone.trim(),
              email: customPatientEmail.trim(),
            });
          } else {
            // Save the chart first. On a booking failure, keep its real ID selected so
            // retrying the appointment cannot create a second patient record.
            patient = await api.patients.create({
              name,
              dob,
              contact: {
                mobilePhone: customPatientPhone.trim(),
                email: customPatientEmail.trim(),
              },
            });
          }
          createdPatientThisAttempt = true;
          setSelectedPatient(patient);
          setIsCustomPatient(false);
          void refreshPatientRoster();
          refreshBookingRoster();
        }
        if (!patient) {
          setBookingError("Select a patient or create a new patient before booking.");
          return;
        }

        if (bookingStatus === "tentative") {
          const intakeError = tentativeIntakeError({
            name: patient.name,
            dob: patient.dob,
            phone: customPatientPhone,
            email: customPatientEmail,
          });
          if (intakeError) {
            setBookingError(intakeError);
            return;
          }
          const phone = customPatientPhone.trim();
          const email = customPatientEmail.trim();
          // A record just created this attempt (patient or prospect) already
          // carries exactly this contact info — nothing to sync, and a
          // prospect has no chart for `api.patients.update` to reach anyway.
          const contactDiffers = !createdPatientThisAttempt
            && (phone !== (patient.contact.mobilePhone || "") || email !== (patient.contact.email || ""));
          if (contactDiffers) {
            if (!hasPermission("edit_patient")) {
              setBookingError("Your role cannot update this patient's contact details. Ask a chart editor to complete phone and email before booking tentatively.");
              return;
            }
            patient = await api.patients.update(patient.id, { contact: { mobilePhone: phone, email } });
            setSelectedPatient(patient);
            void refreshPatientRoster();
            refreshBookingRoster();
          }
        }

        const newApt = await api.appointments.create({
          patientId: patient.id,
          patientName: patient.name,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: bookingType,
          status: bookingStatus,
          modality: bookingModality,
          room: bookingModality === "in-person" ? `${serviceLocation} • ${bookingRoom}` : undefined,
          chiefComplaint: bookingComplaint.trim() || eventNotes.trim() || `${bookingType} visit`,
          insurance: "Not recorded",
          intakeStatus: patient.status === "New Patient" ? "pending" : undefined,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        const isNewProspect = createdPatientThisAttempt && patient.status === "Prospective";
        showToast(
          isNewProspect
            ? `Tentative hold for ${patient.name} on ${formatShortDate(bookingDate)} at ${bookingTime} — continue their intake from the Intake workspace.`
            : `${bookingStatus === "tentative" ? "Tentative hold" : "Unconfirmed appointment"} for ${patient.name} on ${formatShortDate(bookingDate)} at ${bookingTime}`,
        );
        // A prospect has no chart yet for the administrative drawer to open.
        if (createdPatientThisAttempt && !isNewProspect) onPatientCreated(patient.id, patient.name);
      } else if (eventTab === "non-patient") {
        const title = nonPatientTitle.trim() || nonPatientType;
        const newApt = await api.appointments.create({
          patientId: `event-meeting-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: "Team Meeting",
          modality: bookingModality,
          room: bookingModality === "in-person" ? `${serviceLocation} • ${bookingRoom}` : "Virtual Video Conference",
          chiefComplaint: eventNotes.trim() || `${nonPatientType}: ${title}`,
          insurance: "Practice Event",
          dob: "N/A",
          mrn: "MEETING",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        showToast(`Scheduled "${title}" on ${formatShortDate(bookingDate)} at ${bookingTime}`);
      } else if (eventTab === "schedule") {
        const title = scheduleTitle.trim() || "Practice Schedule Block";
        const newApt = await api.appointments.create({
          patientId: `event-block-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: "Schedule Block",
          modality: "in-person",
          room: serviceLocation,
          chiefComplaint: eventNotes.trim() || title,
          insurance: "Internal",
          dob: "N/A",
          mrn: "SCHEDULE",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        showToast(`Added schedule block "${title}" on ${formatShortDate(bookingDate)}`);
      } else if (eventTab === "break") {
        const title = breakType;
        const newApt = await api.appointments.create({
          patientId: `event-break-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: "Break",
          modality: "in-person",
          room: "Break Room / Personal",
          chiefComplaint: eventNotes.trim() || title,
          insurance: "Internal",
          dob: "N/A",
          mrn: "BREAK",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        showToast(`Scheduled ${title} on ${formatShortDate(bookingDate)} at ${bookingTime}`);
      } else if (eventTab === "time-off") {
        const title = `${timeOffReason} (Time Off)`;
        const newApt = await api.appointments.create({
          patientId: `event-timeoff-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: isAllDay ? "08:00 AM" : bookingTime,
          duration: isAllDay ? "480 min" : formattedDuration,
          type: "Time Off",
          modality: "in-person",
          room: "Out of Office",
          chiefComplaint: eventNotes.trim() || title,
          insurance: "Internal",
          dob: "N/A",
          mrn: "TIME-OFF",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        showToast(`Recorded ${title} on ${formatShortDate(bookingDate)}`);
      }

      setIsBookingModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save event.";
      setBookingError(createdPatientThisAttempt
        ? `The person record was saved, but the appointment was not. Your retry will reuse that same record rather than create another one. ${msg}`
        : msg);
    } finally {
      bookingSubmitRef.current = false;
      setIsSubmittingBooking(false);
    }
  }

  return {
    roster,
    rosterError,
    isBookingModalOpen,
    setIsBookingModalOpen,
    eventTab,
    setEventTab,
    bookingDate,
    setBookingDate,
    bookingTime,
    setBookingTime,
    bookingDuration,
    setBookingDuration,
    bookingType,
    setBookingType,
    bookingModality,
    setBookingModality,
    serviceLocation,
    setServiceLocation,
    bookingRoom,
    setBookingRoom,
    bookingStatus,
    setBookingStatus,
    bookingSearchQuery,
    setBookingSearchQuery,
    selectedPatient,
    setSelectedPatient,
    isCustomPatient,
    setIsCustomPatient,
    customPatientName,
    setCustomPatientName,
    customPatientDob,
    setCustomPatientDob,
    customPatientPhone,
    setCustomPatientPhone,
    customPatientEmail,
    setCustomPatientEmail,
    recurrence,
    setRecurrence,
    eventNotes,
    setEventNotes,
    selectedStaff,
    setSelectedStaff,
    nonPatientTitle,
    setNonPatientTitle,
    nonPatientType,
    setNonPatientType,
    scheduleTitle,
    setScheduleTitle,
    breakType,
    setBreakType,
    timeOffReason,
    setTimeOffReason,
    isAllDay,
    setIsAllDay,
    isSubmittingBooking,
    bookingError,
    bookingPatientSuggestions,
    handleOpenBooking,
    handleSubmitBooking,
  };
}

export type CalendarEventEditor = ReturnType<typeof useCalendarEventEditor>;
