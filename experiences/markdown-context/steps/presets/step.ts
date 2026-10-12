import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import type { UiLanguage } from "../../../../i18n";
import condenseEn from "./condense.en.md";
import condenseZh from "./condense.zh.md";
import translateEn from "./translate.en.md";
import translateZh from "./translate.zh.md";
import translateImageEn from "./translate-image.en.md";
import translateImageZh from "./translate-image.zh.md";
import searchImagesEn from "./search-images.en.md";
import searchImagesZh from "./search-images.zh.md";
import explainImageEn from "./explain-image.en.md";
import explainImageZh from "./explain-image.zh.md";

export interface PresetInput {
  language: UiLanguage;
  /** Language name to translate into; only the translate presets take it. */
  target?: string;
}

/**
 * A preset button's instruction. It is shown in the instruction box and then becomes the user request inside the
 * plan step, so it is a step of its own (rendered, never sent by itself) rather than a UI string.
 */
function presetStep(
  id: string,
  zh: string,
  en: string,
  usesTarget: boolean
): StepDefinition<PresetInput, string> {
  return {
    id,
    version: 1,
    render: ({ language, target = "" }) =>
      renderTemplate(language === "zh-TW" ? zh : en, usesTarget ? { target } : {}),
    parse: raw => raw
  };
}

export const condensePresetStep = presetStep("markdown.preset.condense", condenseZh, condenseEn, false);
export const translatePresetStep = presetStep("markdown.preset.translate", translateZh, translateEn, true);
export const translateImagePresetStep = presetStep(
  "markdown.preset.translate-image",
  translateImageZh,
  translateImageEn,
  true
);
export const searchImagesPresetStep = presetStep("markdown.preset.search-images", searchImagesZh, searchImagesEn, false);
export const explainImagePresetStep = presetStep("markdown.preset.explain-image", explainImageZh, explainImageEn, false);
