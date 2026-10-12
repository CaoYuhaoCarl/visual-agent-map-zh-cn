import type { UiLanguage } from "../../../i18n";
import { renderTemplate } from "../../../core/step-runner";
import { inLanguage, type FragmentPair } from "../../../core/steps/_shared/fragments";
import ThinkingOriginLabelTemplate from "./thinking-origin-label.md";
import ThinkingOriginSourceTemplate from "./thinking-origin-source.md";
import AvoidDuplicatesZH from "./avoid-duplicates.zh.md";
import AvoidDuplicatesEN from "./avoid-duplicates.en.md";
import DirectExpansionZH from "./direct-expansion.zh.md";
import DirectExpansionEN from "./direct-expansion.en.md";
import ExistingSubtopicsZH from "./existing-subtopics.zh.md";
import ExistingSubtopicsEN from "./existing-subtopics.en.md";
import ExpansionDirectionZH from "./expansion-direction.zh.md";
import ExpansionDirectionEN from "./expansion-direction.en.md";
import GuidedExpansionZH from "./guided-expansion.zh.md";
import GuidedExpansionEN from "./guided-expansion.en.md";
import LabelCurrentSummaryZH from "./label-current-summary.zh.md";
import LabelCurrentSummaryEN from "./label-current-summary.en.md";
import LabelFullKnowledgeZH from "./label-full-knowledge.zh.md";
import LabelFullKnowledgeEN from "./label-full-knowledge.en.md";
import LabelOldFindingsZH from "./label-old-findings.zh.md";
import LabelOldFindingsEN from "./label-old-findings.en.md";
import LabelVisualReferencesZH from "./label-visual-references.zh.md";
import LabelVisualReferencesEN from "./label-visual-references.en.md";
import NoSummaryYetZH from "./no-summary-yet.zh.md";
import NoSummaryYetEN from "./no-summary-yet.en.md";
import PreliminaryMapZH from "./preliminary-map.zh.md";
import PreliminaryMapEN from "./preliminary-map.en.md";
import ResearchTopicZH from "./research-topic.zh.md";
import ResearchTopicEN from "./research-topic.en.md";
import SynthesisDirectionsZH from "./synthesis-directions.zh.md";
import SynthesisDirectionsEN from "./synthesis-directions.en.md";
import SynthesisGoalZH from "./synthesis-goal.zh.md";
import SynthesisGoalEN from "./synthesis-goal.en.md";

/**
 * Task text that Visual Map builds into the task of an AI request (expand, synthesize, research). Markdown files next to
 * this module; a trailing file newline is removed so the text equals the string it replaced. The model call itself is
 * made by the general task step in core/steps/task.
 */
const text = (template: string): string => renderTemplate(template, {});
const pair = (zh: string, en: string): FragmentPair => ({ zh: text(zh), en: text(en) });

const AVOID_DUPLICATES: FragmentPair = pair(AvoidDuplicatesZH, AvoidDuplicatesEN);
const DIRECT_EXPANSION: FragmentPair = { zh: DirectExpansionZH, en: DirectExpansionEN };
const EXISTING_SUBTOPICS: FragmentPair = pair(ExistingSubtopicsZH, ExistingSubtopicsEN);
const EXPANSION_DIRECTION: FragmentPair = pair(ExpansionDirectionZH, ExpansionDirectionEN);
const GUIDED_EXPANSION: FragmentPair = pair(GuidedExpansionZH, GuidedExpansionEN);
const LABEL_CURRENT_SUMMARY: FragmentPair = pair(LabelCurrentSummaryZH, LabelCurrentSummaryEN);
const LABEL_FULL_KNOWLEDGE: FragmentPair = pair(LabelFullKnowledgeZH, LabelFullKnowledgeEN);
const LABEL_OLD_FINDINGS: FragmentPair = pair(LabelOldFindingsZH, LabelOldFindingsEN);
const LABEL_VISUAL_REFERENCES: FragmentPair = pair(LabelVisualReferencesZH, LabelVisualReferencesEN);
const NO_SUMMARY_YET: FragmentPair = pair(NoSummaryYetZH, NoSummaryYetEN);
const PRELIMINARY_MAP: FragmentPair = { zh: PreliminaryMapZH, en: PreliminaryMapEN };
const RESEARCH_TOPIC: FragmentPair = { zh: ResearchTopicZH, en: ResearchTopicEN };
const SYNTHESIS_DIRECTIONS: FragmentPair = pair(SynthesisDirectionsZH, SynthesisDirectionsEN);
const SYNTHESIS_GOAL: FragmentPair = pair(SynthesisGoalZH, SynthesisGoalEN);

/** Shape of a quick (direct) expansion: levels, first-level count, children per parent, counts per level and total. */
export interface ExpansionShape {
  layers: number;
  firstLayerCount: number;
  childrenPerParent: number;
  counts: string;
  total: string;
}

export const researchTopicTask = (language: UiLanguage, title: string): string =>
  renderTemplate(inLanguage(RESEARCH_TOPIC, language), { title });

/**
 * The task for expanding a topic. A `shape` makes it a direct expansion with fixed counts per level (preliminary map
 * plus direct rules); without one it is a guided expansion in the requested `direction`.
 */
export function expansionTask(
  language: UiLanguage,
  existing: string,
  direction: string | undefined,
  shape: ExpansionShape | null
): string {
  const values = shape
    ? {
        layers: String(shape.layers),
        first: String(shape.firstLayerCount),
        children: String(shape.childrenPerParent),
        counts: shape.counts,
        total: shape.total
      }
    : null;
  const lead = values
    ? renderTemplate(inLanguage(PRELIMINARY_MAP, language), values)
    : direction || inLanguage(EXPANSION_DIRECTION, language);
  const rules = values
    ? renderTemplate(inLanguage(DIRECT_EXPANSION, language), values)
    : inLanguage(GUIDED_EXPANSION, language);
  return `${lead}\n${inLanguage(EXISTING_SUBTOPICS, language)}\n${existing}\n${inLanguage(AVOID_DUPLICATES, language)} ${rules}`;
}

export const synthesisDirectionsTask = (language: UiLanguage): string => inLanguage(SYNTHESIS_DIRECTIONS, language);
export const synthesisGoalTask = (language: UiLanguage): string => inLanguage(SYNTHESIS_GOAL, language);
export const noSummaryYet = (language: UiLanguage): string => inLanguage(NO_SUMMARY_YET, language);
export const labelCurrentSummary = (language: UiLanguage): string => inLanguage(LABEL_CURRENT_SUMMARY, language);
export const labelVisualReferences = (language: UiLanguage): string => inLanguage(LABEL_VISUAL_REFERENCES, language);
export const labelFullKnowledge = (language: UiLanguage): string => inLanguage(LABEL_FULL_KNOWLEDGE, language);
export const labelOldFindings = (language: UiLanguage): string => inLanguage(LABEL_OLD_FINDINGS, language);

/** Source-context blocks that carry a note's Thinking Origin to the model as unverified data. */
export const thinkingOriginBlock = (origin: string): string => renderTemplate(ThinkingOriginSourceTemplate, { origin });
export const thinkingOriginDocumentBlock = (origin: string): string =>
  renderTemplate(ThinkingOriginLabelTemplate, { origin });
