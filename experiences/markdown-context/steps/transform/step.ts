import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import template from "./prompt.md";
import research from "./research.md";
import diagram from "./diagram.md";
import image from "./image.md";

export interface TransformInput {
  instruction: string;
  selected: string;
  context: string;
  action: string;
  hasImage: boolean;
}

const text = (fragment: string): string => renderTemplate(fragment, {});

/** Applies the planned instruction to the selection (transform, research and diagram actions). Not localized. */
export const transformStep: StepDefinition<TransformInput, string> = {
  id: "markdown.transform",
  version: 1,
  render: ({ instruction, selected, context, action, hasImage }) =>
    renderTemplate(template, {
      instruction: JSON.stringify(instruction),
      selected: JSON.stringify(selected),
      context: JSON.stringify(context),
      research: action === "research" ? text(research) : "",
      diagram: action === "diagram" ? text(diagram) : "",
      image: hasImage ? text(image) : ""
    }),
  parse: raw => raw
};
