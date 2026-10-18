import { setIcon, type App, type MarkdownPostProcessorContext, type Plugin } from "obsidian";
import { t } from "../../i18n";
import { MermaidZoomModal } from "./viewer";

/** Class on rendered diagrams (and their section) in VAM notes; the timeline contrast CSS is scoped to it. */
export const SCOPE_CLASS = "vam-mermaid-scope";
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

function scan(app: App, element: HTMLElement): void {
  const hosts = element.matches(".mermaid") ? [element] : [];
  hosts.push(...Array.from(element.querySelectorAll<HTMLElement>(".mermaid")));
  for (const host of hosts) decorateDiagram(app, host);
}

/**
 * Adds a zoom button to rendered mermaid diagrams in VAM notes (reading view, live preview and card previews that
 * render through Obsidian's markdown renderer). Mermaid renders asynchronously, so each block is watched until its
 * SVG appears. Read-only: nothing here writes to a note.
 */
export function registerMermaidZoom(plugin: Plugin): void {
  const observers = new Set<MutationObserver>();
  plugin.register(() => {
    for (const observer of observers) observer.disconnect();
    observers.clear();
  });
  plugin.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
    if (!isVamSource(plugin.app, context.sourcePath)) return;
    element.addClass(SCOPE_CLASS);
    scan(plugin.app, element);
    const mayHoldDiagram =
      element.matches(".mermaid") ||
      ["mermaid", "block-language-mermaid", "language-mermaid"].some(name => element.querySelector(`.${name}`));
    if (!mayHoldDiagram) return;
    const observer = new MutationObserver(() => {
      scan(plugin.app, element);
      if (!element.isConnected) {
        observer.disconnect();
        observers.delete(observer);
      }
    });
    observer.observe(element, { childList: true, subtree: true });
    observers.add(observer);
  });
}
