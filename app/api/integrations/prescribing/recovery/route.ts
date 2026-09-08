import { NextResponse } from "next/server";
import { clinicalActionError, clinicalRequest } from "../../../../server/http/clinical-http";
import { integrationHealthService } from "../../../../server/services/integration-health-service";
import { prescriptionRecoveryService } from "../../../../server/services/prescription-recovery-service";

export async function GET(req: Request) {
  try {
    const request = clinicalRequest(req);
    const [integrations, recovery] = await Promise.all([
      integrationHealthService.list(request.actor),
      Promise.resolve(prescriptionRecoveryService.listOperationalWork(request.actor)),
    ]);

    return NextResponse.json({
      success: true,
      integrations,
      recovery,
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}
