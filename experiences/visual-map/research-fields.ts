import { t } from "../../i18n";
import type { ResearchDepth } from "../../ai/types";

/** Live model choices: the list fills in as model discovery finishes. */
export interface ModelChoices {
  list(): { id: string; label: string }[];
  /** Starts discovery and calls `changed` whenever it updates; returns the unsubscribe function. */
  watch(changed: () => void): () => void;
}

/** Research depth select (fast by default). */
export function researchDepthField(parent: HTMLElement): () => ResearchDepth {
  const label = parent.createEl("label", { cls: "vam-field" });
  label.createSpan({ text: t("ui.research_depth") });
  const depth = label.createEl("select");
  depth.setAttr("aria-label", t("ui.research_depth"));
  depth.createEl("option", { value: "fast", text: t("ui.fast_quick_overview") });
  depth.createEl("option", { value: "normal", text: t("ui.normal_standard_research") });
  depth.createEl("option", { value: "deep", text: t("ui.deep_in_depth_research") });
  depth.value = "fast";
  return () => (depth.value === "deep" ? "deep" : depth.value === "normal" ? "normal" : "fast");
}

/** Model select whose first option (empty value) is `defaultLabel`; returns the chosen model (or undefined) and a dispose function. */
export function modelField(
  parent: HTMLElement,
  models: ModelChoices,
  defaultLabel: string
): { value: () => string | undefined; dispose: () => void } {
  const label = parent.createEl("label", { cls: "vam-field" });
  label.createSpan({ text: t("ui.model") });
  const model = label.createEl("select");
  model.setAttr("aria-label", t("ui.model"));
  const fill = (): void => {
    const selected = model.value;
    model.replaceChildren();
    model.createEl("option", { value: "", text: defaultLabel });
    const choices = models.list();
    for (const option of choices) model.createEl("option", { value: option.id, text: option.label });
    model.value = choices.some(option => option.id === selected) ? selected : "";
  };
  fill();
  const dispose = models.watch(fill);
  return { value: () => model.value || undefined, dispose };
}

/** Content template select whose first option (empty value) is `defaultLabel`; returns the chosen template id, or undefined when that first option is selected. */
export function templateField(
  parent: HTMLElement,
  templates: { id: string; name: string }[],
  defaultLabel: string
): () => string | undefined {
  const label = parent.createEl("label", { cls: "vam-field" });
  label.createSpan({ text: t("ui.detail_template") });
  const select = label.createEl("select");
  select.setAttr("aria-label", t("ui.detail_template"));
  select.createEl("option", { value: "", text: defaultLabel });
  for (const template of templates) select.createEl("option", { value: template.id, text: template.name });
  select.value = "";
  return () => select.value || undefined;
}
