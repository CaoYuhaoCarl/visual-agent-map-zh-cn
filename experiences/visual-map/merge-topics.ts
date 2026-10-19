import { App, Modal } from "obsidian";
import { t } from "../../i18n";
import { descendants, inheritModel, type MapNode } from "../../map-model";
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

/** Whether any source has Detail text: the same test as `mergedStatus`, so AI is offered exactly when there is content. */
export function hasMergeContent(notes: ({ detail?: string } | undefined)[]): boolean {
  return notes.some(note => (note?.detail ?? "").trim() !== "");
}

/** The merged topic's model: its parent's model when there is a parent (like a new subtopic), else the workspace model. */
export function resolveMergeModel(parentModel: string | undefined, workspaceModel: string): string {
  return inheritModel(parentModel, workspaceModel);
}

/** The longest merged-topic name the AI may choose; a longer one is not a name, so the first source's title is used. */
export const MERGE_TITLE_MAX = 60;

/**
 * The merged topic's name from the same AI reply as the merge: the title of its first suggestion, one line and without
 * wrapping quotes. A missing, blank or over-long title falls back to `fallback` (the first source card's title).
 */
export function mergeTitleFromResult(result: { suggestions?: { title?: string }[] }, fallback: string): string {
  const raw = (result.suggestions?.[0]?.title ?? "").replace(/\s+/g, " ").trim();
  const name = raw.replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/g, "").trim();
  return name && name.length <= MERGE_TITLE_MAX ? name : fallback;
}

/** What the dialog needs to start an AI merge; the host owns the usage notice and the background task. */
export interface MergeAiHost {
  /**
   * Starts the AI merge; `title` is only the fallback name (the AI names the topic, the user can rename it on review).
   * `started` runs once the usage notice is accepted: the dialog hides itself there (detach rule,
   * see ui/background-run.ts). Resolves false when AI did not start, so the dialog stays open.
   */
  start: (title: string, started: () => void, signal: AbortSignal) => Promise<boolean>;
}

/** Asks for the merged topic's name and confirms what will happen before any file is touched. */
export class MergeTopicsModal extends Modal {
  private submitted = false;
  private detached = false;
  private readonly controller = new AbortController();
  constructor(
    app: App,
    private count: number,
    private value: string,
    private submit: (title: string) => void,
    private cancelled: () => void = () => {},
    /** Present when a source has content: the dialog then offers an AI merge, on by default. */
    private ai?: MergeAiHost
  ) {
    super(app);
  }
  onOpen(): void {
    this.titleEl.setText(t("ui.merge_title_label"));
    const input = this.contentEl.createEl("input", { type: "text", value: this.value, cls: "vam-name-input" });
    input.setAttr("aria-label", t("ui.merge_title_label"));
    const description = this.contentEl.createEl("p", {
      text: t("ui.merge_confirm_desc", this.count),
      cls: "vam-merge-desc"
    });
    let skipAi: HTMLInputElement | undefined;
    if (this.ai) {
      this.contentEl.createEl("p", { text: t("ui.merge_ai_desc", this.count), cls: "vam-merge-desc" });
      const label = this.contentEl.createEl("label", { cls: "vam-merge-skip-ai" });
      skipAi = label.createEl("input", { type: "checkbox" });
      label.createSpan({ text: t("ui.merge_no_ai") });
    }
    const actions = modalActions(this);
    const status = actionStatus(actions);
    actions.createEl("button", { text: t("ui.cancel") }).addEventListener("click", () => this.close());
    const useAi = (): boolean => !!this.ai && !skipAi?.checked;
    // With AI the name comes from the AI and is edited on the review screen, so the field is only for the plain merge.
    const showName = (): void => {
      input.hidden = useAi();
      description.hidden = useAi();
      this.titleEl.setText(useAi() ? t("ui.merge_topics_history") : t("ui.merge_title_label"));
    };
    const confirm = actions.createEl("button", {
      text: useAi() ? t("ui.merge_with_ai") : t("ui.merge_confirm"),
      cls: useAi() ? "mod-cta" : "mod-warning"
    });
    let pending = false;
    const save = (): void => {
      const value = input.value.trim();
      if ((!value && !useAi()) || pending) return;
      if (useAi() && this.ai) {
        pending = true;
        confirm.disabled = true;
        this.ai
          .start(
            value || this.value.trim(),
            () => {
              // Detach rule: from here the dialog no longer cancels anything; Stop lives on the status bar.
              this.detached = true;
              this.close();
            },
            this.controller.signal
          )
          .catch((error: unknown) => status.setText(error instanceof Error ? error.message : String(error)))
          .finally(() => {
            pending = false;
            if (!this.detached) check();
          });
        return;
      }
      this.submitted = true;
      this.close();
      this.submit(value);
    };
    const check = (): void => {
      const empty = !useAi() && !input.value.trim();
      confirm.disabled = empty || pending;
      if (!pending) status.setText(empty ? t("ui.name_required") : "");
    };
    skipAi?.addEventListener("change", () => {
      confirm.setText(useAi() ? t("ui.merge_with_ai") : t("ui.merge_confirm"));
      confirm.toggleClass("mod-cta", useAi());
      confirm.toggleClass("mod-warning", !useAi());
      showName();
      check();
    });
    input.addEventListener("input", check);
    input.addEventListener("keydown", event => {
      // Enter while an input method is composing only confirms the characters.
      // preventDefault: the close moves focus back to the Merge button, and this same key press must not click it.
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        save();
      }
    });
    confirm.addEventListener("click", save);
    showName();
    check();
    if (!useAi()) {
      input.focus();
      input.select();
    }
  }
  onClose(): void {
    if (this.detached) return;
    // Closing before AI starts cancels, including a usage notice still waiting for an answer.
    this.controller.abort();
    if (!this.submitted) this.cancelled();
  }
}
