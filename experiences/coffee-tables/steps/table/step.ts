import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import {
  cleanChatStyle,
  conversationStyle,
  formatReferenceContext,
  MAX_COFFEE_CONTEXT_CHARS,
  names,
  observerFormat
} from "../../prompt-parts";
import {
  TABLE_LEAD_IN_CONTINUE,
  TABLE_LEAD_IN_NEW,
  TABLE_LEAD_IN_CONTINUE_CN,
  TABLE_LEAD_IN_NEW_CN
} from "../_shared/fragments";
import { coffeeText } from "../../language";
import { segmentSummaryInstruction } from "../../segments";
import type { CoffeeGuestInvitation, GuestSettings } from "../../types";
import en from "./prompt.en.md";
import zh from "./prompt.zh.md";
import cn from "./prompt.zh-CN.md";

export interface TableInput {
  topic: string;
  language: string;
  guests?: GuestSettings;
  draft?: string;
  priorContext?: string;
  invitedGuests?: CoffeeGuestInvitation[];
}

function variables(input: TableInput): Record<string, string> {
  const { topic, language, guests, draft = "", priorContext = "", invitedGuests = [] } = input;
  const settings = guests ?? {
    counts: { experts: 4, "cross-domain": 1, generalist: 1, affected: 1 },
    guests: [],
    background: "",
    customPrompt: ""
  };
  const attendeeRoles = names(settings, invitedGuests, language).map(role => `- ${role}`);
  const style = settings.customization
    ? cleanChatStyle(conversationStyle(language, settings))
    : conversationStyle(language, settings);
  const continuing = !!(draft || priorContext);
  const simplified = language === "zh-CN";
  return {
    hostCount: String(settings.hostCount ?? 2),
    topic,
    attendeeRoles: attendeeRoles.join("\n"),
    background: settings.background.trim()
      ? `\n${simplified ? "补充背景" : "補充背景"}：${settings.background.trim()}`
      : "",
    references: formatReferenceContext(settings.referenceFiles ?? [], language),
    custom: style ? `\n\n${simplified ? "聊天室风格" : "聊天室風格"}：\n${style}` : "",
    prior: priorContext ? `\n\n${simplified ? "先前对谈与追问" : "先前對談與追問"}：\n${priorContext}` : "",
    draftText: draft ? `\n\n${simplified ? "上次未完成的对谈草稿" : "上次未完成的對談草稿"}：\n${draft}` : "",
    opening: continuing
      ? `${simplified ? TABLE_LEAD_IN_CONTINUE_CN : TABLE_LEAD_IN_CONTINUE}\n\n`
      : simplified
        ? TABLE_LEAD_IN_NEW_CN
        : TABLE_LEAD_IN_NEW,
    notes: observerFormat(language, false, settings.customization) + segmentSummaryInstruction(language)
  };
}

/** Opening and continuation of a Coffee Table. The dialogue is parsed by the engine while it streams. */
export const tableStep: StepDefinition<TableInput, string> = {
  id: "coffee.table",
  version: 1,
  render: input => renderTemplate(coffeeText(input.language, en, zh, cn), variables(input)),
  policy: (prompt, input) => {
    if (prompt.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        coffeeText(
          input.language,
          "This table is too long to send safely in full. Start a new table; the existing conversation is preserved.",
          "這桌的內容太長，無法安全地全部交給模型。請先開新桌；舊內容已完整保留。",
          "这桌的内容太长，无法安全地全部交给模型。请先开新桌；旧内容已完整保留。"
        )
      );
  },
  parse: raw => raw
};
