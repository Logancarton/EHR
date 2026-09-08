import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { OrderRepository, type OrderStatus } from "../../server/repositories/order-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const status = searchParams.get("status") as OrderStatus | null;

    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const orders = OrderRepository.getByPatient(patientId, status || undefined);
    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId || !body.name || !body.type) {
      return NextResponse.json(
        { success: false, error: "patientId, name, and type are required" },
        { status: 400 },
      );
    }

    const order = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "stage_order",
        payload: {
          id: body.id,
          patientId: body.patientId,
          orderType: body.type,
          name: body.name,
          details: body.details || {},
        },
      },
    });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "Order id is required" }, { status: 400 });
    }

    if (body.operation === "transmit") {
      const outcome = await ClinicalActionGateway.execute({
        ...clinicalRequest(req),
        action: {
          type: "transmit_order",
          payload: {
            orderId: body.id,
            transmissionMetadata: body.transmissionMetadata || {},
          },
        },
      });
      return NextResponse.json({ success: true, outcome });
    }

    if (body.operation === "confirm_medication_truth") {
      if (body.truthOperation !== "add" && body.truthOperation !== "update") {
        return NextResponse.json({ success: false, error: "truthOperation must be add or update" }, { status: 400 });
      }
      const medication = await ClinicalActionGateway.execute({
        ...clinicalRequest(req),
        action: {
          type: "confirm_prescription_medication_truth",
          payload: {
            orderId: body.id,
            operation: body.truthOperation,
            medicationId: body.medicationId,
          },
        },
      });
      return NextResponse.json({ success: true, medication });
    }

    const order = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "authorize_order",
        payload: { orderId: body.id, authMetadata: body.authMetadata || {} },
      },
    });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "id parameter is required" }, { status: 400 });
    }

    await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: { type: "remove_staged_order", payload: { orderId: id } },
    });

    return NextResponse.json({ success: true, removed: true });
  } catch (error) {
    return clinicalActionError(error);
  }
}
