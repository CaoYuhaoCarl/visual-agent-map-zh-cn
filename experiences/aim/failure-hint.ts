import type { TranslationKey } from "../../i18n";

export type AimRepairHint = Extract<
  TranslationKey,
  | "ui.aim_repair_timeout_hint"
  | "ui.aim_repair_auth_hint"
  | "ui.aim_repair_format_hint"
  | "ui.aim_repair_search_hint"
  | "ui.aim_repair_retry_hint"
>;

export function aimTimedOut(reason: string): boolean {
  return /超過.*分鐘|timed?\s*out|timeout|exceeded.*minutes/i.test(reason);
}

// Only failures that say searching itself did not succeed. Broad words such as "search"
// also appear in unrelated stage names ("Searcher report"), so they are not matched alone.
const SEARCH_FAILURE =
  /no web search succeeded|usable searched report|did not perform web search|search (?:was )?not performed|web search (?:is )?unavailable|沒有實際執行網路搜尋|未執行(?:網路)?搜尋|\bENOTFOUND\b|\bECONN(?:REFUSED|RESET)\b|\bEAI_AGAIN\b|network (?:error|unavailable)|網路連線/i;

/** Picks the remedy shown under a failed AIM attempt from its recorded stop reason. */
export function aimRepairHint(reason: string): AimRepairHint {
  if (aimTimedOut(reason)) return "ui.aim_repair_timeout_hint";
  if (/auth|login|sign.in|登入|unauthorized|quota|rate.limit/i.test(reason)) return "ui.aim_repair_auth_hint";
  if (/format|schema|JSON|marker|格式|分類/i.test(reason)) return "ui.aim_repair_format_hint";
  if (SEARCH_FAILURE.test(reason)) return "ui.aim_repair_search_hint";
  return "ui.aim_repair_retry_hint";
}
