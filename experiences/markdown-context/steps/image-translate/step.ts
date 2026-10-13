import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import template from "./prompt.md";

export interface ImageTranslateInput {
  /** Language name the text in the image is translated into. */
  target: string;
}

/** Redraws the attached image with its text translated; the runtime returns the generated image. Not localized. */
export const imageTranslateStep: StepDefinition<ImageTranslateInput, string> = {
  id: "markdown.image-translate",
  version: 1,
  render: ({ target }) => renderTemplate(template, { target }),
  parse: raw => raw
};
