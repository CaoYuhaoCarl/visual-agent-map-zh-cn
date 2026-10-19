import { App, Modal } from "obsidian";
import { t } from "../../i18n";
import { descendants, type MapNode } from "../../map-model";
import { actionStatus, modalActions } from "../../ui/modals/action-bar";

/** Why the selection cannot be merged; the first condition that fails, as the i18n key that explains it. */
export type MergeBlock =
  | "ui.merge_needs_two"
  | "ui.merge_ancestor_selected"
  | "ui.merge_needs_same_parent"
  | "ui.merge_missing_note"
  | "ui.merge_busy";

export type MergeEligibility =
  { ok: true; sources: MapNode[]; parentId: string | null } | { ok: false; reason: MergeBlock };

/** Cards in reading order (top to bottom, then left to right). */
export function readingOrder(nodes: MapNode[]): MapNode[] {
  return [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Checks the selected ids against the map in the order users can fix them: enough cards, no card with its own
 * subtopic, one shared parent (or all roots), every note loaded, nothing running. The ancestor check comes before the
 * parent check because a topic and its subtopic never share a parent, so the parent message would hide the real cause.
 */
export function mergeEligibility(input: {
  ids: Iterable<string>;
  nodes: MapNode[];
  hasNote: (id: string) => boolean;
  busy: (node: MapNode) => boolean;
}): MergeEligibility {
  const wanted = new Set(input.ids);
  const picked = input.nodes.filter(node => wanted.has(node.id));
  if (wanted.size < 2 || picked.length < 2 || picked.length !== wanted.size)
    return { ok: false, reason: "ui.merge_needs_two" };
  for (const node of picked)
    if (descendants(input.nodes, node.id).size && picked.some(other => descendants(input.nodes, node.id).has(other.id)))
      return { ok: false, reason: "ui.merge_ancestor_selected" };
  const parentId = picked[0].parentId;
  if (picked.some(node => node.parentId !== parentId)) return { ok: false, reason: "ui.merge_needs_same_parent" };
  if (picked.some(node => !input.hasNote(node.id))) return { ok: false, reason: "ui.merge_missing_note" };
  if (picked.some(node => input.busy(node))) return { ok: false, reason: "ui.merge_busy" };
  return { ok: true, sources: readingOrder(picked), parentId };
}

/** The new note's Detail: each source with content, in order, under `### <title>`; empty sources are skipped. */
export function mergedDetail(sources: { title: string; detail: string }[]): string {
  return sources
    .filter(source => source.detail.trim())
    .map(source => `### ${source.title}\n\n${source.detail.trim()}`)
    .join("\n\n");
}

/** A merged note with any content is completed; an all-empty merge stays an idea. */
export function mergedStatus(detail: string): "completed" | "idea" {
  return detail.trim() ? "completed" : "idea";
}

/** Asks for the merged topic's name and confirms what will happen before any file is touched. */
export class MergeTopicsModal extends Modal {
  constructor(
    app: App,
    private count: number,
    private value: string,
    private submit: (title: string) => void
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.merge_title_label"));
    const input = this.contentEl.createEl("input", { type: "text", value: this.value, cls: "vam-name-input" });
    input.setAttr("aria-label", t("ui.merge_title_label"));
    this.contentEl.createEl("p", { text: t("ui.merge_confirm_desc", this.count), cls: "vam-merge-desc" });
    const actions = modalActions(this);
    const status = actionStatus(actions);
    actions.createEl("button", { text: t("ui.cancel") }).addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: t("ui.merge_confirm"), cls: "mod-warning" });
    const save = (): void => {
      const value = input.value.trim();
      if (!value) return;
      this.close();
      this.submit(value);
    };
    const check = (): void => {
      const empty = !input.value.trim();
      confirm.disabled = empty;
      status.setText(empty ? t("ui.name_required") : "");
    };
    input.addEventListener("input", check);
    input.addEventListener("keydown", event => {
      // Enter while an input method is composing only confirms the characters.
      if (event.key === "Enter" && !event.isComposing) save();
    });
    confirm.addEventListener("click", save);
    check();
    input.focus();
    input.select();
  }
}
