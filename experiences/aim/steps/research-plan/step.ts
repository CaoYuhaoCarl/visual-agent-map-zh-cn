import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";
import noReports from "./no-reports.md";

export interface ResearchPlanVars {
  /** One rendered card per available ancestor report (already source JSON plus evidence card). */
  reports: readonly string[];
  currentQuestion: string;
  currentAnswer: string;
}

export function renderResearchPlanTask(vars: ResearchPlanVars): string {
  return phaseTask(
    "research-plan",
    renderTemplate(task, {
      reports: vars.reports.join("\n\n") || renderTemplate(noReports, {}),
      currentQuestion: vars.currentQuestion,
      currentAnswer: vars.currentAnswer
    })
  );
}
