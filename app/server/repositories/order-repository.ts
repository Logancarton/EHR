import { getDatabase } from "../db/connection";
import { type ClinicalOrder } from "../../domain/orders";

export type OrderRecord = {
  id: string;
  patientId: string;
  type: "medication" | "lab";
  name: string;
  status: "staged" | "authorized" | "transmitted";
  details: Record<string, any>;
  orderedBy: string;
  authorizedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export const OrderRepository = {
  getByPatient(patientId: string, status?: "staged" | "authorized" | "transmitted"): OrderRecord[] {
    const db = getDatabase();
    let query = "SELECT * FROM orders WHERE patient_id = ?";
    const params: any[] = [patientId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC";

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      type: r.type as "medication" | "lab",
      name: r.name,
      status: r.status as "staged" | "authorized" | "transmitted",
      details: JSON.parse(r.details_json || "{}"),
      orderedBy: r.ordered_by,
      authorizedAt: r.authorized_at || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  getById(id: string): OrderRecord | null {
    const db = getDatabase();
    const r = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      patientId: r.patient_id,
      type: r.type as "medication" | "lab",
      name: r.name,
      status: r.status as "staged" | "authorized" | "transmitted",
      details: JSON.parse(r.details_json || "{}"),
      orderedBy: r.ordered_by,
      authorizedAt: r.authorized_at || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  stageOrder(order: {
    id?: string;
    patientId: string;
    type: "medication" | "lab";
    name: string;
    details: Record<string, any>;
    orderedBy: string;
  }): OrderRecord {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = order.id || `ord-${order.type === "medication" ? "rx" : "lab"}-${Date.now()}`;

    const record: OrderRecord = {
      id,
      patientId: order.patientId,
      type: order.type,
      name: order.name,
      status: "staged",
      details: order.details,
      orderedBy: order.orderedBy,
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO orders (id, patient_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'staged', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        details_json = excluded.details_json,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.patientId,
      record.type,
      record.name,
      JSON.stringify(record.details),
      record.orderedBy,
      now,
      now
    );

    return record;
  },

  authorize(id: string, authorizedBy: string, authMetadata?: Record<string, any>): OrderRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const mergedDetails = { ...existing.details, ...(authMetadata || {}), authorizedBy };

    db.prepare(`
      UPDATE orders SET
        status = 'authorized',
        details_json = ?,
        authorized_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(mergedDetails), now, now, id);

    return {
      ...existing,
      status: "authorized",
      details: mergedDetails,
      authorizedAt: now,
      updatedAt: now,
    };
  },

  removeStaged(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare("DELETE FROM orders WHERE id = ? AND status = 'staged'").run(id);
    return res.changes > 0;
  },

  clearStagedForPatient(patientId: string): number {
    const db = getDatabase();
    const res = db.prepare("DELETE FROM orders WHERE patient_id = ? AND status = 'staged'").run(patientId);
    return Number(res.changes);
  },
};
