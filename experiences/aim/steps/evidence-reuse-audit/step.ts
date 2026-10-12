import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";

export interface EvidenceReuseAuditVars {
  title: string;
  task: string;
  expectedValue: string;
  plannedValidity: { rationale?: string; validity?: unknown };
  sourceIdentity: unknown;
  sourceConditions: unknown;
  currentConditions: unknown;
  currentDate: string;
  summary: string;
  detail: string;
}

export function renderEvidenceReuseAuditTask(vars: EvidenceReuseAuditVars): string {
  return phaseTask(
    "evidence-reuse-audit",
    renderTemplate(task, {
      title: vars.title,
      task: vars.task,
      expectedValue: vars.expectedValue,
      plannedValidity: JSON.stringify(vars.plannedValidity),
      sourceIdentity: JSON.stringify(vars.sourceIdentity),
      sourceConditions: JSON.stringify(vars.sourceConditions),
      currentConditions: JSON.stringify(vars.currentConditions),
      currentDate: vars.currentDate,
      summary: vars.summary,
      detail: vars.detail
    })
  );
}
