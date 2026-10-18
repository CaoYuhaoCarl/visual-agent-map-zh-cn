/** Marks each line that belongs to a fenced code block (fence lines included). */
export function fencedLines(lines: string[]): boolean[] {
  let fence: string | null = null;
  return lines.map(line => {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      // A closing fence carries no info string.
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
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
 * Detail sits under the note's `## Detail`, so its own headings start at `###` and each one is at most one level
 * deeper than its parent; the original nesting is kept. Headings in code blocks are text and stay as written.
 */
export function normalizeDetailHeadings(markdown: string): string {
  const lines = markdown.split("\n");
  const code = fencedLines(lines);
  const parents: { original: number; level: number }[] = [];
  return lines
    .map((line, index) => {
      const heading = code[index] ? null : /^(#{1,6})([ \t]+.*|[ \t]*)$/.exec(line);
      if (!heading) return line;
      const original = heading[1].length;
      while (parents.length && parents[parents.length - 1].original >= original) parents.pop();
      const level = Math.min(6, (parents[parents.length - 1]?.level ?? 2) + 1);
      parents.push({ original, level });
      return `${"#".repeat(level)}${heading[2]}`;
    })
    .join("\n");
}

const MATH_LOOKAHEAD_LINES = 20;

interface MathToken {
  line: number;
  start: number;
  kind: "[" | "]" | "(" | ")";
}

/** Same-length copy of a line with inline code spans blanked out, so delimiters inside them are never seen. */
function maskInlineCode(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      out += line[i++];
      continue;
    }
    let run = 0;
    while (line[i + run] === "`") run++;
    const ticks = "`".repeat(run);
    const close = line.indexOf(ticks, i + run);
    // Only a run of exactly the same length closes the span.
    let end = close;
    while (end !== -1 && (line[end + run] === "`" || line[end - 1] === "`")) {
      end = line.indexOf(ticks, end + 1);
    }
    if (end === -1) {
      out += line.slice(i, i + run);
      i += run;
    } else {
      out += "\u0000".repeat(end + run - i);
      i = end + run;
    }
  }
  return out;
}

/**
 * Obsidian renders math only as `$…$` and `$$…$$`. Models often write LaTeX's `\(…\)` and `\[…\]`, which markdown reads
 * as escaped brackets, so they are converted. Fenced code, inline code, escaped `\\[` and a delimiter without its
 * partner are left as written. A display block may span lines but never a blank line or a fence.
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (!/\\[[\]()]/.test(markdown)) return markdown;
  const lines = markdown.split("\n");
  const code = fencedLines(lines);
  const masked = lines.map((line, index) => (code[index] ? line : maskInlineCode(line)));
  const tokens: MathToken[] = [];
  masked.forEach((line, index) => {
    if (code[index]) return;
    const pattern = /(\\+)([[\]()])/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      // An even run of backslashes is an escaped backslash followed by a plain bracket.
      if (match[1].length % 2 === 1)
        tokens.push({ line: index, start: match.index + match[1].length - 1, kind: match[2] as MathToken["kind"] });
    }
  });

  const edits: { line: number; start: number; end: number; text: string }[] = [];
  let display: MathToken | null = null;
  let inline: MathToken | null = null;
  let current = -1;
  const blankBetween = (from: number, to: number) => {
    for (let n = from + 1; n <= to; n++) if (code[n] || !lines[n].trim()) return true;
    return false;
  };
  for (const token of tokens) {
    if (token.line !== current) {
      current = token.line;
      inline = null;
    }
    if (display && (token.line - display.line > MATH_LOOKAHEAD_LINES || blankBetween(display.line, token.line - 1)))
      display = null;
    if (token.kind === "[") {
      display = token;
    } else if (token.kind === "]") {
      if (!display) continue;
      if (display.line === token.line) {
        const inner = lines[token.line].slice(display.start + 2, token.start).trim();
        if (inner) edits.push({ line: token.line, start: display.start, end: token.start + 2, text: `$$${inner}$$` });
      } else {
        edits.push({ line: display.line, start: display.start, end: display.start + 2, text: "$$" });
        edits.push({ line: token.line, start: token.start, end: token.start + 2, text: "$$" });
      }
      display = null;
    } else if (!display) {
      if (token.kind === "(") inline = token;
      else if (inline) {
        const inner = lines[token.line].slice(inline.start + 2, token.start).trim();
        if (inner && !inner.includes("$"))
          edits.push({ line: token.line, start: inline.start, end: token.start + 2, text: `$${inner}$` });
        inline = null;
      }
    }
  }
  edits.sort((a, b) => (a.line === b.line ? b.start - a.start : a.line - b.line));
  for (const edit of edits) {
    const line = lines[edit.line];
    lines[edit.line] = line.slice(0, edit.start) + edit.text + line.slice(edit.end);
  }
  return lines.join("\n");
}
