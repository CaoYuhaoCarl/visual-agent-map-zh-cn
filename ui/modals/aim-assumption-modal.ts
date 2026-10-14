import { App, Modal, Setting } from "obsidian";
import { t } from "../../i18n";

/** Picks one assumption of an AIM conclusion and asks for the user's real situation. */
export class AimAssumptionModal extends Modal {
  constructor(
    app: App,
    private assumptions: string[],
    private submit: (assumption: string, correction: string) => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.aim_correct_assumption"));
    this.contentEl.createEl("p", { text: t("ui.aim_correct_assumption_hint"), cls: "vam-modal-intro" });
    const whichLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    whichLabel.createSpan({ text: t("ui.aim_correct_assumption_which") });
    const which = whichLabel.createEl("select");
    for (const assumption of this.assumptions) which.createEl("option", { value: assumption, text: assumption });
    const actualLabel = this.contentEl.createEl("label", { cls: "vam-field" });
    actualLabel.createSpan({ text: t("ui.aim_correct_assumption_actual") });
    const actual = actualLabel.createEl("textarea", { attr: { rows: "3" } });
    new Setting(this.contentEl).addButton(button =>
      button
        .setButtonText(t("ui.aim_correct_assumption_submit"))
        .setCta()
        .onClick(() => {
          if (!actual.value.trim()) {
            actual.focus();
            return;
          }
          this.close();
          this.submit(which.value, actual.value.trim());
        })
    );
    actual.focus();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
