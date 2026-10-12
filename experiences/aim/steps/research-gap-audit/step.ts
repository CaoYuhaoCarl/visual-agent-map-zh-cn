import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";
import targetOnly from "./part.target-only.md";
import candidate from "./part.candidate.md";

export interface ResearchGapAuditVars {
  goal: string;
  currentQuestion: string;
  currentAnswer: string;
  conditions: unknown;
  /** Reconciliation form: only the unchanged assigned target is shown. */
  targetOnly: boolean;
  reportSummary: string;
  candidateGap: { rationale: string; target: unknown; summary: string };
  researchTarget: unknown;
}

export function renderResearchGapAuditTask(vars: ResearchGapAuditVars): string {
  const scope = vars.targetOnly
    ? renderTemplate(targetOnly, { target: JSON.stringify(vars.researchTarget) })
    : renderTemplate(candidate, {
        reportSummary: vars.reportSummary,
        candidateGap: JSON.stringify(vars.candidateGap)
      });
  return phaseTask(
    "research-gap-audit",
    renderTemplate(task, {
      goal: vars.goal,
      currentQuestion: vars.currentQuestion,
      currentAnswer: vars.currentAnswer,
      conditions: JSON.stringify(vars.conditions),
      scope
    })
  );
}
