import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { OrderRepository } from "../repositories/order-repository";
import type { AuditRepositoryPort, OrderRepositoryPort } from "../repositories/ports";
import type { ClinicalExecutionContext } from "./clinical-service";

type Dependencies = {
  orders: OrderRepositoryPort;
  audit: AuditRepositoryPort;
};

const defaultDependencies: Dependencies = {
  orders: OrderRepository,
  audit: AuditRepository,
};

export class OrderControlService {
  constructor(private readonly deps: Dependencies = defaultDependencies) {}

  removeStaged(
    orderId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): true {
    assertPermission(actor, "stage_order");

    const existing = this.deps.orders.getById(orderId);
    if (!existing) throw new Error(`Order not found: ${orderId}`);
    if (existing.status !== "staged") {
      throw new Error(`Only staged orders can be removed: ${orderId}`);
    }

    if (!this.deps.orders.removeStaged(orderId)) {
      throw new Error(`Order not found: ${orderId}`);
    }

    this.deps.audit.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "order_unstaged",
      patientId: existing.patientId,
      description: `Removed staged ${existing.type} order for ${existing.name}.`,
      metadata: {
        orderId,
        source: context.source,
        requestId: context.requestId,
      },
    });

    return true;
  }
}

export const orderControlService = new OrderControlService();
