import type { UiLanguage } from "../../../i18n";
import { renderTemplate } from "../../../core/step-runner";
import { inLanguage, type FragmentPair } from "../../../core/steps/_shared/fragments";
import ThinkingOriginLabelTemplate from "./thinking-origin-label.md";
import ThinkingOriginSourceTemplate from "./thinking-origin-source.md";
import AvoidDuplicatesZH from "./avoid-duplicates.zh.md";
import AvoidDuplicatesEN from "./avoid-duplicates.en.md";
import AvoidDuplicatesCN from "./avoid-duplicates.zh-CN.md";
import ExistingSubtopicsZH from "./existing-subtopics.zh.md";
import ExistingSubtopicsEN from "./existing-subtopics.en.md";
import ExistingSubtopicsCN from "./existing-subtopics.zh-CN.md";
import ExpansionDirectionZH from "./expansion-direction.zh.md";
import ExpansionDirectionEN from "./expansion-direction.en.md";
import ExpansionDirectionCN from "./expansion-direction.zh-CN.md";
import GuidedExpansionZH from "./guided-expansion.zh.md";
import GuidedExpansionEN from "./guided-expansion.en.md";
import GuidedExpansionCN from "./guided-expansion.zh-CN.md";
import LabelCurrentSummaryZH from "./label-current-summary.zh.md";
import LabelCurrentSummaryEN from "./label-current-summary.en.md";
import LabelCurrentSummaryCN from "./label-current-summary.zh-CN.md";
import LabelFullKnowledgeZH from "./label-full-knowledge.zh.md";
import LabelFullKnowledgeEN from "./label-full-knowledge.en.md";
import LabelFullKnowledgeCN from "./label-full-knowledge.zh-CN.md";
import LabelOldFindingsZH from "./label-old-findings.zh.md";
import LabelOldFindingsEN from "./label-old-findings.en.md";
import LabelOldFindingsCN from "./label-old-findings.zh-CN.md";
import LabelVisualReferencesZH from "./label-visual-references.zh.md";
import LabelVisualReferencesEN from "./label-visual-references.en.md";
import LabelVisualReferencesCN from "./label-visual-references.zh-CN.md";
import NoSummaryYetZH from "./no-summary-yet.zh.md";
import NoSummaryYetEN from "./no-summary-yet.en.md";
import NoSummaryYetCN from "./no-summary-yet.zh-CN.md";
import ResearchTopicZH from "./research-topic.zh.md";
import ResearchTopicEN from "./research-topic.en.md";
import ResearchTopicCN from "./research-topic.zh-CN.md";
import SynthesisDirectionsZH from "./synthesis-directions.zh.md";
import SynthesisDirectionsEN from "./synthesis-directions.en.md";
import SynthesisDirectionsCN from "./synthesis-directions.zh-CN.md";
import SynthesisGoalZH from "./synthesis-goal.zh.md";
import SynthesisGoalEN from "./synthesis-goal.en.md";
import SynthesisGoalCN from "./synthesis-goal.zh-CN.md";
import MergeGoalZH from "./merge-goal.zh.md";
import MergeGoalEN from "./merge-goal.en.md";
import MergeGoalCN from "./merge-goal.zh-CN.md";

/**
 * Task text that Visual Map builds into the task of an AI request (expand, synthesize, research). Markdown files next to
 * this module; a trailing file newline is removed so the text equals the string it replaced. The model call itself is
 * made by the general task step in core/steps/task.
 */
const text = (template: string): string => renderTemplate(template, {});
const pair = (zh: string, en: string, cn: string): FragmentPair => ({ zh: text(zh), en: text(en), cn: text(cn) });

const AVOID_DUPLICATES: FragmentPair = pair(AvoidDuplicatesZH, AvoidDuplicatesEN, AvoidDuplicatesCN);
const EXISTING_SUBTOPICS: FragmentPair = pair(ExistingSubtopicsZH, ExistingSubtopicsEN, ExistingSubtopicsCN);
const EXPANSION_DIRECTION: FragmentPair = pair(ExpansionDirectionZH, ExpansionDirectionEN, ExpansionDirectionCN);
const GUIDED_EXPANSION: FragmentPair = pair(GuidedExpansionZH, GuidedExpansionEN, GuidedExpansionCN);
const LABEL_CURRENT_SUMMARY: FragmentPair = pair(LabelCurrentSummaryZH, LabelCurrentSummaryEN, LabelCurrentSummaryCN);
const LABEL_FULL_KNOWLEDGE: FragmentPair = pair(LabelFullKnowledgeZH, LabelFullKnowledgeEN, LabelFullKnowledgeCN);
const LABEL_OLD_FINDINGS: FragmentPair = pair(LabelOldFindingsZH, LabelOldFindingsEN, LabelOldFindingsCN);
const LABEL_VISUAL_REFERENCES: FragmentPair = pair(
  LabelVisualReferencesZH,
  LabelVisualReferencesEN,
  LabelVisualReferencesCN
);
const NO_SUMMARY_YET: FragmentPair = pair(NoSummaryYetZH, NoSummaryYetEN, NoSummaryYetCN);
const RESEARCH_TOPIC: FragmentPair = { zh: ResearchTopicZH, en: ResearchTopicEN, cn: ResearchTopicCN };
const SYNTHESIS_DIRECTIONS: FragmentPair = pair(SynthesisDirectionsZH, SynthesisDirectionsEN, SynthesisDirectionsCN);
const SYNTHESIS_GOAL: FragmentPair = pair(SynthesisGoalZH, SynthesisGoalEN, SynthesisGoalCN);
const MERGE_GOAL: FragmentPair = pair(MergeGoalZH, MergeGoalEN, MergeGoalCN);

export const researchTopicTask = (language: UiLanguage, title: string): string =>
  renderTemplate(inLanguage(RESEARCH_TOPIC, language), { title });

/** The task for a guided expansion of a topic in the requested `direction`. */
export function expansionTask(language: UiLanguage, existing: string, direction: string | undefined): string {
  const lead = direction || inLanguage(EXPANSION_DIRECTION, language);
  return `${lead}\n${inLanguage(EXISTING_SUBTOPICS, language)}\n${existing}\n${inLanguage(AVOID_DUPLICATES, language)} ${inLanguage(GUIDED_EXPANSION, language)}`;
}

export const synthesisDirectionsTask = (language: UiLanguage): string => inLanguage(SYNTHESIS_DIRECTIONS, language);
export const synthesisGoalTask = (language: UiLanguage): string => inLanguage(SYNTHESIS_GOAL, language);
/** The task of an AI merge of selected sibling topics into one (prompt.merge_goal). */
export const mergeGoalTask = (language: UiLanguage): string => inLanguage(MERGE_GOAL, language);
export const noSummaryYet = (language: UiLanguage): string => inLanguage(NO_SUMMARY_YET, language);
export const labelCurrentSummary = (language: UiLanguage): string => inLanguage(LABEL_CURRENT_SUMMARY, language);
export const labelVisualReferences = (language: UiLanguage): string => inLanguage(LABEL_VISUAL_REFERENCES, language);
export const labelFullKnowledge = (language: UiLanguage): string => inLanguage(LABEL_FULL_KNOWLEDGE, language);
export const labelOldFindings = (language: UiLanguage): string => inLanguage(LABEL_OLD_FINDINGS, language);

/** Source-context blocks that carry a note's Thinking Origin to the model as unverified data. */
export const thinkingOriginBlock = (origin: string): string => renderTemplate(ThinkingOriginSourceTemplate, { origin });
export const thinkingOriginDocumentBlock = (origin: string): string =>
  renderTemplate(ThinkingOriginLabelTemplate, { origin });
