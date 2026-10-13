import { translate, type TranslationKey, type UiLanguage } from "../i18n";
import { fencedLines } from "./markdown-blocks";
import { customDetailRule, customDetailStructure } from "../core/steps/task/fragments";

export type DetailSectionRole = "none" | "sources" | "log";
export interface DetailCount {
  mode: "exact" | "min";
  n: number;
}
export interface DetailSection {
  id: string;
  name: string;
  description: string;
  role: DetailSectionRole;
  count?: DetailCount;
  /** Earlier names (and the other language's Standard name) so old notes still map to this section. */
  aliases: string[];
}
export interface DetailTemplate {
  id: string;
  name: string;
  sections: DetailSection[];
}
export interface TemplateIssue {
  key: TranslationKey;
  values: (string | number)[];
  /** 1-based section number the issue belongs to, when it belongs to one. */
  section?: number;
}
export interface CountIssue {
  section: string;
  mode: "exact" | "min";
  n: number;
  actual: number;
}

export const STANDARD_TEMPLATE_ID = "standard";
const LANGUAGES: readonly UiLanguage[] = ["zh-TW", "en"];
const STANDARD: readonly [string, TranslationKey, DetailSectionRole][] = [
  ["core", "detail.core_conclusions", "none"],
  ["knowledge", "detail.key_knowledge", "none"],
  ["sources", "detail.evidence_and_sources", "sources"],
  ["tradeoffs", "detail.tradeoffs_and_limitations", "none"],
  ["questions", "detail.open_questions", "none"],
  ["log", "detail.update_log", "log"]
];

export function standardTemplate(language: UiLanguage): DetailTemplate {
  return {
    id: STANDARD_TEMPLATE_ID,
    name: translate(language, "ui.detail_template_standard"),
    sections: STANDARD.map(([id, key, role]) => {
      const name = translate(language, key);
      return {
        id,
        name,
        description: "",
        role,
        aliases: LANGUAGES.map(locale => translate(locale, key)).filter(alias => alias !== name)
      };
    })
  };
}

export function copyTemplate(source: DetailTemplate, name: string, id: string): DetailTemplate {
  return {
    id,
    name,
    sections: source.sections.map(section => ({
      ...section,
      ...(section.count ? { count: { ...section.count } } : {}),
      aliases: [...section.aliases]
    }))
  };
}

export function sectionKeys(section: DetailSection): string[] {
  return [section.name, ...section.aliases].map(value => value.trim().toLocaleLowerCase()).filter(Boolean);
}

export function validateTemplate(template: DetailTemplate, others: DetailTemplate[]): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const name = template.name.trim();
  if (!name) issues.push({ key: "ui.detail_template_error_name_required", values: [] });
  else if (name.length > 40) issues.push({ key: "ui.detail_template_error_name_long", values: [] });
  else if (
    others.some(other => other.id !== template.id && other.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
  )
    issues.push({ key: "ui.detail_template_error_name_taken", values: [name] });
  if (template.sections.length < 1 || template.sections.length > 12)
    issues.push({ key: "ui.detail_template_error_section_count", values: [] });
  const seen = new Set<string>();
  template.sections.forEach((section, index) => {
    const number = index + 1;
    const sectionName = section.name.trim();
    if (!sectionName)
      issues.push({ key: "ui.detail_template_error_section_name_required", values: [number], section: number });
    else if (/[#\r\n]/.test(section.name))
      issues.push({ key: "ui.detail_template_error_section_name_invalid", values: [number], section: number });
    else if (sectionName.length > 40)
      issues.push({ key: "ui.detail_template_error_section_name_long", values: [number], section: number });
    else if (seen.has(sectionName.toLocaleLowerCase()))
      issues.push({ key: "ui.detail_template_error_section_name_taken", values: [number], section: number });
    seen.add(sectionName.toLocaleLowerCase());
    if (section.description.length > 300)
      issues.push({ key: "ui.detail_template_error_description_long", values: [number], section: number });
    if (section.count && (!Number.isInteger(section.count.n) || section.count.n < 1 || section.count.n > 20))
      issues.push({ key: "ui.detail_template_error_count_range", values: [number], section: number });
  });
  for (const role of ["sources", "log"] as const)
    if (template.sections.filter(section => section.role === role).length > 1)
      issues.push({
        key: "ui.detail_template_error_role_taken",
        values: [role === "sources" ? "ui.detail_template_role_sources" : "ui.detail_template_role_log"]
      });
  return issues;
}

function section(value: unknown): DetailSection | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DetailSection>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  const role: DetailSectionRole = item.role === "sources" || item.role === "log" ? item.role : "none";
  const count =
    item.count && (item.count.mode === "exact" || item.count.mode === "min") && typeof item.count.n === "number"
      ? { mode: item.count.mode, n: item.count.n }
      : undefined;
  return {
    id: item.id,
    name: item.name,
    description: typeof item.description === "string" ? item.description : "",
    role,
    ...(count ? { count } : {}),
    aliases: Array.isArray(item.aliases)
      ? item.aliases.filter((alias): alias is string => typeof alias === "string")
      : []
  };
}

export function normalizeTemplates(value: unknown): DetailTemplate[] {
  if (!Array.isArray(value)) return [];
  const result: DetailTemplate[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<DetailTemplate>;
    if (typeof item.id !== "string" || item.id === STANDARD_TEMPLATE_ID || typeof item.name !== "string") continue;
    if (result.some(existing => existing.id === item.id)) continue;
    if (!Array.isArray(item.sections)) continue;
    const sections = item.sections.map(section);
    if (sections.some(entry => !entry)) continue;
    const template = { id: item.id, name: item.name, sections: sections as DetailSection[] };
    if (validateTemplate(template, result).length) continue;
    result.push(template);
  }
  return result;
}

export function resolveTemplate(
  templates: DetailTemplate[],
  ids: (string | undefined)[],
  language: UiLanguage
): { template: DetailTemplate; missing: string[] } {
  const missing: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    if (id === STANDARD_TEMPLATE_ID) return { template: standardTemplate(language), missing };
    const found = templates.find(template => template.id === id);
    if (found) return { template: found, missing };
    missing.push(id);
  }
  return { template: standardTemplate(language), missing };
}

export function countItems(body: string): number {
  const lines = body.split("\n");
  const code = fencedLines(lines);
  const outside = lines.filter((_, index) => !code[index]);
  const headings = outside.filter(line => /^####\s+\S/.test(line)).length;
  if (headings) return headings;
  return outside.filter(line => /^(?:[-*+]|\d+[.)])\s+\S/.test(line)).length;
}

/** Splits a detail into section bodies keyed by template section index (by name or alias); other text is ignored. */
function sectionBodies(detail: string, template: DetailTemplate): Map<number, string> {
  const lookup = new Map<string, number>();
  template.sections.forEach((section, index) => sectionKeys(section).forEach(key => lookup.set(key, index)));
  const lines = detail.split("\n");
  const code = fencedLines(lines);
  const bodies = new Map<number, string[]>();
  let current: number | undefined;
  lines.forEach((line, index) => {
    const heading = code[index] ? null : /^###\s+(.+?)\s*$/.exec(line);
    const match = heading ? lookup.get(heading[1].toLocaleLowerCase()) : undefined;
    if (match !== undefined) {
      current = match;
      if (!bodies.has(match)) bodies.set(match, []);
      return;
    }
    if (current !== undefined) bodies.get(current)!.push(line);
  });
  return new Map([...bodies].map(([index, body]) => [index, body.join("\n")]));
}

export function checkCounts(detail: string, template: DetailTemplate): CountIssue[] {
  const bodies = sectionBodies(detail, template);
  const issues: CountIssue[] = [];
  template.sections.forEach((section, index) => {
    if (!section.count) return;
    const actual = countItems(bodies.get(index) ?? "");
    const ok = section.count.mode === "exact" ? actual === section.count.n : actual >= section.count.n;
    if (!ok) issues.push({ section: section.name, mode: section.count.mode, n: section.count.n, actual });
  });
  return issues;
}

export function countIssueText(issue: CountIssue, language: UiLanguage): string {
  const key = issue.mode === "exact" ? "ui.detail_count_issue_exact" : "ui.detail_count_issue_min";
  return translate(language, key, issue.section, issue.n, issue.actual);
}

export function detailStructurePrompt(
  template: DetailTemplate,
  language: UiLanguage,
  standardText: (headings: string) => string
): string {
  const headings = template.sections.map(section => `### ${section.name}`).join(", ");
  if (template.id === STANDARD_TEMPLATE_ID) return standardText(headings);
  const rules: string[] = [];
  for (const section of template.sections) {
    const heading = `### ${section.name}`;
    if (section.role === "log") rules.push(customDetailRule("log", language, { heading }));
    if (section.description.trim())
      rules.push(customDetailRule("description", language, { heading, description: section.description.trim() }));
    if (section.count)
      rules.push(customDetailRule(section.count.mode, language, { heading, n: String(section.count.n) }));
  }
  return customDetailStructure(language, {
    count: String(template.sections.length),
    headings,
    rules: rules.length ? `\n${rules.join("\n")}` : ""
  });
}
