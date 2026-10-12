import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";

export interface ReportReviewVars {
  plannerCoverageRule: string;
  userQuestionRule: string;
  floorAskRule: string;
  answeredQuestionCount: number;
  minimumAnswers: number;
  explorationTarget: number;
  questionsAlreadyAsked: readonly string[];
  currentQuestion: string;
  currentAnswer: string;
  researchTurn: number;
  maxResearchTurns: number;
}

export function renderReportReviewTask(vars: ReportReviewVars): string {
  return phaseTask(
    "report-review",
    renderTemplate(task, {
      plannerCoverageRule: vars.plannerCoverageRule,
      userQuestionRule: vars.userQuestionRule,
      floorAskRule: vars.floorAskRule,
      answeredQuestionCount: String(vars.answeredQuestionCount),
      minimumAnswers: String(vars.minimumAnswers),
      explorationTarget: String(vars.explorationTarget),
      questionsAlreadyAsked: JSON.stringify(vars.questionsAlreadyAsked),
      currentQuestion: vars.currentQuestion,
      currentAnswer: vars.currentAnswer,
      researchTurn: String(vars.researchTurn),
      maxResearchTurns: String(vars.maxResearchTurns)
    })
  );
}
