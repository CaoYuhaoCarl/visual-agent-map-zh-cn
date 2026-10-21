import { renderTemplate } from "../../step-runner";
import type { UiLanguage } from "../../../i18n";
import type { TaskContext } from "../../../ai/types";
import {
  inLanguage,
  LABEL_ANCESTORS,
  LABEL_RULES,
  LABEL_SOURCES,
  LABEL_SUMMARY,
  LABEL_TASK,
  LABEL_TOPIC,
  LOCAL_FIRST,
  OBSIDIAN_FORMAT,
  REFERENCE_CITATIONS,
  ROLE,
  SOURCE_SAFETY,
  toneBlock,
  type FragmentPair
} from "../_shared/fragments";
import LanguageZH from "./language.zh.md";
import LanguageEN from "./language.en.md";
import LanguageCN from "./language.zh-CN.md";
import JsonContractZH from "./json-contract.zh.md";
import JsonContractEN from "./json-contract.en.md";
import JsonContractCN from "./json-contract.zh-CN.md";
import WebSearchOffZH from "./web-search-off.zh.md";
import WebSearchOffEN from "./web-search-off.en.md";
import WebSearchOffCN from "./web-search-off.zh-CN.md";
import WebSearchOnZH from "./web-search-on.zh.md";
import WebSearchOnEN from "./web-search-on.en.md";
import WebSearchOnCN from "./web-search-on.zh-CN.md";
import LabelDetailZH from "./label-detail.zh.md";
import LabelDetailEN from "./label-detail.en.md";
import LabelDetailCN from "./label-detail.zh-CN.md";
import LabelFindingsZH from "./label-findings.zh.md";
import LabelFindingsEN from "./label-findings.en.md";
import LabelFindingsCN from "./label-findings.zh-CN.md";
import GuidanceStructuredZH from "./guidance-structured.zh.md";
import GuidanceStructuredEN from "./guidance-structured.en.md";
import GuidanceStructuredCN from "./guidance-structured.zh-CN.md";
import GuidanceGapAuditZH from "./guidance-gap-audit.zh.md";
import GuidanceGapAuditEN from "./guidance-gap-audit.en.md";
import GuidanceGapAuditCN from "./guidance-gap-audit.zh-CN.md";
import GuidancePlainZH from "./guidance-plain.zh.md";
import GuidancePlainEN from "./guidance-plain.en.md";
import GuidancePlainCN from "./guidance-plain.zh-CN.md";
import PhaseResearchGapAuditZH from "./phase/research-gap-audit.zh.md";
import PhaseResearchGapAuditEN from "./phase/research-gap-audit.en.md";
import PhaseResearchGapAuditCN from "./phase/research-gap-audit.zh-CN.md";
import PhaseInitialClarificationZH from "./phase/initial-clarification.zh.md";
import PhaseInitialClarificationEN from "./phase/initial-clarification.en.md";
import PhaseInitialClarificationCN from "./phase/initial-clarification.zh-CN.md";
import PhaseInitialQuestionZH from "./phase/initial-question.zh.md";
import PhaseInitialQuestionEN from "./phase/initial-question.en.md";
import PhaseInitialQuestionCN from "./phase/initial-question.zh-CN.md";
import PhaseResearchPlanZH from "./phase/research-plan.zh.md";
import PhaseResearchPlanEN from "./phase/research-plan.en.md";
import PhaseResearchPlanCN from "./phase/research-plan.zh-CN.md";
import PhaseResearchPlanRepairZH from "./phase/research-plan-repair.zh.md";
import PhaseResearchPlanRepairEN from "./phase/research-plan-repair.en.md";
import PhaseResearchPlanRepairCN from "./phase/research-plan-repair.zh-CN.md";
import PhaseSubtopicResearchZH from "./phase/subtopic-research.zh.md";
import PhaseSubtopicResearchEN from "./phase/subtopic-research.en.md";
import PhaseSubtopicResearchCN from "./phase/subtopic-research.zh-CN.md";
import PhaseTargetedFollowupResearchZH from "./phase/targeted-followup-research.zh.md";
import PhaseTargetedFollowupResearchEN from "./phase/targeted-followup-research.en.md";
import PhaseTargetedFollowupResearchCN from "./phase/targeted-followup-research.zh-CN.md";
import PhaseReportReviewZH from "./phase/report-review.zh.md";
import PhaseReportReviewEN from "./phase/report-review.en.md";
import PhaseReportReviewCN from "./phase/report-review.zh-CN.md";
import PhaseDecisionQualityReviewZH from "./phase/decision-quality-review.zh.md";
import PhaseDecisionQualityReviewEN from "./phase/decision-quality-review.en.md";
import PhaseDecisionQualityReviewCN from "./phase/decision-quality-review.zh-CN.md";
import PhaseFormatRepairZH from "./phase/format-repair.zh.md";
import PhaseFormatRepairEN from "./phase/format-repair.en.md";
import PhaseFormatRepairCN from "./phase/format-repair.zh-CN.md";
import PhaseDeliveryOutlineZH from "./phase/delivery-outline.zh.md";
import PhaseDeliveryOutlineEN from "./phase/delivery-outline.en.md";
import PhaseDeliveryOutlineCN from "./phase/delivery-outline.zh-CN.md";
import PhaseDeliveryResearchZH from "./phase/delivery-research.zh.md";
import PhaseDeliveryResearchEN from "./phase/delivery-research.en.md";
import PhaseDeliveryResearchCN from "./phase/delivery-research.zh-CN.md";
import PhaseDeliveryWritingZH from "./phase/delivery-writing.zh.md";
import PhaseDeliveryWritingEN from "./phase/delivery-writing.en.md";
import PhaseDeliveryWritingCN from "./phase/delivery-writing.zh-CN.md";
import PhaseDeliveryAcceptanceZH from "./phase/delivery-acceptance.zh.md";
import PhaseDeliveryAcceptanceEN from "./phase/delivery-acceptance.en.md";
import PhaseDeliveryAcceptanceCN from "./phase/delivery-acceptance.zh-CN.md";

/**
 * The AIM prompt shell: the language line, shared rules, response contract, per-phase guidance and context labels.
 * Every text is a Markdown file in this folder (phase rules under phase/); the file's trailing newline is removed so
 * the text equals the string it replaced. The phase task text itself is built by the AIM experience, not here.
 */
const text = (template: string): string => renderTemplate(template, {});
const pair = (zh: string, en: string, cn: string): FragmentPair => ({ zh: text(zh), en: text(en), cn: text(cn) });

const LANGUAGE = pair(LanguageZH, LanguageEN, LanguageCN);
const JSON_CONTRACT = pair(JsonContractZH, JsonContractEN, JsonContractCN);
const WEB_SEARCH_OFF = pair(WebSearchOffZH, WebSearchOffEN, WebSearchOffCN);
const WEB_SEARCH_ON = pair(WebSearchOnZH, WebSearchOnEN, WebSearchOnCN);
const LABEL_DETAIL = pair(LabelDetailZH, LabelDetailEN, LabelDetailCN);
const LABEL_FINDINGS = pair(LabelFindingsZH, LabelFindingsEN, LabelFindingsCN);
const GUIDANCE_STRUCTURED = pair(GuidanceStructuredZH, GuidanceStructuredEN, GuidanceStructuredCN);
const GUIDANCE_GAP_AUDIT = pair(GuidanceGapAuditZH, GuidanceGapAuditEN, GuidanceGapAuditCN);
const GUIDANCE_PLAIN = pair(GuidancePlainZH, GuidancePlainEN, GuidancePlainCN);

/** Phase rules keyed by the `aim-phase` marker; a phase without an entry (evidence-reuse-audit) has no rule. */
const PHASE_RULES: Readonly<Record<string, FragmentPair>> = {
  "research-gap-audit": pair(PhaseResearchGapAuditZH, PhaseResearchGapAuditEN, PhaseResearchGapAuditCN),
  "initial-clarification": pair(PhaseInitialClarificationZH, PhaseInitialClarificationEN, PhaseInitialClarificationCN),
  "initial-question": pair(PhaseInitialQuestionZH, PhaseInitialQuestionEN, PhaseInitialQuestionCN),
  "research-plan": pair(PhaseResearchPlanZH, PhaseResearchPlanEN, PhaseResearchPlanCN),
  "research-plan-repair": pair(PhaseResearchPlanRepairZH, PhaseResearchPlanRepairEN, PhaseResearchPlanRepairCN),
  "subtopic-research": pair(PhaseSubtopicResearchZH, PhaseSubtopicResearchEN, PhaseSubtopicResearchCN),
  "targeted-followup-research": pair(
    PhaseTargetedFollowupResearchZH,
    PhaseTargetedFollowupResearchEN,
    PhaseTargetedFollowupResearchCN
  ),
  "report-review": pair(PhaseReportReviewZH, PhaseReportReviewEN, PhaseReportReviewCN),
  "decision-quality-review": pair(
    PhaseDecisionQualityReviewZH,
    PhaseDecisionQualityReviewEN,
    PhaseDecisionQualityReviewCN
  ),
  "format-repair": pair(PhaseFormatRepairZH, PhaseFormatRepairEN, PhaseFormatRepairCN),
  "delivery-outline": pair(PhaseDeliveryOutlineZH, PhaseDeliveryOutlineEN, PhaseDeliveryOutlineCN),
  "delivery-research": pair(PhaseDeliveryResearchZH, PhaseDeliveryResearchEN, PhaseDeliveryResearchCN),
  "delivery-writing": pair(PhaseDeliveryWritingZH, PhaseDeliveryWritingEN, PhaseDeliveryWritingCN),
  "delivery-acceptance": pair(PhaseDeliveryAcceptanceZH, PhaseDeliveryAcceptanceEN, PhaseDeliveryAcceptanceCN)
};

/** Phases whose detail is saved as a note the reader opens: research reports and the final document. */
const READER_FACING_PHASES: ReadonlySet<string> = new Set([
  "subtopic-research",
  "targeted-followup-research",
  "delivery-writing"
]);

/** Whether an AIM request's detail is saved as a note the reader opens. */
export function readerFacingAimPhase(phase: string | undefined): boolean {
  return !!phase && READER_FACING_PHASES.has(phase);
}

export function aimPhase(task: string): string | undefined {
  return task.match(/<!--\s*aim-phase:\s*([a-z-]+)\s*-->/)?.[1];
}

function phaseGuidance(
  phase: string | undefined,
  language: UiLanguage,
  responseContract?: TaskContext["responseContract"],
  structured = false
): string {
  const gapAuditContract = phase === "research-gap-audit" && responseContract === "aim-gap-audit";
  const common = structured ? GUIDANCE_STRUCTURED : gapAuditContract ? GUIDANCE_GAP_AUDIT : GUIDANCE_PLAIN;
  const rule =
    phase && Object.prototype.hasOwnProperty.call(PHASE_RULES, phase) ? inLanguage(PHASE_RULES[phase], language) : "";
  return [inLanguage(common, language), rule].filter(Boolean).join("\n\n");
}

/** Builds the compact AIM prompt while retaining the regular AiResult JSON contract. */
export function buildAimPrompt(context: TaskContext, language: UiLanguage): string {
  const phase = aimPhase(context.task);
  const field = (label: string, value: string | undefined) => (value?.trim() ? `${label}:\n${value}` : "");
  const blocks = [
    inLanguage(LANGUAGE, language),
    inLanguage(ROLE, language),
    inLanguage(SOURCE_SAFETY, language),
    context.sourceContext ? inLanguage(REFERENCE_CITATIONS, language) : "",
    context.sourceContext && context.researchMode !== "local" ? inLanguage(LOCAL_FIRST, language) : "",
    inLanguage(JSON_CONTRACT, language),
    context.toneText ? toneBlock(context.toneText, language) : "",
    phaseGuidance(phase, language, context.responseContract, !!context.aimContract),
    readerFacingAimPhase(phase) ? inLanguage(OBSIDIAN_FORMAT, language) : "",
    context.researchMode === "local"
      ? inLanguage(WEB_SEARCH_OFF, language)
      : context.researchMode === "research"
        ? inLanguage(WEB_SEARCH_ON, language)
        : "",
    field(inLanguage(LABEL_TOPIC, language), context.title),
    field(inLanguage(LABEL_SUMMARY, language), context.summary),
    context.detail ? `${inLanguage(LABEL_DETAIL, language)}:\n${context.detail}` : "",
    field(inLanguage(LABEL_RULES, language), context.rules),
    context.workingFindings ? `${inLanguage(LABEL_FINDINGS, language)}:\n${context.workingFindings}` : "",
    context.sourceContext ? `${inLanguage(LABEL_SOURCES, language)}:\n${context.sourceContext}` : "",
    field(inLanguage(LABEL_ANCESTORS, language), context.ancestors),
    field(inLanguage(LABEL_TASK, language), context.task)
  ];
  return blocks.filter(Boolean).join("\n\n");
}
