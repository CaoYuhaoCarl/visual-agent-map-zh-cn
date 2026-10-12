import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import {
  assembleCoffeeContext,
  cleanChatStyle,
  conversationStyle,
  formatReferenceContext,
  invitationContext,
  MAX_COFFEE_CONTEXT_CHARS,
  observerFormat
} from "../../prompt-parts";
import { segmentSummaryInstruction } from "../../segments";
import type { CoffeeGuestInvitation, CoffeeSession } from "../../types";
import en from "./prompt.en.md";
import zh from "./prompt.zh.md";

export interface QuestionInput {
  session: CoffeeSession;
  question: string;
  draft?: string;
  invitedGuests?: CoffeeGuestInvitation[];
}

function variables(input: QuestionInput, context: string): Record<string, string> {
  const { session, question, draft = "", invitedGuests = [] } = input;
  const settings = session.guests;
  const style = settings?.customization
    ? cleanChatStyle(conversationStyle(session.language, settings))
    : conversationStyle(session.language, settings);
  const inviteContext = invitationContext(invitedGuests, session.language);
  return {
    custom: style ? `\n聊天室風格：\n${style}` : "",
    references: formatReferenceContext(settings?.referenceFiles ?? []),
    context,
    inviteBlock: inviteContext ? `\n\n${inviteContext}` : "",
    question,
    draftBlock: draft ? `\n\n上次已保存的回答草稿：\n${draft}` : "",
    observerFormat: observerFormat(session.language, false, settings?.customization),
    summaryInstruction: segmentSummaryInstruction(session.language)
  };
}

/** Follow-up answer. The answer is parsed by the engine while it streams. */
export const questionStep: StepDefinition<QuestionInput, string> = {
  id: "coffee.question",
  version: 1,
  render: input => {
    const context = assembleCoffeeContext(input.session);
    return renderTemplate(input.session.language === "zh-TW" ? zh : en, variables(input, context));
  },
  policy: (prompt, input) => {
    const zhTw = input.session.language === "zh-TW";
    // Original order: the context-plus-question limit was checked before the prompt was assembled.
    if (assembleCoffeeContext(input.session).length + input.question.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        zhTw
          ? "這桌的內容太長，無法安全地全部交給模型。請先開新桌；舊內容已完整保留。"
          : "This table is too long to send safely in full. Start a new table; the existing conversation is preserved."
      );
    if (prompt.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        zhTw
          ? "這桌的內容太長，無法安全地全部交給模型；桌聊已保留。"
          : "This table is too long to send safely in full; the existing conversation is preserved."
      );
  },
  parse: raw => raw
};
