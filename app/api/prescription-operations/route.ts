import { NextResponse } from "next/server";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { prescriptionOperationsService } from "../../server/services/prescription-operations-service";

export async function GET(req: Request) {
  try {
    const request = clinicalRequest(req);
    const itemId = new URL(req.url).searchParams.get("itemId");
    if (itemId) {
      return NextResponse.json({
        success: true,
        detail: await prescriptionOperationsService.detail(itemId, request.actor),
      });
    }

    return NextResponse.json({
      success: true,
      queue: await prescriptionOperationsService.list(request.actor),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}
