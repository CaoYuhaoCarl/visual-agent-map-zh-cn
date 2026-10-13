import { App, Modal } from "obsidian";
import { t } from "../../i18n";
import type { ResearchDepth, ResearchMode } from "../../ai/types";
import { modelField, researchDepthField, templateField, type ModelChoices } from "./research-fields";
import { modalActions } from "../../ui/modals/action-bar";

export interface MultiResearchRequest {
  researchMode: ResearchMode;
  researchDepth: ResearchDepth;
  requirements: string;
  /** Model for every started topic (saved on the topic, as single-topic research does); undefined keeps each topic's model. */
  model?: string;
  /** Content template for every started topic (saved on the topic); undefined keeps each topic's template. */
  detailTemplateId?: string;
}

export class MultiResearchModal extends Modal {
  private submitted = false;
  private unwatch?: () => void;

  constructor(
    app: App,
    private names: string[],
    private models: ModelChoices,
    private templates: { id: string; name: string }[],
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
    const depth = researchDepthField(this.contentEl);
    const model = modelField(this.contentEl, this.models, t("ui.multi_research_keep_topic_models"));
    this.unwatch = model.dispose;
    const template = templateField(this.contentEl, this.templates, t("ui.detail_template_keep_each"));
    const webLabel = this.contentEl.createEl("label", { cls: "vam-field vam-next-toggle" });
    const web = webLabel.createEl("input", { type: "checkbox" });
    web.checked = true;
    webLabel.createSpan({ text: t("ui.allow_web_search") });
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
        ...(model.value() ? { model: model.value() } : {}),
        ...(template() ? { detailTemplateId: template() } : {})
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
