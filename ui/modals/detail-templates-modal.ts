import { App, Modal, type Setting } from "obsidian";
import { t } from "../../i18n";
import type { Settings } from "../../repository";
import {
  STANDARD_TEMPLATE_ID,
  copyTemplate,
  standardTemplate,
  validateTemplate,
  withoutConflictingAliases,
  type DetailSection,
  type DetailSectionRole,
  type DetailTemplate,
  type TemplateIssue
} from "../../ai/detail-templates";
import { ChoiceModal } from "./choice-modal";

export interface DetailTemplatesHost {
  settings: Settings;
  saveSettings(): Promise<void>;
}

const same = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
const ROLES: [DetailSectionRole, string][] = [
  ["none", "ui.detail_template_role_none"],
  ["sources", "ui.detail_template_role_sources"],
  ["log", "ui.detail_template_role_log"]
];

/** The default the workspace really resolves to: a missing or stale id means Standard. */
function workspaceDefaultId(settings: Settings): string {
  const id = settings.defaultDetailTemplateId;
  return id && settings.detailTemplates.some(template => template.id === id) ? id : STANDARD_TEMPLATE_ID;
}

function option(select: HTMLSelectElement, value: string, text: string): void {
  select.createEl("option", { value, text });
}

/** Settings row: workspace-default dropdown plus the button that opens the library. */
export function renderDetailTemplatesSetting(
  setting: Setting,
  app: App,
  plugin: DetailTemplatesHost,
  refresh: () => void = () => {}
): void {
  const standard = standardTemplate(plugin.settings.language);
  setting
    .setName(t("ui.detail_templates"))
    .setDesc(t("ui.detail_templates_hint"))
    .addDropdown(dropdown => {
      dropdown.addOption(STANDARD_TEMPLATE_ID, standard.name);
      for (const template of plugin.settings.detailTemplates) dropdown.addOption(template.id, template.name);
      dropdown.setValue(workspaceDefaultId(plugin.settings));
      dropdown.onChange(value => {
        plugin.settings.defaultDetailTemplateId = value === STANDARD_TEMPLATE_ID ? undefined : value;
        void plugin.saveSettings();
      });
    })
    .addButton(button =>
      button
        .setButtonText(t("ui.manage_detail_templates"))
        .onClick(() => new DetailTemplatesModal(app, plugin, refresh).open())
    );
}

export class DetailTemplatesModal extends Modal {
  constructor(
    app: App,
    private plugin: DetailTemplatesHost,
    private onChanged: () => void = () => {}
  ) {
    super(app);
  }

  onClose(): void {
    this.onChanged();
  }

  onOpen(): void {
    this.titleEl.setText(t("ui.detail_templates"));
    this.showList();
  }

  private get settings(): Settings {
    return this.plugin.settings;
  }

  private async persist(): Promise<void> {
    await this.plugin.saveSettings();
  }

  private uniqueName(base: string): string {
    const taken = (name: string) =>
      same(name, standardTemplate(this.settings.language).name) ||
      this.settings.detailTemplates.some(template => same(template.name, name));
    let name = base;
    for (let n = 2; taken(name); n++) name = `${base} ${n}`;
    return name;
  }

  private showList(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: t("ui.detail_templates_hint"), cls: "vam-modal-intro" });
    const defaultId = workspaceDefaultId(this.settings);
    const standard = standardTemplate(this.settings.language);
    for (const template of [standard, ...this.settings.detailTemplates]) {
      const isStandard = template.id === STANDARD_TEMPLATE_ID;
      const row = contentEl.createDiv("vam-template-row");
      const info = row.createDiv("vam-template-info");
      info.createEl("strong", { text: template.name });
      info.createSpan({ text: t("ui.detail_template_sections_0", template.sections.length), cls: "vam-template-meta" });
      const isDefault = template.id === defaultId;
      if (isDefault) info.createSpan({ text: t("ui.detail_template_default_tag"), cls: "vam-template-tag" });
      const actions = row.createDiv("vam-template-actions");
      const button = (label: string, run: () => void | Promise<void>, disabled = false) => {
        const element = actions.createEl("button", { text: label });
        element.disabled = disabled;
        element.addEventListener("click", () => void run());
      };
      if (!isStandard) button(t("ui.detail_template_edit"), () => this.showEditor(template, false));
      button(t("ui.detail_template_copy"), () => this.duplicate(template));
      if (!isStandard) button(t("ui.detail_template_delete"), () => this.confirmDelete(template));
      button(t("ui.detail_template_set_default"), () => this.setDefault(template.id), isDefault);
    }
    const footer = contentEl.createDiv("vam-modal-actions");
    footer.createEl("button", { text: t("ui.detail_template_new"), cls: "mod-cta" }).addEventListener("click", () => {
      const fresh = copyTemplate(
        standardTemplate(this.settings.language),
        this.uniqueName(t("ui.detail_template_new_name")),
        crypto.randomUUID()
      );
      this.showEditor(fresh, true);
    });
  }

  private async duplicate(source: DetailTemplate): Promise<void> {
    const name = this.uniqueName(t("ui.detail_template_copy_name_0", source.name));
    this.settings.detailTemplates.push(copyTemplate(source, name, crypto.randomUUID()));
    await this.persist();
    this.showList();
  }

  private async setDefault(id: string): Promise<void> {
    this.settings.defaultDetailTemplateId = id === STANDARD_TEMPLATE_ID ? undefined : id;
    await this.persist();
    this.showList();
  }

  private confirmDelete(template: DetailTemplate): void {
    new ChoiceModal(this.app, t("ui.detail_template_delete"), t("ui.detail_template_delete_confirm_0", template.name), [
      {
        label: t("ui.detail_template_delete"),
        action: () => {
          void this.remove(template.id);
        }
      }
    ]).open();
  }

  private async remove(id: string): Promise<void> {
    this.settings.detailTemplates = this.settings.detailTemplates.filter(template => template.id !== id);
    if (this.settings.defaultDetailTemplateId === id) this.settings.defaultDetailTemplateId = undefined;
    await this.persist();
    this.showList();
  }

  /** Edits a deep copy; nothing reaches settings until Save, so Cancel discards everything. */
  private showEditor(original: DetailTemplate, isNew: boolean): void {
    const { contentEl } = this;
    const draft = copyTemplate(original, original.name, original.id);
    const baseline = new Map(draft.sections.map(section => [section.id, section.name]));
    const others = this.settings.detailTemplates;
    contentEl.empty();
    const topIssues = contentEl.createDiv("vam-template-issues");
    const nameLabel = contentEl.createEl("label", { cls: "vam-field" });
    nameLabel.createSpan({ text: t("ui.detail_template_name") });
    const name = nameLabel.createEl("input", { type: "text" });
    name.value = draft.name;
    name.setAttr("aria-label", t("ui.detail_template_name"));
    const sectionIssues: HTMLElement[] = [];
    const list = contentEl.createDiv("vam-template-sections");
    const addButton = contentEl.createEl("button", { text: t("ui.detail_section_add") });
    const footer = contentEl.createDiv("vam-modal-actions");
    footer.createEl("button", { text: t("ui.cancel") }).addEventListener("click", () => this.showList());
    const save = footer.createEl("button", { text: t("ui.save"), cls: "mod-cta" });

    const builtInNames = (["en", "zh-TW"] as const).map(language => standardTemplate(language).name);
    const check = (): TemplateIssue[] => {
      const issues = validateTemplate(draft, others);
      const trimmed = draft.name.trim();
      if (trimmed && builtInNames.some(builtIn => same(builtIn, trimmed)))
        issues.push({ key: "ui.detail_template_error_name_taken", values: [trimmed] });
      return issues;
    };
    let saving = false;
    const refresh = () => {
      const issues = check();
      topIssues.empty();
      for (const el of sectionIssues) el.empty();
      for (const issue of issues) {
        const values = issue.values.map(value =>
          issue.key === "ui.detail_template_error_role_taken" && typeof value === "string"
            ? t(value as Parameters<typeof t>[0])
            : value
        );
        const target = issue.section ? sectionIssues[issue.section - 1] : topIssues;
        (target ?? topIssues).createDiv({ text: t(issue.key, ...values), cls: "vam-template-issue" });
      }
      save.disabled = issues.length > 0;
    };
    name.addEventListener("input", () => {
      draft.name = name.value;
      refresh();
    });

    const renderSections = () => {
      list.empty();
      sectionIssues.length = 0;
      draft.sections.forEach((section, index) =>
        this.sectionRow(list, draft, section, index, sectionIssues, refresh, renderSections)
      );
      refresh();
    };
    addButton.addEventListener("click", () => {
      draft.sections.push({ id: crypto.randomUUID(), name: "", description: "", role: "none", aliases: [] });
      renderSections();
    });
    save.addEventListener("click", () => {
      if (saving || check().length) return;
      saving = true;
      save.disabled = true;
      const finished = this.finalize(draft, baseline);
      if (isNew) this.settings.detailTemplates.push(finished);
      else
        this.settings.detailTemplates = this.settings.detailTemplates.map(item =>
          item.id === finished.id ? finished : item
        );
      void this.persist().then(() => this.showList());
    });
    renderSections();
  }

  private sectionRow(
    parent: HTMLElement,
    draft: DetailTemplate,
    section: DetailSection,
    index: number,
    sectionIssues: HTMLElement[],
    refresh: () => void,
    rerender: () => void
  ): void {
    const row = parent.createDiv("vam-template-section");
    const name = row.createEl("input", { type: "text" });
    name.value = section.name;
    name.setAttr("aria-label", t("ui.detail_section_name"));
    name.addEventListener("input", () => {
      section.name = name.value;
      refresh();
    });
    const description = row.createEl("textarea");
    description.rows = 2;
    description.value = section.description;
    description.setAttr("aria-label", t("ui.detail_section_description"));
    description.setAttr("placeholder", t("ui.detail_section_description"));
    description.addEventListener("input", () => {
      section.description = description.value;
      refresh();
    });
    const role = row.createEl("select");
    role.setAttr("aria-label", t("ui.detail_section_role"));
    for (const [value, key] of ROLES) option(role, value, t(key as Parameters<typeof t>[0]));
    role.value = section.role;
    role.addEventListener("change", () => {
      section.role = role.value as DetailSectionRole;
      refresh();
    });
    const mode = row.createEl("select");
    mode.setAttr("aria-label", t("ui.detail_section_count"));
    option(mode, "none", t("ui.detail_section_count_none"));
    option(mode, "exact", t("ui.detail_section_count_exact"));
    option(mode, "min", t("ui.detail_section_count_min"));
    mode.value = section.count?.mode ?? "none";
    mode.addEventListener("change", () => {
      if (mode.value === "none") delete section.count;
      else section.count = { mode: mode.value as "exact" | "min", n: section.count?.n ?? 1 };
      rerender();
    });
    if (section.count) {
      const count = row.createEl("input", { type: "number" });
      count.value = String(section.count.n);
      count.setAttr("min", "1");
      count.setAttr("max", "20");
      count.setAttr("aria-label", t("ui.detail_section_count"));
      count.addEventListener("input", () => {
        if (section.count) section.count.n = Number(count.value);
        refresh();
      });
    }
    const move = (by: number) => {
      const target = index + by;
      [draft.sections[index], draft.sections[target]] = [draft.sections[target], draft.sections[index]];
      rerender();
    };
    const control = (label: string, run: () => void, disabled = false) => {
      const button = row.createEl("button", { text: label });
      button.disabled = disabled;
      button.addEventListener("click", run);
    };
    control(t("ui.detail_section_up"), () => move(-1), index === 0);
    control(t("ui.detail_section_down"), () => move(1), index === draft.sections.length - 1);
    control(t("ui.detail_section_remove"), () => {
      draft.sections.splice(index, 1);
      rerender();
    });
    sectionIssues[index] = row.createDiv("vam-template-issues");
  }

  /**
   * Trims names and remembers earlier section names as aliases so old notes still map to the renamed section; an alias
   * equal to any section's current name is dropped so the name always wins.
   */
  private finalize(draft: DetailTemplate, baseline: Map<string, string>): DetailTemplate {
    return {
      id: draft.id,
      name: draft.name.trim(),
      sections: withoutConflictingAliases(
        draft.sections.map(section => {
          const before = baseline.get(section.id);
          return { ...section, name: section.name.trim(), aliases: [...section.aliases, ...(before ? [before] : [])] };
        })
      )
    };
  }
}
