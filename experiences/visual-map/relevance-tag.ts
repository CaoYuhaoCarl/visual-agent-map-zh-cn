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

let tagSeq = 0;
/**
 * The same tag as a real button that changes the tier. It stays out of the tab order until its card has focus (the
 * card's own tool buttons work the same way); `open` gets the button so the menu can open at it.
 */
export function renderRelevanceTagButton(
  parent: HTMLElement,
  tier: RelevanceTier,
  label: string,
  ariaLabel: string,
  open: (button: HTMLButtonElement) => void,
  disabled: boolean
): HTMLButtonElement {
  const tag = parent.createEl("button", { cls: "vam-relevance-tag vam-relevance-tag-button" });
  tag.type = "button";
  tag.dataset.tier = tier;
  tag.tabIndex = -1;
  tag.disabled = disabled;
  // Obsidian's setTooltip writes the tooltip text into aria-label, so the accessible name comes from a hidden span.
  const nameId = `vam-relevance-tag-name-${++tagSeq}`;
  tag.setAttr("aria-label", ariaLabel);
  tag.setAttr("aria-labelledby", nameId);
  tag.setAttr("aria-haspopup", "menu");
  setIcon(tag.createSpan({ cls: "vam-relevance-icon" }), RELEVANCE_ICON[tier]);
  const visible = tag.createSpan({ text: label });
  visible.setAttr("aria-hidden", "true");
  tag.createSpan({ cls: "vam-relevance-tag-name", text: ariaLabel, attr: { id: nameId } });
  tag.addEventListener("click", event => {
    event.stopPropagation();
    if (!tag.disabled) open(tag);
  });
  return tag;
}
