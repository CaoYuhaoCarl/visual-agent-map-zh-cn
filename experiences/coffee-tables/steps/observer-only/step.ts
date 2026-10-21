import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import {
  assembleCoffeeContext,
  cleanChatStyle,
  conversationStyle,
  formatReferenceContext,
  MAX_COFFEE_CONTEXT_CHARS,
  observerFormat
} from "../../prompt-parts";
import type { CoffeeSession } from "../../types";
import { coffeeText } from "../../language";
import en from "./prompt.en.md";
import zh from "./prompt.zh.md";
import cn from "./prompt.zh-CN.md";

export interface ObserverOnlyInput {
  session: CoffeeSession;
}

function history(session: CoffeeSession): string {
  return [
    assembleCoffeeContext(session),
    session.draftMarkdown
      ? `${session.language === "zh-CN" ? "未完成对谈草稿" : "未完成對談草稿"}：\n${session.draftMarkdown}`
      : "",
    session.observerDraftMarkdown
      ? `${session.language === "zh-CN" ? "观察者整理草稿" : "觀察者整理草稿"}：\n${session.observerDraftMarkdown}`
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Refresh the observer notes only. The notes are validated and merged by the engine. */
export const observerOnlyStep: StepDefinition<ObserverOnlyInput, string> = {
  id: "coffee.observer-only",
  version: 1,
  render: ({ session }) => {
    const style = session.guests?.customization
      ? cleanChatStyle(conversationStyle(session.language, session.guests))
      : conversationStyle(session.language, session.guests);
    return renderTemplate(coffeeText(session.language, en, zh, cn), {
      styleSection: style
        ? `${coffeeText(session.language, "Conversation style", "聊天室風格", "聊天室风格")}:\n${style}\n`
        : "",
      references: formatReferenceContext(session.guests?.referenceFiles ?? [], session.language),
      history: history(session),
      observerFormat: observerFormat(session.language, true, session.guests?.customization)
    });
  },
  policy: (prompt, { session }) => {
    // Original order: the history limit was checked before the prompt was assembled.
    if (history(session).length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        coffeeText(
          session.language,
          "This table is too long to summarize safely in full. The existing conversation is preserved.",
          "這桌的內容太長，無法安全地全部交給模型。舊內容已完整保留。",
          "这桌的内容太长，无法安全地全部交给模型。旧内容已完整保留。"
        )
      );
    if (prompt.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        coffeeText(
          session.language,
          "This table is too long to summarize safely in full. The existing conversation is preserved.",
          "這桌的內容太長，無法安全地全部交給模型；舊內容已完整保留。",
          "这桌的内容太长，无法安全地全部交给模型；旧内容已完整保留。"
        )
      );
  },
  parse: raw => raw
};
