import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";

export interface ResearchPlanRepairVars {
  /** The full research-plan task (phase marker included) that produced the malformed reply. */
  planPrompt: string;
  currentQuestion: string;
  currentAnswer: string;
  formatError: string;
  previousResponse: { summary: string; detail: string };
}

export function renderResearchPlanRepairTask(vars: ResearchPlanRepairVars): string {
  return phaseTask(
    "research-plan-repair",
    renderTemplate(task, {
      planPrompt: vars.planPrompt,
      currentQuestion: vars.currentQuestion,
      currentAnswer: vars.currentAnswer,
      formatError: vars.formatError,
      previousResponse: JSON.stringify({
        summary: vars.previousResponse.summary,
        detail: vars.previousResponse.detail.slice(0, 6000)
      })
    })
  );
}
