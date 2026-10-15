/** What a managed note section or heading reads back as after Repository writes it; readback checks compare against these. */
export const managedSectionValue = (value: string): string => value.trim();
export const managedHeadingValue = (value: string): string => value.replace(/\n/g, " ").trim();

export type RelevanceTier = "core" | "support" | "side";
export interface NoteRelevance {
  tier: RelevanceTier;
  reason: string;
}
const RELEVANCE_TIERS: readonly string[] = ["core", "support", "side"];
/**
 * Offline-graded relevance read from note frontmatter (`relevance-tier`, `relevance-reason`). Both must be valid:
 * anything missing or unrecognised reads as no relevance at all, so the map looks exactly as it did without grading.
 */
export function readRelevance(fm: Record<string, unknown>): NoteRelevance | undefined {
  const tier = fm["relevance-tier"],
    reason = fm["relevance-reason"];
  if (typeof tier !== "string" || !RELEVANCE_TIERS.includes(tier)) return undefined;
  if (typeof reason !== "string" || !reason.trim()) return undefined;
  return { tier: tier as RelevanceTier, reason: reason.trim() };
}
/** The learning goal in the map file's frontmatter (`relevance-goal`); absent or blank reads as none. */
export function readRelevanceGoal(fm: Record<string, unknown>): string | undefined {
  const goal = fm["relevance-goal"];
  return typeof goal === "string" && goal.trim() ? goal.trim() : undefined;
}
/** The longest goal the map accepts (characters). */
export const RELEVANCE_GOAL_MAX_LENGTH = 200;
/** A goal as stored: one line, single spaces, trimmed, at most {@link RELEVANCE_GOAL_MAX_LENGTH} characters. */
export function normalizeRelevanceGoal(value: string): string {
  return [...value.replace(/\s+/g, " ").trim()].slice(0, RELEVANCE_GOAL_MAX_LENGTH).join("").trim();
}
