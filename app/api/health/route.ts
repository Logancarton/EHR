import { NextResponse } from "next/server";
import { assertPermission, getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { getDatabase } from "../../server/db/connection";
import { clinicalActionError } from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    const db = getDatabase();
    const patientCount = db.prepare("SELECT COUNT(*) as count FROM patients").get() as { count: number };
    const encounterCount = db.prepare("SELECT COUNT(*) as count FROM encounters").get() as { count: number };
    const orderCount = db.prepare("SELECT COUNT(*) as count FROM orders").get() as { count: number };
    const messageCount = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
    const taskCount = db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number };
    const auditCount = db.prepare("SELECT COUNT(*) as count FROM audit_logs").get() as { count: number };

    return NextResponse.json({
      status: "healthy",
      engine: "node:sqlite (Node 22 built-in)",
      database: "data/ehr.db",
      walMode: true,
      records: {
        patients: Number(patientCount.count),
        encounters: Number(encounterCount.count),
        orders: Number(orderCount.count),
        messages: Number(messageCount.count),
        tasks: Number(taskCount.count),
        auditLogs: Number(auditCount.count),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}
