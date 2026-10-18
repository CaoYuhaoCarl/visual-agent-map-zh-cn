import { translate, uiLocale } from "../i18n";
import type { AiTaskServiceOptions } from "./ai-task-service";
import { providerStepRunner, type ProviderStepRunner } from "./provider-step-runner";
import { prepareStep } from "./step-runner";
import {
  gradableNodes,
  parseRelevanceGrade,
  RELEVANCE_GOAL_MAX_LENGTH,
  RELEVANCE_GRADE_SCHEMA,
  RELEVANCE_GRADE_TOKEN_BUDGET,
  RELEVANCE_REPAIR_MAX_ROUNDS,
  RelevanceGradeError,
  relevanceGradeRepairStep,
  relevanceGradeStep,
  relevanceHierarchyViolations,
  type RelevanceGradeItem,
  type RelevanceGradeRequest,
  type RelevanceGradeResult,
  type RelevanceHierarchyFailure
} from "./steps/relevance-grade/step";

export {
  gradableNodes,
  parseRelevanceGrade,
  RELEVANCE_GOAL_MAX_LENGTH,
  RELEVANCE_GRADE_SCHEMA,
  RELEVANCE_GRADE_TOKEN_BUDGET,
  RELEVANCE_REPAIR_MAX_ROUNDS,
  RelevanceGradeError,
  relevanceGradeRepairStep,
  relevanceHierarchyViolations
};
export type { RelevanceGradeItem, RelevanceGradeRequest, RelevanceGradeResult };
/** A card whose grade a run changed (or set for the first time), with the values needed to undo or redo it. */
export interface RelevanceGradeChange {
  id: string;
  path: string;
  title: string;
  before: { tier: RelevanceGradeItem["tier"]; reason: string; manual?: true } | undefined;
  after: { tier: RelevanceGradeItem["tier"]; reason: string };
}
export interface RelevanceGradeOutcome {
  /** Cards graded successfully, changed or not. */
  graded: number;
  changes: RelevanceGradeChange[];
  /** Cards left alone because they were deleted, renamed or moved while the AI worked. */
  skipped: number;
  /** Cards whose note could not be written. */
  failed: number;
}
/**
 * The one grading run a map can have at a time. It lives on the plugin, keyed by map path, so a second view of the
 * same map cannot start another; the view that started it only displays it and aborts it when it closes.
 */
export interface RelevanceGradeRun {
  token: number;
  owner: object;
  controller: AbortController;
  goal: string;
  status: "running" | "stopped" | "failed" | "declined" | "done";
  /** Localized reason shown in the status bar for stopped, failed and declined runs. */
  message?: string;
  outcome?: RelevanceGradeOutcome;
  /** True once the notes are being written; Stop no longer applies because nothing can be half-applied. */
  writing?: boolean;
  /** True while the AI usage notice is waiting for the user's answer; the map stays locked but nothing is being graded yet. */
  awaitingUsage?: boolean;
  /** True while a repair request (parent-child order, at most two rounds) is in flight. */
  repairing?: boolean;
  /** The history entry that undoes this run, so the status bar only offers Undo while it is still the latest. */
  historyEntry?: object;
}
/** Runs the grade step, and once more the repair step (whose request extends the grade request). */
export type RelevanceGradeRunner = ProviderStepRunner<RelevanceGradeRequest, RelevanceGradeResult>;
export interface RelevanceGradeHooks {
  /** Called just before each repair request is sent (at most {@link RELEVANCE_REPAIR_MAX_ROUNDS} times); `round` starts at 1. */
  onRepair?: (round: number) => void;
}

export function buildRelevanceGradePrompt(request: RelevanceGradeRequest): string {
  return relevanceGradeStep.render(request);
}
export function providerRelevanceGradeRunner(
  options: AiTaskServiceOptions,
  activeTasks: Map<string, AbortController>
): RelevanceGradeRunner {
  return providerStepRunner<RelevanceGradeRequest, RelevanceGradeResult>(options, activeTasks, {
    name: "relevance-grade",
    topic: request => `Relevance grade · ${request.goal.trim().slice(0, 80)}`,
    stopped: () => new RelevanceGradeError("stopped", "Relevance grading stopped")
  });
}
export class RelevanceGradeService {
  constructor(private readonly run: RelevanceGradeRunner) {}
  /**
   * Grade a map against a goal. Throws {@link RelevanceGradeError} (localized message, `code` for the reason) for a map
   * with nothing to grade, an over-budget map, a stop, or any reply that is not exactly one valid grade per card.
   * When a reply fails ONLY because cards rank above their parent, a repair request lists those pairs (with each
   * card's ancestor chain) and asks for a complete corrected reply. Every repair goes through the same strict parser;
   * if it fails only on hierarchy again, a second and last round repairs the latest reply. Any other failure, or a
   * hierarchy failure after the last round, fails the whole grade with a plain message (ids only in `detail`).
   */
  async grade(
    request: RelevanceGradeRequest,
    signal: AbortSignal,
    hooks: RelevanceGradeHooks = {}
  ): Promise<RelevanceGradeResult> {
    const stopped = (): RelevanceGradeError =>
      new RelevanceGradeError("stopped", translate(uiLocale(request.language), "error.relevance_grade_stopped"));
    if (signal.aborted) throw stopped();
    const prepared = prepareStep(relevanceGradeStep, request);
    let raw: string;
    try {
      raw = await this.run(request, signal, prepared);
    } catch (error) {
      if (signal.aborted && !(error instanceof RelevanceGradeError)) throw stopped();
      if (error instanceof RelevanceGradeError && error.code === "stopped") throw stopped();
      if (error instanceof RelevanceGradeError && error.hierarchy && !signal.aborted)
        return this.repair(request, signal, hooks, error.hierarchy, stopped);
      throw error;
    }
    if (signal.aborted) throw stopped();
    try {
      return prepared.parse(raw);
    } catch (error) {
      if (error instanceof RelevanceGradeError && error.hierarchy)
        return this.repair(request, signal, hooks, error.hierarchy, stopped);
      throw error;
    }
  }
  private async repair(
    request: RelevanceGradeRequest,
    signal: AbortSignal,
    hooks: RelevanceGradeHooks,
    first: RelevanceHierarchyFailure,
    stopped: () => RelevanceGradeError
  ): Promise<RelevanceGradeResult> {
    let failure = first;
    for (let round = 1; ; round++) {
      // Rendered and budget-checked before anything is shown or sent: an over-budget repair is refused.
      const prepared = prepareStep(relevanceGradeRepairStep, {
        ...request,
        previousReply: failure.reply,
        violations: failure.violations
      });
      if (signal.aborted) throw stopped();
      hooks.onRepair?.(round);
      let raw: string;
      try {
        raw = await this.run(request, signal, prepared);
      } catch (error) {
        if (signal.aborted) throw stopped();
        if (error instanceof RelevanceGradeError && error.code === "stopped") throw stopped();
        throw error;
      }
      if (signal.aborted) throw stopped();
      try {
        return prepared.parse(raw);
      } catch (error) {
        if (!(error instanceof RelevanceGradeError) || !error.hierarchy) throw error;
        if (round >= RELEVANCE_REPAIR_MAX_ROUNDS)
          throw new RelevanceGradeError(
            "invalid",
            translate(uiLocale(request.language), "error.relevance_grade_hierarchy"),
            undefined,
            error.message
          );
        failure = error.hierarchy;
      }
    }
  }
}
