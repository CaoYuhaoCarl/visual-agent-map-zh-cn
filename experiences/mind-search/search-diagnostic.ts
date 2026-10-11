import type { MindSearchSearchDiagnostic } from "../../map-model";
import type { WebSearchEvent } from "../../ai/types";

/** Counts provider web-search events for one research turn; every provider emits the same event shape. */
export function createSearchDiagnostic(researchTurn: number): { diagnostic: MindSearchSearchDiagnostic; onEvent: (event: WebSearchEvent) => void } {
  const diagnostic: MindSearchSearchDiagnostic = { researchTurn, startedEvents: 0, completedEvents: 0, completedSearchActions: 0, otherCompletedActions: 0 };
  const onEvent = (event: WebSearchEvent): void => {
    if (event.method === "item/started") { diagnostic.startedEvents++; return; }
    const params = event.params as { item?: { action?: { type?: unknown } } } | undefined;
    diagnostic.completedEvents++;
    if (params?.item?.action?.type === "search") diagnostic.completedSearchActions++;
    else diagnostic.otherCompletedActions++;
  };
  return { diagnostic, onEvent };
}

/** Any completed web action (a query or an opened page) is retrieved evidence worth recovering. */
export const hasCompletedWebRetrieval = (diagnostics: readonly MindSearchSearchDiagnostic[] | undefined): boolean =>
  (diagnostics ?? []).some(item => item.completedSearchActions + item.otherCompletedActions > 0);
