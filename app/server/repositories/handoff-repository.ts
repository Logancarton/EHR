import { getDatabase } from "../db/connection";
import { type ProviderContext, hasPermission } from "../auth/provider-context";
import { AppointmentRepository } from "./appointment-repository";
import type {
  VisitHandoff,
  HandoffStatus,
  HandoffHistoryEvent,
} from "../../lib/schedule-data";

export interface CreateHandoffInput {
  appointmentId: string;
  patientId: string;
  toUserId: string;
  toUserName: string;
  reason: string;
  clinicalSummary: string;
}

export const HandoffRepository = {
  getHandoff(id: string): VisitHandoff | null {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM appointment_handoffs WHERE id = ?").get(id) as any;
    if (!row) return null;
    return mapRowToHandoff(row);
  },

  listHandoffs(filter?: {
    appointmentId?: string;
    patientId?: string;
    toUserId?: string;
    fromUserId?: string;
    status?: HandoffStatus;
  }): VisitHandoff[] {
    const db = getDatabase();
    let query = "SELECT * FROM appointment_handoffs";
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.appointmentId) {
      conditions.push("appointment_id = ?");
      params.push(filter.appointmentId);
    }
    if (filter?.patientId) {
      conditions.push("patient_id = ?");
      params.push(filter.patientId);
    }
    if (filter?.toUserId) {
      conditions.push("to_user_id = ?");
      params.push(filter.toUserId);
    }
    if (filter?.fromUserId) {
      conditions.push("from_user_id = ?");
      params.push(filter.fromUserId);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY created_at DESC";

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(mapRowToHandoff);
  },

  createHandoff(input: CreateHandoffInput, actor: ProviderContext): VisitHandoff {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = `handoff-${crypto.randomUUID()}`;

    const history: HandoffHistoryEvent[] = [
      {
        action: "initiated",
        actorId: actor.userId,
        actorName: actor.displayName || actor.userId,
        timestamp: now,
        note: `Handoff initiated for ${input.reason}`,
      },
    ];

    db.prepare(`
      INSERT INTO appointment_handoffs (
        id, appointment_id, patient_id, from_user_id, from_user_name,
        to_user_id, to_user_name, reason, clinical_summary, status,
        decline_reason, history_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?)
    `).run(
      id,
      input.appointmentId,
      input.patientId,
      actor.userId,
      actor.displayName || actor.userId,
      input.toUserId,
      input.toUserName,
      input.reason,
      input.clinicalSummary,
      JSON.stringify(history),
      now,
      now,
    );

    return this.getHandoff(id)!;
  },

  acceptHandoff(id: string, actor: ProviderContext, note?: string): VisitHandoff {
    const existing = this.getHandoff(id);
    if (!existing) {
      throw new Error(`Handoff not found: ${id}`);
    }
    if (existing.status !== "pending") {
      throw new Error(`Cannot accept handoff with status: ${existing.status}`);
    }

    // Mutual agreement rule: Only intended recipient or explicit appointment manager can accept
    if (existing.toUserId !== actor.userId && !hasPermission(actor, "manage_appointments")) {
      throw new Error(`Unauthorized: only recipient ${existing.toUserName} can accept this handoff.`);
    }

    const now = new Date().toISOString();
    const history = [
      ...existing.history,
      {
        action: "accepted",
        actorId: actor.userId,
        actorName: actor.displayName || actor.userId,
        timestamp: now,
        note: note || undefined,
      },
    ];

    const db = getDatabase();
    db.prepare(`
      UPDATE appointment_handoffs SET
        status = 'accepted',
        history_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(history), now, id);

    // Operational workflow assignment on the appointment:
    // Update appointment assignment according to role, without granting longitudinal chart access!
    const appointment = AppointmentRepository.getById(existing.appointmentId);
    if (appointment) {
      const isProvider = ["psychiatrist", "physician", "therapist", "psychologist", "np", "pa"].includes(
        actor.role.toLowerCase(),
      );
      if (isProvider) {
        AppointmentRepository.update(existing.appointmentId, {
          providerId: actor.userId,
          providerName: actor.displayName || actor.userId,
        });
      } else {
        AppointmentRepository.update(existing.appointmentId, {
          assignedStaffId: actor.userId,
          assignedStaffName: actor.displayName || actor.userId,
        });
      }
    }

    return this.getHandoff(id)!;
  },

  declineHandoff(id: string, actor: ProviderContext, declineReason: string): VisitHandoff {
    const existing = this.getHandoff(id);
    if (!existing) {
      throw new Error(`Handoff not found: ${id}`);
    }
    if (existing.status !== "pending") {
      throw new Error(`Cannot decline handoff with status: ${existing.status}`);
    }

    // Mutual agreement rule: Only intended recipient or explicit appointment manager can decline
    if (existing.toUserId !== actor.userId && !hasPermission(actor, "manage_appointments")) {
      throw new Error(`Unauthorized: only recipient ${existing.toUserName} can decline this handoff.`);
    }

    const now = new Date().toISOString();
    const history = [
      ...existing.history,
      {
        action: "declined",
        actorId: actor.userId,
        actorName: actor.displayName || actor.userId,
        timestamp: now,
        note: declineReason,
      },
    ];

    const db = getDatabase();
    db.prepare(`
      UPDATE appointment_handoffs SET
        status = 'declined',
        decline_reason = ?,
        history_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(declineReason, JSON.stringify(history), now, id);

    // Responsibility remains with fromUserId; appointment assignment is unchanged
    return this.getHandoff(id)!;
  },

  cancelHandoff(id: string, actor: ProviderContext, note?: string): VisitHandoff {
    const existing = this.getHandoff(id);
    if (!existing) {
      throw new Error(`Handoff not found: ${id}`);
    }
    if (existing.status !== "pending") {
      throw new Error(`Cannot cancel handoff with status: ${existing.status}`);
    }

    // Sender or manager can cancel
    if (existing.fromUserId !== actor.userId && !hasPermission(actor, "manage_appointments")) {
      throw new Error(`Unauthorized: only sender ${existing.fromUserName} can cancel this handoff.`);
    }

    const now = new Date().toISOString();
    const history = [
      ...existing.history,
      {
        action: "cancelled",
        actorId: actor.userId,
        actorName: actor.displayName || actor.userId,
        timestamp: now,
        note: note || undefined,
      },
    ];

    const db = getDatabase();
    db.prepare(`
      UPDATE appointment_handoffs SET
        status = 'cancelled',
        history_json = ?,
        updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(history), now, id);

    return this.getHandoff(id)!;
  },
};

function mapRowToHandoff(r: any): VisitHandoff {
  let history: HandoffHistoryEvent[] = [];
  try {
    history = JSON.parse(r.history_json || "[]");
  } catch {
    history = [];
  }

  return {
    id: r.id,
    appointmentId: r.appointment_id,
    patientId: r.patient_id,
    fromUserId: r.from_user_id,
    fromUserName: r.from_user_name,
    toUserId: r.to_user_id,
    toUserName: r.to_user_name,
    reason: r.reason,
    clinicalSummary: r.clinical_summary,
    status: r.status as HandoffStatus,
    declineReason: r.decline_reason || undefined,
    history,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
