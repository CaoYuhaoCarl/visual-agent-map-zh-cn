import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";
import reusedEvidence from "./reused-evidence.md";

/** Task text of `aim.delivery-research`: search to fill and verify the agreed outline. */
export const renderResearchTask = (outline: string): string => renderTemplate(template, { outline });

/** Stored research result when the outline asks for no new search: the marker plus the instruction to use the supplied evidence. */
export const REUSED_RESEARCH_DETAIL = renderTemplate(reusedEvidence, {});
