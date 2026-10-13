import { App, FuzzySuggestModal, Modal, Notice, TFile } from "obsidian";
import { t } from "../../i18n";
import { parseOutline, type OutlineIssue, type OutlineNode } from "./outline-import";

export interface OutlineImportRequest {
  nodes: OutlineNode[];
  source: string | null;
  shallowResearch: boolean;
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

  constructor(
    app: App,
    private create: (request: OutlineImportRequest) => Promise<void>
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
    const shallowLabel = this.contentEl.createEl("label", { cls: "vam-field vam-next-toggle" });
    this.shallow = shallowLabel.createEl("input", { type: "checkbox" });
    shallowLabel.createSpan({ text: t("ui.outline_import_shallow") });
    this.createButton = this.contentEl.createEl("button", { text: t("ui.outline_import_create"), cls: "mod-cta" });
    this.createButton.addEventListener("click", () => void this.submit());
    this.refresh();
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
      await this.create({ nodes: this.nodes, source: this.source, shallowResearch: this.shallow.checked });
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
      this.submitting = false;
      this.refresh();
    }
  }
}
