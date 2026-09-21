"use client";

import { useEffect, useState } from "react";
import {
  WORKSPACE_SIDEBAR_BADGES_EVENT,
  subscribeWorkspaceEvent,
  type WorkspaceSidebarBadgesDetail,
} from "./workspace-events";

/**
 * Pending-work counts keyed by destination id.
 *
 * The queues publish these as they answer — labs and documents from
 * `PracticeQueueWorkspaceShell`, tasks and inbox from `GlobalWorkspaceShell`,
 * prescribing from `PrescriptionOperationsWorkspace` — so a count shown in the shell
 * is a number a surface actually returned rather than a chrome-side estimate.
 *
 * Read here by every chrome that offers one of those destinations, so that a count
 * follows its destination when the destination moves between surfaces (UI-7a moved
 * Documents from the Clinical menu to the `+` launcher, and its count with it).
 * Counts accumulate: a queue that has not answered yet contributes no key, which is
 * distinct from a key whose value is zero.
 */
export function useWorkspaceBadgeCounts(): WorkspaceSidebarBadgesDetail {
  const [counts, setCounts] = useState<WorkspaceSidebarBadgesDetail>({});

  useEffect(
    () =>
      subscribeWorkspaceEvent(WORKSPACE_SIDEBAR_BADGES_EVENT, (detail) => {
        if (detail) setCounts((previous) => ({ ...previous, ...detail }));
      }),
    [],
  );

  return counts;
}
