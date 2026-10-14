import { createHash } from "node:crypto";
import type { AimBranchRecord } from "../../map-model";

export type AimResearchPlan = NonNullable<AimBranchRecord["researchPlan"]>;
export type AimResearchTarget = AimResearchPlan[number];
export function researchContentHash(report: { summary: string; detail: string }): string {
  return createHash("sha256")
    .update(JSON.stringify({ summary: report.summary, detail: report.detail }))
    .digest("hex");
}

/** Planners sometimes nest validity inside source; move it to the target so the exact source keeps only its identity fields. */
function hoistNestedValidity(item: AimResearchTarget): AimResearchTarget {
  const nested = (item.source as { validity?: unknown } | undefined)?.validity;
  if (item.validity !== undefined || !nested || typeof nested !== "object") return item;
  const { validity: _validity, ...source } = item.source as NonNullable<AimResearchTarget["source"]> & {
    validity?: unknown;
  };
  return { ...item, source, validity: nested as AimResearchTarget["validity"] };
}

/** A reuse/update target names an exact saved source, why it applies, and which conditions it depends on. */
function hasProvenSource(item: AimResearchTarget): boolean {
  const source = item.source;
  return !(
    !source ||
    [source.branchId, source.resultId, source.notePath, source.contentHash].some(
      value => typeof value !== "string" || !value.trim()
    ) ||
    !Number.isInteger(source.version) ||
    source.version < 1 ||
    !/^[a-f0-9]{64}$/i.test(source.contentHash) ||
    !item.rationale?.trim() ||
    !item.validity?.reason?.trim() ||
    !Array.isArray(item.validity.conditionKeys) ||
    item.validity.conditionKeys.some(key => typeof key !== "string" || !key.trim())
  );
}

/**
 * A freshly planned reuse/update target whose source claim is incomplete becomes new research, as the spec asks for
 * a source that is missing or does not apply. Only the parser of a new plan calls this; saved plans are not changed.
 */
export function researchUnprovenReuse(subtopics: unknown): unknown {
  if (!Array.isArray(subtopics)) return subtopics;
  return (subtopics as unknown[]).map((item: unknown) => {
    if (!item || typeof item !== "object") return item;
    const target = hoistNestedValidity(item as AimResearchTarget);
    if ((target.action !== "reuse" && target.action !== "update") || hasProvenSource(target)) return item;
    const { source: _source, validity: _validity, ...rest } = target;
    return { ...rest, action: "research" };
  });
}

/** Legacy targets remain valid; explicit dependency metadata opts into bounded parallel work. */
export function validateAimResearchPlan(subtopics: unknown): AimResearchPlan {
  if (
    !Array.isArray(subtopics) ||
    subtopics.length > 5 ||
    subtopics.some((item: unknown) => {
      if (!item || typeof item !== "object") return true;
      const fields = item as Record<string, unknown>;
      return ["id", "title", "task", "expectedValue"].some(
        key => typeof fields[key] !== "string" || !fields[key].trim()
      );
    })
  )
    throw new Error("Planner must return 0–5 valid research subtopics before the answer can proceed.");
  const plan = (subtopics as AimResearchPlan).map(hoistNestedValidity);
  const ids = new Set(plan.map(item => item.id));
  if (ids.size !== plan.length || new Set(plan.map(item => item.title.trim().toLowerCase())).size !== plan.length)
    throw new Error("Planner research subtopics must have unique ids and titles.");
  for (const item of plan) {
    if (item.action !== undefined && !["reuse", "update", "research"].includes(item.action))
      throw new Error("Invalid AIM research action.");
    if (
      item.dependsOn !== undefined &&
      (!Array.isArray(item.dependsOn) ||
        new Set(item.dependsOn).size !== item.dependsOn.length ||
        item.dependsOn.some(id => typeof id !== "string" || !ids.has(id) || id === item.id))
    )
      throw new Error("Research dependencies must name distinct existing targets other than themselves.");
    if ((item.action === "reuse" || item.action === "update") && !hasProvenSource(item))
      throw new Error("Reuse and update targets need an exact source, rationale and condition validity assessment.");
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Research dependencies cannot contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of plan.find(item => item.id === id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  return plan;
}
