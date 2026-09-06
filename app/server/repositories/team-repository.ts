import { getDatabase } from "../db/connection";
import type { ProviderContext } from "../auth/provider-context";
import type {
  SharedPatientRef,
  TeamMember,
  TeamMessage,
  TeamPresence,
  TeamTaskAgreement,
  TeamTaskAgreementStatus,
  TeamTaskAssignment,
  TeamTaskStatus,
} from "../../domain/team-collaboration";

function normalizedPair(left: string, right: string): [string, string] {
  if (left === right) throw new Error("Team collaboration requires two different members.");
  return left < right ? [left, right] : [right, left];
}

function mapMember(row: any): TeamMember {
  return {
    id: row.id,
    displayName: row.display_name,
    credentials: row.credentials || undefined,
    role: row.role,
    initials: row.initials,
    presence: row.presence as TeamPresence,
    active: Boolean(row.active),
  };
}

function mapAgreement(row: any): TeamTaskAgreement {
  return {
    id: row.id,
    memberAId: row.member_a_id,
    memberBId: row.member_b_id,
    status: row.status as TeamTaskAgreementStatus,
    requestedBy: row.requested_by,
    acceptedBy: row.accepted_by || undefined,
    requestedAt: row.requested_at,
    acceptedAt: row.accepted_at || undefined,
    revokedAt: row.revoked_at || undefined,
    updatedAt: row.updated_at,
  };
}

function mapAssignment(row: any): TeamTaskAssignment {
  return {
    id: row.id,
    assignerId: row.assigner_id,
    assigneeId: row.assignee_id,
    assignerName: row.assigner_name,
    assigneeName: row.assignee_name,
    text: row.text,
    linkedPatient: row.patient_id
      ? { id: row.patient_id, name: row.patient_name, mrn: row.patient_mrn }
      : undefined,
    dueDate: row.due_date || undefined,
    status: row.status as TeamTaskStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const TeamRepository = {
  ensureMember(actor: ProviderContext): TeamMember {
    const db = getDatabase();
    const initials = actor.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "TM";
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO team_members (
        id, display_name, credentials, role, initials, presence, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'online', 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        credentials = excluded.credentials,
        role = excluded.role,
        initials = excluded.initials,
        presence = 'online',
        active = 1,
        updated_at = excluded.updated_at
    `).run(
      actor.userId,
      actor.displayName,
      actor.credentials || null,
      actor.role,
      initials,
      now,
      now,
    );

    return this.getMember(actor.userId)!;
  },

  getMember(id: string): TeamMember | null {
    const row = getDatabase().prepare("SELECT * FROM team_members WHERE id = ? AND active = 1").get(id) as any;
    return row ? mapMember(row) : null;
  },

  listMembers(excludeUserId?: string): TeamMember[] {
    const db = getDatabase();
    const rows = excludeUserId
      ? (db.prepare("SELECT * FROM team_members WHERE active = 1 AND id <> ? ORDER BY display_name").all(excludeUserId) as any[])
      : (db.prepare("SELECT * FROM team_members WHERE active = 1 ORDER BY display_name").all() as any[]);
    return rows.map(mapMember);
  },

  hasPatientAccess(userId: string, patientId: string): boolean {
    return Boolean(
      getDatabase()
        .prepare("SELECT 1 FROM team_member_patients WHERE user_id = ? AND patient_id = ?")
        .get(userId, patientId),
    );
  },

  getSharedPatients(leftUserId: string, rightUserId: string): SharedPatientRef[] {
    const rows = getDatabase().prepare(`
      SELECT p.id, p.name, p.mrn
      FROM team_member_patients left_access
      JOIN team_member_patients right_access
        ON right_access.patient_id = left_access.patient_id
      JOIN patients p ON p.id = left_access.patient_id
      WHERE left_access.user_id = ? AND right_access.user_id = ?
      ORDER BY p.name
    `).all(leftUserId, rightUserId) as any[];

    return rows.map((row) => ({ id: row.id, name: row.name, mrn: row.mrn }));
  },

  ensureThread(leftUserId: string, rightUserId: string): string {
    const db = getDatabase();
    const [memberAId, memberBId] = normalizedPair(leftUserId, rightUserId);
    const existing = db
      .prepare("SELECT id FROM team_threads WHERE member_a_id = ? AND member_b_id = ?")
      .get(memberAId, memberBId) as { id: string } | undefined;
    if (existing) return existing.id;

    const id = `team-thread-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO team_threads (id, member_a_id, member_b_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, memberAId, memberBId, now, now);
    return id;
  },

  getMessages(leftUserId: string, rightUserId: string): TeamMessage[] {
    const db = getDatabase();
    const threadId = this.ensureThread(leftUserId, rightUserId);
    const rows = db.prepare(`
      SELECT
        m.*,
        sender.display_name AS sender_name,
        p.name AS patient_name,
        p.mrn AS patient_mrn
      FROM team_messages m
      JOIN team_members sender ON sender.id = m.sender_id
      LEFT JOIN patients p ON p.id = m.patient_id
      WHERE m.thread_id = ?
      ORDER BY m.created_at ASC
    `).all(threadId) as any[];

    db.prepare(`
      UPDATE team_messages
      SET read_at = COALESCE(read_at, ?)
      WHERE thread_id = ? AND sender_id <> ?
    `).run(new Date().toISOString(), threadId, leftUserId);

    return rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      content: row.content,
      linkedPatient: row.patient_id
        ? { id: row.patient_id, name: row.patient_name, mrn: row.patient_mrn }
        : undefined,
      createdAt: row.created_at,
      readAt: row.read_at || undefined,
    }));
  },

  addMessage(input: {
    senderId: string;
    partnerId: string;
    content: string;
    patientId?: string;
  }): TeamMessage {
    const db = getDatabase();
    const threadId = this.ensureThread(input.senderId, input.partnerId);
    const id = `team-msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO team_messages (id, thread_id, sender_id, content, patient_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, threadId, input.senderId, input.content, input.patientId || null, now);
    db.prepare("UPDATE team_threads SET updated_at = ? WHERE id = ?").run(now, threadId);

    return this.getMessages(input.senderId, input.partnerId).find((message) => message.id === id)!;
  },

  unreadCount(actorId: string, partnerId: string): number {
    const [memberAId, memberBId] = normalizedPair(actorId, partnerId);
    const row = getDatabase().prepare(`
      SELECT COUNT(*) AS count
      FROM team_messages m
      JOIN team_threads t ON t.id = m.thread_id
      WHERE t.member_a_id = ? AND t.member_b_id = ?
        AND m.sender_id <> ? AND m.read_at IS NULL
    `).get(memberAId, memberBId, actorId) as { count: number } | undefined;
    return Number(row?.count || 0);
  },

  lastMessageAt(actorId: string, partnerId: string): string | undefined {
    const [memberAId, memberBId] = normalizedPair(actorId, partnerId);
    const row = getDatabase().prepare(`
      SELECT MAX(m.created_at) AS last_message_at
      FROM team_messages m
      JOIN team_threads t ON t.id = m.thread_id
      WHERE t.member_a_id = ? AND t.member_b_id = ?
    `).get(memberAId, memberBId) as { last_message_at?: string | null } | undefined;
    return row?.last_message_at || undefined;
  },

  getAgreement(leftUserId: string, rightUserId: string): TeamTaskAgreement | null {
    const [memberAId, memberBId] = normalizedPair(leftUserId, rightUserId);
    const row = getDatabase()
      .prepare("SELECT * FROM team_task_agreements WHERE member_a_id = ? AND member_b_id = ?")
      .get(memberAId, memberBId) as any;
    return row ? mapAgreement(row) : null;
  },

  requestAgreement(requesterId: string, partnerId: string): TeamTaskAgreement {
    const db = getDatabase();
    const [memberAId, memberBId] = normalizedPair(requesterId, partnerId);
    const existing = this.getAgreement(requesterId, partnerId);
    const now = new Date().toISOString();
    const id = existing?.id || `team-agreement-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(`
      INSERT INTO team_task_agreements (
        id, member_a_id, member_b_id, status, requested_by, accepted_by,
        requested_at, accepted_at, revoked_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, NULL, ?, NULL, NULL, ?)
      ON CONFLICT(member_a_id, member_b_id) DO UPDATE SET
        status = 'pending',
        requested_by = excluded.requested_by,
        accepted_by = NULL,
        requested_at = excluded.requested_at,
        accepted_at = NULL,
        revoked_at = NULL,
        updated_at = excluded.updated_at
    `).run(id, memberAId, memberBId, requesterId, now, now);

    return this.getAgreement(requesterId, partnerId)!;
  },

  acceptAgreement(actorId: string, partnerId: string): TeamTaskAgreement {
    const existing = this.getAgreement(actorId, partnerId);
    if (!existing) throw new Error("Task-sharing agreement not found.");
    if (existing.status !== "pending") throw new Error("Task-sharing agreement is not pending.");
    if (existing.requestedBy === actorId) {
      throw new Error("The other team member must accept this task-sharing agreement.");
    }

    const now = new Date().toISOString();
    getDatabase().prepare(`
      UPDATE team_task_agreements
      SET status = 'active', accepted_by = ?, accepted_at = ?, revoked_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(actorId, now, now, existing.id);
    return this.getAgreement(actorId, partnerId)!;
  },

  revokeAgreement(actorId: string, partnerId: string): TeamTaskAgreement {
    const existing = this.getAgreement(actorId, partnerId);
    if (!existing) throw new Error("Task-sharing agreement not found.");
    const now = new Date().toISOString();
    getDatabase().prepare(`
      UPDATE team_task_agreements
      SET status = 'revoked', revoked_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, existing.id);
    return this.getAgreement(actorId, partnerId)!;
  },

  listAssignments(actorId: string): TeamTaskAssignment[] {
    const rows = getDatabase().prepare(`
      SELECT
        a.*,
        assigner.display_name AS assigner_name,
        assignee.display_name AS assignee_name,
        p.name AS patient_name,
        p.mrn AS patient_mrn
      FROM team_task_assignments a
      JOIN team_members assigner ON assigner.id = a.assigner_id
      JOIN team_members assignee ON assignee.id = a.assignee_id
      LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.assigner_id = ? OR a.assignee_id = ?
      ORDER BY CASE a.status WHEN 'open' THEN 0 ELSE 1 END, a.created_at DESC
    `).all(actorId, actorId) as any[];
    return rows.map(mapAssignment);
  },

  createAssignment(input: {
    assignerId: string;
    assigneeId: string;
    text: string;
    patientId?: string;
    dueDate?: string;
  }): TeamTaskAssignment {
    const db = getDatabase();
    const id = `team-task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO team_task_assignments (
        id, assigner_id, assignee_id, text, patient_id, due_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(
      id,
      input.assignerId,
      input.assigneeId,
      input.text,
      input.patientId || null,
      input.dueDate || null,
      now,
      now,
    );
    return this.listAssignments(input.assignerId).find((task) => task.id === id)!;
  },

  updateAssignmentStatus(taskId: string, status: TeamTaskStatus): TeamTaskAssignment | null {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM team_task_assignments WHERE id = ?").get(taskId) as any;
    if (!existing) return null;
    db.prepare("UPDATE team_task_assignments SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), taskId);
    return this.listAssignments(existing.assignee_id).find((task) => task.id === taskId) || null;
  },
};
