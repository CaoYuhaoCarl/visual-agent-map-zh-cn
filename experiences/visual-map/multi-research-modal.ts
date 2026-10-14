import { App, Modal } from "obsidian";
import { t } from "../../i18n";
import type { ResearchDepth, ResearchMode } from "../../ai/types";
import { modelField, researchDepthField, templateField, toneField, type ModelChoices } from "./research-fields";
import { modalActions } from "../../ui/modals/action-bar";

export interface MultiResearchRequest {
  researchMode: ResearchMode;
  researchDepth: ResearchDepth;
  requirements: string;
  /** Search for image references; only meaningful with web search. */
  imageSearch: boolean;
  /** Model for every started topic (saved on the topic, as single-topic research does); undefined keeps each topic's model. */
  model?: string;
  /** Content template for every started topic (saved on the topic); undefined keeps each topic's template. */
  detailTemplateId?: string;
  /** Writing tone for every started topic (saved on the topic); undefined keeps each topic's tone. */
  toneId?: string;
}

export class MultiResearchModal extends Modal {
  private submitted = false;
  private unwatch?: () => void;

  constructor(
    app: App,
    private names: string[],
    private models: ModelChoices,
    private templates: { id: string; name: string }[],
    private submit: (request: MultiResearchRequest) => void,
    private tones: { id: string; name: string }[] = []
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("ui.multi_research_title"));
    this.contentEl.createEl("p", { text: t("ui.multi_research_intro", this.names.length), cls: "vam-modal-intro" });
    const topics = this.contentEl.createDiv("vam-integration-sources");
    topics.createEl("strong", { text: t("ui.multi_research_topics") });
    for (const name of this.names) topics.createDiv({ text: name });
    const depth = researchDepthField(this.contentEl);
    const model = modelField(this.contentEl, this.models, t("ui.multi_research_keep_topic_models"));
    this.unwatch = model.dispose;
    const template = templateField(this.contentEl, this.templates, t("ui.detail_template_keep_each"));
    const tone = toneField(this.contentEl, this.tones, t("ui.tone_keep_each"));
    const webLabel = this.contentEl.createEl("label", { cls: "vam-field vam-next-toggle" });
    const web = webLabel.createEl("input", { type: "checkbox" });
    web.checked = true;
    webLabel.createSpan({ text: t("ui.allow_web_search") });
    const imageLabel = this.contentEl.createEl("label", { cls: "vam-field vam-next-toggle" });
    const images = imageLabel.createEl("input", { type: "checkbox" });
    images.checked = true;
    imageLabel.createSpan({ text: t("ui.search_for_image_references") });
    web.addEventListener("change", () => {
      images.disabled = !web.checked;
      if (!web.checked) images.checked = false;
    });
    const requirementsLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    requirementsLabel.createSpan({ text: t("ui.additional_requirements") });
    const requirements = requirementsLabel.createEl("textarea");
    requirements.rows = 3;
    requirements.setAttr("aria-label", t("ui.additional_requirements"));
    const actions = modalActions(this);
    const cancel = actions.createEl("button", { text: t("ui.cancel") });
    cancel.addEventListener("click", () => this.close());
    const start = actions.createEl("button", {
      text: t("ui.multi_research_start_0", this.names.length),
      cls: "mod-cta"
    });
    start.addEventListener("click", () => {
      if (this.submitted) return;
      this.submitted = true;
      const request: MultiResearchRequest = {
        researchMode: web.checked ? "research" : "local",
        researchDepth: depth(),
        requirements: requirements.value.trim(),
        imageSearch: web.checked && images.checked,
        ...(model.value() ? { model: model.value() } : {}),
        ...(template() ? { detailTemplateId: template() } : {}),
        ...(tone() ? { toneId: tone() } : {})
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
