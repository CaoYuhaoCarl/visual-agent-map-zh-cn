import { App, Modal, Setting } from "obsidian";
import { t } from "../../i18n";
import { modalActions } from "./action-bar";

export interface Choice {
  label: string;
  description?: string;
  buttonLabel?: string;
  /** Destructive: styled as a warning so it never looks like the safe default. */
  warning?: boolean;
  action: () => void;
}

export class ChoiceModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private description: string,
    private choices: Choice[]
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(this.titleText);
    this.contentEl.createEl("p", { text: this.description, cls: "vam-modal-intro" });
    for (const choice of this.choices) {
      const setting = new Setting(this.contentEl);
      const run = (): void => {
        this.close();
        choice.action();
      };
      if (choice.description)
        setting
          .setName(choice.label)
          .setDesc(choice.description)
          .addButton(b => {
            b.setButtonText(choice.buttonLabel ?? t("ui.select")).onClick(run);
            if (choice.warning) b.setDestructive();
          });
      else
        setting.addButton(b => {
          b.setButtonText(choice.label).onClick(run);
          if (choice.warning) b.setDestructive();
        });
    }
    const cancel = modalActions(this).createEl("button", { text: t("ui.cancel") });
    cancel.addEventListener("click", () => this.close());
    // Start on Cancel, so a stray Enter never runs a choice, least of all a destructive one.
    cancel.focus();
  }
}
