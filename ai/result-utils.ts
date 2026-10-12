import type { VisualReference } from "../repository";
import { translate, type UiLanguage } from "../i18n";
import type { AiResult } from "./types";

const SENTENCE_END = /[。！？；!?;]/;

/**
 * Shortens a map summary to `limit` code points without leaving trailing whitespace.
 * Prefers a sentence end, then a word gap, in the second half of the window; otherwise
 * cuts hard. Shortened text that does not end a sentence gets an ellipsis within the limit.
 */
export function truncateSummary(value: string, limit = 80): string {
  const characters = Array.from(value.trim());
  if (characters.length <= limit) return characters.join("");
  const floor = Math.floor(limit / 2);
  for (let index = limit - 1; index >= floor; index--) {
    const character = characters[index];
    if (SENTENCE_END.test(character) || (character === "." && /\s/.test(characters[index + 1] ?? "")))
      return characters.slice(0, index + 1).join("");
  }
  const window = characters.slice(0, limit - 1);
  let gap = -1;
  for (let index = window.length - 1; index >= floor && gap < 0; index--) if (/\s/.test(window[index])) gap = index;
  return `${(gap >= 0 ? window.slice(0, gap) : window).join("").trimEnd()}…`;
}

const LEGACY_SEARCH_FAILURE = /\bresearch status\s*:\s*(?:not searched|search failed|unavailable)\b/i;

/** A searched report is unusable when its structured status says no search succeeded; legacy wording is consulted only without one. */
export function reportedSearchFailure(result: Pick<AiResult, "summary" | "detail" | "searchStatus">): boolean {
  // A completed report may still mention one unavailable source or subtask in its narrative.
  if (result.searchStatus !== undefined) return result.searchStatus !== "completed";
  return LEGACY_SEARCH_FAILURE.test(`${result.summary}\n${result.detail}`);
}

/** Marks each line that belongs to a fenced code block (fence lines included). */
export function fencedLines(lines: string[]): boolean[] {
  let fence: string | null = null;
  return lines.map(line => {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return true;
    }
    if (open) {
      fence = open[1];
      return true;
    }
    return false;
  });
}

/**
 * A footnote definition VAM writes for a note source: an old `src-` label, a single wikilink, or an external-source
 * note. Other footnotes belong to the writer and are left alone.
 */
export function sourceFootnoteDefinition(line: string): { label: string; target: string } | null {
  const match = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/.exec(line);
  if (!match) return null;
  const target = match[2].trim();
  const external = (["zh-TW", "en"] as const).some(locale =>
    target.startsWith(translate(locale, "note.external_source_0", "").trim())
  );
  return match[1].startsWith("src-") || /^\[\[[^\]]+\]\]$/.test(target) || external
    ? { label: match[1], target }
    : null;
}

export function canonicalDetail(value: string, language: UiLanguage = "zh-TW"): string {
  const detail = value.trim();
  const keys = [
    "detail.core_conclusions",
    "detail.key_knowledge",
    "detail.evidence_and_sources",
    "detail.tradeoffs_and_limitations",
    "detail.open_questions",
    "detail.update_log"
  ] as const;
  const headings = keys.map(key => translate(language, key));
  const aliases = new Map<string, number>();
  for (let index = 0; index < keys.length; index++)
    for (const locale of ["zh-TW", "en"] as const)
      aliases.set(translate(locale, keys[index]).toLocaleLowerCase(), index);
  const sections = new Map<number, string[]>();
  const leading: string[] = [];
  // Source footnote definitions all belong to "Evidence and sources", wherever the reply put them.
  const footnotes: string[] = [];
  let current: number | null = null;
  const detailLines = detail.split("\n");
  const code = fencedLines(detailLines);
  for (const [index, line] of detailLines.entries()) {
    if (!code[index] && sourceFootnoteDefinition(line)) {
      footnotes.push(line);
      continue;
    }
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    const match = heading ? aliases.get(heading[1].toLocaleLowerCase()) : undefined;
    if (match !== undefined) {
      current = match;
      if (!sections.has(match)) sections.set(match, []);
      continue;
    }
    (current === null ? leading : sections.get(current)!).push(line);
  }
  if (sections.size === 0) sections.set(0, [leading.join("\n").trim()]);
  else if (leading.join("\n").trim()) sections.set(0, [leading.join("\n").trim(), ...(sections.get(0) ?? [])]);
  if (footnotes.length) {
    const evidence = (sections.get(2) ?? []).join("\n").trim();
    sections.set(2, [[evidence, footnotes.join("\n")].filter(Boolean).join("\n\n")]);
  }
  const empty = translate(language, "note.no_new_information");
  return headings
    .map((heading, index) => `### ${heading}\n\n${sections.get(index)?.join("\n").trim() || empty}`)
    .join("\n\n");
}

export function visualReferencesMarkdown(references: VisualReference[] = [], language: UiLanguage = "zh-TW"): string {
  return references
    .map(item => {
      const title = item.title.trim() || translate(language, "detail.visual_reference");
      const imageUrl = item.imageUrl.trim();
      const sourceUrl = item.sourceUrl.trim();
      if (!imageUrl || !sourceUrl) return "";
      const palette = item.palette
        .map(color => color.trim())
        .filter(Boolean)
        .join(" / ");
      return [
        `**${title}**`,
        "",
        `![${title}](${imageUrl})`,
        "",
        translate(language, "detail.source", sourceUrl),
        item.description.trim() ? translate(language, "detail.purpose", item.description.trim()) : "",
        palette ? translate(language, "detail.palette", palette) : "",
        item.formula.trim() ? translate(language, "detail.reusable_formula", item.formula.trim()) : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}
