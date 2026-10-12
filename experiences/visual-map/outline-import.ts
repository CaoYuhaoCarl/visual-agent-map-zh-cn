import { safeName } from "../../repository";

export const OUTLINE_NODE_LIMIT = 100;
export const OUTLINE_TITLE_LIMIT = 200;

export interface OutlineNode {
  index: number;
  title: string;
  level: number;
  parent: number | null;
  line: number;
}
export type OutlineIssueKey =
  | "ui.outline_error_no_headings"
  | "ui.outline_error_empty_title"
  | "ui.outline_error_multiple_roots"
  | "ui.outline_error_too_many_nodes"
  | "ui.outline_error_title_too_long"
  | "ui.outline_error_vam_note"
  | "ui.outline_warning_skipped_level"
  | "ui.outline_warning_duplicate_title"
  | "ui.outline_warning_filename_collision"
  | "ui.outline_warning_ignored_lines";
export interface OutlineIssue {
  line: number;
  key: OutlineIssueKey;
  values: (string | number)[];
}
export interface OutlineParse {
  nodes: OutlineNode[];
  errors: OutlineIssue[];
  warnings: OutlineIssue[];
  totalLines: number;
  headingLines: number;
  ignoredLines: number;
  blankLines: number;
  skippedLines: number;
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const MARKDOWN_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*(markdown|md)?[ \t]*$/i;

/** Heading text as plain text: Markdown emphasis, code and link syntax removed, escapes resolved. */
export function outlineTitle(raw: string): string {
  const escaped: string[] = [];
  const protectedText = raw.replace(/\\([!-/:-@[-`{-~])/g, (_match, character: string) => {
    escaped.push(character);
    return `\uE000${escaped.length - 1}\uE000`;
  });
  const plain = protectedText
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(`+)([^`]*?)\1/g, "$2")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "$1$2");
  return plain.replace(/\uE000(\d+)\uE000/g, (_match, index: string) => escaped[Number(index)]).trim();
}

/** Unwraps an outline the AI returned inside a single ```markdown / ```md / ``` fence holding headings. */
function unwrapFencedOutline(lines: string[]): string[] {
  const open = lines.findIndex(line => MARKDOWN_FENCE.test(line));
  if (open < 0) return lines;
  const marker = MARKDOWN_FENCE.exec(lines[open])![1];
  const close = lines.findIndex(
    (line, index) =>
      index > open &&
      FENCE_CLOSE.test(line) &&
      FENCE_CLOSE.exec(line)![1][0] === marker[0] &&
      FENCE_CLOSE.exec(line)![1].length >= marker.length
  );
  if (close < 0) return lines;
  const inner = lines.slice(open + 1, close);
  const outside = [...lines.slice(0, open), ...lines.slice(close + 1)];
  const innerHasHeading = inner.some(line => HEADING.test(line));
  const outsideHasHeading = outside.some(line => HEADING.test(line));
  if (!innerHasHeading || outsideHasHeading) return lines;
  // Keep line numbers stable: the fence lines become blank.
  return lines.map((line, index) => (index === open || index === close ? "" : line));
}

export function parseOutline(input: string): OutlineParse {
  const lines = unwrapFencedOutline(
    (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).replace(/\r\n?/g, "\n").split("\n")
  );
  const nodes: OutlineNode[] = [];
  const errors: OutlineIssue[] = [];
  const warnings: OutlineIssue[] = [];
  let headingLines = 0,
    ignoredLines = 0,
    blankLines = 0,
    skippedLines = 0;
  let fence: string | null = null;
  let block: "html" | "obsidian" | "math" | null = null;
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end > 0) {
      start = end + 1;
      skippedLines += start;
    }
  }
  const stack: OutlineNode[] = [];
  const seenTitles = new Map<string, number>();
  const seenFiles = new Map<string, string>();
  let rootLevel = 0;
  let vamNote = false;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (line.includes("<!-- visual-agent-map:")) vamNote = true;
    if (fence) {
      skippedLines++;
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    if (block) {
      skippedLines++;
      const end = block === "html" ? "-->" : block === "obsidian" ? "%%" : "$$";
      if (line.includes(end)) block = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      skippedLines++;
      fence = open[1];
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("<!--")) {
      skippedLines++;
      if (!trimmed.includes("-->", 4)) block = "html";
      continue;
    }
    if (trimmed.startsWith("%%")) {
      skippedLines++;
      if (!trimmed.slice(2).includes("%%")) block = "obsidian";
      continue;
    }
    if (trimmed.startsWith("$$")) {
      skippedLines++;
      if (!trimmed.slice(2).includes("$$")) block = "math";
      continue;
    }
    if (!trimmed) {
      blankLines++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (!heading) {
      ignoredLines++;
      continue;
    }
    headingLines++;
    const level = heading[1].length;
    const raw = (heading[2] ?? "").replace(/(^|[ \t]+)#+[ \t]*$/, "");
    const title = outlineTitle(raw);
    if (!title) {
      errors.push({ line: lineNumber, key: "ui.outline_error_empty_title", values: [lineNumber] });
      continue;
    }
    if ([...title].length > OUTLINE_TITLE_LIMIT)
      errors.push({
        line: lineNumber,
        key: "ui.outline_error_title_too_long",
        values: [lineNumber, OUTLINE_TITLE_LIMIT]
      });
    if (!nodes.length) rootLevel = level;
    else if (level <= rootLevel) {
      errors.push({ line: lineNumber, key: "ui.outline_error_multiple_roots", values: [lineNumber] });
      continue;
    }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    if (parent && level > parent.level + 1)
      warnings.push({ line: lineNumber, key: "ui.outline_warning_skipped_level", values: [lineNumber] });
    const node: OutlineNode = {
      index: nodes.length,
      title,
      level,
      parent: parent ? parent.index : null,
      line: lineNumber
    };
    nodes.push(node);
    stack.push(node);
    if (seenTitles.has(title))
      warnings.push({ line: lineNumber, key: "ui.outline_warning_duplicate_title", values: [lineNumber, title] });
    else {
      seenTitles.set(title, lineNumber);
      const file = safeName(title).toLocaleLowerCase();
      const other = seenFiles.get(file);
      if (other !== undefined && other !== title)
        warnings.push({ line: lineNumber, key: "ui.outline_warning_filename_collision", values: [lineNumber, title] });
      else seenFiles.set(file, title);
    }
  }
  if (vamNote) errors.unshift({ line: 1, key: "ui.outline_error_vam_note", values: [] });
  if (!nodes.length && !errors.length) errors.push({ line: 0, key: "ui.outline_error_no_headings", values: [] });
  if (nodes.length > OUTLINE_NODE_LIMIT)
    errors.push({ line: 0, key: "ui.outline_error_too_many_nodes", values: [nodes.length, OUTLINE_NODE_LIMIT] });
  if (ignoredLines) warnings.push({ line: 0, key: "ui.outline_warning_ignored_lines", values: [ignoredLines] });
  return {
    nodes,
    errors,
    warnings,
    totalLines: lines.length,
    headingLines,
    ignoredLines,
    blankLines,
    skippedLines
  };
}
