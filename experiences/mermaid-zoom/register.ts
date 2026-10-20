import { ViewPlugin, type EditorView } from "@codemirror/view";
import {
  editorInfoField,
  MarkdownRenderChild,
  setIcon,
  type App,
  type MarkdownPostProcessorContext,
  type Plugin
} from "obsidian";
import { t } from "../../i18n";
import { MermaidZoomModal } from "./viewer";

/** Class on each rendered diagram that belongs to a VAM note; the timeline contrast CSS is scoped to it. */
export const SCOPE_CLASS = "vam-mermaid-scope";
/** Class on each callout that belongs to a VAM note; the callout contrast CSS is scoped to it. */
export const CALLOUT_SCOPE_CLASS = "vam-callout-scope";
/** Class on each link (and footnote ref or back-reference) that belongs to a VAM note; the link contrast CSS is scoped to it. */
export const LINK_SCOPE_CLASS = "vam-link-scope";
/** Class on the editor (live preview and source mode) of a VAM note; the editor link contrast CSS is scoped to it. */
export const EDITOR_SCOPE_CLASS = "vam-editor-scope";
export const ZOOMABLE_CLASS = "vam-mermaid-zoomable";
export const BUTTON_CLASS = "vam-mermaid-zoom-btn";

function marker(value: unknown): boolean {
  return value === true || value === "true";
}

/** A VAM-managed note is one whose frontmatter carries VAM's topic-note or map marker. Nothing else is touched. */
export function isVamFrontmatter(frontmatter: Record<string, unknown> | null | undefined): boolean {
  return marker(frontmatter?.["agent-map-node"]) || marker(frontmatter?.["visual-agent-map"]);
}

export function isVamSource(app: App, sourcePath: string): boolean {
  if (!sourcePath) return false;
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!file || !("extension" in file)) return false;
  return isVamFrontmatter(app.metadataCache.getFileCache(file as never)?.frontmatter);
}

/** Marks a rendered diagram and gives it the zoom button. Idempotent, so it can run on every DOM change. */
export function decorateDiagram(app: App, host: HTMLElement): void {
  const svg = host.querySelector("svg");
  if (!svg) return;
  host.addClass(SCOPE_CLASS, ZOOMABLE_CLASS);
  if (host.querySelector(`.${BUTTON_CLASS}`)) return;
  const button = host.createEl("button", {
    cls: `${BUTTON_CLASS} clickable-icon`,
    attr: { type: "button", "aria-label": t("ui.mermaid_zoom_open"), title: t("ui.mermaid_zoom_open") }
  });
  setIcon(button, "maximize-2");
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const current = host.querySelector("svg");
    if (current) new MermaidZoomModal(app, current, button).open();
  });
}

/** Whether this diagram sits in an embedded note inside `section`; the embedded note is judged by its own path. */
function inForeignEmbed(section: HTMLElement, host: HTMLElement): boolean {
  const embed = host.closest(".internal-embed, .markdown-embed");
  return !!embed && embed !== section && section.contains(embed);
}

/** Gives every callout of `section` that belongs to it the callout scope class. Idempotent; embedded notes are judged by their own path. */
function scanCallouts(section: HTMLElement): void {
  const callouts = section.matches(".callout, .cm-callout") ? [section] : [];
  callouts.push(...Array.from(section.querySelectorAll<HTMLElement>(".callout, .cm-callout")));
  for (const callout of callouts) {
    if (!inForeignEmbed(section, callout)) callout.addClass(CALLOUT_SCOPE_CLASS);
  }
}

/**
 * Gives every link of `section` that belongs to it the link scope class. The links are marked one by one (not the
 * section) because a section can hold an embedded note that is judged by its own path. Idempotent.
 */
function scanLinks(section: HTMLElement): void {
  const selector = ".internal-link, .external-link, .footnote-link, .footnote-backref";
  const links = section.matches(selector) ? [section] : [];
  links.push(...Array.from(section.querySelectorAll<HTMLElement>(selector)));
  for (const link of links) {
    if (!inForeignEmbed(section, link)) link.addClass(LINK_SCOPE_CLASS);
  }
}

/** Decorates every rendered diagram of `section` that belongs to it; returns how many it has handled. */
function scan(app: App, section: HTMLElement): number {
  const hosts = section.matches(".mermaid") ? [section] : [];
  hosts.push(...Array.from(section.querySelectorAll<HTMLElement>(".mermaid")));
  let done = 0;
  for (const host of hosts) {
    if (inForeignEmbed(section, host) || !host.querySelector("svg")) continue;
    decorateDiagram(app, host);
    done++;
  }
  return done;
}

/** Ties a section's MutationObserver to Obsidian's render lifecycle: it stops when the section is unloaded. */
class WatchChild extends MarkdownRenderChild {
  constructor(
    element: HTMLElement,
    private readonly stop: () => void
  ) {
    super(element);
  }
  onunload(): void {
    this.stop();
  }
}

function isDiagramNode(node: Node): boolean {
  const el = node as Element;
  return typeof el.matches === "function" && el.matches("svg, .mermaid, .cm-embed-block, .callout, .cm-callout, a");
}

/** A DOM change matters only when a diagram (svg or .mermaid) was added, or it happened inside an embed block or a diagram. */
function mutationTouchesDiagram(mutation: MutationRecord): boolean {
  if (Array.from(mutation.addedNodes).some(isDiagramNode)) return true;
  const target = mutation.target as Element | null;
  const element = target && typeof target.closest === "function" ? target : (target?.parentElement ?? null);
  return !!element?.closest(".cm-embed-block, .mermaid, .cm-callout");
}

/**
 * Live preview draws mermaid in an editor widget that Obsidian does not hand to markdown post processors, so each
 * editor gets one watcher instead. It lives exactly as long as its editor view (CodeMirror calls destroy), reads the
 * note path when it scans (the file may not be known at construction) and only touches notes VAM manages.
 */
export class EditorWatcher {
  private readonly observer: MutationObserver;
  private lastPath: string | undefined;
  constructor(
    private readonly app: App,
    private readonly dom: HTMLElement,
    private readonly sourcePath: () => string | undefined,
    private readonly onDestroy: (watcher: EditorWatcher) => void
  ) {
    this.observer = new MutationObserver(mutations => {
      if (mutations.some(mutationTouchesDiagram)) this.scan();
    });
    this.observer.observe(dom, { childList: true, subtree: true });
    this.scan();
  }
  scan(): void {
    const path = this.sourcePath();
    this.lastPath = path;
    const isVam = !!path && isVamSource(this.app, path);
    this.dom.toggleClass(EDITOR_SCOPE_CLASS, isVam);
    if (path && isVam) {
      scanCallouts(this.dom);
      scanLinks(this.dom);
      scan(this.app, this.dom);
    }
  }
  /** Editor state updates fire on every keystroke; rescan only when the editor now shows a different file. */
  onUpdate(): void {
    if (this.sourcePath() !== this.lastPath) this.scan();
  }
  destroy(): void {
    this.observer.disconnect();
    this.dom.removeClass(EDITOR_SCOPE_CLASS);
    this.onDestroy(this);
  }
}

export interface MermaidZoomHandle {
  /** Post-processor sections still waiting for their diagram plus live editors being watched (diagnostics only). */
  observerCount(): number;
  /** Live-preview editors currently watched (diagnostics only). */
  editorCount(): number;
}

/**
 * Adds a zoom button to rendered mermaid diagrams in VAM notes (reading view, live preview and card previews that
 * render through Obsidian's markdown renderer). Mermaid renders asynchronously, so a section whose diagram is not
 * there yet is watched until the SVG appears, then released at once. A re-render runs the post processor again, so
 * nothing observes for longer than that. Read-only: nothing here writes to a note.
 */
export function registerMermaidZoom(plugin: Plugin): MermaidZoomHandle {
  const observers = new Set<MutationObserver>();
  const editors = new Set<EditorWatcher>();
  plugin.register(() => {
    for (const observer of observers) observer.disconnect();
    observers.clear();
    for (const watcher of Array.from(editors)) watcher.destroy();
  });
  plugin.registerEditorExtension(
    ViewPlugin.fromClass(
      class {
        private readonly watcher: EditorWatcher;
        constructor(view: EditorView) {
          this.watcher = new EditorWatcher(
            plugin.app,
            view.dom,
            () => view.state.field(editorInfoField, false)?.file?.path,
            done => editors.delete(done)
          );
          editors.add(this.watcher);
        }
        update(): void {
          this.watcher.onUpdate();
        }
        destroy(): void {
          this.watcher.destroy();
        }
      }
    )
  );
  plugin.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
    if (!isVamSource(plugin.app, context.sourcePath)) return;
    scanCallouts(element);
    scanLinks(element);
    if (scan(plugin.app, element) > 0) return;
    const mayHoldDiagram =
      element.matches(".mermaid") ||
      ["mermaid", "block-language-mermaid", "language-mermaid"].some(name => element.querySelector(`.${name}`));
    if (!mayHoldDiagram) return;
    const release = (): void => {
      observer.disconnect();
      observers.delete(observer);
    };
    // Obsidian renders sections it has not attached yet (below the fold), so a detached section is not abandoned: it is
    // released once its diagram is decorated, once it was attached and then removed, or when its render child unloads.
    let attached = element.isConnected;
    const observer = new MutationObserver(() => {
      if (element.isConnected) attached = true;
      if (scan(plugin.app, element) > 0 || (attached && !element.isConnected)) release();
    });
    observer.observe(element, { childList: true, subtree: true });
    observers.add(observer);
    context.addChild(new WatchChild(element, release));
  });
  return { observerCount: () => observers.size, editorCount: () => editors.size };
}
