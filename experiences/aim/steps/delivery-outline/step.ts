import { renderTemplate } from "../../../../core/step-runner";
import template from "./task.md";

/** Task text of `aim.delivery-outline`: design the document, mapping sections to the supplied evidence. */
export const renderOutlineTask = (sourceCatalog: string): string => renderTemplate(template, { sourceCatalog });
