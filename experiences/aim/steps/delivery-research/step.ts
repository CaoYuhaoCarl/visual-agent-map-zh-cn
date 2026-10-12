import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";

/** Task text of `aim.delivery-research`: search to fill and verify the agreed outline. */
export const renderResearchTask = (outline: string): string => renderTemplate(template, { outline });
