import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";

export interface AcceptanceTaskVariables {
  outline: string;
  research: string;
  sourceCatalog: string;
  draft: string;
}
/** Task text of `aim.delivery-acceptance`: the final join review of the assembled draft. */
export const renderAcceptanceTask = (variables: AcceptanceTaskVariables): string =>
  renderTemplate(template, { ...variables });
