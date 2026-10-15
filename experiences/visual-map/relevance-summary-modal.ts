import { App, Modal, setIcon } from "obsidian";
import { t } from "../../i18n";
import type { NoteRelevance } from "../../note-values";
import { actionStatus, modalActions } from "../../ui/modals/action-bar";
import { RELEVANCE_LABEL, renderRelevanceTag } from "./relevance-tag";

/** One card whose grade changed in a grading run, in map order. */
export interface RelevanceChangeRow {
  id: string;
  title: string;
  before: NoteRelevance | undefined;
  after: NoteRelevance;
}
export interface RelevanceSummaryHost {
  rows: RelevanceChangeRow[];
  /** Marks the changed cards on the map; an empty list clears the marks. */
  highlight: (ids: string[]) => void;
}

/**
 * Read-only list of what a grading run changed: one row per card with its old tag, its new tag and the reason.
 * The changed cards are marked on the map while the window is open.
 */
export class RelevanceSummaryModal extends Modal {
  constructor(
    app: App,
    private host: RelevanceSummaryHost
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("vam-relevance-summary-modal");
    this.titleEl.setText(t("ui.relevance_changes_title"));
    if (!this.host.rows.length) this.contentEl.createEl("p", { cls: "vam-hint", text: t("ui.relevance_changes_none") });
    else {
      const list = this.contentEl.createEl("ul", { cls: "vam-relevance-changes" });
      list.setAttr("aria-label", t("ui.relevance_changes_title"));
      for (const row of this.host.rows) {
        const item = list.createEl("li", { cls: "vam-relevance-change" });
        item.createDiv({ cls: "vam-relevance-change-title", text: row.title });
        const tags = item.createDiv({ cls: "vam-relevance-change-tags" });
        if (row.before) renderRelevanceTag(tags, row.before.tier, t(RELEVANCE_LABEL[row.before.tier]));
        else tags.createSpan({ cls: "vam-relevance-ungraded", text: t("ui.relevance_ungraded") });
        const arrow = tags.createSpan({ cls: "vam-relevance-arrow" });
        arrow.setAttr("role", "img");
        arrow.setAttr("aria-label", t("ui.relevance_changed_to"));
        setIcon(arrow, "arrow-right");
        renderRelevanceTag(tags, row.after.tier, t(RELEVANCE_LABEL[row.after.tier]));
        item.createEl("p", { cls: "vam-relevance-change-reason", text: row.after.reason });
      }
    }
    const footer = modalActions(this);
    actionStatus(footer);
    const close = footer.createEl("button", { text: t("ui.close") });
    close.addEventListener("click", () => this.close());
    this.host.highlight(this.host.rows.map(row => row.id));
    close.focus();
  }

  onClose(): void {
    this.host.highlight([]);
  }
}
