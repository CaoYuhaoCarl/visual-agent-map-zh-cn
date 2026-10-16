/**
 * Position ids for prompts: the model copies a short label ("c1", "c2", ...) instead of a 36-character UUID, and the
 * parser turns it back into the real id through the same map. The label is the 1-based position in the given order, so
 * the same list always renders the same labels. One label maps to exactly one real id and back; nothing is guessed.
 */
export interface PositionIds {
  /** The short label of a real id, or undefined when the id is not in the list. */
  short(realId: string): string | undefined;
  /** The real id of a short label, or undefined for anything that is not a label of this list (a UUID included). */
  real(shortId: string): string | undefined;
}

export function positionIds(realIds: ReadonlyArray<string>): PositionIds {
  const toShort = new Map<string, string>();
  const toReal = new Map<string, string>();
  realIds.forEach((realId, index) => {
    if (toShort.has(realId)) return;
    const label = `c${index + 1}`;
    toShort.set(realId, label);
    toReal.set(label, realId);
  });
  return { short: realId => toShort.get(realId), real: shortId => toReal.get(shortId) };
}
