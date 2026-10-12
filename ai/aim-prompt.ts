import type { UiLanguage } from "../i18n";
import {
  inLanguage,
  LABEL_ANCESTORS,
  LABEL_RULES,
  LABEL_SOURCES,
  LABEL_SUMMARY,
  LABEL_TASK,
  LABEL_TOPIC,
  LOCAL_FIRST,
  REFERENCE_CITATIONS,
  ROLE,
  SOURCE_SAFETY
} from "../core/steps/_shared/fragments";
import type { TaskContext } from "./types";

export function aimPhase(task: string): string | undefined {
  return task.match(/<!--\s*aim-phase:\s*([a-z-]+)\s*-->/)?.[1];
}

function phaseGuidance(
  phase: string | undefined,
  language: UiLanguage,
  responseContract?: TaskContext["responseContract"],
  structured = false
): string {
  const english = language === "en";
  const gapAuditContract = phase === "research-gap-audit" && responseContract === "aim-gap-audit";
  const common = structured
    ? english
      ? "Follow the phase task. Put machine-readable decisions, questions, choices and plans only in the aim field defined by the response schema; summary and detail are reader-facing text. Do not write HTML comment markers. Leave aim fields that do not apply to the chosen decision empty. Do not impose a fixed heading template or turn planning, review, repair, or research into a complete knowledge page."
      : "依照本階段任務處理。機器可讀的決策、問題、選項與規劃只放在 response schema 定義的 aim 欄位；summary 與 detail 是給讀者看的內容，不要寫 HTML 註解標記。與所選決策無關的 aim 欄位留空。不要套用固定標題模板，也不要把規劃、審查、修復或研究階段改寫成完整知識頁。"
    : gapAuditContract
      ? english
        ? "Follow the phase task and the dedicated response schema exactly. Do not add a marker, suggestions, or visual references. Do not impose a fixed heading template or turn this audit into a complete knowledge page."
        : "嚴格遵循本階段任務與專用回應 schema。不要增加標記、建議或視覺參考；不要套用固定標題模板，也不要把稽核改寫成完整知識頁。"
      : english
        ? "Follow the phase task exactly. Do not impose a fixed heading template or turn planning, review, repair, or research into a complete knowledge page."
        : "依照本階段任務處理。不要套用固定標題模板，也不要把規劃、審查、修復或研究階段改寫成完整知識頁。";
  const phaseRules: Record<string, string> = english
    ? {
        "research-gap-audit":
          "Write the rationale first in detail, then set summary to exactly user_condition or external_evidence. Return empty suggestions and visualReferences arrays.",
        "initial-clarification": "Ask only necessary unknown user conditions in aim.questions; an empty list is valid.",
        "initial-question":
          "When asking, put one direct question in aim.question and 2–5 distinct answer choices in aim.answerOptions. Do not answer for the user.",
        "research-plan":
          "Return 0–5 distinct evidence tasks in aim.subtopics, using reuse/update/research and dependsOn. Empty requires usable prior evidence; no minimum new searches. Do not answer the goal or research in this Planner turn.",
        "research-plan-repair":
          "Repair only the reported plan defect using the supplied context. Return 0–5 distinct evidence tasks in aim.subtopics; empty requires usable prior evidence; do not research.",
        "subtopic-research":
          "Research only the assigned target. Report search status accurately, distinguish evidence from uncertainty, and preserve source attribution. Do not ask the user.",
        "targeted-followup-research":
          "Research the single assigned evidence gap. Report search status accurately, distinguish evidence from uncertainty, and preserve source attribution. Do not ask the user.",
        "report-review":
          "For research_more, give exactly one aim.researchTarget. For ask_user, give one direct aim.question and 2–5 distinct aim.answerOptions. For conclude, give aim.stopReason.",
        "decision-quality-review":
          "Review only the supplied candidate and evidence. For research_more, give exactly one aim.researchTarget. For ask_user, give one direct aim.question and 2–5 distinct aim.answerOptions. For conclude, give aim.stopReason.",
        "format-repair":
          "Repair only missing or malformed required fields. Preserve the existing decision and user question exactly; do not reinterpret evidence, change the decision, or add facts.",
        "delivery-outline":
          "Design the requested document outline in aim.sections. Do not write the document or perform research.",
        "delivery-research":
          "Research only the agreed final-document outline. Report availability accurately and preserve source attribution. Do not write the document or ask the user.",
        "delivery-writing":
          "Write the requested reader-facing deliverable from supplied context and evidence. Follow the task's requested structure and preserve attribution and uncertainty.",
        "delivery-acceptance":
          "Review the complete deliverable against the original goal and task contract. Return the decision in the aim fields and a brief acceptance note or list of issues; do not reproduce or rewrite the draft. If research_more is required, identify one concrete evidence target. Do not ask the user."
      }
    : {
        "research-gap-audit":
          "先在 detail 撰寫簡短理由，再將 summary 設為完全相同的 user_condition 或 external_evidence。suggestions 與 visualReferences 必須是空陣列。",
        "initial-clarification": "只在 aim.questions 詢問必要且未知的使用者條件；可以是空清單。",
        "initial-question":
          "需要提問時，在 aim.question 寫一個直接的問句，並在 aim.answerOptions 提供 2–5 個不同選項。不要代替使用者回答。",
        "research-plan":
          "在 aim.subtopics 回傳 0–5 個不同證據任務，標明沿用、更新或新查證及依賴；零任務須有可用的既有證據，不要求最低搜尋數；此 Planner 階段不要回答整體目標或進行研究。",
        "research-plan-repair":
          "只依提供的脈絡修復回報的規劃缺陷，在 aim.subtopics 回傳 0–5 個不同證據任務；零任務須有可用的既有證據；不要進行研究。",
        "subtopic-research": "只研究指定目標。準確回報搜尋狀態，區分證據與不確定性並保留來源歸屬；不要詢問使用者。",
        "targeted-followup-research":
          "只研究指定的一項證據缺口。準確回報搜尋狀態，區分證據與不確定性並保留來源歸屬；不要詢問使用者。",
        "report-review":
          "research_more 必須提供恰好一個 aim.researchTarget；ask_user 必須提供一個直接的 aim.question 與 2–5 個不同的 aim.answerOptions；conclude 必須提供 aim.stopReason。",
        "decision-quality-review":
          "只審查提供的候選決策與證據。research_more 必須提供恰好一個 aim.researchTarget；ask_user 必須提供一個直接的 aim.question 與 2–5 個不同的 aim.answerOptions；conclude 必須提供 aim.stopReason。",
        "format-repair":
          "只修復缺漏或格式錯誤的必要欄位。原樣保留既有決策與使用者問題；不要重新解讀證據、改變決策或新增事實。",
        "delivery-outline": "在 aim.sections 設計要求的文件大綱；不要撰寫文件或進行研究。",
        "delivery-research": "只研究已確認的最終文件大綱。準確回報可取得性並保留來源歸屬；不要撰寫文件或詢問使用者。",
        "delivery-writing": "依提供的脈絡與證據撰寫要求的讀者文件，遵循任務指定結構並保留來源歸屬與不確定性。",
        "delivery-acceptance":
          "依原始目標與任務契約審查完整交付內容。在 aim 欄位回傳決策，並附簡短通過說明或問題清單；不要重複或改寫草稿。需要 research_more 時指出一個具體證據目標。不要詢問使用者。"
      };
  return [common, phase ? phaseRules[phase] : ""].filter(Boolean).join("\n\n");
}

/** Builds the compact AIM prompt while retaining the regular AiResult JSON contract. */
export function buildAimPrompt(context: TaskContext, language: UiLanguage): string {
  const phase = aimPhase(context.task);
  const languageInstruction =
    language === "en"
      ? "Write generated content in English unless the current task or topic rules explicitly request another language. Preserve quoted source text and proper names."
      : "新產生的內容使用繁體中文，除非目前任務或議題規則明確指定其他語言。保留來源原文引述與專有名稱。";
  const field = (label: string, value: string | undefined) => (value?.trim() ? `${label}:\n${value}` : "");
  const blocks = [
    languageInstruction,
    inLanguage(ROLE, language),
    inLanguage(SOURCE_SAFETY, language),
    context.sourceContext ? inLanguage(REFERENCE_CITATIONS, language) : "",
    context.sourceContext && context.researchMode !== "local" ? inLanguage(LOCAL_FIRST, language) : "",
    language === "en"
      ? "Return JSON only, matching the supplied response schema and including every required field. AIM has visual search disabled, so visualReferences must be an empty array."
      : "只回傳符合提供之 response schema 的 JSON，並包含所有必要欄位。AIM 未啟用視覺搜尋，因此 visualReferences 必須是空陣列。",
    phaseGuidance(phase, language, context.responseContract, !!context.aimContract),
    context.researchMode === "local"
      ? language === "en"
        ? "Do not use web search in this local-only phase."
        : "此階段僅使用本次提供的內容，不要進行網路搜尋。"
      : context.researchMode === "research"
        ? language === "en"
          ? "Use available web search tools when the phase task requires external evidence. Report search status truthfully."
          : "階段任務需要外部證據時使用可用的網路搜尋工具，並如實回報搜尋狀態。"
        : "",
    field(inLanguage(LABEL_TOPIC, language), context.title),
    field(inLanguage(LABEL_SUMMARY, language), context.summary),
    context.detail
      ? `${language === "en" ? "Current detail and supplied reports" : "目前內容與提供的報告"}:\n${context.detail}`
      : "",
    field(inLanguage(LABEL_RULES, language), context.rules),
    context.workingFindings
      ? `${language === "en" ? "Previous findings" : "先前發現"}:\n${context.workingFindings}`
      : "",
    context.sourceContext ? `${inLanguage(LABEL_SOURCES, language)}:\n${context.sourceContext}` : "",
    field(inLanguage(LABEL_ANCESTORS, language), context.ancestors),
    field(inLanguage(LABEL_TASK, language), context.task)
  ];
  return blocks.filter(Boolean).join("\n\n");
}
