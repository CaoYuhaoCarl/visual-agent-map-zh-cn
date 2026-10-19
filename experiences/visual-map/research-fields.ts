import { t } from "../../i18n";
import type { ResearchDepth } from "../../ai/types";

/** Live model choices: the list fills in as model discovery finishes. */
export interface ModelChoices {
  list(): { id: string; label: string }[];
  /** Starts discovery and calls `changed` whenever it updates; returns the unsubscribe function. */
  watch(changed: () => void): () => void;
}

/** Today's standard depth for every research dialog; a dialog passes `initial` only for a deliberate exception. */
export const DEFAULT_RESEARCH_DEPTH: ResearchDepth = "normal";

/** What each depth searches and how it answers, shown under the depth choice. */
export function researchDepthDescription(depth: ResearchDepth): string {
  const description =
    depth === "fast"
      ? t("ui.quick_aim_for_up_to_1_web_search_and_2_main_sources_answer_t")
      : depth === "deep"
        ? t("ui.deep_aim_for_up_to_6_web_searches_and_10_main_sources_compar")
        : t("ui.standard_aim_for_up_to_3_web_searches_and_5_main_sources_sum");
  return `${description} ${t("ui.web_and_image_searches_share_the_search_limit_search_counts")}`;
}

let depthGroup = 0;

/**
 * The one research-depth choice: Quick / Standard / Deep as a radio group with the chosen depth's description below.
 * Checked and focused state are JS-toggled classes (`is-checked`, `is-focused`), so the stylesheet needs no :has().
 */
export function researchDepthField(
  parent: HTMLElement,
  options: { initial?: ResearchDepth; onChange?: (depth: ResearchDepth) => void } = {}
): { value: () => ResearchDepth; set: (depth: ResearchDepth) => void } {
  const fieldset = parent.createEl("fieldset", { cls: "vam-next-depth-set" });
  fieldset.createEl("legend", { text: t("ui.research_depth") });
  const group = `vam-depth-${++depthGroup}`;
  const row = fieldset.createDiv("vam-next-depths");
  const hint = fieldset.createEl("p", { cls: "vam-hint", attr: { "aria-live": "polite" } });
  const radios = new Map<ResearchDepth, { input: HTMLInputElement; label: HTMLElement }>();
  const paint = (): void => {
    for (const { input, label } of radios.values()) label.toggleClass("is-checked", input.checked);
  };
  const value = (): ResearchDepth => [...radios].find(([, item]) => item.input.checked)?.[0] ?? DEFAULT_RESEARCH_DEPTH;
  const set = (depth: ResearchDepth): void => {
    for (const [key, item] of radios) item.input.checked = key === depth;
    hint.setText(researchDepthDescription(depth));
    paint();
  };
  for (const [depth, key] of [
    ["fast", "ui.quick"],
    ["normal", "ui.standard"],
    ["deep", "ui.deep"]
  ] as const) {
    const label = row.createEl("label");
    const input = label.createEl("input", { type: "radio", value: depth, attr: { name: group } });
    label.createSpan({ text: t(key) });
    radios.set(depth, { input, label });
    input.addEventListener("change", () => {
      if (!input.checked) return;
      set(depth);
      options.onChange?.(depth);
    });
    input.addEventListener("focus", () => label.addClass("is-focused"));
    input.addEventListener("blur", () => label.removeClass("is-focused"));
  }
  set(options.initial ?? DEFAULT_RESEARCH_DEPTH);
  return { value, set };
}

/**
 * A field whose label row can carry a small link (edit, fix). A div, not a label: the link must not become the label's
 * control, so each select keeps its own aria-label.
 */
export function linkedField(parent: HTMLElement, label: string): { field: HTMLDivElement; head: HTMLDivElement } {
  const field = parent.createDiv("vam-field");
  const head = field.createDiv("vam-field-head");
  head.createSpan({ text: label });
  return { field, head };
}

export function fieldLink(head: HTMLElement, text: string, run: () => void): void {
  const link = head.createEl("button", { text, cls: "vam-field-link" });
  link.type = "button";
  link.addEventListener("click", event => {
    event.preventDefault();
    run();
  });
}

/**
 * Model select whose first option (empty value) is `defaultLabel`; returns the chosen model (or undefined) and a dispose
 * function. With `repair`, a "Fix connection…" link beside it checks the chosen model's AI service.
 */
export function modelField(
  parent: HTMLElement,
  models: ModelChoices,
  defaultLabel: string,
  repair?: (model: string | undefined) => void
): { value: () => string | undefined; set: (id: string | undefined) => void; dispose: () => void } {
  const { field, head } = linkedField(parent, t("ui.model"));
  const model = field.createEl("select");
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
  if (repair) fieldLink(head, t("ui.connection_repair"), () => repair(model.value || undefined));
  const dispose = models.watch(fill);
  return {
    value: () => model.value || undefined,
    // A model that is not (yet) in the list stays selected as an extra option, so a restored choice is not lost.
    set: id => {
      if (id && !Array.from(model.children).some(option => (option as HTMLOptionElement).value === id))
        model.createEl("option", { value: id, text: id });
      model.value = id ?? "";
    },
    dispose
  };
}

/**
 * Content template select whose first option (empty value) is `defaultLabel`; returns the chosen template id, or
 * undefined when that first option is selected. With `manage`, an edit link beside it opens the template library;
 * `templates` is updated in place.
 */
export function templateField(
  parent: HTMLElement,
  templates: { id: string; name: string }[],
  defaultLabel: string,
  manage?: ManageChoices,
  /** Runs after the list was refreshed, so a summary that names the template stays current. */
  changed: () => void = () => {}
): (() => string | undefined) & { set: (id: string | undefined) => void } {
  const { field, head } = linkedField(parent, t("ui.detail_template"));
  const select = field.createEl("select");
  select.setAttr("aria-label", t("ui.detail_template"));
  const fill = (): void => {
    const selected = select.value;
    select.replaceChildren();
    select.createEl("option", { value: "", text: defaultLabel });
    for (const template of templates) select.createEl("option", { value: template.id, text: template.name });
    select.value = templates.some(template => template.id === selected) ? selected : "";
  };
  fill();
  if (manage)
    fieldLink(head, t("ui.template_edit"), () =>
      manage(select.value || undefined, next => {
        templates.splice(0, templates.length, ...next);
        fill();
        changed();
      })
    );
  const read = (): string | undefined => select.value || undefined;
  return Object.assign(read, {
    set: (id: string | undefined): void => {
      select.value = id && templates.some(template => template.id === id) ? id : "";
    }
  });
}

/** Opens a library (tones, templates) at `selected` when given, and reports the refreshed list once it closes. */
export type ManageChoices = (
  selected: string | undefined,
  refreshed: (choices: { id: string; name: string }[]) => void
) => void;
export type ManageTones = ManageChoices;
/** The small links a research dialog can show beside its model and template fields. */
export interface FieldLinks {
  repair?: (model: string | undefined) => void;
  manageTemplates?: ManageChoices;
}

/**
 * Writing tone select whose first option (empty value) is `defaultLabel`; returns the chosen preset id, or undefined when
 * that first option is selected. With `manage`, an edit link beside it opens the tone library; `tones` is updated in place.
 */
export function toneField(
  parent: HTMLElement,
  tones: { id: string; name: string }[],
  defaultLabel: string,
  manage?: ManageTones,
  /** Runs after the list was refreshed, so a summary that names the tone stays current. */
  changed: () => void = () => {}
): () => string | undefined {
  const { field, head } = linkedField(parent, t("ui.tone"));
  const select = field.createEl("select");
  select.setAttr("aria-label", t("ui.tone"));
  const fill = (): void => {
    const selected = select.value;
    select.replaceChildren();
    select.createEl("option", { value: "", text: defaultLabel });
    for (const tone of tones) select.createEl("option", { value: tone.id, text: tone.name });
    select.value = tones.some(tone => tone.id === selected) ? selected : "";
  };
  fill();
  if (manage)
    fieldLink(head, t("ui.tone_edit"), () =>
      manage(select.value || undefined, next => {
        tones.splice(0, tones.length, ...next);
        fill();
        changed();
      })
    );
  return () => select.value || undefined;
}
