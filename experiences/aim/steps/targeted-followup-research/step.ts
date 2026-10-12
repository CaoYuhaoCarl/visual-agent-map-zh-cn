import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";

export interface TargetedFollowupResearchVars {
  searcherTargetRule: string;
  title: string;
  task: string;
  expectedValue: string;
  currentQuestion: string;
  currentAnswer: string;
}

export function renderTargetedFollowupResearchTask(vars: TargetedFollowupResearchVars): string {
  return phaseTask("targeted-followup-research", renderTemplate(task, { ...vars }));
}
