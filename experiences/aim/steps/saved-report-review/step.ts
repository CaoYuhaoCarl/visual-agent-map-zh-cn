import { renderTemplate } from "../../../../core/step-runner";
import reviewTemplate from "./review.md";
import followupSearchTemplate from "./followup-search.md";

/** Texts of the Planner review of saved Searcher reports of a failed attempt, and its one bounded follow-up search. */
export interface SavedReportReviewVars {
  plannerCoverageRule: string;
  floorAskRule: string;
  userQuestionRule: string;
  answeredQuestionCount: number;
  minimumAnswers: number;
  explorationTarget: number;
  goal: string;
  question: string;
  answerDescription: string;
  conditions: string;
  lineage: string;
  questionHistory: readonly string[];
  reportSummary: string;
  reportDetail: string;
}
export function renderSavedReportReviewTask(vars: SavedReportReviewVars): string {
  return renderTemplate(reviewTemplate, {
    plannerCoverageRule: vars.plannerCoverageRule,
    floorAskRule: vars.floorAskRule,
    userQuestionRule: vars.userQuestionRule,
    answeredQuestionCount: String(vars.answeredQuestionCount),
    minimumAnswers: String(vars.minimumAnswers),
    explorationTarget: String(vars.explorationTarget),
    goal: vars.goal,
    question: vars.question,
    answerDescription: vars.answerDescription,
    conditions: vars.conditions,
    lineage: vars.lineage,
    questionHistory: JSON.stringify(vars.questionHistory),
    reportSummary: vars.reportSummary,
    reportDetail: vars.reportDetail
  });
}

export interface SavedReportFollowupVars {
  searcherTargetRule: string;
  title: string;
  task: string;
  expectedValue: string;
  question: string;
  answerDescription: string;
  reportDetail: string;
}
export const renderSavedReportFollowupSearchTask = (vars: SavedReportFollowupVars): string =>
  renderTemplate(followupSearchTemplate, { ...vars });
