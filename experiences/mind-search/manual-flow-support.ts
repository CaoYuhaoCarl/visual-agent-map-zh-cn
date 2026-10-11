// Prompt rules, constants and parsers for the Manual AIM flow; moved from manual-flow.ts unchanged.
import type { AiResult, TaskContext } from "../../ai/types";
import type { MapDocument, MapNode, MindSearchBranchRecord } from "../../map-model";
import { type CommitResult } from "../../mindsearch-mve/research-run-store";
import type { CodexWebSearchEvent } from "../../ai/runtime/codex-app-server";
import {
  MINDSEARCH_NO_QUESTION,
  type MindSearchContract,
  type MindSearchDecision
} from "../../ai/mindsearch-contracts";
import { parseMindSearchPlannerReview } from "../../mindsearch-mve/planner-review";
import {
  validateMindSearchResearchPlan,
  type MindSearchResearchPlan,
  type MindSearchResearchTarget
} from "./research-plan";

export const MINDSEARCH_UNKNOWN_OPTION_ID = "__mindsearch_unknown__";
export { MINDSEARCH_NO_QUESTION };
export const MIN_ANSWERED_QUESTIONS_BEFORE_CONCLUSION = 3;
export const PLANNER_COVERAGE_RULE =
  "Before deciding, compare the original topic and current question with the requested outcome and every persisted report. Name the central outcome(s) the user needs, then mark each answered or still open. A relevant side fact does not answer a missing core outcome. If a core outcome is open and one targeted search could plausibly help, choose research_more for that exact gap. Ask_user only for missing user conditions, not missing evidence. If a core outcome remains open at the research-turn limit, keep research_more so the result is saved as partial, not complete.";
export const SEARCHER_TARGET_RULE =
  "Answer the assigned research target first. Treat prior reports and side facts as context, not as a substitute for the target. Do not repeat resolved background facts in place of the requested outcome. If the search does not support the target, say explicitly that the target remains unresolved; do not imply it was answered.";
/** Below the floor more research never substitutes for the missing user input. */
/** Every question goes to the user, so it must be about their goal, not about this workflow. */
export const USER_QUESTION_RULE =
  "A question to the user must be about the original goal, the user's preferences, constraints, resources or situation. Never ask about this tool's workflow, question counts, nodes, branches or research process, and never rephrase an earlier question as a new one.";
export const FLOOR_ASK_RULE =
  "Below the floor, choose research_more only for a material evidence gap in the original goal itself; if the reports already answer the goal, choose ask_user. Never pick research_more to satisfy the floor.";
export const ALL_DECISIONS: readonly MindSearchDecision[] = ["research_more", "ask_user", "conclude"];
export const reviewContract = (decisions: readonly MindSearchDecision[]): MindSearchContract => ({
  kind: "review",
  decisions
});
/** Below the answered-question floor the schema does not offer conclude, so the Planner cannot violate it. */
export const floorDecisions = (answeredQuestionCount: number): readonly MindSearchDecision[] =>
  answeredQuestionCount < MIN_ANSWERED_QUESTIONS_BEFORE_CONCLUSION ? ["research_more", "ask_user"] : ALL_DECISIONS;
export function phaseTask(phase: string, task: string): string {
  return `<!-- mindsearch-phase: ${phase} -->\n${task}`;
}
export function countMindSearchAnsweredQuestions(map: MapDocument, branchId: string | null): number {
  let count = 0,
    current = branchId ? map.mindSearch?.branches.find(branch => branch.id === branchId) : undefined;
  while (current) {
    if (map.nodes.find(node => node.id === current!.questionNodeId)?.mindSearchKind === "question") count++;
    current = current.parentBranchId
      ? map.mindSearch?.branches.find(branch => branch.id === current!.parentBranchId)
      : undefined;
  }
  return count;
}
export const OUTCOME_EXPECTATION_RULE =
  "Use the original goal, known user conditions and outcome preferences. Resolve important contradictions before concluding. Preserve evidence attribution and uncertainty. Do only the current phase; a research report is not the final deliverable.";
export function lineageWithoutRepeatedReports(lineage: string, reportDetail: string): string {
  return lineage
    .split(/\n\n(?=(?:User answer to |Saved research result v))/g)
    .filter(section => {
      if (!section.startsWith("Saved research result ")) return true;
      const report = section.match(/\nReport:\n([\s\S]*)$/)?.[1]?.trim();
      return !report || !reportDetail.includes(report);
    })
    .join("\n\n");
}
export type MindSearchAskModel = (
  context: TaskContext,
  model: string,
  reasoning?: unknown,
  signal?: AbortSignal,
  onWebSearchEvent?: (event: CodexWebSearchEvent) => void
) => Promise<AiResult>;

export type PlannerQuestionResult =
  | { status: "question"; node: MapNode; options: { id: string; label: string }[] }
  | { status: "no-question"; outcome?: ManualResearchResult };
export type ManualResearchResult =
  | { status: "completed" | "partial"; branchId: string; result: CommitResult }
  | { status: "waiting-user"; branchId: string; result: CommitResult; questionNodeId: string }
  | { status: "in-progress" | "stale"; branchId: string };
export type MindSearchPersist = <T>(operation: () => Promise<T>) => Promise<T>;

export type QuestionPlanEntry = {
  fingerprint: string;
  controller: AbortController;
  promise: Promise<PlannerQuestionResult>;
  subscribers: Set<symbol>;
  settled: boolean;
};

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  }
}

export function normalizePersistedAnswerOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options.flatMap((option: unknown) => {
    if (typeof option === "string" && option.trim()) return [option];
    if (option && typeof option === "object" && "value" in option) {
      const value = (option as { value?: unknown }).value;
      if (typeof value === "string" && value.trim()) return [value];
    }
    return [];
  });
}

export function parseMindSearchResearchPlan(result: Pick<AiResult, "detail" | "suggestions">): MindSearchResearchPlan {
  const marked = result.detail.match(/<!--\s*mindsearch-plan\s+([\s\S]*?)\s*-->/);
  const unmarked = marked ? null : result.detail.match(/\{\s*"subtopics"\s*:\s*\[[\s\S]*?\]\s*\}/);
  const payload = marked?.[1] ?? unmarked?.[0];
  let markerError: unknown;
  if (payload) {
    try {
      const raw: unknown = JSON.parse(payload);
      const subtopics = raw && typeof raw === "object" ? (raw as { subtopics?: unknown }).subtopics : undefined;
      return validateMindSearchResearchPlan(subtopics);
    } catch (error) {
      markerError = error; /* Use the provider's structured suggestions below when its detail marker is malformed. */
    }
  }
  const suggestions = result.suggestions;
  if (Array.isArray(suggestions) && suggestions.length >= 1 && suggestions.length <= 5) {
    const plan = suggestions.map((item, index) => {
      const title = typeof item?.title === "string" ? item.title : "";
      const slug =
        title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 32) || "subtopic";
      return { id: `suggestion-${index + 1}-${slug}`, title, task: item?.task, expectedValue: item?.contribution };
    });
    return validateMindSearchResearchPlan(plan);
  }
  // Surface the marker's specific defect so the format repair can correct it.
  if (markerError instanceof Error && !(markerError instanceof SyntaxError)) throw markerError;
  throw new Error("Planner must return 0–5 valid research subtopics before the answer can proceed.");
}

export type PlannerReview = ReturnType<typeof parseMindSearchPlannerReview>;

export type ResearchCandidate = {
  source: NonNullable<MindSearchResearchTarget["source"]>;
  evidenceId: string;
  title: string;
  summary: string;
  detail: string;
  conditions: Record<string, string>;
};
export class ResearchWorkflowInterrupted extends Error {
  constructor(readonly status: "stale" | "in-progress") {
    super(`MindSearch research is ${status}.`);
  }
}
export class ReuseEvidenceRejected extends Error {}

export type PlannerQualityContext = {
  goal: string;
  goalDetail: string;
  conditions: Record<string, string>;
  currentQuestion: string;
  currentAnswer: string;
  answeredQuestionCount: number;
  questionHistory: string[];
  lineage: string;
  reportSummary: string;
  reportDetail: string;
  evidenceIds?: readonly string[];
  deliveryEvidence?: import("./final-delivery").DeliveryEvidence[];
  preclassifiedResearchTarget?: PlannerReview["researchTarget"];
  deliveryRecovery?: MindSearchBranchRecord["deliveryRecovery"];
  saveDeliveryRecovery?: (
    checkpoint: import("./final-delivery").FinalDeliveryCheckpoint,
    phase?: string
  ) => Promise<void>;
  timeoutMs?: number;
  setPhase?: (phase: string) => Promise<void>;
};

export type ResearchGapClassification = { classification: "user_condition" | "external_evidence"; rationale: string };

/** Connects Planner turns, explicit user answers, the existing run store, and existing VAM AI/storage services. */
