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
import en from "./prompt.en.md";
import zh from "./prompt.zh.md";

export interface ObserverOnlyInput {
  session: CoffeeSession;
}

function history(session: CoffeeSession): string {
  return [
    assembleCoffeeContext(session),
    session.draftMarkdown ? `未完成對談草稿：\n${session.draftMarkdown}` : "",
    session.observerDraftMarkdown ? `觀察者整理草稿：\n${session.observerDraftMarkdown}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Refresh the observer notes only. The notes are validated and merged by the engine. */
export const observerOnlyStep: StepDefinition<ObserverOnlyInput, string> = {
  id: "coffee.observer-only",
  version: 1,
  render: ({ session }) => {
    const zhTw = session.language === "zh-TW";
    const style = session.guests?.customization
      ? cleanChatStyle(conversationStyle(session.language, session.guests))
      : conversationStyle(session.language, session.guests);
    return renderTemplate(zhTw ? zh : en, {
      styleSection: style ? `${zhTw ? "聊天室風格" : "Conversation style"}:\n${style}\n` : "",
      references: formatReferenceContext(session.guests?.referenceFiles ?? []),
      history: history(session),
      observerFormat: observerFormat(session.language, true, session.guests?.customization)
    });
  },
  policy: (prompt, { session }) => {
    const zhTw = session.language === "zh-TW";
    // Original order: the history limit was checked before the prompt was assembled.
    if (history(session).length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        zhTw
          ? "這桌的內容太長，無法安全地全部交給模型。舊內容已完整保留。"
          : "This table is too long to summarize safely in full. The existing conversation is preserved."
      );
    if (prompt.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        zhTw
          ? "這桌的內容太長，無法安全地全部交給模型；舊內容已完整保留。"
          : "This table is too long to summarize safely in full. The existing conversation is preserved."
      );
  },
  parse: raw => raw
};
