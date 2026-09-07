import { getDatabase } from "../db/connection";

export type OrderStatus =
  | "staged"
  | "authorized"
  | "transmitted"
  | "transmission_failed";

export type OrderRecord = {
  id: string;
  patientId: string;
  type: "medication" | "lab";
  name: string;
  status: OrderStatus;
  details: Record<string, any>;
  orderedBy: string;
  authorizedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function rowToOrder(r: any): OrderRecord {
  return {
    id: r.id,
    patientId: r.patient_id,
    type: r.type as "medication" | "lab",
    name: r.name,
    status: r.status as OrderStatus,
    details: JSON.parse(r.details_json || "{}"),
    orderedBy: r.ordered_by,
    authorizedAt: r.authorized_at || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const OrderRepository = {
  getByPatient(patientId: string, status?: OrderStatus): OrderRecord[] {
    const db = getDatabase();
    let query = "SELECT * FROM orders WHERE patient_id = ?";
    const params: any[] = [patientId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC";

    return (db.prepare(query).all(...params) as any[]).map(rowToOrder);
  },

  getById(id: string): OrderRecord | null {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    return row ? rowToOrder(row) : null;
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
    const existing = this.getById(id);

    if (existing) {
      if (existing.patientId !== order.patientId || existing.type !== order.type) {
        throw new Error(`Order ${id} cannot be reassigned to another patient or order type.`);
      }

      // Re-staging an already-authorized/transmitted order must never roll it backward or
      // overwrite durable transmission metadata. Treat the same order id as idempotent.
      if (existing.status !== "staged") return existing;

      db.prepare(`
        UPDATE orders SET name = ?, details_json = ?, updated_at = ?
        WHERE id = ? AND status = 'staged'
      `).run(order.name, JSON.stringify(order.details || {}), now, id);

      return this.getById(id)!;
    }

    db.prepare(`
      INSERT INTO orders (id, patient_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'staged', ?, ?, ?, ?)
    `).run(
      id,
      order.patientId,
      order.type,
      order.name,
      JSON.stringify(order.details || {}),
      order.orderedBy,
      now,
      now,
    );

    return this.getById(id)!;
  },

  authorize(id: string, authorizedBy: string, authMetadata?: Record<string, any>): OrderRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    // Authorization is a one-way legal transition. Retrying a closing workflow must not
    // create a second authorization or roll a transmitted/failed order backward.
    if (existing.status !== "staged") return existing;

    const now = new Date().toISOString();
    const mergedDetails = { ...existing.details, ...(authMetadata || {}), authorizedBy };

    db.prepare(`
      UPDATE orders SET
        status = 'authorized',
        details_json = ?,
        authorized_at = ?,
        updated_at = ?
      WHERE id = ? AND status = 'staged'
    `).run(JSON.stringify(mergedDetails), now, now, id);

    return this.getById(id);
  },

  markTransmitted(id: string, receipt: Record<string, any>): OrderRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;
    if (existing.status === "transmitted") return existing;
    if (existing.status !== "authorized" && existing.status !== "transmission_failed") {
      throw new Error(`Order ${id} must be authorized before transmission.`);
    }

    const now = new Date().toISOString();
    const attempts = Number(existing.details?.transmissionAttempts || 0) + 1;
    const details = {
      ...existing.details,
      transmissionAttempts: attempts,
      transmittedAt: now,
      transmissionReceipt: receipt,
      lastTransmissionError: null,
    };

    db.prepare(`
      UPDATE orders SET status = 'transmitted', details_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(details), now, id);

    return this.getById(id);
  },

  markTransmissionFailed(id: string, errorMessage: string): OrderRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;
    if (existing.status === "transmitted") return existing;
    if (existing.status !== "authorized" && existing.status !== "transmission_failed") {
      throw new Error(`Order ${id} must be authorized before recording a transmission failure.`);
    }

    const now = new Date().toISOString();
    const attempts = Number(existing.details?.transmissionAttempts || 0) + 1;
    const details = {
      ...existing.details,
      transmissionAttempts: attempts,
      lastTransmissionError: {
        message: errorMessage,
        at: now,
      },
    };

    db.prepare(`
      UPDATE orders SET status = 'transmission_failed', details_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(details), now, id);

    return this.getById(id);
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
