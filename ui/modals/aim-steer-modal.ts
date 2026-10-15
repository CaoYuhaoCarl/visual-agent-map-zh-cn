import { App, Modal, Setting } from "obsidian";
import { t } from "../../i18n";

/** Asks for the direction an AIM run should take from now on. */
export class AimSteerModal extends Modal {
  constructor(
    app: App,
    private submit: (direction: string) => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.aim_steer"));
    this.contentEl.createEl("p", { text: t("ui.aim_steer_hint"), cls: "vam-modal-intro" });
    const label = this.contentEl.createEl("label", { cls: "vam-field" });
    label.createSpan({ text: t("ui.aim_steer_prompt") });
    const direction = label.createEl("textarea", { attr: { rows: "3" } });
    new Setting(this.contentEl).addButton(button =>
      button
        .setButtonText(t("ui.aim_steer_submit"))
        .setCta()
        .onClick(() => {
          if (!direction.value.trim()) {
            direction.focus();
            return;
          }
          this.close();
          this.submit(direction.value.trim());
        })
    );
    direction.focus();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
