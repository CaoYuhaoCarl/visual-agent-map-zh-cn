import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";

export function renderInitialClarificationTask(): string {
  return phaseTask("initial-clarification", renderTemplate(task, {}));
}
