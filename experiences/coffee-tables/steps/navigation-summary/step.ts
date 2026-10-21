import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import { MAX_COFFEE_CONTEXT_CHARS } from "../../prompt-parts";
import { parseSummaryBatch } from "../../segments";
import { coffeeText } from "../../language";
import en from "./prompt.en.md";
import zh from "./prompt.zh.md";
import cn from "./prompt.zh-CN.md";

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
    renderTemplate(coffeeText(language, en, zh, cn), {
      segments: JSON.stringify(segments.map(({ id, text }) => ({ id, text })))
    }),
  policy: (prompt, { language }) => {
    if (prompt.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        coffeeText(
          language,
          "The conversation is too long to summarize in one request; no content was truncated or changed.",
          "對談太長，無法一次補齊摘要；原資料保留，內容未截斷。",
          "对谈太长，无法一次补齐摘要；原资料保留，内容未截断。"
        )
      );
  },
  parse: (raw, { segments }) =>
    parseSummaryBatch(
      raw,
      segments.map(item => item.id)
    )
};
