import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { TeamRepository } from "../repositories/team-repository";
import type { AuditRepositoryPort, TeamRepositoryPort } from "../repositories/ports";
import type {
  TeamMessage,
  TeamTaskAgreement,
  TeamTaskAssignment,
  TeamTaskStatus,
  TeamWorkspaceSnapshot,
} from "../../domain/team-collaboration";
import type { ClinicalExecutionContext } from "./clinical-service";

type Dependencies = {
  team: TeamRepositoryPort;
  audit: AuditRepositoryPort;
};

const defaultDependencies: Dependencies = {
  team: TeamRepository,
  audit: AuditRepository,
};

function auditActor(actor: ProviderContext) {
  return {
    userId: actor.userId,
    userName: providerLabel(actor),
    userRole: actor.role,
  };
}

function executionMetadata(context: ClinicalExecutionContext) {
  return { source: context.source, requestId: context.requestId };
}

export class CollaborationService {
  constructor(private readonly deps: Dependencies = defaultDependencies) {}

  snapshot(actor: ProviderContext): TeamWorkspaceSnapshot {
    assertPermission(actor, "collaborate_team");
    this.deps.team.ensureMember(actor);

    const partners = this.deps.team.listMembers(actor.userId).map((member) => ({
      member,
      sharedPatients: this.deps.team.getSharedPatients(actor.userId, member.id),
      taskAgreement: this.deps.team.getAgreement(actor.userId, member.id) || undefined,
      unreadCount: this.deps.team.unreadCount(actor.userId, member.id),
      lastMessageAt: this.deps.team.lastMessageAt(actor.userId, member.id),
    }));

    return {
      actorId: actor.userId,
      partners,
      assignedTasks: this.deps.team.listAssignments(actor.userId),
    };
  }

  conversation(partnerId: string, actor: ProviderContext): TeamMessage[] {
    assertPermission(actor, "collaborate_team");
    this.deps.team.ensureMember(actor);
    if (!this.deps.team.getMember(partnerId)) {
      throw new Error(`Team member not found: ${partnerId}`);
    }
    return this.deps.team.getMessages(actor.userId, partnerId);
  }

  sendMessage(
    input: { partnerId: string; content: string; patientId?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): TeamMessage {
    assertPermission(actor, "collaborate_team");
    this.deps.team.ensureMember(actor);
    if (!input.content.trim()) throw new Error("Team message cannot be empty.");
    if (!this.deps.team.getMember(input.partnerId)) {
      throw new Error(`Team member not found: ${input.partnerId}`);
    }

    if (input.patientId) {
      const actorAccess = this.deps.team.hasPatientAccess(actor.userId, input.patientId);
      const partnerAccess = this.deps.team.hasPatientAccess(input.partnerId, input.patientId);
      if (!actorAccess || !partnerAccess) {
        throw new Error("Patient can only be linked when both team members have access to that chart.");
      }
    }

    const message = this.deps.team.addMessage({
      senderId: actor.userId,
      partnerId: input.partnerId,
      content: input.content.trim(),
      patientId: input.patientId,
    });

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "team_message_sent",
      patientId: input.patientId,
      description: `Sent internal team message to ${input.partnerId}.`,
      metadata: {
        messageId: message.id,
        partnerId: input.partnerId,
        linkedPatientId: input.patientId,
        ...executionMetadata(context),
      },
    });

    return message;
  }

  requestTaskAgreement(
    partnerId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): TeamTaskAgreement {
    assertPermission(actor, "manage_team_tasks");
    this.deps.team.ensureMember(actor);
    if (!this.deps.team.getMember(partnerId)) throw new Error(`Team member not found: ${partnerId}`);

    const agreement = this.deps.team.requestAgreement(actor.userId, partnerId);
    this.auditAgreement("requested", agreement, partnerId, actor, context);
    return agreement;
  }

  acceptTaskAgreement(
    partnerId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): TeamTaskAgreement {
    assertPermission(actor, "manage_team_tasks");
    this.deps.team.ensureMember(actor);
    const agreement = this.deps.team.acceptAgreement(actor.userId, partnerId);
    this.auditAgreement("accepted", agreement, partnerId, actor, context);
    return agreement;
  }

  revokeTaskAgreement(
    partnerId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): TeamTaskAgreement {
    assertPermission(actor, "manage_team_tasks");
    this.deps.team.ensureMember(actor);
    const agreement = this.deps.team.revokeAgreement(actor.userId, partnerId);
    this.auditAgreement("revoked", agreement, partnerId, actor, context);
    return agreement;
  }

  assignTask(
    input: { assigneeId: string; text: string; patientId?: string; dueDate?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): TeamTaskAssignment {
    assertPermission(actor, "manage_team_tasks");
    this.deps.team.ensureMember(actor);
    if (!input.text.trim()) throw new Error("Assigned task cannot be empty.");
    if (input.assigneeId === actor.userId) {
      throw new Error("Use personal tasks for work assigned to yourself.");
    }
    if (!this.deps.team.getMember(input.assigneeId)) {
      throw new Error(`Team member not found: ${input.assigneeId}`);
    }

    const agreement = this.deps.team.getAgreement(actor.userId, input.assigneeId);
    if (!agreement || agreement.status !== "active") {
      throw new Error("Task assignment requires an active agreement accepted by both team members.");
    }

    if (input.patientId) {
      const actorAccess = this.deps.team.hasPatientAccess(actor.userId, input.patientId);
      const assigneeAccess = this.deps.team.hasPatientAccess(input.assigneeId, input.patientId);
      if (!actorAccess || !assigneeAccess) {
        throw new Error("A patient-linked task can only be assigned when both team members have chart access.");
      }
    }

    const task = this.deps.team.createAssignment({
      assignerId: actor.userId,
      assigneeId: input.assigneeId,
      text: input.text.trim(),
      patientId: input.patientId,
      dueDate: input.dueDate,
    });

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "team_task_assigned",
      patientId: input.patientId,
      description: `Assigned internal task ${task.id} to ${task.assigneeName}.`,
      metadata: {
        taskId: task.id,
        assigneeId: input.assigneeId,
        dueDate: input.dueDate,
        ...executionMetadata(context),
      },
    });
    return task;
  }

  updateTaskStatus(
    taskId: string,
    status: TeamTaskStatus,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): TeamTaskAssignment {
    assertPermission(actor, "manage_team_tasks");
    this.deps.team.ensureMember(actor);
    const existing = this.deps.team.listAssignments(actor.userId).find((task) => task.id === taskId);
    if (!existing) throw new Error(`Team task not found: ${taskId}`);

    if (status === "done" && existing.assigneeId !== actor.userId) {
      throw new Error("Only the assignee can mark an assigned task done.");
    }
    if (status === "cancelled" && existing.assignerId !== actor.userId) {
      throw new Error("Only the assigner can cancel an assigned task.");
    }

    const updated = this.deps.team.updateAssignmentStatus(taskId, status);
    if (!updated) throw new Error(`Team task not found: ${taskId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "team_task_updated",
      patientId: updated.linkedPatient?.id,
      description: `Updated internal task ${taskId} to ${status}.`,
      metadata: { taskId, status, ...executionMetadata(context) },
    });
    return updated;
  }

  private auditAgreement(
    verb: string,
    agreement: TeamTaskAgreement,
    partnerId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "team_task_agreement_changed",
      description: `Task-sharing agreement ${verb} with ${partnerId}.`,
      metadata: {
        agreementId: agreement.id,
        partnerId,
        status: agreement.status,
        ...executionMetadata(context),
      },
    });
  }
}

export const collaborationService = new CollaborationService();
