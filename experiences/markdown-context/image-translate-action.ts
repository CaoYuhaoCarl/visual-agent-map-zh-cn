import { Component, MarkdownView, Notice, setIcon, type App, type TFile } from "obsidian";
import { getUiLanguage, SUPPORTED_LANGUAGES, t, type UiLanguage } from "../../i18n";
import { prepareStep, type PreparedStep } from "../../core/step-runner";
import { imageTranslateStep } from "./steps/image-translate/step";

export interface ImageTranslateOptions {
  model: () => string;
  run: <Input, Output>(
    prepared: PreparedStep<Input, Output>,
    model: string,
    signal: AbortSignal,
    image?: HTMLImageElement,
    webSearch?: boolean,
    generateImage?: boolean
  ) => Promise<string>;
  /** Saves a generated image as an attachment of `notePath`; returns its vault path. */
  saveImage: (dataUrl: string, notePath: string, name: string) => Promise<string>;
}

interface ImageTarget {
  view: MarkdownView;
  path: string;
  image: HTMLImageElement;
  /** The image's Markdown embed when it appears exactly once in the note; replacing needs it. */
  token: string | null;
}

type Placement = "replace" | "new";

/**
 * Clicking an image in a note shows one action: make a translated version of the image. The person picks a
 * language and whether the new image replaces the embed or goes below it; the result is written directly.
 */
export class ImageTranslateAction extends Component {
  private pill: HTMLButtonElement | null = null;
  private popover: HTMLElement | null = null;
  private target: ImageTarget | null = null;
  private running: AbortController | null = null;
  private language: UiLanguage | null = null;

  constructor(
    private readonly app: App,
    private readonly options: ImageTranslateOptions
  ) {
    super();
  }

  onload(): void {
    this.registerDomEvent(document, "pointerdown", event => {
      const inside = event.target instanceof Element && event.target.closest(".vam-image-action");
      if (!inside) this.hide();
    });
    this.registerDomEvent(document, "scroll", () => this.hide(), true);
    this.registerDomEvent(window, "resize", () => this.hide());
    this.registerDomEvent(document, "keydown", event => {
      if (event.key === "Escape" && (this.pill || this.popover)) this.hide();
    });
  }

  onunload(): void {
    this.hide();
  }

  /** Shows the action beside `image`; a translation already in progress keeps running in the background. */
  show(view: MarkdownView, image: HTMLImageElement, token: string | null): void {
    if (!view.file) return;
    this.hide();
    this.target = { view, path: view.file.path, image, token };
    const rect = image.getBoundingClientRect();
    const pill = this.app.workspace.containerEl.createEl("button", { cls: "vam-image-action vam-image-action-pill" });
    setIcon(pill.createSpan({ cls: "vam-image-action-icon" }), "wand-sparkles");
    pill.createSpan({ text: t("ui.image_translate_action") });
    pill.addEventListener("click", () => this.openPopover());
    this.pill = pill;
    this.place(pill, rect.right - 8, rect.top + 8, "right");
  }

  private hide(): void {
    this.pill?.remove();
    this.pill = null;
    this.popover?.remove();
    this.popover = null;
  }

  /** Fixed position near a point, kept inside the window; `align` says which edge the point marks. */
  private place(element: HTMLElement, x: number, y: number, align: "left" | "right"): void {
    const width = element.offsetWidth || 220;
    const height = element.offsetHeight || 40;
    const left = align === "right" ? x - width : x;
    element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  }

  private openPopover(): void {
    const target = this.target;
    const pill = this.pill;
    if (!target || !pill) return;
    const anchor = pill.getBoundingClientRect();
    pill.remove();
    this.pill = null;
    const popover = this.app.workspace.containerEl.createDiv({ cls: "vam-image-action vam-image-action-popover" });
    popover.setAttribute("role", "dialog");
    const titleId = `vam-image-action-title-${Date.now()}`;
    popover.setAttribute("aria-labelledby", titleId);
    this.popover = popover;
    const header = popover.createDiv({ cls: "vam-image-action-header" });
    header.createEl("strong", { text: t("ui.image_translate_action"), attr: { id: titleId } });
    const close = header.createEl("button", { cls: "clickable-icon" });
    close.setAttribute("aria-label", t("ui.close"));
    setIcon(close, "x");
    close.addEventListener("click", () => this.hide());

    const field = popover.createEl("label", { cls: "vam-image-action-field" });
    field.createSpan({ text: t("ui.image_translate_language") });
    const select = field.createEl("select", { cls: "dropdown" });
    for (const option of SUPPORTED_LANGUAGES) select.createEl("option", { value: option.id, text: option.label });
    select.value = this.language ?? getUiLanguage();

    const status = popover.createDiv({ cls: "vam-image-action-status" });
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = popover.createDiv({ cls: "vam-image-action-buttons" });
    const replace = actions.createEl("button", { text: t("ui.image_translate_replace") });
    const add = actions.createEl("button", { text: t("ui.image_translate_new"), cls: "mod-cta" });
    if (!target.token) {
      // Replacing needs the one embed this image came from; without it only a new image can be added.
      replace.disabled = true;
      status.setText(t("ui.image_translate_replace_unavailable"));
    }
    if (this.running) this.showRunning(status, actions);
    const start = (placement: Placement): void => {
      this.language = select.value as UiLanguage;
      void this.translate(target, this.language, placement, status, actions);
    };
    replace.addEventListener("click", () => start("replace"));
    add.addEventListener("click", () => start("new"));
    this.place(popover, anchor.right, anchor.top, "right");
    select.focus();
  }

  private showRunning(status: HTMLElement, actions: HTMLElement): void {
    status.setText(t("ui.image_translate_running"));
    status.addClass("is-running");
    actions.empty();
    actions.createEl("button", { text: t("ui.context_ai_stop") }).addEventListener("click", () => {
      this.running?.abort();
      this.hide();
    });
  }

  private async translate(
    target: ImageTarget,
    language: UiLanguage,
    placement: Placement,
    status: HTMLElement,
    actions: HTMLElement
  ): Promise<void> {
    if (this.running) return;
    const controller = new AbortController();
    this.running = controller;
    this.showRunning(status, actions);
    const name = SUPPORTED_LANGUAGES.find(item => item.id === language)?.name ?? language;
    let saved: TFile | null = null;
    try {
      const dataUrl = await this.options.run(
        prepareStep(imageTranslateStep, { target: name }),
        this.options.model(),
        controller.signal,
        target.image,
        false,
        true
      );
      if (controller.signal.aborted) return;
      if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(dataUrl))
        throw new Error(t("ui.context_ai_image_not_generated"));
      // Name after the original without its extension or an earlier language suffix, so names do not pile up.
      const languages = SUPPORTED_LANGUAGES.map(item => item.id.replace(/[-]/g, "\\-")).join("|");
      const base = (target.image.alt || "image")
        .replace(/\.(?:png|jpe?g|gif|webp)$/i, "")
        .replace(new RegExp(`-(?:${languages})(?:[ -]\\d+)?$`), "")
        .replace(/[^\p{L}\p{N}_-]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      const path = await this.options.saveImage(dataUrl, target.path, `${base || "image"}-${language}`);
      saved = this.app.vault.getFileByPath(path);
      const note = this.app.vault.getFileByPath(target.path);
      if (!saved || !note) throw new Error(t("ui.context_ai_note_changed"));
      const link = this.app.fileManager.generateMarkdownLink(saved, target.path);
      const embed = link.startsWith("!") ? link : `!${link}`;
      const outcome = await this.write(target, note, embed, placement);
      new Notice(t(outcome, saved.path));
      saved = null;
    } catch (error) {
      if (!controller.signal.aborted) new Notice(error instanceof Error ? error.message : String(error));
      // The image was saved but could not be placed: do not leave an unused file behind.
      if (saved) await this.app.fileManager.trashFile(saved);
    } finally {
      if (this.running === controller) this.running = null;
      if (status.isConnected) this.hide();
    }
  }

  /**
   * Places the embed where the original image is now (the person may have edited meanwhile). In an open editor the
   * change is one undoable edit; otherwise the file is updated. Falls back to the end of the note.
   */
  private async write(
    target: ImageTarget,
    note: TFile,
    embed: string,
    placement: Placement
  ): Promise<"ui.image_translate_replaced" | "ui.image_translate_added" | "ui.image_translate_appended"> {
    let outcome: "ui.image_translate_replaced" | "ui.image_translate_added" | "ui.image_translate_appended" =
      "ui.image_translate_appended";
    const edit = (text: string): string => {
      const token = target.token;
      const at = token ? text.indexOf(token) : -1;
      const unique = !!token && at >= 0 && text.indexOf(token, at + token.length) < 0;
      if (unique && placement === "replace") {
        outcome = "ui.image_translate_replaced";
        return `${text.slice(0, at)}${embed}${text.slice(at + token.length)}`;
      }
      if (unique) {
        outcome = "ui.image_translate_added";
        const lineEnd = text.indexOf("\n", at + token.length);
        const end = lineEnd < 0 ? text.length : lineEnd;
        return `${text.slice(0, end)}\n\n${embed}${text.slice(end)}`;
      }
      outcome = "ui.image_translate_appended";
      return `${text.replace(/\s*$/, "")}\n\n${embed}\n`;
    };
    const open = this.app.workspace
      .getLeavesOfType("markdown")
      .map(leaf => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === note.path);
    if (open) {
      const editor = open.editor;
      const before = editor.getValue();
      const after = edit(before);
      // Replace only the changed span so the edit stays small and undoable.
      let start = 0;
      while (start < before.length && before[start] === after[start]) start++;
      let endBefore = before.length,
        endAfter = after.length;
      while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
        endBefore--;
        endAfter--;
      }
      editor.replaceRange(after.slice(start, endAfter), editor.offsetToPos(start), editor.offsetToPos(endBefore));
    } else await this.app.vault.process(note, edit);
    return outcome;
  }
}
