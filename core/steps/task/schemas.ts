import { aimContractSchema, type AimContract } from "../../../ai/aim-contracts";
import aimGapAuditSchema from "../../../ai/aim-gap-audit-schema";
import { SEARCH_STATUSES, type TaskContext } from "../../../ai/types";
import responseSchema from "../../../response-schema.json";

/** How a task context is answered: the response schema sent to the model and the flags its parser needs. */
export interface TaskResponseShape {
  schema: unknown;
  isAimGapAudit: boolean;
  isIsolatedWebResearch: boolean;
  contract?: AimContract;
}

export function taskResponseShape(context: TaskContext): TaskResponseShape {
  const isAimGapAudit =
    context.responseContract === "aim-gap-audit" && context.promptProfile === "aim" && context.researchMode === "local";
  const isDeliveryAcceptance =
    context.responseContract === "aim-delivery-acceptance" &&
    context.promptProfile === "aim" &&
    context.researchMode === "local";
  const deliverySchema = {
    ...responseSchema,
    properties: {
      ...responseSchema.properties,
      summary: {
        type: "string",
        description: "A short plain-language preview. Never put machine-readable review markers here."
      },
      detail: {
        type: "string",
        pattern: "^\\s*<!--\\s*aim-review\\s+\\{[^\\r\\n]*\\}\\s*-->",
        description:
          "Begin with the COMPLETE first-line AIM review marker containing decision and rationale (and stopReason for conclude). Put the marker in detail only, followed by the acceptance explanation. Never split or truncate the marker."
      }
    }
  };
  const isIsolatedWebResearch = context.aimIsolatedResearch === true && context.researchMode !== "local";
  const webResearchSchema = {
    ...responseSchema,
    properties: {
      ...responseSchema.properties,
      searchStatus: {
        type: "string",
        enum: [...SEARCH_STATUSES],
        description:
          "completed only when at least one web search or page fetch returned usable results for this task; failed when searching was attempted without usable results; not_attempted when no search ran."
      }
    },
    required: [...responseSchema.required, "searchStatus"]
  };
  const contract = context.promptProfile === "aim" && !isAimGapAudit ? context.aimContract : undefined;
  const schema = contract
    ? aimContractSchema(
        contract,
        isIsolatedWebResearch ? webResearchSchema : responseSchema,
        context.aimEvidenceLookup === true
      )
    : isAimGapAudit
      ? aimGapAuditSchema
      : isDeliveryAcceptance
        ? deliverySchema
        : isIsolatedWebResearch
          ? webResearchSchema
          : responseSchema;
  return { schema, isAimGapAudit, isIsolatedWebResearch, ...(contract ? { contract } : {}) };
}
