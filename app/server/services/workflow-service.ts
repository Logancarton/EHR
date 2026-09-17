import { randomUUID } from "node:crypto";
import { ageFromDateOfBirth, tentativeIntakeError } from "../../domain/patient-administration";
import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AppointmentRepository, type AppointmentRecord } from "../repositories/appointment-repository";
import { AuditRepository } from "../repositories/audit-repository";
import { MessageRepository } from "../repositories/message-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { ProspectivePersonRepository } from "../repositories/prospective-person-repository";
import { TaskRepository } from "../repositories/task-repository";
import { HandoffRepository, type CreateHandoffInput } from "../repositories/handoff-repository";
import type {
  AppointmentRepositoryPort,
  AuditRepositoryPort,
  HandoffRepositoryPort,
  MessageRepositoryPort,
  PatientRepositoryPort,
  TaskRepositoryPort,
} from "../repositories/ports";
import {
  calculateFollowUpDate,
  isAppointmentStatus,
  isNonPatientEvent,
  isProspectivePersonId,
  type AppointmentStatus,
  type VisitType,
  type VisitHandoff,
} from "../../lib/schedule-data";
import type { ClinicalExecutionContext } from "./clinical-service";

/**
 * The identity behind a tentative hold, whichever side of promotion it's on
 * (D-076). `patient` and `prospect` are mutually exclusive; both null means
 * the id resolved to neither, which the caller treats as not found.
 */
function resolveTentativeSubject(patientId: string): {
  patient: ReturnType<typeof PatientRepository.getById>;
  prospect: ReturnType<typeof ProspectivePersonRepository.getById>;
} {
  if (isProspectivePersonId(patientId)) {
    return { patient: null, prospect: ProspectivePersonRepository.getById(patientId) };
  }
  return { patient: PatientRepository.getById(patientId), prospect: null };
}

function tentativeSubjectIdentity(subject: { patient: any; prospect: any }): { name: string; dob: string; phone?: string; email?: string } | null {
  if (subject.patient) {
    return { name: subject.patient.name, dob: subject.patient.dob, phone: subject.patient.contact?.mobilePhone, email: subject.patient.contact?.email };
  }
  if (subject.prospect) {
    return { name: subject.prospect.name, dob: subject.prospect.dob || "", phone: subject.prospect.mobilePhone, email: subject.prospect.email };
  }
  return null;
}

type Dependencies = {
  patients: PatientRepositoryPort;
  messages: MessageRepositoryPort;
  tasks: TaskRepositoryPort;
  appointments: AppointmentRepositoryPort;
  handoffs: HandoffRepositoryPort;
  audit: AuditRepositoryPort;
};

const defaultDependencies: Dependencies = {
  patients: PatientRepository,
  messages: MessageRepository,
  tasks: TaskRepository,
  appointments: AppointmentRepository,
  handoffs: HandoffRepository,
  audit: AuditRepository,
};

function auditActor(actor: ProviderContext) {
  return {
    userId: actor.userId,
    userName: providerLabel(actor),
    userRole: actor.role,
  };
}

function meta(context: ClinicalExecutionContext) {
  return { source: context.source, requestId: context.requestId };
}

export type CreateAppointmentInput = {
  id?: string;
  patientId: string;
  patientName?: string;
  dob?: string;
  age?: number;
  mrn?: string;
  date: string;
  time: string;
  duration?: string;
  type?: VisitType;
  status?: AppointmentStatus;
  chiefComplaint?: string;
  room?: string;
  alert?: string;
  insurance?: string;
  modality?: "in-person" | "video";
  providerId?: string;
  providerName?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  intakeStatus?: "completed" | "pending" | "exempt";
  notes?: string;
  arrivedAt?: string;
  startedAt?: string;
  completedAt?: string;
  followUpInterval?: string;
  originAppointmentId?: string;
};

export class WorkflowService {
  constructor(private readonly deps: Dependencies = defaultDependencies) {}

  sendMessage(
    input: {
      patientId: string;
      threadId: string;
      content: string;
      channel?: "portal" | "sms";
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "send_message");
    if (!this.deps.patients.getById(input.patientId)) {
      throw new Error(`Patient not found: ${input.patientId}`);
    }

    const message = this.deps.messages.addMessage({
      patientId: input.patientId,
      threadId: input.threadId,
      senderRole: "provider",
      senderName: providerLabel(actor),
      content: input.content,
      channel: input.channel || "portal",
    });

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "message_sent",
      patientId: input.patientId,
      description: `Sent clinical message in thread ${input.threadId}.`,
      metadata: { messageId: message.id, channel: message.channel, ...meta(context) },
    });
    return message;
  }

  markMessageRead(
    threadId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): true {
    assertPermission(actor, "read_clinical");
    this.deps.messages.markRead(threadId);
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "message_read",
      description: `Marked patient message thread ${threadId} read.`,
      metadata: { threadId, ...meta(context) },
    });
    return true;
  }

  createTask(
    input: { text: string; patientId?: string; due?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "manage_tasks");
    if (input.patientId && !this.deps.patients.getById(input.patientId)) {
      throw new Error(`Patient not found: ${input.patientId}`);
    }

    const task = this.deps.tasks.createTask(input);
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "task_created",
      patientId: task.patientId,
      description: `Created clinical task ${task.id}.`,
      metadata: { taskId: task.id, due: task.due, ...meta(context) },
    });
    return task;
  }

  toggleTask(
    taskId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "manage_tasks");
    const task = this.deps.tasks.toggleTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "task_updated",
      patientId: task.patientId,
      description: `Updated clinical task ${task.id}.`,
      metadata: { taskId: task.id, completed: task.completed, ...meta(context) },
    });
    return task;
  }

  deleteTask(
    taskId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): true {
    assertPermission(actor, "manage_tasks");
    const task = this.deps.tasks.getTasks().find((item) => item.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!this.deps.tasks.deleteTask(taskId)) throw new Error(`Task not found: ${taskId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "task_deleted",
      patientId: task.patientId,
      description: `Deleted clinical task ${taskId}.`,
      metadata: { taskId, ...meta(context) },
    });
    return true;
  }

  createScratchNote(
    input: { text: string; color?: string; patientId?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "manage_tasks");
    if (input.patientId && !this.deps.patients.getById(input.patientId)) {
      throw new Error(`Patient not found: ${input.patientId}`);
    }

    const note = this.deps.tasks.createScratchNote(input);
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "scratchpad_created",
      patientId: note.patientId,
      description: `Created scratchpad note ${note.id}.`,
      metadata: { noteId: note.id, ...meta(context) },
    });
    return note;
  }

  deleteScratchNote(
    noteId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): true {
    assertPermission(actor, "manage_tasks");
    const note = this.deps.tasks.getScratchNotes().find((item) => item.id === noteId);
    if (!note) throw new Error(`Scratchpad note not found: ${noteId}`);
    if (!this.deps.tasks.deleteScratchNote(noteId)) {
      throw new Error(`Scratchpad note not found: ${noteId}`);
    }

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "scratchpad_deleted",
      patientId: note.patientId,
      description: `Deleted scratchpad note ${noteId}.`,
      metadata: { noteId, ...meta(context) },
    });
    return true;
  }

  createAppointment(
    input: CreateAppointmentInput,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    if (input.status !== undefined && !isAppointmentStatus(input.status)) throw new Error("Invalid appointment status.");
    const isNonPatient = isNonPatientEvent(input.patientId, input.type);
    const isProspective = !isNonPatient && isProspectivePersonId(input.patientId);
    const subject = isNonPatient ? { patient: null, prospect: null } : resolveTentativeSubject(input.patientId);
    const { patient, prospect } = subject;
    if (!isNonPatient && !isProspective && !patient) throw new Error(`Patient not found: ${input.patientId}`);
    if (isProspective && !prospect) throw new Error(`Prospective record not found: ${input.patientId}`);
    if (input.status === "tentative") {
      const identity = tentativeSubjectIdentity(subject);
      if (!identity) throw new Error("A tentative appointment must be linked to a patient chart or a prospective record.");
      const error = tentativeIntakeError(identity);
      if (error) throw new Error(error);
    }

    const appointment = this.deps.appointments.create({
      id: input.id || `apt-${Date.now()}-${randomUUID().slice(0, 8)}`,
      date: input.date,
      patientId: patient ? patient.id : prospect ? prospect.id : (input.patientId || `event-${Date.now()}`),
      patientName: patient ? patient.name : prospect ? prospect.name : (input.patientName || input.chiefComplaint || input.type || "Calendar Event"),
      dob: patient ? patient.dob : prospect ? (prospect.dob || "N/A") : "N/A",
      age: patient ? patient.age : prospect?.dob ? ageFromDateOfBirth(prospect.dob) ?? 0 : 0,
      mrn: patient ? patient.mrn : (input.mrn || (isProspective ? "PENDING" : "EVENT")),
      time: input.time,
      duration: input.duration || "30 min",
      type: input.type || (isNonPatient ? "Team Meeting" : "30-min Med Check"),
      status: input.status || "scheduled",
      chiefComplaint: input.chiefComplaint || (isNonPatient ? (input.notes || input.type || "Event") : "Scheduled psychiatric follow-up."),
      room: input.room,
      alert: input.alert,
      insurance: input.insurance || (isNonPatient ? "Internal" : "Self-Pay / Commercial"),
      modality: input.modality || "in-person",
      providerId: input.providerId || actor.userId,
      providerName: input.providerName || actor.displayName,
      assignedStaffId: input.assignedStaffId,
      assignedStaffName: input.assignedStaffName,
      intakeStatus: input.intakeStatus || (
        !isNonPatient && (input.status === "tentative" || patient?.status === "New Patient" || isProspective || input.type === "60-min Intake")
          ? "pending"
          : "exempt"
      ),
      notes: input.notes,
      arrivedAt: input.arrivedAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      followUpInterval: input.followUpInterval,
      originAppointmentId: input.originAppointmentId,
    });

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_scheduled",
      patientId: appointment.patientId,
      description: `${appointment.status === "tentative" ? "Placed tentative hold" : "Scheduled appointment"} ${appointment.id} for ${appointment.patientName}.`,
      metadata: {
        appointmentId: appointment.id,
        status: appointment.status,
        date: appointment.date,
        time: appointment.time,
        type: appointment.type,
        ...meta(context),
      },
    });
    return appointment;
  }

  checkInAppointment(
    appointmentId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    expectedVersion?: number,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    const now = new Date().toISOString();
    const updated = this.deps.appointments.update(
      appointmentId,
      { status: "waiting", arrivedAt: now },
      expectedVersion,
    );
    if (!updated) throw new Error(`Appointment not found: ${appointmentId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: updated.patientId,
      description: `Checked in patient for appointment ${appointmentId} (status: waiting).`,
      metadata: {
        appointmentId,
        status: "waiting",
        arrivedAt: now,
        version: updated.version,
        ...meta(context),
      },
    });
    return updated;
  }

  startVisitAppointment(
    appointmentId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    expectedVersion?: number,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    const now = new Date().toISOString();
    const updated = this.deps.appointments.update(
      appointmentId,
      { status: "in-visit", startedAt: now },
      expectedVersion,
    );
    if (!updated) throw new Error(`Appointment not found: ${appointmentId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: updated.patientId,
      description: `Started visit for appointment ${appointmentId} (status: in-visit).`,
      metadata: {
        appointmentId,
        status: "in-visit",
        startedAt: now,
        version: updated.version,
        ...meta(context),
      },
    });
    return updated;
  }

  completeAppointment(
    appointmentId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    expectedVersion?: number,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    const now = new Date().toISOString();
    const updated = this.deps.appointments.update(
      appointmentId,
      { status: "completed", completedAt: now },
      expectedVersion,
    );
    if (!updated) throw new Error(`Appointment not found: ${appointmentId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: updated.patientId,
      description: `Completed appointment ${appointmentId} (status: completed).`,
      metadata: {
        appointmentId,
        status: "completed",
        completedAt: now,
        version: updated.version,
        ...meta(context),
      },
    });
    return updated;
  }

  markNoShowAppointment(
    appointmentId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    expectedVersion?: number,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    const updated = this.deps.appointments.updateStatus(appointmentId, "no-show", expectedVersion);
    if (!updated) throw new Error(`Appointment not found: ${appointmentId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: updated.patientId,
      description: `Marked appointment ${appointmentId} as no-show.`,
      metadata: {
        appointmentId,
        status: "no-show",
        version: updated.version,
        ...meta(context),
      },
    });
    return updated;
  }

  scheduleFollowUpAppointment(
    input: {
      originAppointmentId: string;
      interval: string;
      date?: string;
      time?: string;
      type?: VisitType;
      duration?: string;
      providerId?: string;
      room?: string;
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    const origin = this.deps.appointments.getById(input.originAppointmentId);
    if (!origin) throw new Error(`Origin appointment not found: ${input.originAppointmentId}`);

    const patient = this.deps.patients.getById(origin.patientId);
    if (!patient) throw new Error(`Patient not found: ${origin.patientId}`);

    const followUpDate = input.date || calculateFollowUpDate(origin.date, input.interval);
    const followUpTime = input.time || origin.time;
    const followUpType = input.type || origin.type;
    const followUpDuration = input.duration || origin.duration;
    const providerId = input.providerId || origin.providerId || actor.userId;
    const providerName = origin.providerName || providerLabel(actor);

    const appointment = this.deps.appointments.create({
      id: `apt-fup-${Date.now()}-${randomUUID().slice(0, 8)}`,
      date: followUpDate,
      patientId: patient.id,
      patientName: patient.name,
      dob: patient.dob,
      age: patient.age,
      mrn: patient.mrn,
      time: followUpTime,
      duration: followUpDuration,
      type: followUpType,
      status: "scheduled",
      chiefComplaint: `Follow-up visit (${input.interval}) following encounter on ${origin.date}.`,
      room: input.room || origin.room,
      alert: origin.alert,
      insurance: origin.insurance,
      modality: origin.modality,
      providerId,
      providerName,
      assignedStaffId: origin.assignedStaffId,
      assignedStaffName: origin.assignedStaffName,
      intakeStatus: "exempt",
      followUpInterval: input.interval,
      originAppointmentId: origin.id,
    });

    // Update origin appointment with follow-up interval if not set
    this.deps.appointments.update(origin.id, {
      followUpInterval: input.interval,
    });

    // Update patient next_visit summary
    this.deps.patients.update(patient.id, {
      nextVisit: `${followUpDate} ${followUpTime}`,
    });

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_scheduled",
      patientId: appointment.patientId,
      description: `Scheduled follow-up appointment ${appointment.id} for ${appointment.patientName} (${input.interval} follow-up on ${followUpDate}).`,
      metadata: {
        appointmentId: appointment.id,
        originAppointmentId: origin.id,
        interval: input.interval,
        date: appointment.date,
        time: appointment.time,
        ...meta(context),
      },
    });

    return appointment;
  }

  updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    expectedVersion?: number,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    if (!isAppointmentStatus(status)) throw new Error("Invalid appointment status.");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    if (status === "tentative") {
      const identity = tentativeSubjectIdentity(resolveTentativeSubject(existing.patientId));
      if (!identity) throw new Error("A tentative appointment must be linked to a patient chart or a prospective record.");
      const error = tentativeIntakeError(identity);
      if (error) throw new Error(error);
    }

    const updated = this.deps.appointments.updateStatus(appointmentId, status, expectedVersion);
    if (!updated) throw new Error(`Appointment not found: ${appointmentId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: updated.patientId,
      description: `Updated appointment ${appointmentId} status to ${status}.`,
      metadata: {
        appointmentId,
        oldStatus: existing.status,
        newStatus: status,
        version: updated.version,
        ...meta(context),
      },
    });
    return updated;
  }

  updateAppointment(
    appointmentId: string,
    updates: Partial<Omit<AppointmentRecord, "id" | "createdAt" | "updatedAt">>,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    expectedVersion?: number,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    if (updates.status !== undefined && !isAppointmentStatus(updates.status)) throw new Error("Invalid appointment status.");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    if ((updates.status ?? existing.status) === "tentative") {
      const identity = tentativeSubjectIdentity(resolveTentativeSubject(updates.patientId ?? existing.patientId));
      if (!identity) throw new Error("A tentative appointment must be linked to a patient chart or a prospective record.");
      const error = tentativeIntakeError(identity);
      if (error) throw new Error(error);
    }

    const updated = this.deps.appointments.update(appointmentId, updates, expectedVersion);
    if (!updated) throw new Error(`Appointment not found: ${appointmentId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: updated.patientId,
      description: `Updated appointment ${appointmentId} details.`,
      metadata: {
        appointmentId,
        updates,
        version: updated.version,
        ...meta(context),
      },
    });
    return updated;
  }

  cancelAppointment(
    appointmentId: string,
    cancellationReason: string,
    cancellationNote: string | undefined,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    expectedVersion?: number,
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    const updated = this.deps.appointments.cancel(
      appointmentId,
      cancellationReason,
      cancellationNote,
      actor.displayName || actor.userId,
      expectedVersion,
    );
    if (!updated) throw new Error(`Appointment not found: ${appointmentId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_cancelled",
      patientId: updated.patientId,
      description: `Cancelled appointment ${appointmentId} (${cancellationReason}).`,
      metadata: {
        appointmentId,
        cancellationReason,
        cancellationNote,
        version: updated.version,
        ...meta(context),
      },
    });
    return updated;
  }

  initiateAppointmentHandoff(
    input: CreateHandoffInput,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): VisitHandoff {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(input.appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${input.appointmentId}`);

    const handoff = this.deps.handoffs.createHandoff(input, actor);
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: input.patientId,
      description: `Initiated handoff for appointment ${input.appointmentId} to ${input.toUserName} (${input.reason}).`,
      metadata: {
        handoffId: handoff.id,
        appointmentId: input.appointmentId,
        toUserId: input.toUserId,
        reason: input.reason,
        ...meta(context),
      },
    });
    return handoff;
  }

  acceptAppointmentHandoff(
    handoffId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    note?: string,
  ): VisitHandoff {
    const existing = this.deps.handoffs.getHandoff(handoffId);
    if (!existing) throw new Error(`Handoff not found: ${handoffId}`);

    const handoff = this.deps.handoffs.acceptHandoff(handoffId, actor, note);
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: existing.patientId,
      description: `Accepted handoff ${handoffId} for appointment ${existing.appointmentId}.`,
      metadata: {
        handoffId,
        appointmentId: existing.appointmentId,
        note,
        ...meta(context),
      },
    });
    return handoff;
  }

  declineAppointmentHandoff(
    handoffId: string,
    declineReason: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): VisitHandoff {
    const existing = this.deps.handoffs.getHandoff(handoffId);
    if (!existing) throw new Error(`Handoff not found: ${handoffId}`);

    const handoff = this.deps.handoffs.declineHandoff(handoffId, actor, declineReason);
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: existing.patientId,
      description: `Declined handoff ${handoffId} for appointment ${existing.appointmentId} (${declineReason}).`,
      metadata: {
        handoffId,
        appointmentId: existing.appointmentId,
        declineReason,
        ...meta(context),
      },
    });
    return handoff;
  }

  cancelAppointmentHandoff(
    handoffId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    note?: string,
  ): VisitHandoff {
    const existing = this.deps.handoffs.getHandoff(handoffId);
    if (!existing) throw new Error(`Handoff not found: ${handoffId}`);

    const handoff = this.deps.handoffs.cancelHandoff(handoffId, actor, note);
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: existing.patientId,
      description: `Cancelled handoff ${handoffId} for appointment ${existing.appointmentId}.`,
      metadata: {
        handoffId,
        appointmentId: existing.appointmentId,
        note,
        ...meta(context),
      },
    });
    return handoff;
  }

  deleteAppointment(
    appointmentId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): true {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);
    if (!this.deps.appointments.delete(appointmentId)) {
      throw new Error(`Appointment not found: ${appointmentId}`);
    }

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_updated",
      patientId: existing.patientId,
      description: `Deleted appointment ${appointmentId} for ${existing.patientName}.`,
      metadata: { appointmentId, deleted: true, ...meta(context) },
    });
    return true;
  }
}

export const workflowService = new WorkflowService();
