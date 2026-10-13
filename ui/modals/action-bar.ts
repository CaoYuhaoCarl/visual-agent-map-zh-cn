import type { Modal } from "obsidian";

/**
 * A fixed action bar below a modal's scrolling content: the content scrolls, the buttons stay in view.
 * Styled by `.vam-review-modal` and `.vam-next-actions` in styles.css.
 */
export function modalActions(modal: Modal): HTMLDivElement {
  modal.modalEl.addClass("vam-review-modal");
  return modal.modalEl.createDiv("vam-next-actions");
}

/** A live status line inside an action bar, for errors and reasons a button is unavailable. */
export function actionStatus(actions: HTMLElement): HTMLSpanElement {
  return actions.createSpan({ cls: "vam-next-actions-note vam-next-status", attr: { "aria-live": "polite" } });
}
