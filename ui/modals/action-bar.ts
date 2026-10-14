import type { Modal } from "obsidian";
import { t } from "../../i18n";

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

/**
 * A discard button that asks once more: the first press arms it for five seconds and explains that the
 * work cannot be recovered; only a second press runs `discard`. Returns a function that cancels the timer.
 */
export function armDiscard(
  button: HTMLButtonElement,
  status: HTMLElement,
  discard: () => void,
  blocked: () => boolean = () => false,
  labels: { confirm: string; hint: string } = { confirm: t("ui.discard_confirm"), hint: t("ui.discard_confirm_hint") }
): () => void {
  const label = button.textContent ?? "";
  let timer = 0;
  const disarm = (): void => {
    window.clearTimeout(timer);
    timer = 0;
    button.setText(label);
    button.removeClass("mod-warning");
  };
  button.addEventListener("click", () => {
    if (blocked()) return;
    if (timer) {
      disarm();
      discard();
      return;
    }
    timer = window.setTimeout(() => {
      disarm();
      status.setText("");
    }, 5000);
    button.setText(labels.confirm);
    button.addClass("mod-warning");
    status.setText(labels.hint);
  });
  return disarm;
}
