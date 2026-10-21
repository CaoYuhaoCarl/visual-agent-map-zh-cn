import { prepareStep } from "../../core/step-runner";
import { observerGuidance } from "./customization";
import { cleanChatStyle, conversationStyle, observerFormat, OBSERVER_TITLES } from "./prompt-parts";
import { segmentSummaryInstruction } from "./segments";
import { observerOnlyStep } from "./steps/observer-only/step";
import { questionStep } from "./steps/question/step";
import { tableStep } from "./steps/table/step";
import type { CoffeeGuestInvitation, CoffeeSession, GuestSettings } from "./types";

export * from "./prompt-parts";

/** The prompt text of each step is defined by its Step Runner step; these helpers render it without sending it. */
export function tablePrompt(
  topic: string,
  language: string,
  guests?: GuestSettings,
  draft = "",
  priorContext = "",
  invitedGuests: CoffeeGuestInvitation[] = []
): string {
  return prepareStep(tableStep, { topic, language, guests, draft, priorContext, invitedGuests }).prompt;
}
export function questionPrompt(
  session: CoffeeSession,
  question: string,
  draft = "",
  invitedGuests: CoffeeGuestInvitation[] = []
): string {
  return prepareStep(questionStep, { session, question, draft, invitedGuests }).prompt;
}
export function observerOnlyPrompt(session: CoffeeSession): string {
  return prepareStep(observerOnlyStep, { session }).prompt;
}
/** Display-only opening preview; provider protocol remains in the table step. */
export function openingPromptPreview(topic: string, language: string, guests: GuestSettings): string {
  const zh = language === "zh-TW";
  const style = cleanChatStyle(conversationStyle(language, guests));
  const prompt = tablePrompt(topic, language, { ...guests, stylePrompt: style });
  const guidance = guests.customization ? `${observerGuidance(language, guests.customization)}\n` : "";
  const readableNotes = zh
    ? `\n\n${guidance}觀察者整理：保留完整洞見與脈絡，引用具體發言；跨段綜合時說明沒有單一來源。更新時保留仍有價值的洞見，修正或合併重疊內容。\n${OBSERVER_TITLES.zh}\n\n最後以一句話概括本次對談的主題與思考轉折，使用聊天室語言。`
    : language === "zh-CN"
      ? `\n\n${guidance}观察者整理：保留完整洞见与脉络，引用具体发言；跨段综合时说明没有单一来源。更新时保留仍有价值的洞见，修正或合并重叠内容。\n${OBSERVER_TITLES["zh-CN"]}\n\n最后以一句话概括本次对谈的主题与思考转折，使用简体中文。`
      : `\n\n${guidance}Observer notes: retain complete insights and context, cite specific dialogue, and identify cross-turn synthesis without a single source. Preserve valuable insights when updating, revising or combining overlapping ideas.\n${OBSERVER_TITLES.en}\n\nEnd with a one-sentence summary of this segment’s topic and turn in thinking, in the conversation language.`;
  const protocol = observerFormat(language, false, guests.customization) + segmentSummaryInstruction(language);
  return prompt.slice(0, -protocol.length) + readableNotes;
}
