import { renderTemplate } from "../../../../core/step-runner";
import searchTemplate from "./search.md";
import reviewTemplate from "./review.md";
import targetPart from "./part.target.md";
import unresolvedGapPart from "./part.unresolved-gap.md";

/** Texts of a continued partial branch: one bounded search, then the Planner review of all evidence. */
export interface PartialContinuationSearchVars {
  searcherTargetRule: string;
  /** The Planner's directed target, or the unresolved gap when no target was directed. */
  gap: { kind: "target"; title: string; task: string; expectedValue: string } | { kind: "unresolved"; text: string };
  goal: string;
  question: string;
  answer: string;
  conditions: string;
  lineage: string;
  reportSummary: string;
  reportDetail: string;
}
export function renderPartialContinuationSearchTask(vars: PartialContinuationSearchVars): string {
  const gap =
    vars.gap.kind === "target"
      ? renderTemplate(targetPart, { title: vars.gap.title, task: vars.gap.task, expectedValue: vars.gap.expectedValue })
      : renderTemplate(unresolvedGapPart, { gap: vars.gap.text });
  return renderTemplate(searchTemplate, {
    searcherTargetRule: vars.searcherTargetRule,
    gap,
    goal: vars.goal,
    question: vars.question,
    answer: vars.answer,
    conditions: vars.conditions,
    lineage: vars.lineage,
    reportSummary: vars.reportSummary,
    reportDetail: vars.reportDetail
  });
}

export interface PartialContinuationReviewVars {
  plannerCoverageRule: string;
  floorAskRule: string;
  userQuestionRule: string;
  answeredQuestionCount: number;
  minimumAnswers: number;
  explorationTarget: number;
  questionsAlreadyAsked: readonly string[];
  goal: string;
  question: string;
  answer: string;
  conditions: string;
  lineage: string;
  reportSummary: string;
  reportDetail: string;
}
export function renderPartialContinuationReviewTask(vars: PartialContinuationReviewVars): string {
  return renderTemplate(reviewTemplate, {
    plannerCoverageRule: vars.plannerCoverageRule,
    floorAskRule: vars.floorAskRule,
    userQuestionRule: vars.userQuestionRule,
    answeredQuestionCount: String(vars.answeredQuestionCount),
    minimumAnswers: String(vars.minimumAnswers),
    explorationTarget: String(vars.explorationTarget),
    questionsAlreadyAsked: JSON.stringify(vars.questionsAlreadyAsked),
    goal: vars.goal,
    question: vars.question,
    answer: vars.answer,
    conditions: vars.conditions,
    lineage: vars.lineage,
    reportSummary: vars.reportSummary,
    reportDetail: vars.reportDetail
  });
}
