import { NextResponse } from "next/server";
import { TaskRepository } from "../../server/repositories/task-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") || undefined;
    const type = searchParams.get("type"); // "task" | "scratchpad" | undefined (both)

    if (type === "scratchpad") {
      const scratchNotes = TaskRepository.getScratchNotes();
      return NextResponse.json({ success: true, scratchNotes });
    }

    if (type === "task") {
      const tasks = TaskRepository.getTasks(patientId);
      return NextResponse.json({ success: true, tasks });
    }

    const tasks = TaskRepository.getTasks(patientId);
    const scratchNotes = TaskRepository.getScratchNotes();

    return NextResponse.json({
      success: true,
      tasks,
      scratchNotes,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itemType = body.type || "task";

    if (itemType === "scratchpad") {
      if (!body.text) {
        return NextResponse.json({ success: false, error: "Text is required for scratchpad note" }, { status: 400 });
      }
      const note = TaskRepository.createScratchNote({
        text: body.text,
        color: body.color,
        patientId: body.patientId,
      });
      return NextResponse.json({ success: true, scratchNote: note }, { status: 201 });
    }

    if (!body.text) {
      return NextResponse.json({ success: false, error: "Text is required for clinical task" }, { status: 400 });
    }

    const task = TaskRepository.createTask({
      text: body.text,
      patientId: body.patientId,
      due: body.due,
    });

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "Task id is required" }, { status: 400 });
    }

    const updated = TaskRepository.toggleTask(body.id);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, task: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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

    const deleted = type === "scratchpad" ? TaskRepository.deleteScratchNote(id) : TaskRepository.deleteTask(id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
