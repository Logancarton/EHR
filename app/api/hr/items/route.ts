import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import {
  HRService,
  isHrItemCategory,
  isHrItemStatus,
  HR_ITEM_CATEGORIES,
  HR_ITEM_STATUSES,
} from "../../../server/services/hr-service";
import { clinicalActionError } from "../../../server/http/clinical-http";
import { hrRequestBody, optionalHrString } from "../request-body";

/**
 * Assign one item into a member's HR record (D-086).
 *
 * An insurance plan, a licensing deadline, a coaching, a goal. Requires `manage_hr`,
 * and refuses when the member has no record yet — setting somebody up is its own act
 * with its own audit entry.
 */
export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await hrRequestBody(req, [
      "userId",
      "category",
      "title",
      "detail",
      "status",
      "dueOn",
      "organizationId",
    ]);

    const userId = optionalHrString(body.userId, "userId", 160);
    if (!userId) throw new Error("userId is required.");

    const category = optionalHrString(body.category, "category", 32);
    if (!isHrItemCategory(category)) {
      throw new Error(`category must be one of: ${HR_ITEM_CATEGORIES.join(", ")}.`);
    }
    const status = optionalHrString(body.status, "status", 32);
    if (status !== undefined && !isHrItemStatus(status)) {
      throw new Error(`status must be one of: ${HR_ITEM_STATUSES.join(", ")}.`);
    }

    const result = HRService.assignItem(actor, {
      userId,
      category,
      title: String(body.title ?? ""),
      detail: optionalHrString(body.detail, "detail", 1000),
      status,
      dueOn: optionalHrString(body.dueOn, "dueOn", 10) ?? null,
      organizationId: optionalHrString(body.organizationId, "organizationId", 160),
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}
