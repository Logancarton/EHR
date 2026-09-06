import type { ProviderContext } from "../auth/provider-context";
import {
  clinicalService,
  type ClinicalExecutionContext,
} from "../services/clinical-service";
import type { EncounterRecord } from "../repositories/encounter-repository";

export type ClinicalAction =
  | {
      type: "stage_order";
      payload: {
        id?: string;
        patientId: string;
        orderType: "medication" | "lab";
        name: string;
        details?: Record<string, any>;
      };
    }
  | {
      type: "authorize_order";
      payload: {
        orderId: string;
        authMetadata?: Record<string, any>;
      };
    }
  | {
      type: "save_encounter_draft";
      payload: Partial<EncounterRecord> & { patientId: string };
    }
  | {
      type: "sign_encounter";
      payload: { encounterId: string };
    };

export type ClinicalActionEnvelope = {
  action: ClinicalAction;
  actor: ProviderContext;
  context: ClinicalExecutionContext;
};

/**
 * Single mutation gateway shared by direct UI actions, AI tool calls, and API routes.
 * AI does not receive privileged database access; it can only request the same typed
 * actions that the rest of the application uses.
 */
export async function executeClinicalAction(envelope: ClinicalActionEnvelope) {
  const { action, actor, context } = envelope;

  switch (action.type) {
    case "stage_order":
      return clinicalService.stageOrder(
        {
          id: action.payload.id,
          patientId: action.payload.patientId,
          type: action.payload.orderType,
          name: action.payload.name,
          details: action.payload.details,
        },
        actor,
        context,
      );

    case "authorize_order":
      return clinicalService.authorizeOrder(
        action.payload.orderId,
        action.payload.authMetadata || {},
        actor,
        context,
      );

    case "save_encounter_draft":
      return clinicalService.saveEncounterDraft(action.payload, actor, context);

    case "sign_encounter":
      return clinicalService.signEncounter(
        action.payload.encounterId,
        actor,
        context,
      );

    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported clinical action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export const ClinicalActionGateway = {
  execute: executeClinicalAction,
};
