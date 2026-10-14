import type { AiResult, Suggestion } from "./types";

/**
 * Provider-enforced response contracts for AIM (AIM) control phases.
 *
 * Control data travels in a dedicated `aim` field validated by the provider's
 * structured-output schema instead of as prose-described JSON inside `detail`.
 * The result is folded back into the canonical marker form, which remains the
 * single persisted representation that every downstream parser already reads.
 *
 * Schemas use only types, enums, required and additionalProperties so they stay
 * valid under every provider's strict mode. Each decision reads only the fields it
 * needs; fields that belong to another decision are ignored, never rejected.
 */
export type AimDecision = "research_more" | "ask_user" | "conclude";
export type AimContract =
  | { kind: "intake" }
  | { kind: "question"; requireQuestion: boolean }
  | { kind: "plan" }
  | { kind: "reuse" }
  | { kind: "review"; decisions: readonly AimDecision[] }
  | { kind: "outline" }
  | { kind: "delivery-research" };

/** Mirrors manual-flow's sentinel without importing the workflow into the provider layer. */
export const AIM_NO_QUESTION = "__AIM_NO_QUESTION__";

const QUESTION_SCOPE =
  "Ask about the user's goal, preferences, constraints or situation, never about this tool's workflow, counts, nodes or branches.";
const text = { type: "string" } as const;
const texts = { type: "array", items: text } as const;
const nullable = <T extends Record<string, unknown>>(schema: T) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false
});

function payloadSchema(contract: AimContract): Record<string, unknown> {
  switch (contract.kind) {
    case "intake":
      return object({
        questions: {
          ...texts,
          description: "0–5 short questions about unknown user conditions; empty when none are needed."
        }
      });
    case "question":
      return object({
        decision: { type: "string", enum: contract.requireQuestion ? ["ask_user"] : ["ask_user", "no_question"] },
        question: {
          ...text,
          description: `The one direct question for the user, written as a question. ${QUESTION_SCOPE} Empty only for no_question.`
        },
        answerOptions: {
          ...texts,
          description: "2–5 distinct answer choices for the question. Empty only for no_question."
        }
      });
    case "plan":
      return object({
        subtopics: {
          type: "array",
          description: "0–5 distinct evidence tasks.",
          items: object({
            id: text,
            title: text,
            task: text,
            expectedValue: text,
            action: { type: "string", enum: ["research", "update", "reuse"] },
            dependsOn: { ...texts, description: "Ids of prerequisite targets in this plan; empty when independent." },
            rationale: text,
            source: {
              ...nullable(
                object({
                  branchId: text,
                  resultId: text,
                  notePath: text,
                  version: { type: "integer" },
                  contentHash: text
                })
              ),
              description:
                "For reuse/update: the exact source copied from the supplied ancestor report. Null for research."
            },
            validity: {
              ...nullable(object({ conditionKeys: texts, reason: text })),
              description:
                "For reuse/update: which supplied condition keys the source depends on and why it still applies. Null for research."
            }
          })
        }
      });
    case "reuse":
      return object({
        usable: { type: "boolean" },
        rationale: text,
        conditionKeys: texts,
        validity: { ...text, description: "Freshness and applicability assessment." }
      });
    case "review":
      return object({
        goalAnswered: {
          type: "boolean",
          description:
            "true when the supplied reports already answer the original goal under the known conditions; false when a material evidence gap in the goal itself remains."
        },
        decision: { type: "string", enum: [...contract.decisions] },
        rationale: { ...text, description: "Evidence-based reason for the decision." },
        stopReason: { ...text, description: "For conclude: why research can stop. Otherwise empty." },
        question: {
          ...text,
          description: `For ask_user: the one direct question for the user, written as a question. ${QUESTION_SCOPE} Otherwise empty.`
        },
        answerOptions: { ...texts, description: "For ask_user: 2–5 distinct answer choices. Otherwise empty." },
        researchTarget: {
          ...nullable(
            object({
              title: text,
              task: { ...text, description: "Search instruction." },
              expectedValue: { ...text, description: "Uncertainty the search should reduce." }
            })
          ),
          description: "For research_more: the one targeted evidence gap. Otherwise null."
        },
        unresolvedConditions: {
          ...texts,
          description:
            "Decision-changing user conditions that are still unknown and cannot reasonably be assumed. A condition the user said they do not know is resolved by a stated assumption. Empty when none."
        },
        gapKind: {
          anyOf: [{ type: "string", enum: ["searchable", "user_only", "not_decisive"] }, { type: "null" }],
          description:
            "For research_more: searchable when public web sources can close the gap; user_only when only the user or someone they must contact can supply it (their own documents, quotes, offers, devices, account or company data); not_decisive when closing it would not change the recommendation. Otherwise null."
        }
      });
    case "outline":
      return object({
        sections: {
          type: "array",
          items: object({
            heading: text,
            purpose: text,
            searchTask: {
              ...text,
              description: "Specific web search needed for this section, or empty if already supported."
            },
            evidenceIds: {
              ...nullable(texts),
              description: "Supplied source IDs this section relies on, or null to use all supplied sources."
            },
            dependencies: { ...nullable(texts), description: "Additional supplied source IDs, or null." }
          })
        }
      });
    case "delivery-research":
      return object({
        status: {
          type: "string",
          enum: ["searched", "unavailable"],
          description:
            "searched only when web search actually ran for the outline; unavailable when tools failed or were not available."
        }
      });
  }
}

/** Extend a base response schema with the contract's `aim` payload and, when allowed, an evidence lookup request. */
export function aimContractSchema(
  contract: AimContract,
  base: { properties: Record<string, unknown>; required: readonly string[] } & Record<string, unknown>,
  evidenceLookup: boolean
): Record<string, unknown> {
  const payload = payloadSchema(contract);
  const aim = evidenceLookup
    ? {
        ...payload,
        properties: {
          ...(payload.properties as Record<string, unknown>),
          evidenceRequestIds: {
            ...texts,
            description:
              "Up to 3 exact evidence IDs whose full reports are needed before deciding; empty when the indexes suffice."
          }
        },
        required: [...(payload.required as string[]), "evidenceRequestIds"]
      }
    : payload;
  const { $schema: _draft, ...body } = base;
  return { ...body, properties: { ...base.properties, aim }, required: [...base.required, "aim"] };
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const cleanList = (value: unknown): string[] => (Array.isArray(value) ? value.map(clean).filter(Boolean) : []);
const choice = (title: string): Suggestion => ({ title, task: "", contribution: "", parentTitle: "" });
const marker = (name: string, value: unknown) => `<!-- ${name} ${JSON.stringify(value)} -->`;
/** Remove a stale marker of the same kind so the folded marker is the only one. */
const withoutMarker = (detail: string, name: string) =>
  detail.replace(new RegExp(`<!--\\s*${name}\\s+[\\s\\S]*?-->\\s*`, "g"), "").trim();
const prepend = (head: string, body: string) => (body ? `${head}\n${body}` : head);

function foldPayload(contract: AimContract, aim: Record<string, unknown>, result: AiResult): AiResult {
  switch (contract.kind) {
    case "intake":
      return {
        ...result,
        detail: prepend(
          marker("aim-intake", { questions: cleanList(aim.questions) }),
          withoutMarker(result.detail, "aim-intake")
        ),
        suggestions: []
      };
    case "question": {
      if (aim.decision === "no_question") return { ...result, summary: AIM_NO_QUESTION, suggestions: [] };
      return { ...result, summary: clean(aim.question), suggestions: cleanList(aim.answerOptions).map(choice) };
    }
    case "plan": {
      const subtopics = (Array.isArray(aim.subtopics) ? aim.subtopics : []).map((item: unknown) => {
        const { source, validity, ...target } = (item && typeof item === "object" ? item : {}) as Record<
          string,
          unknown
        >;
        return { ...target, ...(source ? { source } : {}), ...(validity ? { validity } : {}) };
      });
      return {
        ...result,
        detail: prepend(marker("aim-plan", { subtopics }), withoutMarker(result.detail, "aim-plan")),
        suggestions: []
      };
    }
    case "reuse":
      return {
        ...result,
        detail: prepend(
          marker("aim-reuse", {
            usable: aim.usable === true,
            rationale: clean(aim.rationale),
            conditionKeys: cleanList(aim.conditionKeys),
            validity: clean(aim.validity)
          }),
          withoutMarker(result.detail, "aim-reuse")
        )
      };
    case "review": {
      const decision = aim.decision as AimDecision;
      const fields: Record<string, string | boolean | string[]> = {
        decision,
        rationale: clean(aim.rationale),
        ...(typeof aim.goalAnswered === "boolean" ? { goalAnswered: aim.goalAnswered } : {})
      };
      if (decision === "conclude") fields.stopReason = clean(aim.stopReason);
      if (decision === "ask_user") fields.question = clean(aim.question);
      if (decision === "research_more" && typeof aim.gapKind === "string") fields.gapKind = aim.gapKind;
      const unresolved = cleanList(aim.unresolvedConditions);
      if (unresolved.length) fields.unresolvedConditions = unresolved;
      const target =
        aim.researchTarget && typeof aim.researchTarget === "object"
          ? (aim.researchTarget as Record<string, unknown>)
          : undefined;
      const suggestions =
        decision === "ask_user"
          ? cleanList(aim.answerOptions).map(choice)
          : decision === "research_more" && target
            ? [
                {
                  title: clean(target.title),
                  task: clean(target.task),
                  contribution: clean(target.expectedValue),
                  parentTitle: ""
                }
              ]
            : [];
      return {
        ...result,
        detail: prepend(marker("aim-review", fields), withoutMarker(result.detail, "aim-review")),
        suggestions
      };
    }
    case "outline": {
      const sections = (Array.isArray(aim.sections) ? aim.sections : []).map((item: unknown) => {
        const { evidenceIds, dependencies, ...section } = (item && typeof item === "object" ? item : {}) as Record<
          string,
          unknown
        >;
        // Null keeps the legacy meaning of an absent mapping: the section may use all supplied sources.
        return {
          ...section,
          ...(Array.isArray(evidenceIds) ? { evidenceIds } : {}),
          ...(Array.isArray(dependencies) ? { dependencies } : {})
        };
      });
      return {
        ...result,
        detail: prepend(
          marker("aim-delivery-outline", { sections }),
          withoutMarker(result.detail, "aim-delivery-outline")
        ),
        suggestions: []
      };
    }
    case "delivery-research":
      return {
        ...result,
        detail: prepend(
          marker("aim-delivery-research", { status: aim.status }),
          withoutMarker(result.detail, "aim-delivery-research")
        )
      };
  }
}

/**
 * Fold a structured `aim` payload into the canonical AiResult. A response without
 * the payload is returned unchanged so legacy marker responses still parse.
 */
export function foldAimContract(contract: AimContract, aim: unknown, result: AiResult): AiResult {
  if (!aim || typeof aim !== "object" || Array.isArray(aim)) return result;
  const payload = aim as Record<string, unknown>;
  const requestIds = cleanList(payload.evidenceRequestIds);
  if (requestIds.length)
    return {
      ...result,
      detail: prepend(
        marker("aim-evidence-request", { ids: requestIds }),
        withoutMarker(result.detail, "aim-evidence-request")
      ),
      suggestions: []
    };
  return foldPayload(contract, payload, result);
}
