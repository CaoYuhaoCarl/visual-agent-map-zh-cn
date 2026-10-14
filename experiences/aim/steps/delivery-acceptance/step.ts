import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";
import openItemsTemplate from "./open-items.md";

export interface AcceptanceTaskVariables {
  outline: string;
  research: string;
  sourceCatalog: string;
  draft: string;
  /** Unverified items the conclusion carries for the user to confirm; omitted when there are none. */
  openItems?: string;
}
/** Task text of `aim.delivery-acceptance`: the final join review of the assembled draft. */
export const renderAcceptanceTask = ({ openItems, ...variables }: AcceptanceTaskVariables): string => {
  const task = renderTemplate(template, { ...variables });
  return openItems ? `${task}\n\n${renderTemplate(openItemsTemplate, { openItems })}` : task;
};
