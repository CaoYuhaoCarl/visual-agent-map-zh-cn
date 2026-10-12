import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import userCondition from "./task.user-condition.md";
import belowFloor from "./task.below-floor.md";
import answeredGoal from "./task.answered-goal.md";

interface CorrectionCommon {
  userQuestionRule: string;
  goal: string;
  currentQuestion: string;
  currentAnswer: string;
  conditions: unknown;
  questionHistory: readonly string[];
}

export interface UserConditionReviewVars extends CorrectionCommon {
  rationale: string;
  candidateSummary: string;
  /** The candidate body without its aim-review marker. */
  candidateBody: string;
  candidateGap: { rationale: string; target: unknown };
}

export interface FloorCorrectionVars extends CorrectionCommon {
  answeredQuestionCount: number;
  minimumAnswers: number;
  goalDetail: string;
  /** Lineage with repeated reports removed; an empty value renders as "None.". */
  lineage: string;
  reportSummary: string;
  reportDetail: string;
  candidate: unknown;
}

export type AnsweredGoalReviewVars = Omit<FloorCorrectionVars, "answeredQuestionCount" | "minimumAnswers">;

export function renderUserConditionReviewTask(vars: UserConditionReviewVars): string {
  return phaseTask(
    "decision-quality-review",
    renderTemplate(userCondition, {
      userQuestionRule: vars.userQuestionRule,
      rationale: vars.rationale,
      goal: vars.goal,
      currentQuestion: vars.currentQuestion,
      currentAnswer: vars.currentAnswer,
      conditions: JSON.stringify(vars.conditions),
      questionHistory: JSON.stringify(vars.questionHistory),
      candidateSummary: vars.candidateSummary,
      candidateBody: vars.candidateBody,
      candidateGap: JSON.stringify(vars.candidateGap)
    })
  );
}

function floorVariables(vars: AnsweredGoalReviewVars): Record<string, string> {
  return {
    userQuestionRule: vars.userQuestionRule,
    goal: vars.goal,
    goalDetail: vars.goalDetail,
    conditions: JSON.stringify(vars.conditions),
    currentQuestion: vars.currentQuestion,
    currentAnswer: vars.currentAnswer,
    questionHistory: JSON.stringify(vars.questionHistory),
    earlierAnswers: vars.lineage || "None.",
    reportSummary: vars.reportSummary,
    reportDetail: vars.reportDetail,
    candidate: JSON.stringify(vars.candidate)
  };
}

export function renderBelowFloorReviewTask(vars: FloorCorrectionVars): string {
  return phaseTask(
    "decision-quality-review",
    renderTemplate(belowFloor, {
      ...floorVariables(vars),
      answeredQuestionCount: String(vars.answeredQuestionCount),
      minimumAnswers: String(vars.minimumAnswers)
    })
  );
}

export function renderAnsweredGoalReviewTask(vars: AnsweredGoalReviewVars): string {
  return phaseTask("decision-quality-review", renderTemplate(answeredGoal, floorVariables(vars)));
}
