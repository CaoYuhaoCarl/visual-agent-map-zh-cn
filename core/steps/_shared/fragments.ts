import { renderTemplate } from "../../step-runner";
import type { UiLanguage } from "../../../i18n";
import LabelAncestorsZH from "./label-ancestors.zh.md";
import LabelAncestorsEN from "./label-ancestors.en.md";
import LabelAncestorsCN from "./label-ancestors.zh-CN.md";
import LabelRulesZH from "./label-rules.zh.md";
import LabelRulesEN from "./label-rules.en.md";
import LabelRulesCN from "./label-rules.zh-CN.md";
import LabelSourcesZH from "./label-sources.zh.md";
import LabelSourcesEN from "./label-sources.en.md";
import LabelSourcesCN from "./label-sources.zh-CN.md";
import LabelSummaryZH from "./label-summary.zh.md";
import LabelSummaryEN from "./label-summary.en.md";
import LabelSummaryCN from "./label-summary.zh-CN.md";
import LabelTaskZH from "./label-task.zh.md";
import LabelTaskEN from "./label-task.en.md";
import LabelTaskCN from "./label-task.zh-CN.md";
import LabelTopicZH from "./label-topic.zh.md";
import LabelTopicEN from "./label-topic.en.md";
import LabelTopicCN from "./label-topic.zh-CN.md";
import LocalFirstZH from "./local-first.zh.md";
import LocalFirstEN from "./local-first.en.md";
import LocalFirstCN from "./local-first.zh-CN.md";
import NoneZH from "./none.zh.md";
import NoneEN from "./none.en.md";
import NoneCN from "./none.zh-CN.md";
import ObsidianFormatZH from "./obsidian-format.zh.md";
import ObsidianFormatEN from "./obsidian-format.en.md";
import ObsidianFormatCN from "./obsidian-format.zh-CN.md";
import ReferenceCitationsZH from "./reference-citations.zh.md";
import ReferenceCitationsEN from "./reference-citations.en.md";
import ReferenceCitationsCN from "./reference-citations.zh-CN.md";
import RoleZH from "./role.zh.md";
import RoleEN from "./role.en.md";
import RoleCN from "./role.zh-CN.md";
import SourceSafetyZH from "./source-safety.zh.md";
import SourceSafetyEN from "./source-safety.en.md";
import SourceSafetyCN from "./source-safety.zh-CN.md";
import ToneZH from "./tone.zh.md";
import ToneEN from "./tone.en.md";
import ToneCN from "./tone.zh-CN.md";

/**
 * Prompt text shared by the general task step and the AIM prompt builder. Each fragment is a Markdown file next to this
 * module; the file's own trailing newline is removed so the text equals the string it replaced.
 */
const text = (template: string): string => renderTemplate(template, {});
export interface FragmentPair {
  readonly zh: string;
  readonly en: string;
  readonly cn: string;
}
const pair = (zh: string, en: string, cn: string): FragmentPair => ({ zh: text(zh), en: text(en), cn: text(cn) });

/** Select the static resource explicitly; unknown runtime values use English, never an inferred Chinese variant. */
export function inLanguage(fragment: FragmentPair, language: UiLanguage): string {
  return language === "zh-CN" ? fragment.cn : language === "zh-TW" ? fragment.zh : fragment.en;
}

export const LABEL_ANCESTORS: FragmentPair = pair(LabelAncestorsZH, LabelAncestorsEN, LabelAncestorsCN);
export const LABEL_RULES: FragmentPair = pair(LabelRulesZH, LabelRulesEN, LabelRulesCN);
export const LABEL_SOURCES: FragmentPair = pair(LabelSourcesZH, LabelSourcesEN, LabelSourcesCN);
export const LABEL_SUMMARY: FragmentPair = pair(LabelSummaryZH, LabelSummaryEN, LabelSummaryCN);
export const LABEL_TASK: FragmentPair = pair(LabelTaskZH, LabelTaskEN, LabelTaskCN);
export const LABEL_TOPIC: FragmentPair = pair(LabelTopicZH, LabelTopicEN, LabelTopicCN);
export const LOCAL_FIRST: FragmentPair = pair(LocalFirstZH, LocalFirstEN, LocalFirstCN);
export const NONE: FragmentPair = pair(NoneZH, NoneEN, NoneCN);
/** How a reader-facing detail uses Obsidian syntax (callouts, tables, mermaid, task lists, highlights). */
export const OBSIDIAN_FORMAT: FragmentPair = pair(ObsidianFormatZH, ObsidianFormatEN, ObsidianFormatCN);
export const REFERENCE_CITATIONS: FragmentPair = pair(ReferenceCitationsZH, ReferenceCitationsEN, ReferenceCitationsCN);
export const ROLE: FragmentPair = pair(RoleZH, RoleEN, RoleCN);
export const SOURCE_SAFETY: FragmentPair = pair(SourceSafetyZH, SourceSafetyEN, SourceSafetyCN);

/**
 * The tone rule plus the resolved tone text. Callers add it only when a tone text exists (academic or absent adds
 * nothing), so prompts without a tone stay byte-identical to before.
 */
export function toneBlock(toneText: string, language: UiLanguage): string {
  return renderTemplate(inLanguage({ zh: ToneZH, en: ToneEN, cn: ToneCN }, language), { tone: toneText });
}
