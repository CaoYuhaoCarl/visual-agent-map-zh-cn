import { estimateTokens } from "../../../ai/context-builder";
import { translate, uiLocale, type UiLanguage } from "../../../i18n";
import type { ReasoningLevel } from "../../../ai/types";
import type { RelevanceTier } from "../../../note-values";
import { renderTemplate, type StepDefinition } from "../../step-runner";
import type { StructureNode } from "../structure-review/step";
import languageEn from "./language.en.md";
import languageZh from "./language.zh.md";
import template from "./prompt.md";

export const RELEVANCE_TIERS: readonly RelevanceTier[] = ["core", "support", "side"];
export const RELEVANCE_GRADE_TOKEN_BUDGET = 32_000;
export const RELEVANCE_GOAL_MAX_LENGTH = 200;

export interface RelevanceGradeRequest {
  /** What the learner wants to achieve; sent as a JSON string and treated as untrusted data. */
  goal: string;
  /** The whole map, parent before child. Cards whose `parentId` is null are context only and are never graded. */
  nodes: StructureNode[];
  language: UiLanguage;
  /** Language of the prompt and the model's reasons; defaults to `language`, which stays the interface language for errors. */
  contentLanguage?: UiLanguage;
  model: string;
  reasoning: ReasoningLevel;
}
export interface RelevanceGradeItem {
  id: string;
  tier: RelevanceTier;
  reason: string;
}
export interface RelevanceGradeResult {
  items: RelevanceGradeItem[];
}
export class RelevanceGradeError extends Error {
  constructor(
    readonly code: "empty" | "over_budget" | "stopped" | "invalid",
    message: string
  ) {
    super(message);
    this.name = "RelevanceGradeError";
  }
}

export const RELEVANCE_GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          tier: { type: "string", enum: [...RELEVANCE_TIERS] },
          reason: { type: "string", minLength: 1 }
        },
        required: ["id", "tier", "reason"]
      }
    }
  },
  required: ["items"]
};

/** The cards that get a tier: everything except top-level cards, which are only context. */
export const gradableNodes = (nodes: ReadonlyArray<StructureNode>): StructureNode[] =>
  nodes.filter(node => node.parentId !== null);

const invalid = (locale: UiLanguage, detail: string): RelevanceGradeError =>
  new RelevanceGradeError("invalid", translate(locale, "error.relevance_grade_invalid", detail));

/**
 * Strict parser. The WHOLE reply is refused (with `RelevanceGradeError`, nothing written, no partial result) when it is
 * not JSON; is not exactly `{"items": [...]}`; has an item that is not an object with exactly `id`, `tier` and
 * `reason`; has a tier other than core, support or side; has a reason that is empty after trimming; repeats an id;
 * names an id that is not on the map or belongs to a top-level card; or leaves any gradable card out.
 * Nothing is coerced, dropped or truncated except surrounding whitespace in a reason.
 */
export function parseRelevanceGrade(
  raw: string,
  tree: ReadonlyArray<StructureNode>,
  language: UiLanguage = "en"
): RelevanceGradeResult {
  const locale = uiLocale(language);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw invalid(locale, "JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(locale, "object");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Array.isArray(body.items)) throw invalid(locale, "items");
  const gradable = new Map(gradableNodes(tree).map(node => [node.id, node]));
  const known = new Set(tree.map(node => node.id));
  const seen = new Set<string>();
  const items: RelevanceGradeItem[] = [];
  body.items.forEach((entry: unknown, index: number) => {
    const where = `#${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid(locale, where);
    const item = entry as Record<string, unknown>;
    const keys = Object.keys(item);
    if (keys.length !== 3 || !["id", "tier", "reason"].every(key => keys.includes(key)))
      throw invalid(locale, `${where} keys`);
    const { id, tier, reason } = item;
    if (typeof id !== "string" || !id) throw invalid(locale, `${where} id`);
    if (typeof tier !== "string" || !(RELEVANCE_TIERS as readonly string[]).includes(tier))
      throw invalid(locale, `${where} tier`);
    if (typeof reason !== "string" || !reason.trim()) throw invalid(locale, `${where} reason`);
    if (!known.has(id)) throw invalid(locale, `${where} id ${id}`);
    if (!gradable.has(id)) throw invalid(locale, `${where} top-level ${id}`);
    if (seen.has(id)) throw invalid(locale, `${where} duplicate ${id}`);
    seen.add(id);
    items.push({ id, tier: tier as RelevanceTier, reason: reason.replace(/\s+/g, " ").trim() });
  });
  const missing = [...gradable.keys()].filter(id => !seen.has(id));
  if (missing.length) throw invalid(locale, `missing ${missing.length}: ${missing.slice(0, 3).join(", ")}`);
  return { items };
}

/** Grade every card of a map against the learner's goal. Input is titles, summaries and structure; the reply is strict JSON. */
export const relevanceGradeStep: StepDefinition<RelevanceGradeRequest, RelevanceGradeResult> = {
  id: "relevance-grade",
  version: 1,
  render: request =>
    renderTemplate(template, {
      languageInstruction: renderTemplate(
        (request.contentLanguage ?? request.language) === "zh-TW" ? languageZh : languageEn,
        {}
      ),
      goal: JSON.stringify(request.goal),
      nodes: JSON.stringify(
        request.nodes.map(node => ({
          id: node.id,
          title: node.title,
          summary: node.summary,
          parentId: node.parentId,
          depth: node.depth
        }))
      )
    }),
  schema: RELEVANCE_GRADE_SCHEMA,
  policy: (prompt, request) => {
    const locale = uiLocale(request.language);
    if (!gradableNodes(request.nodes).length)
      throw new RelevanceGradeError("empty", translate(locale, "error.relevance_grade_empty"));
    if (estimateTokens(prompt + JSON.stringify(RELEVANCE_GRADE_SCHEMA)) > RELEVANCE_GRADE_TOKEN_BUDGET)
      throw new RelevanceGradeError("over_budget", translate(locale, "error.relevance_grade_over_budget"));
  },
  parse: (raw, request) => parseRelevanceGrade(raw, request.nodes, request.language)
};
