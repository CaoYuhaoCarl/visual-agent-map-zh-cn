import { renderTemplate } from "../../../../core/step-runner";
import evidenceCardTemplate from "./evidence-card.md";
import noLimitations from "./evidence-card-no-limitations.md";
import noSources from "./evidence-card-no-sources.md";

/** The compact evidence index the Planner sees; the labels are fixed text, the values come from the saved report. */
export function renderEvidenceCard(variables: {
  id: string;
  summary: string;
  limitations: string;
  urls: readonly string[];
  length: number;
}): string {
  return renderTemplate(evidenceCardTemplate, {
    id: variables.id,
    summary: variables.summary,
    limitations: variables.limitations || renderTemplate(noLimitations, {}),
    urlCount: String(variables.urls.length),
    sourceIndex: variables.urls.slice(0, 6).join(" ") || renderTemplate(noSources, {}),
    length: String(variables.length)
  });
}
