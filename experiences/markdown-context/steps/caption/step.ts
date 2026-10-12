import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import template from "./prompt.md";

export interface CaptionInput {
  captionInstruction: string;
  /** Default caption language, used only when the request names none. */
  language: string;
}

/** Writes the caption for an image that was found by search. Not localized. */
export const captionStep: StepDefinition<CaptionInput, string> = {
  id: "markdown.caption",
  version: 1,
  render: ({ captionInstruction, language }) =>
    renderTemplate(template, { captionInstruction: JSON.stringify(captionInstruction), language }),
  parse: raw => raw
};
