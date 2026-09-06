import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AppointmentRepository, type AppointmentRecord } from "../repositories/appointment-repository";
import { AuditRepository } from "../repositories/audit-repository";
import { MessageRepository } from "../repositories/message-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { TaskRepository } from "../repositories/task-repository";
import type {
  AppointmentRepositoryPort,
  AuditRepositoryPort,
  MessageRepositoryPort,
  PatientRepositoryPort,
  TaskRepositoryPort,
} from "../repositories/ports";
import type { AppointmentStatus, VisitType } from "../../lib/schedule-data";
import type { ClinicalExecutionContext } from "./clinical-service";

type Dependencies = {
  patients: PatientRepositoryPort;
  messages: MessageRepositoryPort;
  tasks: TaskRepositoryPort;
  appointments: AppointmentRepositoryPort;
  audit: AuditRepositoryPort;
};

const defaultDependencies: Dependencies = {
  patients: PatientRepository,
  messages: MessageRepository,
  tasks: TaskRepository,
  appointments: AppointmentRepository,
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
  date: string;
  time: string;
  duration?: string;
  type?: VisitType;
  status?: AppointmentStatus;
  chiefComplaint?: string;
  room?: string;
  alert?: string;
  insurance?: string;
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
    const patient = this.deps.patients.getById(input.patientId);
    if (!patient) throw new Error(`Patient not found: ${input.patientId}`);

    const appointment = this.deps.appointments.create({
      id: input.id || `apt-${Date.now().toString().slice(-6)}`,
      date: input.date,
      patientId: patient.id,
      patientName: patient.name,
      dob: patient.dob,
      age: patient.age,
      mrn: patient.mrn,
      time: input.time,
      duration: input.duration || "30 min",
      type: input.type || "30-min Med Check",
      status: input.status || "scheduled",
      chiefComplaint: input.chiefComplaint || "Scheduled psychiatric follow-up.",
      room: input.room,
      alert: input.alert,
      insurance: input.insurance || "Self-Pay / Commercial",
    });

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "appointment_scheduled",
      patientId: appointment.patientId,
      description: `Scheduled appointment ${appointment.id} for ${appointment.patientName}.`,
      metadata: {
        appointmentId: appointment.id,
        date: appointment.date,
        time: appointment.time,
        type: appointment.type,
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
  ): AppointmentRecord {
    assertPermission(actor, "manage_appointments");
    const existing = this.deps.appointments.getById(appointmentId);
    if (!existing) throw new Error(`Appointment not found: ${appointmentId}`);

    const updated = this.deps.appointments.updateStatus(appointmentId, status);
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
        ...meta(context),
      },
    });
    return updated;
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
