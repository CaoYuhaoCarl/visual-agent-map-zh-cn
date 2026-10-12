import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";
import additionalResearch from "./additional-research.md";
import noMappedSource from "./no-mapped-source.md";

export interface WritingTaskVariables {
  heading: string;
  purpose: string;
  outline: string;
  knownConditions: string;
  scopedEvidence: string;
  /** The research report for this section, or undefined when the section needs no search. */
  scopedResearch?: string;
}
/** Task text of `aim.delivery-writing`: write one section from its mapped evidence. */
export const renderWritingTask = (variables: WritingTaskVariables): string =>
  renderTemplate(template, {
    heading: variables.heading,
    purpose: variables.purpose,
    outline: variables.outline,
    knownConditions: variables.knownConditions,
    scopedEvidence: variables.scopedEvidence,
    additionalResearch:
      variables.scopedResearch === undefined ? "" : renderTemplate(additionalResearch, { research: variables.scopedResearch })
  });

/** Evidence text of a section that no supplied source is mapped to, while other sources exist. */
export const NO_MAPPED_SOURCE = renderTemplate(noMappedSource, {});
