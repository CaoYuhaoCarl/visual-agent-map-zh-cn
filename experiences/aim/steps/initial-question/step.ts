import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";
import savedTerminal from "./task.saved-terminal.md";
import correction from "./task.correction.md";
import motherGoal from "./part.mother-goal.md";

interface QuestionCommon {
  /** Present when the topic differs from the current node. */
  mother?: { title: string; detail: string };
  lineage: string;
}

export interface InitialQuestionVars extends QuestionCommon {
  userQuestionRule: string;
  minimumAnswers: number;
  answeredQuestionCount: number;
  explorationTarget: number;
  currentTopic: { title: string; summary: string; detail: string };
}

export interface SavedTerminalQuestionVars extends InitialQuestionVars {
  savedConditions: unknown;
  knownQuestions: readonly string[];
}

export interface QuestionCorrectionVars extends QuestionCommon {
  answeredQuestionCount: number;
  minimumAnswers: number;
  originalTopic: { title: string; summary: string; detail: string };
  previousQuestions: readonly string[];
}

const motherBlock = (mother: QuestionCommon["mother"]): string =>
  mother
    ? "\n\n" + renderTemplate(motherGoal, { goal: JSON.stringify({ title: mother.title, detail: mother.detail }) })
    : "";
const topicJson = (topic: { title: string; summary: string; detail: string }): string =>
  JSON.stringify({ title: topic.title, summary: topic.summary, detail: topic.detail });
const lineageText = (lineage: string): string => lineage || "None yet.";

function shared(vars: InitialQuestionVars): Record<string, string> {
  return {
    userQuestionRule: vars.userQuestionRule,
    answeredQuestionCount: String(vars.answeredQuestionCount),
    minimumAnswers: String(vars.minimumAnswers),
    explorationTarget: String(vars.explorationTarget),
    currentTopic: topicJson(vars.currentTopic),
    motherGoal: motherBlock(vars.mother),
    lineage: lineageText(vars.lineage)
  };
}

export function renderInitialQuestionTask(vars: InitialQuestionVars): string {
  return phaseTask("initial-question", renderTemplate(task, shared(vars)));
}

export function renderSavedTerminalQuestionTask(vars: SavedTerminalQuestionVars): string {
  return phaseTask(
    "initial-question",
    renderTemplate(savedTerminal, {
      ...shared(vars),
      savedConditions: JSON.stringify(vars.savedConditions),
      knownQuestions: JSON.stringify(vars.knownQuestions)
    })
  );
}

export function renderQuestionCorrectionTask(vars: QuestionCorrectionVars): string {
  return phaseTask(
    "initial-question",
    renderTemplate(correction, {
      answeredQuestionCount: String(vars.answeredQuestionCount),
      minimumAnswers: String(vars.minimumAnswers),
      originalTopic: topicJson(vars.originalTopic),
      motherGoal: motherBlock(vars.mother),
      previousQuestions: JSON.stringify(vars.previousQuestions),
      lineage: lineageText(vars.lineage)
    })
  );
}
