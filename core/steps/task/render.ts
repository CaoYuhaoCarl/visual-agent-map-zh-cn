import { buildAimPrompt } from "../aim/shell";
import { researchGuidance } from "../../../ai/task-policy";
import type { TaskContext } from "../../../ai/types";
import { visualGuidance } from "../../../ai/visual-guidance";
import type { UiLanguage } from "../../../i18n";
import { detailStructurePrompt, standardTemplate } from "../../../ai/detail-templates";
import {
  inLanguage,
  LABEL_ANCESTORS,
  LABEL_RULES,
  LABEL_SOURCES,
  LABEL_SUMMARY,
  LABEL_TASK,
  LABEL_TOPIC,
  LOCAL_FIRST,
  NONE,
  OBSIDIAN_FORMAT,
  REFERENCE_CITATIONS,
  ROLE,
  SOURCE_SAFETY,
  toneBlock
} from "../_shared/fragments";
import {
  ADAPTIVE_DETAIL_STRUCTURE,
  DECOMPOSE,
  DEFAULT_TASK,
  detailStructure,
  GENERAL_TASK,
  JSON_CONTRACT,
  LABEL_DETAIL,
  LABEL_FINDINGS,
  OUTPUT_LANGUAGE,
  SYNTHESIZE
} from "./fragments";

/** The regular (non-AIM) task prompt. Empty blocks are kept, so the blank-line layout matches the original builder. */
export function generalTaskPrompt(context: TaskContext, language: UiLanguage): string {
  const modeFragment =
    context.mode === "task"
      ? GENERAL_TASK
      : context.mode === "decompose"
        ? DECOMPOSE
        : context.mode === "synthesize"
          ? SYNTHESIZE
          : DEFAULT_TASK;
  const none = inLanguage(NONE, language);
  return [
    inLanguage(OUTPUT_LANGUAGE, language),
    inLanguage(ROLE, language),
    inLanguage(SOURCE_SAFETY, language),
    context.sourceContext ? inLanguage(REFERENCE_CITATIONS, language) : "",
    context.sourceContext && context.researchMode !== "local" ? inLanguage(LOCAL_FIRST, language) : "",
    inLanguage(JSON_CONTRACT, language),
    ...(context.toneText ? [toneBlock(context.toneText, language)] : []),
    inLanguage(modeFragment, language),
    context.mode !== "decompose"
      ? [
          context.detailFormat === "adaptive"
            ? inLanguage(ADAPTIVE_DETAIL_STRUCTURE, language)
            : detailStructurePrompt(context.detailTemplate ?? standardTemplate(language), language, headings =>
                detailStructure(language, headings)
              ),
          context.intermediateDetail ? "" : inLanguage(OBSIDIAN_FORMAT, language)
        ]
          .filter(Boolean)
          .join("\n\n")
      : "",
    researchGuidance(context, language),
    ...visualGuidance(context, language),
    `${inLanguage(LABEL_TOPIC, language)}:\n${context.title}`,
    `${inLanguage(LABEL_SUMMARY, language)}:\n${context.summary}`,
    context.mode !== "decompose" ? `${inLanguage(LABEL_DETAIL, language)}:\n${context.detail || none}` : "",
    `${inLanguage(LABEL_RULES, language)}:\n${context.rules || none}`,
    context.workingFindings ? `${inLanguage(LABEL_FINDINGS, language)}:\n${context.workingFindings}` : "",
    context.sourceContext ? `${inLanguage(LABEL_SOURCES, language)}:\n${context.sourceContext}` : "",
    `${inLanguage(LABEL_ANCESTORS, language)}:\n${context.ancestors || none}`,
    `${inLanguage(LABEL_TASK, language)}:\n${context.task}`
  ].join("\n\n");
}

/** AIM requests use the AIM prompt shell in core/steps/aim; its templates are Markdown files there. */
export function taskPrompt(context: TaskContext, language: UiLanguage): string {
  return context.promptProfile === "aim" ? buildAimPrompt(context, language) : generalTaskPrompt(context, language);
}
