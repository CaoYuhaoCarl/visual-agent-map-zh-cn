import { estimateTokens } from "../../../ai/context-builder";
import { translate, uiLocale, type UiLanguage } from "../../../i18n";
import type { ReasoningLevel } from "../../../ai/types";
import type { RelevanceLevel, RelevanceTier } from "../../../note-values";
import { positionIds } from "../../short-ids";
import { renderTemplate, type StepDefinition } from "../../step-runner";
import type { StructureNode } from "../structure-review/step";
import languageEn from "./language.en.md";
import languageZh from "./language.zh.md";
import template from "./prompt.md";
import repairTemplate from "./repair.md";

export const RELEVANCE_TIERS: readonly RelevanceTier[] = ["core", "support", "side"];
export const RELEVANCE_GRADE_TOKEN_BUDGET = 32_000;
export const RELEVANCE_GOAL_MAX_LENGTH = 200;

export interface RelevanceGradeRequest {
  /** What the learner wants to achieve; sent as a JSON string and treated as untrusted data. */
  goal: string;
  /** How much the learner already knows; sent as a JSON string, or `null` when not given. Untrusted data. */
  level?: RelevanceLevel;
  /** One line of the learner's conditions or what they already know; sent as a JSON string, or `null`. Untrusted data. */
  context?: string;
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
/** One card graded above its parent (core > support > side). */
export interface RelevanceHierarchyViolation {
  childId: string;
  childTier: RelevanceTier;
  parentId: string;
  parentTier: RelevanceTier;
}
/** Set on an "invalid" error whose ONLY problem is parent-child violations; carries what a repair round needs. */
export interface RelevanceHierarchyFailure {
  violations: RelevanceHierarchyViolation[];
  /** The reply as the parser read it (trimmed reasons), otherwise valid and complete. */
  reply: RelevanceGradeResult;
}
export class RelevanceGradeError extends Error {
  constructor(
    readonly code: "empty" | "over_budget" | "stopped" | "invalid",
    message: string,
    readonly hierarchy?: RelevanceHierarchyFailure,
    /** Technical detail (may contain card ids) for logs; never shown to the user. */
    readonly detail?: string
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

const TIER_RANK: Record<RelevanceTier, number> = { core: 2, support: 1, side: 0 };

const invalid = (locale: UiLanguage, detail: string): RelevanceGradeError =>
  new RelevanceGradeError("invalid", translate(locale, "error.relevance_grade_invalid", detail));

/**
 * Strict parser. The WHOLE reply is refused (with `RelevanceGradeError`, nothing written, no partial result) when it is
 * not JSON; is not exactly `{"items": [...]}`; has an item that is not an object with exactly `id`, `tier` and
 * `reason`; has a tier other than core, support or side; has a reason that is empty after trimming; repeats an id;
 * names an id that is not on the map or belongs to a top-level card; leaves any gradable card out; or ranks a card
 * above its parent (core > support > side; a top-level parent is context and not compared).
 * The reply uses the short position ids of {@link gradePrompt} (c1..cN, in map order); each is turned back into the real
 * id here, so everything returned or reported (items, violations, error details) carries real ids. A real id (UUID) in
 * the reply is not a position id and is refused like any unknown id.
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
  const ids = positionIds(tree.map(node => node.id));
  const gradable = new Map(gradableNodes(tree).map(node => [node.id, node]));
  const seen = new Set<string>();
  const items: RelevanceGradeItem[] = [];
  body.items.forEach((entry: unknown, index: number) => {
    const where = `#${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid(locale, where);
    const item = entry as Record<string, unknown>;
    const keys = Object.keys(item);
    if (keys.length !== 3 || !["id", "tier", "reason"].every(key => keys.includes(key)))
      throw invalid(locale, `${where} keys`);
    const { id: label, tier, reason } = item;
    if (typeof label !== "string" || !label) throw invalid(locale, `${where} id`);
    if (typeof tier !== "string" || !(RELEVANCE_TIERS as readonly string[]).includes(tier))
      throw invalid(locale, `${where} tier`);
    if (typeof reason !== "string" || !reason.trim()) throw invalid(locale, `${where} reason`);
    const id = ids.real(label);
    if (id === undefined) throw invalid(locale, `${where} id ${label}`);
    if (!gradable.has(id)) throw invalid(locale, `${where} top-level ${id}`);
    if (seen.has(id)) throw invalid(locale, `${where} duplicate ${id}`);
    seen.add(id);
    items.push({ id, tier: tier as RelevanceTier, reason: reason.replace(/\s+/g, " ").trim() });
  });
  const missing = [...gradable.keys()].filter(id => !seen.has(id));
  if (missing.length) throw invalid(locale, `missing ${missing.length}: ${missing.slice(0, 3).join(", ")}`);
  const violations = relevanceHierarchyViolations(items, tree);
  if (violations.length) {
    const first = violations[0];
    const more = violations.length > 1 ? ` (+${violations.length - 1} more)` : "";
    throw new RelevanceGradeError(
      "invalid",
      translate(
        locale,
        "error.relevance_grade_invalid",
        `hierarchy ${first.childId}: ${first.childTier} under ${first.parentTier} ${first.parentId}${more}`
      ),
      { violations, reply: { items } }
    );
  }
  return { items };
}

/** Every graded card ranked above its graded parent, in map order. A top-level parent is context and is not compared. */
export function relevanceHierarchyViolations(
  items: ReadonlyArray<RelevanceGradeItem>,
  tree: ReadonlyArray<StructureNode>
): RelevanceHierarchyViolation[] {
  const tierOf = new Map(items.map(item => [item.id, item.tier]));
  const violations: RelevanceHierarchyViolation[] = [];
  for (const node of gradableNodes(tree)) {
    const parentTier = node.parentId ? tierOf.get(node.parentId) : undefined;
    const tier = tierOf.get(node.id);
    if (node.parentId && parentTier && tier && TIER_RANK[tier] > TIER_RANK[parentTier])
      violations.push({ childId: node.id, childTier: tier, parentId: node.parentId, parentTier });
  }
  return violations;
}

const languageLine = (request: RelevanceGradeRequest): string =>
  renderTemplate((request.contentLanguage ?? request.language) === "zh-TW" ? languageZh : languageEn, {});

/** The cards as the model sees them: position ids (c1..cN in map order) for both `id` and `parentId`, no UUIDs. */
const promptCards = (nodes: ReadonlyArray<StructureNode>) => {
  const ids = positionIds(nodes.map(node => node.id));
  const label = (id: string): string => ids.short(id) ?? id;
  return nodes.map(node => ({
    id: label(node.id),
    title: node.title,
    summary: node.summary,
    parentId: node.parentId === null ? null : label(node.parentId),
    depth: node.depth
  }));
};

const gradePrompt = (request: RelevanceGradeRequest): string =>
  renderTemplate(template, {
    languageInstruction: languageLine(request),
    goal: JSON.stringify(request.goal),
    level: JSON.stringify(request.level ?? null),
    context: JSON.stringify(request.context ?? null),
    nodes: JSON.stringify(promptCards(request.nodes))
  });

const refuseIfTooBig = (prompt: string, request: RelevanceGradeRequest): void => {
  const locale = uiLocale(request.language);
  if (!gradableNodes(request.nodes).length)
    throw new RelevanceGradeError("empty", translate(locale, "error.relevance_grade_empty"));
  if (estimateTokens(prompt + JSON.stringify(RELEVANCE_GRADE_SCHEMA)) > RELEVANCE_GRADE_TOKEN_BUDGET)
    throw new RelevanceGradeError("over_budget", translate(locale, "error.relevance_grade_over_budget"));
};

/** Grade every card of a map against the learner's goal. Input is titles, summaries and structure; the reply is strict JSON. */
export const relevanceGradeStep: StepDefinition<RelevanceGradeRequest, RelevanceGradeResult> = {
  id: "relevance-grade",
  version: 4,
  render: gradePrompt,
  schema: RELEVANCE_GRADE_SCHEMA,
  policy: refuseIfTooBig,
  parse: (raw, request) => parseRelevanceGrade(raw, request.nodes, request.language)
};

/** The most repair rounds one grade may use; each round fixes only parent-child violations of the latest reply. */
export const RELEVANCE_REPAIR_MAX_ROUNDS = 2;
/** A repair round: the latest reply was complete and valid except for the listed parent-child violations. */
export interface RelevanceRepairRequest extends RelevanceGradeRequest {
  previousReply: RelevanceGradeResult;
  violations: RelevanceHierarchyViolation[];
}
/**
 * The repair prompt speaks position ids like the grade prompt: the reply and the pairs are converted before they are sent.
 * Each pair also carries the chain of ancestors from the parent up to the top-level card with each one's tier in the
 * previous reply (the top-level card is context only, so its tier is null): raising a parent may need its ancestors raised.
 */
const repairPrompt = (request: RelevanceRepairRequest): string => {
  const ids = positionIds(request.nodes.map(node => node.id));
  const label = (id: string): string => ids.short(id) ?? id;
  const parentOf = new Map(request.nodes.map(node => [node.id, node.parentId]));
  const tierOf = new Map(request.previousReply.items.map(item => [item.id, item.tier]));
  const chain = (parentId: string): Array<{ id: string; tier: RelevanceTier | null }> => {
    const result: Array<{ id: string; tier: RelevanceTier | null }> = [];
    const seen = new Set<string>();
    for (let id: string | null | undefined = parentId; id && !seen.has(id); id = parentOf.get(id)) {
      seen.add(id);
      result.push({ id: label(id), tier: tierOf.get(id) ?? null });
    }
    return result;
  };
  return renderTemplate(repairTemplate, {
    originalPrompt: gradePrompt(request),
    previousReply: JSON.stringify({
      items: request.previousReply.items.map(item => ({ ...item, id: label(item.id) }))
    }),
    violations: JSON.stringify(
      request.violations.map(violation => ({
        ...violation,
        childId: label(violation.childId),
        parentId: label(violation.parentId),
        ancestors: chain(violation.parentId)
      }))
    ),
    languageInstruction: languageLine(request)
  });
};
export const relevanceGradeRepairStep: StepDefinition<RelevanceRepairRequest, RelevanceGradeResult> = {
  id: "relevance-grade-repair",
  version: 3,
  render: repairPrompt,
  schema: RELEVANCE_GRADE_SCHEMA,
  policy: refuseIfTooBig,
  // The same strict parser; a repair that breaks anything but hierarchy fails the grade, and one that still violates
  // hierarchy gets another round until RELEVANCE_REPAIR_MAX_ROUNDS is used up.
  parse: (raw, request) => parseRelevanceGrade(raw, request.nodes, request.language)
};
