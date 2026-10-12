import { App, Modal } from "obsidian";
import { t } from "../../i18n";
import type { ResearchDepth, ResearchMode } from "../../ai/types";

export interface MultiResearchRequest {
  researchMode: ResearchMode;
  researchDepth: ResearchDepth;
  requirements: string;
  /** Model for every started topic (saved on the topic, as single-topic research does); undefined keeps each topic's model. */
  model?: string;
}

/** Live model choices: the list fills in as model discovery finishes. */
export interface MultiResearchModels {
  list(): { id: string; label: string }[];
  /** Starts discovery and calls `changed` whenever it updates; returns the unsubscribe function. */
  watch(changed: () => void): () => void;
}

export class MultiResearchModal extends Modal {
  private submitted = false;
  private unwatch?: () => void;

  constructor(
    app: App,
    private names: string[],
    private models: MultiResearchModels,
    private submit: (request: MultiResearchRequest) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("ui.multi_research_title"));
    this.contentEl.createEl("p", { text: t("ui.multi_research_intro", this.names.length), cls: "vam-modal-intro" });
    const topics = this.contentEl.createDiv("vam-integration-sources");
    topics.createEl("strong", { text: t("ui.multi_research_topics") });
    for (const name of this.names) topics.createDiv({ text: name });
    const depthLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    depthLabel.createSpan({ text: t("ui.research_depth") });
    const depth = depthLabel.createEl("select");
    depth.setAttr("aria-label", t("ui.research_depth"));
    depth.createEl("option", { value: "fast", text: t("ui.fast_quick_overview") });
    depth.createEl("option", { value: "normal", text: t("ui.normal_standard_research") });
    depth.createEl("option", { value: "deep", text: t("ui.deep_in_depth_research") });
    depth.value = "fast";
    const modelLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    modelLabel.createSpan({ text: t("ui.model") });
    const model = modelLabel.createEl("select");
    model.setAttr("aria-label", t("ui.model"));
    const fillModels = (): void => {
      const selected = model.value;
      model.replaceChildren();
      model.createEl("option", { value: "", text: t("ui.multi_research_keep_topic_models") });
      const choices = this.models.list();
      for (const option of choices) model.createEl("option", { value: option.id, text: option.label });
      model.value = choices.some(option => option.id === selected) ? selected : "";
    };
    fillModels();
    this.unwatch = this.models.watch(fillModels);
    const webLabel = this.contentEl.createEl("label", { cls: "vam-field vam-next-toggle" });
    const web = webLabel.createEl("input", { type: "checkbox" });
    web.checked = true;
    webLabel.createSpan({ text: t("ui.allow_web_search") });
    const requirementsLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    requirementsLabel.createSpan({ text: t("ui.additional_requirements") });
    const requirements = requirementsLabel.createEl("textarea");
    requirements.rows = 3;
    requirements.setAttr("aria-label", t("ui.additional_requirements"));
    const actions = this.contentEl.createDiv("vam-modal-actions");
    const cancel = actions.createEl("button", { text: t("ui.cancel") });
    cancel.addEventListener("click", () => this.close());
    const start = actions.createEl("button", { text: t("ui.multi_research_start"), cls: "mod-cta" });
    start.addEventListener("click", () => {
      if (this.submitted) return;
      this.submitted = true;
      const request: MultiResearchRequest = {
        researchMode: web.checked ? "research" : "local",
        researchDepth: depth.value === "deep" ? "deep" : depth.value === "normal" ? "normal" : "fast",
        requirements: requirements.value.trim(),
        ...(model.value ? { model: model.value } : {})
      };
      this.close();
      this.submit(request);
    });
  }

  onClose(): void {
    this.unwatch?.();
    this.unwatch = undefined;
  }
}
