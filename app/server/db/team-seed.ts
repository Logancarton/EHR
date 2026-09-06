import type { DatabaseSync } from "node:sqlite";

export function seedTeamCollaboration(db: DatabaseSync) {
  const now = new Date().toISOString();

  const members = [
    ["prototype-provider", "Prototype Provider", null, "provider", "PP", "online"],
    ["team-taylor", "Taylor Brooks", "PMHNP-BC", "provider", "TB", "online"],
    ["team-casey", "Casey Nguyen", null, "clinical_assistant", "CN", "away"],
  ] as const;

  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO team_members (
      id, display_name, credentials, role, initials, presence, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  for (const member of members) {
    insertMember.run(...member, now, now);
  }

  const patientCount = db.prepare("SELECT COUNT(*) AS count FROM patients").get() as { count: number };
  if (!patientCount.count) return;

  const patientLinks = [
    ["prototype-provider", "maya-chen"],
    ["prototype-provider", "jordan-reed"],
    ["prototype-provider", "sofia-martinez"],
    ["team-taylor", "maya-chen"],
    ["team-taylor", "jordan-reed"],
    ["team-casey", "maya-chen"],
    ["team-casey", "sofia-martinez"],
  ] as const;

  const insertAccess = db.prepare(`
    INSERT OR IGNORE INTO team_member_patients (user_id, patient_id, relationship, created_at)
    VALUES (?, ?, 'care-team', ?)
  `);
  for (const [userId, patientId] of patientLinks) {
    const exists = db.prepare("SELECT 1 FROM patients WHERE id = ?").get(patientId);
    if (exists) insertAccess.run(userId, patientId, now);
  }

  const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];
  const [taylorA, taylorB] = pair("prototype-provider", "team-taylor");
  const [caseyA, caseyB] = pair("prototype-provider", "team-casey");

  db.prepare(`
    INSERT OR IGNORE INTO team_threads (id, member_a_id, member_b_id, created_at, updated_at)
    VALUES ('team-thread-taylor', ?, ?, ?, ?)
  `).run(taylorA, taylorB, now, now);
  db.prepare(`
    INSERT OR IGNORE INTO team_threads (id, member_a_id, member_b_id, created_at, updated_at)
    VALUES ('team-thread-casey', ?, ?, ?, ?)
  `).run(caseyA, caseyB, now, now);

  db.prepare(`
    INSERT OR IGNORE INTO team_task_agreements (
      id, member_a_id, member_b_id, status, requested_by, accepted_by,
      requested_at, accepted_at, updated_at
    ) VALUES ('team-agreement-taylor', ?, ?, 'active', 'team-taylor', 'prototype-provider', ?, ?, ?)
  `).run(taylorA, taylorB, now, now, now);

  db.prepare(`
    INSERT OR IGNORE INTO team_task_agreements (
      id, member_a_id, member_b_id, status, requested_by,
      requested_at, updated_at
    ) VALUES ('team-agreement-casey', ?, ?, 'pending', 'team-casey', ?, ?)
  `).run(caseyA, caseyB, now, now);

  const messageCount = db.prepare("SELECT COUNT(*) AS count FROM team_messages").get() as { count: number };
  if (!messageCount.count) {
    db.prepare(`
      INSERT INTO team_messages (id, thread_id, sender_id, content, patient_id, created_at)
      VALUES ('team-msg-1', 'team-thread-taylor', 'team-taylor', ?, 'maya-chen', ?)
    `).run("I reviewed Maya's recent interval history. Her shared chart context is linked here so we can keep the discussion patient-specific.", now);

    db.prepare(`
      INSERT INTO team_messages (id, thread_id, sender_id, content, patient_id, created_at)
      VALUES ('team-msg-2', 'team-thread-casey', 'team-casey', ?, NULL, ?)
    `).run("I sent you a task-sharing request. Once you accept it, either of us can assign work to the other.", now);
  }
}
