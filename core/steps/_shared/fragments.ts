import { renderTemplate } from "../../step-runner";
import type { UiLanguage } from "../../../i18n";
import LabelAncestorsZH from "./label-ancestors.zh.md";
import LabelAncestorsEN from "./label-ancestors.en.md";
import LabelRulesZH from "./label-rules.zh.md";
import LabelRulesEN from "./label-rules.en.md";
import LabelSourcesZH from "./label-sources.zh.md";
import LabelSourcesEN from "./label-sources.en.md";
import LabelSummaryZH from "./label-summary.zh.md";
import LabelSummaryEN from "./label-summary.en.md";
import LabelTaskZH from "./label-task.zh.md";
import LabelTaskEN from "./label-task.en.md";
import LabelTopicZH from "./label-topic.zh.md";
import LabelTopicEN from "./label-topic.en.md";
import LocalFirstZH from "./local-first.zh.md";
import LocalFirstEN from "./local-first.en.md";
import NoneZH from "./none.zh.md";
import NoneEN from "./none.en.md";
import ReferenceCitationsZH from "./reference-citations.zh.md";
import ReferenceCitationsEN from "./reference-citations.en.md";
import RoleZH from "./role.zh.md";
import RoleEN from "./role.en.md";
import SourceSafetyZH from "./source-safety.zh.md";
import SourceSafetyEN from "./source-safety.en.md";

/**
 * Prompt text shared by the general task step and the AIM prompt builder. Each fragment is a Markdown file next to this
 * module; the file's own trailing newline is removed so the text equals the string it replaced.
 */
const text = (template: string): string => renderTemplate(template, {});
export interface FragmentPair {
  readonly zh: string;
  readonly en: string;
}
const pair = (zh: string, en: string): FragmentPair => ({ zh: text(zh), en: text(en) });

/** The fragment in the interface language; `en` selects English, anything else Traditional Chinese (as `translate` does). */
export function inLanguage(fragment: FragmentPair, language: UiLanguage): string {
  return language === "en" ? fragment.en : fragment.zh;
}

export const LABEL_ANCESTORS: FragmentPair = pair(LabelAncestorsZH, LabelAncestorsEN);
export const LABEL_RULES: FragmentPair = pair(LabelRulesZH, LabelRulesEN);
export const LABEL_SOURCES: FragmentPair = pair(LabelSourcesZH, LabelSourcesEN);
export const LABEL_SUMMARY: FragmentPair = pair(LabelSummaryZH, LabelSummaryEN);
export const LABEL_TASK: FragmentPair = pair(LabelTaskZH, LabelTaskEN);
export const LABEL_TOPIC: FragmentPair = pair(LabelTopicZH, LabelTopicEN);
export const LOCAL_FIRST: FragmentPair = pair(LocalFirstZH, LocalFirstEN);
export const NONE: FragmentPair = pair(NoneZH, NoneEN);
export const REFERENCE_CITATIONS: FragmentPair = pair(ReferenceCitationsZH, ReferenceCitationsEN);
export const ROLE: FragmentPair = pair(RoleZH, RoleEN);
export const SOURCE_SAFETY: FragmentPair = pair(SourceSafetyZH, SourceSafetyEN);
