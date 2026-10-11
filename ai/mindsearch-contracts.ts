import type { AiResult, Suggestion } from "./types";

/**
 * Provider-enforced response contracts for AIM (MindSearch) control phases.
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
export type MindSearchDecision = "research_more" | "ask_user" | "conclude";
export type MindSearchContract =
  | { kind: "intake" }
  | { kind: "question"; requireQuestion: boolean }
  | { kind: "plan" }
  | { kind: "reuse" }
  | { kind: "review"; decisions: readonly MindSearchDecision[] }
  | { kind: "outline" }
  | { kind: "delivery-research" };

/** Mirrors manual-flow's sentinel without importing the workflow into the provider layer. */
export const MINDSEARCH_NO_QUESTION = "__MINDSEARCH_NO_QUESTION__";

const text = { type: "string" } as const;
const texts = { type: "array", items: text } as const;
const nullable = <T extends Record<string, unknown>>(schema: T) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

function payloadSchema(contract: MindSearchContract): Record<string, unknown> {
  switch (contract.kind) {
    case "intake":
      return object({ questions: { ...texts, description: "0–5 short questions about unknown user conditions; empty when none are needed." } });
    case "question":
      return object({
        decision: { type: "string", enum: contract.requireQuestion ? ["ask_user"] : ["ask_user", "no_question"] },
        question: { ...text, description: "The one direct question for the user, written as a question. Empty only for no_question." },
        answerOptions: { ...texts, description: "2–5 distinct answer choices for the question. Empty only for no_question." }
      });
    case "plan":
      return object({
        subtopics: {
          type: "array",
          description: "0–5 distinct evidence tasks.",
          items: object({
            id: text, title: text, task: text, expectedValue: text,
            action: { type: "string", enum: ["research", "update", "reuse"] },
            dependsOn: { ...texts, description: "Ids of prerequisite targets in this plan; empty when independent." },
            rationale: text,
            source: { ...nullable(object({ branchId: text, resultId: text, notePath: text, version: { type: "integer" }, contentHash: text })), description: "For reuse/update: the exact source copied from the supplied ancestor report. Null for research." },
            validity: { ...nullable(object({ conditionKeys: texts, reason: text })), description: "For reuse/update: which supplied condition keys the source depends on and why it still applies. Null for research." }
          })
        }
      });
    case "reuse":
      return object({ usable: { type: "boolean" }, rationale: text, conditionKeys: texts, validity: { ...text, description: "Freshness and applicability assessment." } });
    case "review":
      return object({
        decision: { type: "string", enum: [...contract.decisions] },
        rationale: { ...text, description: "Evidence-based reason for the decision." },
        stopReason: { ...text, description: "For conclude: why research can stop. Otherwise empty." },
        question: { ...text, description: "For ask_user: the one direct question for the user, written as a question. Otherwise empty." },
        answerOptions: { ...texts, description: "For ask_user: 2–5 distinct answer choices. Otherwise empty." },
        researchTarget: { ...nullable(object({ title: text, task: { ...text, description: "Search instruction." }, expectedValue: { ...text, description: "Uncertainty the search should reduce." } })), description: "For research_more: the one targeted evidence gap. Otherwise null." }
      });
    case "outline":
      return object({
        sections: {
          type: "array",
          items: object({
            heading: text, purpose: text,
            searchTask: { ...text, description: "Specific web search needed for this section, or empty if already supported." },
            evidenceIds: { ...nullable(texts), description: "Supplied source IDs this section relies on, or null to use all supplied sources." },
            dependencies: { ...nullable(texts), description: "Additional supplied source IDs, or null." }
          })
        }
      });
    case "delivery-research":
      return object({ status: { type: "string", enum: ["searched", "unavailable"], description: "searched only when web search actually ran for the outline; unavailable when tools failed or were not available." } });
  }
}

/** Extend a base response schema with the contract's `aim` payload and, when allowed, an evidence lookup request. */
export function mindSearchContractSchema(contract: MindSearchContract, base: { properties: Record<string, unknown>; required: readonly string[] } & Record<string, unknown>, evidenceLookup: boolean): Record<string, unknown> {
  const payload = payloadSchema(contract);
  const aim = evidenceLookup
    ? { ...payload, properties: { ...(payload.properties as Record<string, unknown>), evidenceRequestIds: { ...texts, description: "Up to 3 exact evidence IDs whose full reports are needed before deciding; empty when the indexes suffice." } }, required: [...(payload.required as string[]), "evidenceRequestIds"] }
    : payload;
  const { $schema: _draft, ...body } = base;
  return { ...body, properties: { ...base.properties, aim }, required: [...base.required, "aim"] };
}

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const cleanList = (value: unknown): string[] => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const choice = (title: string): Suggestion => ({ title, task: "", contribution: "", parentTitle: "" });
const marker = (name: string, value: unknown) => `<!-- ${name} ${JSON.stringify(value)} -->`;
/** Remove a stale marker of the same kind so the folded marker is the only one. */
const withoutMarker = (detail: string, name: string) => detail.replace(new RegExp(`<!--\\s*${name}\\s+[\\s\\S]*?-->\\s*`, "g"), "").trim();
const prepend = (head: string, body: string) => body ? `${head}\n${body}` : head;

function foldPayload(contract: MindSearchContract, aim: Record<string, unknown>, result: AiResult): AiResult {
  switch (contract.kind) {
    case "intake":
      return { ...result, detail: prepend(marker("mindsearch-intake", { questions: cleanList(aim.questions) }), withoutMarker(result.detail, "mindsearch-intake")), suggestions: [] };
    case "question": {
      if (aim.decision === "no_question") return { ...result, summary: MINDSEARCH_NO_QUESTION, suggestions: [] };
      return { ...result, summary: clean(aim.question), suggestions: cleanList(aim.answerOptions).map(choice) };
    }
    case "plan": {
      const subtopics = (Array.isArray(aim.subtopics) ? aim.subtopics : []).map((item: unknown) => {
        const { source, validity, ...target } = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return { ...target, ...(source ? { source } : {}), ...(validity ? { validity } : {}) };
      });
      return { ...result, detail: prepend(marker("mindsearch-plan", { subtopics }), withoutMarker(result.detail, "mindsearch-plan")), suggestions: [] };
    }
    case "reuse":
      return { ...result, detail: prepend(marker("mindsearch-reuse", { usable: aim.usable === true, rationale: clean(aim.rationale), conditionKeys: cleanList(aim.conditionKeys), validity: clean(aim.validity) }), withoutMarker(result.detail, "mindsearch-reuse")) };
    case "review": {
      const decision = aim.decision as MindSearchDecision;
      const fields: Record<string, string> = { decision, rationale: clean(aim.rationale) };
      if (decision === "conclude") fields.stopReason = clean(aim.stopReason);
      if (decision === "ask_user") fields.question = clean(aim.question);
      const target = aim.researchTarget && typeof aim.researchTarget === "object" ? aim.researchTarget as Record<string, unknown> : undefined;
      const suggestions = decision === "ask_user" ? cleanList(aim.answerOptions).map(choice)
        : decision === "research_more" && target ? [{ title: clean(target.title), task: clean(target.task), contribution: clean(target.expectedValue), parentTitle: "" }]
          : [];
      return { ...result, detail: prepend(marker("mindsearch-review", fields), withoutMarker(result.detail, "mindsearch-review")), suggestions };
    }
    case "outline": {
      const sections = (Array.isArray(aim.sections) ? aim.sections : []).map((item: unknown) => {
        const { evidenceIds, dependencies, ...section } = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        // Null keeps the legacy meaning of an absent mapping: the section may use all supplied sources.
        return { ...section, ...(Array.isArray(evidenceIds) ? { evidenceIds } : {}), ...(Array.isArray(dependencies) ? { dependencies } : {}) };
      });
      return { ...result, detail: prepend(marker("mindsearch-delivery-outline", { sections }), withoutMarker(result.detail, "mindsearch-delivery-outline")), suggestions: [] };
    }
    case "delivery-research":
      return { ...result, detail: prepend(marker("mindsearch-delivery-research", { status: aim.status }), withoutMarker(result.detail, "mindsearch-delivery-research")) };
  }
}

/**
 * Fold a structured `aim` payload into the canonical AiResult. A response without
 * the payload is returned unchanged so legacy marker responses still parse.
 */
export function foldMindSearchContract(contract: MindSearchContract, aim: unknown, result: AiResult): AiResult {
  if (!aim || typeof aim !== "object" || Array.isArray(aim)) return result;
  const payload = aim as Record<string, unknown>;
  const requestIds = cleanList(payload.evidenceRequestIds);
  if (requestIds.length) return { ...result, detail: prepend(marker("mindsearch-evidence-request", { ids: requestIds }), withoutMarker(result.detail, "mindsearch-evidence-request")), suggestions: [] };
  return foldPayload(contract, payload, result);
}
