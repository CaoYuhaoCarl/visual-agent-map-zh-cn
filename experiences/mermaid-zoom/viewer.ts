import { Modal, setIcon, type App } from "obsidian";
import { t } from "../../i18n";
import { sanitizeSvgClone, type SvgNode } from "./sanitize-svg";
import {
  actualSizeView,
  fitView,
  initialView,
  panBy,
  wheelFactor,
  zoomAt,
  ZOOM_STEP,
  type Size,
  type View
} from "./zoom-math";

const PAN_STEP = 80;

/** The diagram's natural size: its viewBox when it has one, otherwise what the note currently shows. */
export function naturalSize(svg: Element): Size {
  const box = (svg.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0)
    return { width: box[2], height: box[3] };
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 300, height: rect.height || 150 };
}

/**
 * A near full-window, read-only viewer for one rendered diagram. It shows a sanitized clone of the SVG; the note
 * and the original SVG are never modified.
 */
export class MermaidZoomModal extends Modal {
  private view: View = { scale: 1, x: 0, y: 0 };
  private natural: Size = { width: 300, height: 150 };
  private viewport: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private readout: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private interacted = false;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number } | null = null;

  constructor(
    app: App,
    private readonly source: Element,
    private readonly trigger: HTMLElement | null
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("vam-mermaid-zoom-modal");
    this.titleEl.setText(t("ui.mermaid_zoom_title"));
    contentEl.empty();
    contentEl.addClass("vam-mermaid-zoom-content");

    this.natural = naturalSize(this.source);
    const clone = sanitizeSvgClone(this.source.cloneNode(true) as unknown as SvgNode) as unknown as SVGElement;
    clone.setAttribute("width", String(this.natural.width));
    clone.setAttribute("height", String(this.natural.height));

    const toolbar = contentEl.createDiv({ cls: "vam-mermaid-zoom-toolbar" });
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", t("ui.mermaid_zoom_title"));
    this.toolButton(toolbar, "zoom-out", t("ui.mermaid_zoom_out"), () => this.zoomStep(1 / ZOOM_STEP));
    this.toolButton(toolbar, "zoom-in", t("ui.mermaid_zoom_in"), () => this.zoomStep(ZOOM_STEP));
    this.toolButton(toolbar, "maximize", t("ui.mermaid_zoom_fit"), () => this.fit(), t("ui.mermaid_zoom_fit"));
    this.toolButton(toolbar, null, t("ui.mermaid_zoom_actual"), () => this.actualSize(), "100%");
    this.readout = toolbar.createSpan({ cls: "vam-mermaid-zoom-readout", text: "100%" });
    toolbar.createSpan({ cls: "vam-mermaid-zoom-hint", text: t("ui.mermaid_zoom_hint") });

    const viewport = contentEl.createDiv({ cls: "vam-mermaid-zoom-viewport" });
    viewport.setAttribute("tabindex", "0");
    viewport.setAttribute("role", "group");
    viewport.setAttribute("aria-label", t("ui.mermaid_zoom_canvas_label"));
    const stage = viewport.createDiv({ cls: "vam-mermaid-zoom-stage mermaid vam-mermaid-scope" });
    stage.style.width = `${this.natural.width}px`;
    stage.style.height = `${this.natural.height}px`;
    stage.appendChild(clone);
    this.viewport = viewport;
    this.stage = stage;

    viewport.addEventListener("wheel", event => this.onWheel(event), { passive: false });
    viewport.addEventListener("pointerdown", event => this.onPointerDown(event));
    viewport.addEventListener("pointermove", event => this.onPointerMove(event));
    viewport.addEventListener("pointerup", event => this.onPointerEnd(event));
    viewport.addEventListener("pointercancel", event => this.onPointerEnd(event));
    modalEl.addEventListener("keydown", event => this.onKeyDown(event));

    this.view = initialView(this.natural, this.size());
    this.apply(false);
    if (typeof ResizeObserver !== "undefined") {
      // The first layout may report no size yet; until the reader acts, keep the opening view matched to the window.
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.interacted) {
          this.view = initialView(this.natural, this.size());
          this.apply(false);
        }
      });
      this.resizeObserver.observe(viewport);
    }
    viewport.focus();
    // Obsidian moves focus after onOpen returns; take it back so the keyboard shortcuts work right away.
    window.setTimeout(() => viewport.focus(), 50);
  }

  onClose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.pointers.clear();
    this.contentEl.empty();
    // Return focus to the button that opened the viewer, unless a live-preview redraw has already removed it.
    if (this.trigger?.isConnected !== false) this.trigger?.focus();
  }

  /** Current view, exposed for tests and for the status readout. */
  currentView(): View {
    return { ...this.view };
  }

  private size(): Size {
    const viewport = this.viewport;
    const width = viewport?.clientWidth || viewport?.getBoundingClientRect().width || 0;
    const height = viewport?.clientHeight || viewport?.getBoundingClientRect().height || 0;
    return { width: width || 900, height: height || 600 };
  }

  private toolButton(parent: HTMLElement, icon: string | null, label: string, run: () => void, text?: string): void {
    const button = parent.createEl("button", {
      cls: "vam-mermaid-zoom-tool",
      attr: { type: "button", "aria-label": label }
    });
    if (icon) setIcon(button, icon);
    if (text) button.createSpan({ text });
    button.addEventListener("click", () => {
      run();
      this.viewport?.focus();
    });
  }

  private apply(animate: boolean): void {
    if (!this.stage) return;
    this.stage.toggleClass("is-animated", animate);
    this.stage.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
    this.readout?.setText(`${Math.round(this.view.scale * 100)}%`);
  }

  private zoomStep(factor: number): void {
    const size = this.size();
    this.interacted = true;
    this.view = zoomAt(this.view, factor, size.width / 2, size.height / 2);
    this.apply(true);
  }

  private fit(): void {
    this.interacted = true;
    this.view = fitView(this.natural, this.size());
    this.apply(true);
  }

  private actualSize(): void {
    this.interacted = true;
    this.view = actualSizeView(this.view, this.size());
    this.apply(true);
  }

  private local(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.viewport?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const point = this.local(event);
    this.interacted = true;
    this.view = zoomAt(this.view, wheelFactor(event.deltaY, event.ctrlKey, event.deltaMode), point.x, point.y);
    this.apply(false);
  }

  private onPointerDown(event: PointerEvent): void {
    this.pointers.set(event.pointerId, this.local(event));
    this.viewport?.setPointerCapture?.(event.pointerId);
    this.viewport?.addClass("is-dragging");
    this.pinch = this.pointers.size === 2 ? { distance: this.pointerDistance() } : null;
  }

  private onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const next = this.local(event);
    this.interacted = true;
    this.pointers.set(event.pointerId, next);
    if (this.pointers.size >= 2 && this.pinch) {
      const distance = this.pointerDistance();
      const [a, b] = [...this.pointers.values()];
      if (this.pinch.distance > 0 && distance > 0)
        this.view = zoomAt(this.view, distance / this.pinch.distance, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinch.distance = distance;
    } else {
      this.view = panBy(this.view, next.x - previous.x, next.y - previous.y);
    }
    this.apply(false);
  }

  private onPointerEnd(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    this.pinch = this.pointers.size === 2 ? { distance: this.pointerDistance() } : null;
    if (this.pointers.size === 0) this.viewport?.removeClass("is-dragging");
  }

  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? PAN_STEP * 3 : PAN_STEP;
    const pan = (dx: number, dy: number): void => {
      this.interacted = true;
      this.view = panBy(this.view, dx, dy);
      this.apply(true);
    };
    switch (event.key) {
      case "+":
      case "=":
        this.zoomStep(ZOOM_STEP);
        break;
      case "-":
      case "_":
        this.zoomStep(1 / ZOOM_STEP);
        break;
      case "0":
        this.fit();
        break;
      case "ArrowLeft":
        pan(step, 0);
        break;
      case "ArrowRight":
        pan(-step, 0);
        break;
      case "ArrowUp":
        pan(0, step);
        break;
      case "ArrowDown":
        pan(0, -step);
        break;
      default:
        return;
    }
    event.preventDefault();
  }
}
