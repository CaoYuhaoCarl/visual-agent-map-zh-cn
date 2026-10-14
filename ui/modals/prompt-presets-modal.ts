import { App, Modal, type Setting } from "obsidian";
import { t } from "../../i18n";
import { actionStatus, armDiscard, modalActions } from "./action-bar";
import type { Settings } from "../../repository";
import {
  createPreset,
  deletePreset,
  duplicatePreset,
  isBuiltinPreset,
  listPresets,
  updatePreset,
  type PromptPresetKind
} from "../../ai/prompt-presets";

export interface PromptPresetsHost {
  settings: Settings;
  saveSettings(): Promise<void>;
}

/** Settings row: a short description and the button that opens the tone library. */
export function renderTonePresetsSetting(
  setting: Setting,
  app: App,
  plugin: PromptPresetsHost,
  refresh: () => void = () => {}
): void {
  setting
    .setName(t("ui.tone_presets"))
    .setDesc(t("ui.tone_presets_hint"))
    .addButton(button =>
      button
        .setButtonText(t("ui.tone_presets_manage"))
        .onClick(() => new PromptPresetsModal(app, plugin, "tone", refresh).open())
    );
}

/**
 * The preset library for one kind: built-ins (view, duplicate) and custom presets (edit, rename, duplicate, delete).
 * Only `tone` has a settings entry today; the outline generator reuses this modal for `outline`.
 */
export class PromptPresetsModal extends Modal {
  private bar?: HTMLDivElement;
  private disarms: (() => void)[] = [];

  constructor(
    app: App,
    private plugin: PromptPresetsHost,
    private kind: PromptPresetKind = "tone",
    private onChanged: () => void = () => {},
    /** Opens straight into this preset (edit, or view for a built-in), as from a dialog's tone picker. */
    private initialId?: string
  ) {
    super(app);
  }

  private actionBar(): HTMLDivElement {
    this.bar?.remove();
    this.bar = modalActions(this);
    return this.bar;
  }

  private disarmAll(): void {
    for (const disarm of this.disarms) disarm();
    this.disarms = [];
  }

  onClose(): void {
    this.disarmAll();
    this.onChanged();
  }

  onOpen(): void {
    this.titleEl.setText(t("ui.tone_presets"));
    if (this.initialId) this.showEditor(this.initialId);
    else this.showList();
  }

  private get custom() {
    return this.plugin.settings.promptPresets ?? [];
  }

  private async persist(presets: ReturnType<typeof deletePreset>): Promise<void> {
    this.plugin.settings.promptPresets = presets;
    await this.plugin.saveSettings();
  }

  private showList(): void {
    this.disarmAll();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: t("ui.tone_presets_hint"), cls: "vam-modal-intro" });
    const footer = this.actionBar();
    const status = actionStatus(footer);
    for (const preset of listPresets(this.custom, this.kind, this.plugin.settings.language)) {
      const builtin = isBuiltinPreset(preset.id);
      const row = contentEl.createDiv("vam-template-row");
      const info = row.createDiv("vam-template-info");
      info.createEl("strong", { text: preset.name });
      if (builtin) info.createSpan({ text: t("ui.preset_builtin_tag"), cls: "vam-template-tag" });
      const actions = row.createDiv("vam-template-actions");
      const button = (label: string, run: () => void | Promise<void>): HTMLButtonElement => {
        const element = actions.createEl("button", { text: label });
        element.addEventListener("click", () => void run());
        return element;
      };
      button(t(builtin ? "ui.preset_view" : "ui.preset_edit"), () => this.showEditor(preset.id));
      button(t("ui.preset_copy"), () => this.duplicate(preset.id));
      if (!builtin) {
        const remove = actions.createEl("button", { text: t("ui.preset_delete"), cls: "vam-danger-text" });
        this.disarms.push(
          armDiscard(
            remove,
            status,
            () => {
              void this.remove(preset.id);
            },
            () => false,
            { confirm: t("ui.preset_delete_confirm"), hint: t("ui.preset_delete_hint") }
          )
        );
      }
    }
    footer.createEl("button", { text: t("ui.close") }).addEventListener("click", () => this.close());
    footer.createEl("button", { text: t("ui.tone_presets_new"), cls: "mod-cta" }).addEventListener("click", () => {
      void this.create();
    });
  }

  private async create(): Promise<void> {
    const { presets, created } = createPreset(this.custom, {
      kind: this.kind,
      name: t("ui.tone_presets_new_name"),
      text: ""
    });
    if (!created) return;
    await this.persist(presets);
    this.showEditor(created.id);
  }

  private async duplicate(id: string): Promise<void> {
    const { presets, created } = duplicatePreset(this.custom, id, this.plugin.settings.language);
    if (!created) return;
    await this.persist(presets);
    this.showList();
  }

  private async remove(id: string): Promise<void> {
    await this.persist(deletePreset(this.custom, id));
    this.showList();
  }

  /** Edits one preset; built-ins open read-only. Nothing is written until Save, so Cancel discards the edit. */
  private showEditor(id: string): void {
    this.disarmAll();
    const preset = listPresets(this.custom, this.kind, this.plugin.settings.language).find(item => item.id === id);
    if (!preset) {
      this.showList();
      return;
    }
    const readOnly = isBuiltinPreset(id);
    const { contentEl } = this;
    contentEl.empty();
    const nameLabel = contentEl.createEl("label", { cls: "vam-field" });
    nameLabel.createSpan({ text: t("ui.tone_preset_name") });
    const name = nameLabel.createEl("input", { type: "text" });
    name.value = preset.name;
    name.disabled = readOnly;
    name.setAttr("aria-label", t("ui.tone_preset_name"));
    const textLabel = contentEl.createEl("label", { cls: "vam-field" });
    textLabel.createSpan({ text: t("ui.tone_preset_text") });
    const text = textLabel.createEl("textarea");
    text.rows = 10;
    text.value = preset.text;
    text.disabled = readOnly;
    text.setAttr("aria-label", t("ui.tone_preset_text"));
    text.setAttr("placeholder", t("ui.tone_preset_text_placeholder"));
    const footer = this.actionBar();
    const status = actionStatus(footer);
    footer
      .createEl("button", { text: t(readOnly ? "ui.close" : "ui.cancel") })
      .addEventListener("click", () => this.showList());
    if (readOnly) return;
    const save = footer.createEl("button", { text: t("ui.save"), cls: "mod-cta" });
    const check = (): void => {
      save.disabled = !name.value.trim();
      status.setText(save.disabled ? t("ui.preset_name_required") : "");
    };
    name.addEventListener("input", check);
    save.addEventListener("click", () => {
      if (!name.value.trim()) return;
      save.disabled = true;
      void this.persist(updatePreset(this.custom, id, { name: name.value, text: text.value })).then(() =>
        this.showList()
      );
    });
    check();
  }
}
