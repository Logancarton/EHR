import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Calendar scheduling rejects provider overlaps server-side and releases cancelled slots", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-calendar-conflict-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-calendar-conflict-secret-0123456789";

  try {
    const { workflowService, AppointmentScheduleConflictError } = await import("../app/server/services/workflow-service");
    const actor = {
      userId: "provider-calendar-hardening",
      displayName: "Calendar Hardening Provider",
      organizationId: "org-calendar-hardening",
      role: "provider" as const,
      capabilities: ["manage_appointments" as const, "read_schedule" as const],
    };
    const context = { source: "api" as const };

    const first = workflowService.createAppointment(
      {
        patientId: "event-block-primary",
        patientName: "Primary schedule block",
        date: "2026-10-12",
        time: "10:00 AM",
        duration: "60 min",
        type: "Schedule Block",
      },
      actor,
      context,
    );

    assert.throws(
      () => workflowService.createAppointment(
        {
          patientId: "event-meeting-overlap",
          patientName: "Overlapping meeting",
          date: "2026-10-12",
          time: "10:30 AM",
          duration: "30 min",
          type: "Team Meeting",
        },
        actor,
        context,
      ),
      AppointmentScheduleConflictError,
      "an overlapping event for the same provider must be refused even if the browser had stale availability",
    );

    const adjacent = workflowService.createAppointment(
      {
        patientId: "event-meeting-adjacent",
        patientName: "Adjacent meeting",
        date: "2026-10-12",
        time: "11:00 AM",
        duration: "30 min",
        type: "Team Meeting",
      },
      actor,
      context,
    );
    assert.equal(adjacent.time, "11:00 AM");

    assert.throws(
      () => workflowService.updateAppointment(
        adjacent.id,
        { time: "10:30 AM" },
        actor,
        context,
        adjacent.version,
      ),
      AppointmentScheduleConflictError,
      "rescheduling into an occupied interval must be refused at the same authority boundary",
    );

    workflowService.cancelAppointment(first.id, "Practice cancelled", "Release slot for test.", actor, context, first.version);

    const replacement = workflowService.createAppointment(
      {
        patientId: "event-block-replacement",
        patientName: "Replacement block",
        date: "2026-10-12",
        time: "10:00 AM",
        duration: "60 min",
        type: "Schedule Block",
      },
      actor,
      context,
    );
    assert.equal(replacement.time, "10:00 AM", "a cancelled event no longer occupies the slot");

    const otherProvider = workflowService.createAppointment(
      {
        patientId: "event-meeting-other-provider",
        patientName: "Other provider meeting",
        date: "2026-10-12",
        time: "10:00 AM",
        duration: "60 min",
        type: "Team Meeting",
        providerId: "provider-other",
        providerName: "Other Provider",
      },
      actor,
      context,
    );
    assert.equal(otherProvider.providerId, "provider-other", "known different providers may work concurrently");
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});
