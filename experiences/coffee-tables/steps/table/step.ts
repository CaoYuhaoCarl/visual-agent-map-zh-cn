import { renderTemplate, type StepDefinition } from "../../../../core/step-runner";
import {
  cleanChatStyle,
  conversationStyle,
  formatReferenceContext,
  MAX_COFFEE_CONTEXT_CHARS,
  names,
  observerFormat
} from "../../prompt-parts";
import { segmentSummaryInstruction } from "../../segments";
import type { CoffeeGuestInvitation, GuestSettings } from "../../types";
import en from "./prompt.en.md";
import zh from "./prompt.zh.md";

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
  const attendeeRoles = names(settings, invitedGuests).map(role => `- ${role}`);
  const style = settings.customization
    ? cleanChatStyle(conversationStyle(language, settings))
    : conversationStyle(language, settings);
  const continuing = !!(draft || priorContext);
  return {
    hostCount: String(settings.hostCount ?? 2),
    topic,
    attendeeRoles: attendeeRoles.join("\n"),
    background: settings.background.trim() ? `\n補充背景：${settings.background.trim()}` : "",
    references: formatReferenceContext(settings.referenceFiles ?? []),
    custom: style ? `\n\n聊天室風格：\n${style}` : "",
    prior: priorContext ? `\n\n先前對談與追問：\n${priorContext}` : "",
    draftText: draft ? `\n\n上次未完成的對談草稿：\n${draft}` : "",
    opening: continuing
      ? "這是同一桌的續聊，以下是已保存的對話脈絡。\n\n"
      : "開場依序列出參與者（每人一行「- **姓名｜角色**：簡短背景」）。",
    notes: observerFormat(language, false, settings.customization) + segmentSummaryInstruction(language)
  };
}

/** Opening and continuation of a Coffee Table. The dialogue is parsed by the engine while it streams. */
export const tableStep: StepDefinition<TableInput, string> = {
  id: "coffee.table",
  version: 1,
  render: input => renderTemplate(input.language === "zh-TW" ? zh : en, variables(input)),
  policy: (prompt, input) => {
    if (prompt.length > MAX_COFFEE_CONTEXT_CHARS)
      throw new Error(
        input.language === "zh-TW"
          ? "這桌的內容太長，無法安全地全部交給模型。請先開新桌；舊內容已完整保留。"
          : "This table is too long to send safely in full. Start a new table; the existing conversation is preserved."
      );
  },
  parse: raw => raw
};
