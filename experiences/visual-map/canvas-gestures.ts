/** What a pointer press on empty canvas starts. Pure so the gesture table can be tested without a DOM. */
export type CanvasPointerIntent = "pan" | "marquee-enter" | "marquee-add" | "marquee-subtract" | "ignore";

export interface CanvasPointerState {
  button: number;
  integrationMode: boolean;
  spaceHeld: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Normal mode: a plain drag pans; Shift+drag draws a selection box that enters topic selection; Alt or Space pans too.
 * Topic selection mode: a plain drag adds to the selection, Option (Alt)+drag removes, Space or the middle button pans.
 * The middle button always pans; any other button does nothing.
 */
export function canvasPointerIntent(state: CanvasPointerState): CanvasPointerIntent {
  if (state.button === 1) return "pan";
  if (state.button !== 0) return "ignore";
  if (state.spaceHeld) return "pan";
  if (state.integrationMode) return state.altKey ? "marquee-subtract" : "marquee-add";
  if (state.shiftKey && !state.altKey) return "marquee-enter";
  return "pan";
}
