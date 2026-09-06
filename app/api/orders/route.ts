import { NextResponse } from "next/server";
import { OrderRepository } from "../../server/repositories/order-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const status = searchParams.get("status") as any;

    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const orders = OrderRepository.getByPatient(patientId, status);
    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.patientId || !body.name || !body.type) {
      return NextResponse.json({ success: false, error: "patientId, name, and type are required" }, { status: 400 });
    }

    const staged = OrderRepository.stageOrder({
      id: body.id,
      patientId: body.patientId,
      type: body.type,
      name: body.name,
      details: body.details || {},
      orderedBy: body.orderedBy || "Dr. Logan Carton, MD",
    });

    AuditRepository.log({
      eventType: "order_staged",
      patientId: staged.patientId,
      description: `Staged ${staged.type} order for ${staged.name} in DrFirst/Quest cart.`,
      metadata: { orderId: staged.id, type: staged.type },
    });

    return NextResponse.json({ success: true, order: staged }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "Order id is required" }, { status: 400 });
    }

    const authorizedBy = body.authorizedBy || "Dr. Logan Carton, MD";
    const authMetadata = body.authMetadata || {};

    const authorized = OrderRepository.authorize(body.id, authorizedBy, authMetadata);
    if (!authorized) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    // DEA EPCS Audit Trail
    AuditRepository.log({
      eventType: "order_authorized",
      patientId: authorized.patientId,
      description: `Authorized & committed ${authorized.type} order for ${authorized.name}. Attested by ${authorizedBy}.`,
      metadata: {
        orderId: authorized.id,
        type: authorized.type,
        epcsAttested: Boolean(authMetadata.epcsAttested),
        transmissionTarget: authMetadata.target || "DrFirst Rcopia / Surescripts",
      },
    });

    return NextResponse.json({ success: true, order: authorized });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "id parameter is required" }, { status: 400 });
    }

    const removed = OrderRepository.removeStaged(id);
    return NextResponse.json({ success: true, removed });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
