import { renderTemplate } from "../../step-runner";
import type { UiLanguage } from "../../../i18n";
import { inLanguage, type FragmentPair } from "../_shared/fragments";
import SourceRegistryTemplate from "./source-registry.md";
import AdaptiveDetailStructureZH from "./adaptive-detail-structure.zh.md";
import AdaptiveDetailStructureEN from "./adaptive-detail-structure.en.md";
import AdaptiveDetailStructureCN from "./adaptive-detail-structure.zh-CN.md";
import CustomDetailStructureZH from "./custom-detail-structure.zh.md";
import CustomDetailStructureEN from "./custom-detail-structure.en.md";
import CustomDetailStructureCN from "./custom-detail-structure.zh-CN.md";
import CustomRuleLogZH from "./custom-detail-rule-log.zh.md";
import CustomRuleLogEN from "./custom-detail-rule-log.en.md";
import CustomRuleLogCN from "./custom-detail-rule-log.zh-CN.md";
import CustomRuleDescriptionZH from "./custom-detail-rule-description.zh.md";
import CustomRuleDescriptionEN from "./custom-detail-rule-description.en.md";
import CustomRuleDescriptionCN from "./custom-detail-rule-description.zh-CN.md";
import CustomRuleExactZH from "./custom-detail-rule-exact.zh.md";
import CustomRuleExactEN from "./custom-detail-rule-exact.en.md";
import CustomRuleExactCN from "./custom-detail-rule-exact.zh-CN.md";
import CustomRuleMinZH from "./custom-detail-rule-min.zh.md";
import CustomRuleMinEN from "./custom-detail-rule-min.en.md";
import CustomRuleMinCN from "./custom-detail-rule-min.zh-CN.md";
import TextbookDetailStructureZH from "./textbook-detail-structure.zh.md";
import TextbookDetailStructureEN from "./textbook-detail-structure.en.md";
import TextbookDetailStructureCN from "./textbook-detail-structure.zh-CN.md";
import RepairCountsZH from "./repair-counts.zh.md";
import RepairCountsEN from "./repair-counts.en.md";
import RepairCountsCN from "./repair-counts.zh-CN.md";
import DecomposeZH from "./decompose.zh.md";
import DecomposeEN from "./decompose.en.md";
import DecomposeCN from "./decompose.zh-CN.md";
import DefaultTaskZH from "./default-task.zh.md";
import DefaultTaskEN from "./default-task.en.md";
import DefaultTaskCN from "./default-task.zh-CN.md";
import DetailStructureZH from "./detail-structure.zh.md";
import DetailStructureEN from "./detail-structure.en.md";
import DetailStructureCN from "./detail-structure.zh-CN.md";
import GeneralTaskZH from "./general-task.zh.md";
import GeneralTaskEN from "./general-task.en.md";
import GeneralTaskCN from "./general-task.zh-CN.md";
import JsonZH from "./json.zh.md";
import JsonEN from "./json.en.md";
import JsonCN from "./json.zh-CN.md";
import LabelDetailZH from "./label-detail.zh.md";
import LabelDetailEN from "./label-detail.en.md";
import LabelDetailCN from "./label-detail.zh-CN.md";
import LabelFindingsZH from "./label-findings.zh.md";
import LabelFindingsEN from "./label-findings.en.md";
import LabelFindingsCN from "./label-findings.zh-CN.md";
import OutputLanguageZH from "./output-language.zh.md";
import OutputLanguageEN from "./output-language.en.md";
import OutputLanguageCN from "./output-language.zh-CN.md";
import MergeZH from "./merge.zh.md";
import MergeEN from "./merge.en.md";
import MergeCN from "./merge.zh-CN.md";
import MergeRepairZH from "./merge-repair.zh.md";
import MergeRepairEN from "./merge-repair.en.md";
import MergeRepairCN from "./merge-repair.zh-CN.md";
import SynthesizeZH from "./synthesize.zh.md";
import SynthesizeEN from "./synthesize.en.md";
import SynthesizeCN from "./synthesize.zh-CN.md";
import VisualAutoZH from "./visual-auto.zh.md";
import VisualAutoEN from "./visual-auto.en.md";
import VisualAutoCN from "./visual-auto.zh-CN.md";
import VisualEmbedZH from "./visual-embed.zh.md";
import VisualEmbedEN from "./visual-embed.en.md";
import VisualEmbedCN from "./visual-embed.zh-CN.md";
import VisualNoneZH from "./visual-none.zh.md";
import VisualNoneEN from "./visual-none.en.md";
import VisualNoneCN from "./visual-none.zh-CN.md";
import VisualOnZH from "./visual-on.zh.md";
import VisualOnEN from "./visual-on.en.md";
import VisualOnCN from "./visual-on.zh-CN.md";
import VisualPreserveZH from "./visual-preserve.zh.md";
import VisualPreserveEN from "./visual-preserve.en.md";
import VisualPreserveCN from "./visual-preserve.zh-CN.md";

/** Prompt text of the general task step and its visual guidance; Markdown files next to this module. */
const text = (template: string): string => renderTemplate(template, {});
const pair = (zh: string, en: string, cn: string): FragmentPair => ({ zh: text(zh), en: text(en), cn: text(cn) });

export const ADAPTIVE_DETAIL_STRUCTURE: FragmentPair = pair(
  AdaptiveDetailStructureZH,
  AdaptiveDetailStructureEN,
  AdaptiveDetailStructureCN
);
export const DECOMPOSE: FragmentPair = pair(DecomposeZH, DecomposeEN, DecomposeCN);
export const DEFAULT_TASK: FragmentPair = pair(DefaultTaskZH, DefaultTaskEN, DefaultTaskCN);
/** A template, not text: {@link detailStructure} fills its `{{headings}}` placeholder. */
const DETAIL_STRUCTURE_TEMPLATE: FragmentPair = { zh: DetailStructureZH, en: DetailStructureEN, cn: DetailStructureCN };
export const GENERAL_TASK: FragmentPair = pair(GeneralTaskZH, GeneralTaskEN, GeneralTaskCN);
export const JSON_CONTRACT: FragmentPair = pair(JsonZH, JsonEN, JsonCN);
export const LABEL_DETAIL: FragmentPair = pair(LabelDetailZH, LabelDetailEN, LabelDetailCN);
export const LABEL_FINDINGS: FragmentPair = pair(LabelFindingsZH, LabelFindingsEN, LabelFindingsCN);
export const OUTPUT_LANGUAGE: FragmentPair = pair(OutputLanguageZH, OutputLanguageEN, OutputLanguageCN);
/** Merge mode: organize only what the sources say (no synthesis of agreements, tradeoffs or open questions). */
export const MERGE: FragmentPair = pair(MergeZH, MergeEN, MergeCN);
export const SYNTHESIZE: FragmentPair = pair(SynthesizeZH, SynthesizeEN, SynthesizeCN);
export const VISUAL_AUTO: FragmentPair = pair(VisualAutoZH, VisualAutoEN, VisualAutoCN);
export const VISUAL_EMBED: FragmentPair = pair(VisualEmbedZH, VisualEmbedEN, VisualEmbedCN);
export const VISUAL_NONE: FragmentPair = pair(VisualNoneZH, VisualNoneEN, VisualNoneCN);
export const VISUAL_ON: FragmentPair = pair(VisualOnZH, VisualOnEN, VisualOnCN);
export const VISUAL_PRESERVE: FragmentPair = pair(VisualPreserveZH, VisualPreserveEN, VisualPreserveCN);

/** The six standard Detail headings are interface text, so the caller builds them; this fills the structure sentence. */
export function detailStructure(language: UiLanguage, headings: string): string {
  return renderTemplate(inLanguage(DETAIL_STRUCTURE_TEMPLATE, language), { headings });
}
const CUSTOM_DETAIL_STRUCTURE_TEMPLATE: FragmentPair = {
  zh: CustomDetailStructureZH,
  en: CustomDetailStructureEN,
  cn: CustomDetailStructureCN
};
/** A custom template's structure sentence: `{{count}}` headings, the heading list, then any per-section rules. */
export function customDetailStructure(
  language: UiLanguage,
  values: { count: string; headings: string; rules: string }
): string {
  return renderTemplate(inLanguage(CUSTOM_DETAIL_STRUCTURE_TEMPLATE, language), values);
}
const CUSTOM_DETAIL_RULES: Record<"log" | "description" | "exact" | "min", FragmentPair> = {
  log: { zh: CustomRuleLogZH, en: CustomRuleLogEN, cn: CustomRuleLogCN },
  description: { zh: CustomRuleDescriptionZH, en: CustomRuleDescriptionEN, cn: CustomRuleDescriptionCN },
  exact: { zh: CustomRuleExactZH, en: CustomRuleExactEN, cn: CustomRuleExactCN },
  min: { zh: CustomRuleMinZH, en: CustomRuleMinEN, cn: CustomRuleMinCN }
};
export function customDetailRule(
  kind: "log" | "description" | "exact" | "min",
  language: UiLanguage,
  values: Record<string, string>
): string {
  return renderTemplate(inLanguage(CUSTOM_DETAIL_RULES[kind], language), values);
}
const REPAIR_COUNTS_TEMPLATE: FragmentPair = { zh: RepairCountsZH, en: RepairCountsEN, cn: RepairCountsCN };
/** The single follow-up request that asks the model to fix sections whose item counts missed the template. */
export function repairCounts(language: UiLanguage, issues: string): string {
  return renderTemplate(inLanguage(REPAIR_COUNTS_TEMPLATE, language), { issues });
}
const MERGE_REPAIR_TEMPLATE: FragmentPair = { zh: MergeRepairZH, en: MergeRepairEN, cn: MergeRepairCN };
/** The single follow-up request of an AI merge whose result lost or invented numbers, links or embeds. */
export function mergeRepair(language: UiLanguage, missing: string, added: string, title: string): string {
  return renderTemplate(inLanguage(MERGE_REPAIR_TEMPLATE, language), { missing, added, title });
}
export function sourceRegistry(catalog: string): string {
  return renderTemplate(SourceRegistryTemplate, { catalog });
}

const TEXTBOOK_DETAIL_STRUCTURE_TEMPLATE: FragmentPair = {
  zh: TextbookDetailStructureZH,
  en: TextbookDetailStructureEN,
  cn: TextbookDetailStructureCN
};
/** The Textbook template's structure text: lead-in, `{{headings}}` in order, omit-empty override, self-check before `{{log}}`. */
export function textbookDetailStructure(language: UiLanguage, values: { headings: string; log: string }): string {
  return renderTemplate(inLanguage(TEXTBOOK_DETAIL_STRUCTURE_TEMPLATE, language), values);
}
