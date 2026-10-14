import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";
import additionalResearch from "./additional-research.md";
import noMappedSource from "./no-mapped-source.md";

export interface WritingTaskVariables {
  outline: string;
  knownConditions: string;
  evidence: string;
  /** The final-document research report, or undefined when the outline needs no search. */
  research?: string;
}
/** Task text of `aim.delivery-writing`: write the whole document in one call, so its sections cannot repeat each other. */
export const renderWritingTask = (variables: WritingTaskVariables): string =>
  renderTemplate(template, {
    outline: variables.outline,
    knownConditions: variables.knownConditions,
    evidence: variables.evidence,
    additionalResearch:
      variables.research === undefined ? "" : renderTemplate(additionalResearch, { research: variables.research })
  });

/** Evidence text of a document that no supplied source is mapped to, while other sources exist. */
export const NO_MAPPED_SOURCE = renderTemplate(noMappedSource, {});
