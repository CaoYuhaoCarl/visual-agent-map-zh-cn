import { setIcon } from "obsidian";
import type { TranslationKey } from "../../i18n";
import type { RelevanceTier } from "../../note-values";

export const RELEVANCE_ICON: Record<RelevanceTier, string> = {
  core: "target",
  support: "library",
  side: "skip-forward"
};
export const RELEVANCE_LABEL: Record<RelevanceTier, TranslationKey> = {
  core: "ui.relevance_core",
  support: "ui.relevance_support",
  side: "ui.relevance_side"
};

/** The quiet icon + text tag used on cards and in the grading summary. */
export function renderRelevanceTag(parent: HTMLElement, tier: RelevanceTier, label: string): HTMLSpanElement {
  const tag = parent.createSpan({ cls: "vam-relevance-tag" });
  tag.dataset.tier = tier;
  setIcon(tag.createSpan({ cls: "vam-relevance-icon" }), RELEVANCE_ICON[tier]);
  tag.createSpan({ text: label });
  return tag;
}
