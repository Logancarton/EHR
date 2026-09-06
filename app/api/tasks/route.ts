import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { TaskRepository } from "../../server/repositories/task-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") || undefined;
    const type = searchParams.get("type");

    if (type === "scratchpad") {
      return NextResponse.json({ success: true, scratchNotes: TaskRepository.getScratchNotes() });
    }
    if (type === "task") {
      return NextResponse.json({ success: true, tasks: TaskRepository.getTasks(patientId) });
    }

    return NextResponse.json({
      success: true,
      tasks: TaskRepository.getTasks(patientId),
      scratchNotes: TaskRepository.getScratchNotes(),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itemType = body.type || "task";
    if (!body.text) {
      return NextResponse.json({ success: false, error: "Text is required" }, { status: 400 });
    }

    if (itemType === "scratchpad") {
      const scratchNote = await ClinicalActionGateway.execute({
        ...clinicalRequest(req),
        action: {
          type: "create_scratch_note",
          payload: { text: body.text, color: body.color, patientId: body.patientId },
        },
      });
      return NextResponse.json({ success: true, scratchNote }, { status: 201 });
    }

    const task = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: {
        type: "create_task",
        payload: { text: body.text, patientId: body.patientId, due: body.due },
      },
    });
    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "Task id is required" }, { status: 400 });
    }

    const task = await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action: { type: "toggle_task", payload: { taskId: body.id } },
    });
    return NextResponse.json({ success: true, task });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "task";
    if (!id) {
      return NextResponse.json({ success: false, error: "Item id is required" }, { status: 400 });
    }

    await ClinicalActionGateway.execute({
      ...clinicalRequest(req),
      action:
        type === "scratchpad"
          ? { type: "delete_scratch_note", payload: { noteId: id } }
          : { type: "delete_task", payload: { taskId: id } },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return clinicalActionError(error);
  }
}
