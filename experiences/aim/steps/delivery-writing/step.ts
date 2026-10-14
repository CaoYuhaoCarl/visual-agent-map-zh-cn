import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";
import additionalResearch from "./additional-research.md";
import noMappedSource from "./no-mapped-source.md";
import writtenSectionsTemplate from "./written-sections.md";

export interface WritingTaskVariables {
  heading: string;
  purpose: string;
  outline: string;
  knownConditions: string;
  scopedEvidence: string;
  /** The research report for this section, or undefined when the section needs no search. */
  scopedResearch?: string;
  /** Headings and summaries of the sections written before this one; omitted for the first section. */
  writtenSections?: string;
}
/** Task text of `aim.delivery-writing`: write one section from its mapped evidence. */
export const renderWritingTask = (variables: WritingTaskVariables): string => {
  const task = renderTemplate(template, {
    heading: variables.heading,
    purpose: variables.purpose,
    outline: variables.outline,
    knownConditions: variables.knownConditions,
    scopedEvidence: variables.scopedEvidence,
    additionalResearch:
      variables.scopedResearch === undefined
        ? ""
        : renderTemplate(additionalResearch, { research: variables.scopedResearch })
  });
  return variables.writtenSections
    ? `${task}\n\n${renderTemplate(writtenSectionsTemplate, { writtenSections: variables.writtenSections })}`
    : task;
};

/** Evidence text of a section that no supplied source is mapped to, while other sources exist. */
export const NO_MAPPED_SOURCE = renderTemplate(noMappedSource, {});
