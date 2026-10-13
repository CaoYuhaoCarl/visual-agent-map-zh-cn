import { App, FuzzySuggestModal, Modal, Notice, TFile } from "obsidian";
import { t } from "../../i18n";
import { parseOutline, type OutlineIssue, type OutlineNode } from "./outline-import";
import type { ResearchDepth } from "../../ai/types";
import { modelField, researchDepthField, templateField, type ModelChoices } from "./research-fields";

/** Where the imported outline goes; omitted means a new mind map. */
export type OutlinePlacement = { kind: "new" } | { kind: "tree" } | { kind: "under"; parentId: string };

/** What the open view offers as an import target, read when the window opens. */
export interface OutlineImportTarget {
  map: "none" | "aim" | "editable";
  selected?: { id: string; title: string };
}

export interface OutlineImportRequest {
  nodes: OutlineNode[];
  placement?: OutlinePlacement;
  source: string | null;
  shallowResearch: boolean;
  /** Shallow research depth (fast when omitted). */
  researchDepth?: ResearchDepth;
  /** Model for the new topics and their shallow research; undefined uses the workspace default. */
  model?: string;
  /**
   * Content template: a new map's default, or recorded on each created topic when importing into an open map; also
   * used by the shallow research. Undefined uses the map/workspace default.
   */
  detailTemplateId?: string;
}

export class OutlineFileModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private choose: (file: TFile) => void
  ) {
    super(app);
    this.setPlaceholder(t("ui.outline_import_choose_file_placeholder"));
  }
  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }
  getItemText(file: TFile): string {
    return file.path;
  }
  onChooseItem(file: TFile): void {
    this.choose(file);
  }
}

export class OutlineImportModal extends Modal {
  private textarea!: HTMLTextAreaElement;
  private preview!: HTMLElement;
  private sourceLabel!: HTMLElement;
  private createButton!: HTMLButtonElement;
  private shallow!: HTMLInputElement;
  private source: string | null = null;
  private sourceText = "";
  private nodes: OutlineNode[] = [];
  private submitting = false;
  private depth: () => ResearchDepth = () => "fast";
  private model: () => string | undefined = () => undefined;
  private template: () => string | undefined = () => undefined;
  private unwatch?: () => void;
  private placement: OutlinePlacement["kind"] = "new";

  constructor(
    app: App,
    private create: (request: OutlineImportRequest) => Promise<void>,
    private models: ModelChoices = { list: () => [], watch: () => () => {} },
    private templates: { id: string; name: string }[] = [],
    private target: OutlineImportTarget = { map: "none" }
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("ui.outline_import"));
    this.contentEl.createEl("p", { text: t("ui.outline_import_hint"), cls: "vam-hint" });
    const actions = this.contentEl.createDiv("vam-outline-actions");
    actions
      .createEl("button", { text: t("ui.outline_import_choose_file") })
      .addEventListener("click", () => new OutlineFileModal(this.app, file => void this.loadFile(file)).open());
    actions.createEl("button", { text: t("ui.outline_import_copy_format") }).addEventListener("click", () => {
      void navigator.clipboard
        .writeText(t("ui.outline_import_format"))
        .then(() => new Notice(t("ui.outline_import_format_copied")))
        .catch(() => new Notice(t("ui.outline_import_copy_failed")));
    });
    this.textarea = this.contentEl.createEl("textarea", { cls: "vam-task-input vam-outline-text" });
    this.textarea.rows = 14;
    this.textarea.setAttr("aria-label", t("ui.outline_import_text_label"));
    this.textarea.addEventListener("input", () => this.refresh());
    this.sourceLabel = this.contentEl.createEl("p", { cls: "vam-hint" });
    this.preview = this.contentEl.createDiv("vam-outline-preview");
    this.placementField();
    const shallowLabel = this.contentEl.createEl("label", { cls: "vam-field vam-next-toggle" });
    this.shallow = shallowLabel.createEl("input", { type: "checkbox" });
    shallowLabel.createSpan({ text: t("ui.outline_import_shallow") });
    const researchOptions = this.contentEl.createDiv("vam-outline-research-options");
    this.depth = researchDepthField(researchOptions);
    const model = modelField(researchOptions, this.models, t("ui.workspace_default"));
    this.model = model.value;
    this.unwatch = model.dispose;
    this.template = templateField(researchOptions, this.templates, t("ui.detail_template_use_workspace"));
    const showOptions = (): void => researchOptions.toggleClass("is-hidden", !this.shallow.checked);
    this.shallow.addEventListener("change", showOptions);
    showOptions();
    this.createButton = this.contentEl.createEl("button", { text: t("ui.outline_import_create"), cls: "mod-cta" });
    this.createButton.addEventListener("click", () => void this.submit());
    this.refresh();
  }

  /** "Put it in": a new map (default), this map as a new tree, or under the selected topic. */
  private placementField(): void {
    const group = this.contentEl.createDiv("vam-field vam-outline-placement");
    group.setAttr("role", "radiogroup");
    group.setAttr("aria-label", t("ui.outline_import_placement"));
    group.createSpan({ text: t("ui.outline_import_placement") });
    const mapReason =
      this.target.map === "aim"
        ? t("ui.outline_import_placement_aim")
        : this.target.map === "none"
          ? t("ui.outline_import_placement_no_map")
          : null;
    const selected = this.target.selected;
    const options: { kind: OutlinePlacement["kind"]; text: string; reason: string | null }[] = [
      { kind: "new", text: t("ui.outline_import_placement_new"), reason: null },
      { kind: "tree", text: t("ui.outline_import_placement_tree"), reason: mapReason },
      {
        kind: "under",
        text: selected
          ? t("ui.outline_import_placement_under_named", selected.title)
          : t("ui.outline_import_placement_under"),
        reason: mapReason ?? (selected ? null : t("ui.outline_import_placement_no_selection"))
      }
    ];
    for (const option of options) {
      const label = group.createEl("label", { cls: "vam-field vam-next-toggle" });
      const input = label.createEl("input", { type: "radio", value: option.kind });
      input.name = "vam-outline-placement";
      input.checked = option.kind === this.placement;
      input.disabled = option.reason !== null;
      input.addEventListener("change", () => {
        if (input.checked) this.placement = option.kind;
      });
      label.createSpan({ text: option.text });
      if (option.reason) group.createEl("p", { text: option.reason, cls: "vam-hint vam-outline-placement-reason" });
    }
  }

  private placementRequest(): OutlinePlacement {
    if (this.placement === "under" && this.target.selected) return { kind: "under", parentId: this.target.selected.id };
    return this.placement === "tree" ? { kind: "tree" } : { kind: "new" };
  }

  onClose(): void {
    this.unwatch?.();
    this.unwatch = undefined;
  }

  async loadFile(file: TFile): Promise<void> {
    const text = await this.app.vault.cachedRead(file);
    this.textarea.value = text;
    this.source = file.path;
    this.sourceText = text;
    this.refresh();
  }

  private issueText(issue: OutlineIssue): string {
    return t(issue.key, ...issue.values);
  }

  private refresh(): void {
    // A source path stays attached only while the text is the file's text.
    if (this.source && this.textarea.value !== this.sourceText) this.source = null;
    this.sourceLabel.setText(this.source ? t("ui.outline_import_source", this.source) : "");
    this.preview.empty();
    const text = this.textarea.value;
    if (!text.trim()) {
      this.nodes = [];
      this.preview.createEl("p", { text: t("ui.outline_import_preview_empty"), cls: "vam-hint" });
      this.createButton.disabled = true;
      return;
    }
    const parse = parseOutline(text);
    this.nodes = parse.errors.length ? [] : parse.nodes;
    for (const issue of parse.errors)
      this.preview.createEl("p", { text: this.issueText(issue), cls: "vam-outline-error" });
    for (const issue of parse.warnings) this.preview.createEl("p", { text: this.issueText(issue), cls: "vam-hint" });
    if (!parse.errors.length) {
      const depth = new Map<number, number>();
      for (const node of parse.nodes) depth.set(node.index, node.parent === null ? 1 : depth.get(node.parent)! + 1);
      this.preview.createEl("p", {
        text: t("ui.outline_import_preview_count", parse.nodes.length, Math.max(...depth.values()))
      });
      const list = this.preview.createDiv("vam-outline-tree");
      for (const node of parse.nodes)
        list
          .createDiv({ cls: `vam-outline-row vam-outline-depth-${Math.min(depth.get(node.index)!, 6)}` })
          .setText(node.title);
    }
    this.createButton.disabled = this.submitting || !!parse.errors.length;
  }

  private async submit(): Promise<void> {
    if (this.submitting || !this.nodes.length) return;
    this.submitting = true;
    this.createButton.disabled = true;
    try {
      const shallowResearch = this.shallow.checked;
      const model = shallowResearch ? this.model() : undefined;
      const detailTemplateId = shallowResearch ? this.template() : undefined;
      await this.create({
        nodes: this.nodes,
        placement: this.placementRequest(),
        source: this.source,
        shallowResearch,
        ...(shallowResearch ? { researchDepth: this.depth() } : {}),
        ...(model ? { model } : {}),
        ...(detailTemplateId ? { detailTemplateId } : {})
      });
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
      this.submitting = false;
      this.refresh();
    }
  }
}
