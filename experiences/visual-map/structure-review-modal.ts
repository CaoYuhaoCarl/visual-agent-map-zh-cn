import { App, Modal } from "obsidian";
import { t } from "../../i18n";
import { actionStatus, modalActions } from "../../ui/modals/action-bar";
import { renderProposalList, type ProposalItem, type ProposalKind } from "./modals";
import type {
  StructureReviewResult,
  StructureSuggestion,
  StructureSuggestionKind
} from "../../core/structure-review-service";

/** The message of any thrown value; errors may come from another realm, so no instanceof check. */
const messageOf = (error: unknown): string => {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(error);
};

/** What the review window needs from the open map. Nothing on the map changes until `apply` is called. */
export interface StructureReviewHost {
  /** Whole map (root card) or one branch (a subtopic). */
  scope: "map" | "branch";
  /** Runs the review (asking about AI usage first); rejects with a readable reason. */
  review: (signal: AbortSignal) => Promise<StructureReviewResult>;
  /** The card's title on the map today. */
  titleOf: (id: string) => string;
  /** Why the suggestion can no longer be applied, or null when it still matches the map. */
  staleReason: (suggestion: StructureSuggestion) => string | null;
  /** Applies one suggestion as one undoable change; false when the user cancelled its confirmation. */
  apply: (suggestion: StructureSuggestion, title: string) => Promise<boolean>;
  /** Marks the suggested cards on the map; an empty list clears the marks. */
  highlight: (ids: string[]) => void;
}

const KIND: Record<StructureSuggestionKind, ProposalKind> = {
  strengthen: "add",
  reduce: "remove",
  move: "move",
  merge: "merge"
};

/**
 * AI structure review of the map or a branch. The AI reads titles, summaries and status only; each suggestion is
 * applied on its own, a stale one is refused with its reason, and closing the window clears the card highlights.
 */
export class StructureReviewModal extends Modal {
  private controller?: AbortController;
  private closed = false;
  private entries: { suggestion: StructureSuggestion; applied: boolean }[] = [];

  constructor(
    app: App,
    private host: StructureReviewHost
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("vam-structure-review-modal");
    this.titleEl.setText(t(this.host.scope === "map" ? "ui.structure_review_map" : "ui.structure_review_branch"));
    this.contentEl.createEl("p", { cls: "vam-modal-intro", text: t("ui.structure_review_intro") });
    const result = this.contentEl.createDiv("vam-structure-review-result");
    const footer = modalActions(this);
    const status = actionStatus(footer);
    const close = footer.createEl("button", { text: t("ui.close") });
    close.addEventListener("click", () => this.close());
    const start = footer.createEl("button", { text: t("ui.structure_review_start"), cls: "mod-cta" });
    start.addEventListener("click", () => {
      if (this.controller) {
        this.controller.abort();
        return;
      }
      const controller = new AbortController();
      this.controller = controller;
      start.setText(t("ui.cancel"));
      start.removeClass("mod-cta");
      status.setText(t("ui.structure_review_running"));
      void this.host
        .review(controller.signal)
        .then(review => {
          if (this.closed || controller.signal.aborted) return;
          status.setText("");
          start.remove();
          this.showSuggestions(result, review);
        })
        .catch(error => {
          if (this.closed) return;
          status.setText(controller.signal.aborted ? t("ui.structure_review_cancelled") : messageOf(error));
          start.setText(t("ui.structure_review_start"));
          start.addClass("mod-cta");
        })
        .finally(() => {
          if (this.controller === controller) this.controller = undefined;
        });
    });
    // Start on Close, so an Enter that opened the window cannot start a review.
    close.focus();
  }

  onClose(): void {
    this.closed = true;
    this.controller?.abort();
    this.controller = undefined;
    this.host.highlight([]);
  }

  private targets(): string[] {
    return this.entries
      .filter(entry => !entry.applied && !this.host.staleReason(entry.suggestion))
      .flatMap(({ suggestion }) => [
        suggestion.targetId,
        ...(suggestion.newParentId ? [suggestion.newParentId] : []),
        ...(suggestion.mergeIntoId ? [suggestion.mergeIntoId] : [])
      ]);
  }

  private showSuggestions(parent: HTMLElement, review: StructureReviewResult): void {
    parent.empty();
    if (review.rejected.length)
      parent.createEl("p", { cls: "vam-hint", text: t("ui.structure_review_rejected_0", review.rejected.length) });
    if (!review.suggestions.length) {
      parent.createEl("p", { cls: "vam-hint", text: t("ui.structure_review_none") });
      return;
    }
    parent.createEl("p", { cls: "vam-hint", text: t("ui.structure_review_apply_hint") });
    this.entries = review.suggestions.map(suggestion => ({ suggestion, applied: false }));
    const refreshers: (() => void)[] = [];
    const refreshAll = (): void => {
      for (const refresh of refreshers) refresh();
      this.host.highlight(this.targets());
    };
    const items: ProposalItem[] = review.suggestions.map(suggestion => {
      const destination =
        suggestion.kind === "strengthen"
          ? suggestion.targetId
          : suggestion.kind === "move"
            ? suggestion.newParentId
            : suggestion.kind === "merge"
              ? suggestion.mergeIntoId
              : undefined;
      return {
        kind: KIND[suggestion.kind],
        title: suggestion.kind === "strengthen" ? (suggestion.title ?? "") : this.host.titleOf(suggestion.targetId),
        task: "",
        contribution: "",
        reason: suggestion.reason,
        ...(destination ? { destination: this.host.titleOf(destination) } : {})
      };
    });
    let index = 0;
    renderProposalList(parent, items, () => {}, {
      compact: true,
      apply: (_item, row) => {
        const entry = this.entries[index++];
        const button = row.head.createEl("button", {
          text: t("ui.structure_review_apply"),
          cls: "vam-structure-apply"
        });
        const note = row.element.createEl("p", { cls: "vam-structure-note", attr: { "aria-live": "polite" } });
        let busy = false;
        let message = "";
        const refresh = (): void => {
          const stale = entry.applied ? null : this.host.staleReason(entry.suggestion);
          row.element.toggleClass("is-applied", entry.applied);
          row.element.toggleClass("is-stale", !!stale);
          button.disabled = busy || entry.applied || !!stale;
          button.setText(t(entry.applied ? "ui.structure_review_applied" : "ui.structure_review_apply"));
          row.title.readOnly = entry.applied || entry.suggestion.kind !== "strengthen";
          note.setText(stale ?? message);
        };
        refreshers.push(refresh);
        refresh();
        button.addEventListener("click", () => {
          if (busy || entry.applied) return;
          const stale = this.host.staleReason(entry.suggestion);
          if (stale) {
            refreshAll();
            return;
          }
          const title = row.title.value.trim();
          if (entry.suggestion.kind === "strengthen" && !title) {
            message = t("ui.structure_review_title_required");
            refresh();
            return;
          }
          busy = true;
          refresh();
          void this.host
            .apply(entry.suggestion, title)
            .then(applied => {
              entry.applied = applied;
              message = applied ? t("ui.structure_review_applied_note") : "";
            })
            .catch(error => {
              message = messageOf(error);
            })
            .finally(() => {
              busy = false;
              if (!this.closed) refreshAll();
            });
        });
      }
    });
    refreshAll();
  }
}
