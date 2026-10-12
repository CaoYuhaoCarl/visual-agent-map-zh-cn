import { renderTemplate } from "../../../../core/step-runner";
import { phaseTask } from "../../manual-flow-support";
import task from "./task.md";
import prerequisites from "./part.prerequisites.md";
import noPrerequisites from "./part.no-prerequisites.md";
import updateSource from "./part.update-source.md";
import rejectedReuse from "./part.rejected-reuse.md";

export interface SubtopicResearchVars {
  searcherTargetRule: string;
  title: string;
  task: string;
  expectedValue: string;
  currentQuestion: string;
  currentAnswer: string;
  otherSubtopics: readonly string[];
  /** Completed prerequisite reports, already joined; empty when the target has none. */
  dependencyReports: string;
  /** Present when an earlier report is being updated. */
  source?: { identity: unknown; conditions: unknown; summary: string; detail: string };
  currentConditions: unknown;
  /** Why copying earlier evidence was rejected; empty when it was not. */
  rejectedReuse: string;
}

export function renderSubtopicResearchTask(vars: SubtopicResearchVars): string {
  const prerequisiteBlock = vars.dependencyReports
    ? renderTemplate(prerequisites, { dependencyReports: vars.dependencyReports })
    : renderTemplate(noPrerequisites, {});
  const sourceBlock = vars.source
    ? "\n\n" +
      renderTemplate(updateSource, {
        sourceIdentity: JSON.stringify(vars.source.identity),
        sourceConditions: JSON.stringify(vars.source.conditions),
        currentConditions: JSON.stringify(vars.currentConditions),
        summary: vars.source.summary,
        detail: vars.source.detail
      })
    : "";
  const rejectedBlock = vars.rejectedReuse ? "\n\n" + renderTemplate(rejectedReuse, { reason: vars.rejectedReuse }) : "";
  return phaseTask(
    "subtopic-research",
    renderTemplate(task, {
      searcherTargetRule: vars.searcherTargetRule,
      title: vars.title,
      task: vars.task,
      expectedValue: vars.expectedValue,
      currentQuestion: vars.currentQuestion,
      currentAnswer: vars.currentAnswer,
      otherSubtopics: vars.otherSubtopics.join("; "),
      prerequisites: prerequisiteBlock,
      updateSource: sourceBlock,
      rejectedReuse: rejectedBlock
    })
  );
}
