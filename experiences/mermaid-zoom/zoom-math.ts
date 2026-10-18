/** Pure zoom and pan math for the diagram viewer. No DOM, so it is unit-tested directly. */

export interface Size {
  width: number;
  height: number;
}

/** `scale` maps diagram pixels to screen pixels; `x`/`y` is where the diagram's top-left corner sits in the viewport. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** A wide diagram never opens smaller than this, so its text stays legible; the owner pans for the rest. */
export const MIN_READABLE_SCALE = 0.6;
/** A small diagram is enlarged to fit, but not beyond this. */
export const MAX_FIT_SCALE = 2;
export const FIT_PADDING = 24;
export const ZOOM_STEP = 1.25;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** The scale at which the whole diagram fits inside the viewport (with padding), clamped to the allowed range. */
export function fitScale(diagram: Size, viewport: Size, padding = FIT_PADDING): number {
  if (diagram.width <= 0 || diagram.height <= 0) return 1;
  const available = {
    width: Math.max(1, viewport.width - padding * 2),
    height: Math.max(1, viewport.height - padding * 2)
  };
  return clampScale(Math.min(available.width / diagram.width, available.height / diagram.height, MAX_FIT_SCALE));
}

function centered(scale: number, diagram: Size, viewport: Size): View {
  return {
    scale,
    x: (viewport.width - diagram.width * scale) / 2,
    y: (viewport.height - diagram.height * scale) / 2
  };
}

/** The "fit to window" view: the whole diagram, centered. */
export function fitView(diagram: Size, viewport: Size): View {
  return centered(fitScale(diagram, viewport), diagram, viewport);
}

/**
 * The view the viewer opens at: fit to the window, unless that would shrink the text below the readable minimum.
 * In that case the diagram opens at the minimum, centered on the axis that still fits and starting at the top-left
 * padding on the axis that overflows.
 */
export function initialView(diagram: Size, viewport: Size): View {
  const fit = fitScale(diagram, viewport);
  if (fit >= MIN_READABLE_SCALE) return centered(fit, diagram, viewport);
  const scale = MIN_READABLE_SCALE;
  const view = centered(scale, diagram, viewport);
  if (diagram.width * scale > viewport.width) view.x = FIT_PADDING;
  if (diagram.height * scale > viewport.height) view.y = FIT_PADDING;
  return view;
}

/** A 100% view, centered on the same point of the diagram that is currently at the viewport center. */
export function actualSizeView(view: View, viewport: Size): View {
  return zoomAt(view, 1 / view.scale, viewport.width / 2, viewport.height / 2);
}

/** Zoom by `factor` keeping the diagram point under (`cx`, `cy`) (viewport coordinates) fixed. */
export function zoomAt(view: View, factor: number, cx: number, cy: number): View {
  const scale = clampScale(view.scale * (Number.isFinite(factor) && factor > 0 ? factor : 1));
  const ratio = scale / view.scale;
  return { scale, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** The zoom factor for one wheel event; a pinch gesture (ctrlKey) is reported in finer deltas, so it counts more. */
export function wheelFactor(deltaY: number, ctrlKey: boolean, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.exp(-pixels * (ctrlKey ? 0.01 : 0.0015));
}
