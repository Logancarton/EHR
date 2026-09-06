import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { collaborationService } from "../../../server/services/collaboration-service";
import { clinicalActionError, clinicalRequest } from "../../../server/http/clinical-http";
import type { TeamTaskStatus } from "../../../domain/team-collaboration";

export async function GET(req: Request) {
  try {
    const { actor } = clinicalRequest(req);
    const tasks = collaborationService.snapshot(actor).assignedTasks;
    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { actor, context } = clinicalRequest(req);
    const body = await req.json();
    if (!body.assigneeId || !body.text) {
      return NextResponse.json(
        { success: false, error: "assigneeId and text are required" },
        { status: 400 },
      );
    }

    const task = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "team_assign_task",
        payload: {
          assigneeId: body.assigneeId,
          text: body.text,
          patientId: body.patientId || undefined,
          dueDate: body.dueDate || undefined,
        },
      },
    });
    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { actor, context } = clinicalRequest(req);
    const body = await req.json();
    if (!body.taskId || !body.status) {
      return NextResponse.json(
        { success: false, error: "taskId and status are required" },
        { status: 400 },
      );
    }
    if (!(["open", "done", "cancelled"] as string[]).includes(body.status)) {
      return NextResponse.json({ success: false, error: "Invalid team task status" }, { status: 400 });
    }

    const task = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "team_update_task_status",
        payload: { taskId: body.taskId, status: body.status as TeamTaskStatus },
      },
    });
    return NextResponse.json({ success: true, task });
  } catch (error) {
    return clinicalActionError(error);
  }
}
