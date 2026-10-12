import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import { MAX_COFFEE_CONTEXT_CHARS } from "../../prompt-parts";
import { parseSummaryBatch } from "../../segments";
import en from "./prompt.en.md";
import zh from "./prompt.zh.md";

export interface NavigationSummaryInput {
  language: string;
  segments: Array<{ id: string; text: string }>;
}

/**
 * One-sentence navigation summaries for segments that have none. `parse` is the whole JSON contract; the engine
 * calls it after its stale-generation and abort checks, so it uses `StepRunner.send`.
 */
export const navigationSummaryStep: StepDefinition<NavigationSummaryInput, Array<{ id: string; summary: string }>> = {
  id: "coffee.navigation-summary",
  version: 1,
  render: ({ language, segments }) =>
    renderTemplate(language === "zh-TW" ? zh : en, {
      segments: JSON.stringify(segments.map(({ id, text }) => ({ id, text })))
    }),
  policy: (prompt, { language }) => {
    if (prompt.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        language === "zh-TW"
          ? "對談太長，無法一次補齊摘要；原資料保留，內容未截斷。"
          : "The conversation is too long to summarize in one request; no content was truncated or changed."
      );
  },
  parse: (raw, { segments }) =>
    parseSummaryBatch(
      raw,
      segments.map(item => item.id)
    )
};
