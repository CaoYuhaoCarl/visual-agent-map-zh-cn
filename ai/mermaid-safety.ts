/**
 * Mermaid blocks in a model-written detail are rendered by Obsidian, so the prompt's limits are enforced here too:
 * only flowchart/graph and timeline diagrams with text nodes and arrows. A block that breaks a limit (click or link
 * directives, HTML tags, init/config, URLs, images, icons, styles) keeps its text but loses the `mermaid` info
 * string, so Obsidian shows it as plain code and never renders it.
 */
const ALLOWED_DIAGRAM = /^(?:flowchart|graph)(?:\s+(?:LR|RL|TD|TB|BT))?\s*;?\s*$|^timeline\b/i;
const UNSAFE_LINE: readonly RegExp[] = [
  // A directive starts a line or follows a `;` statement separator.
  /(?:^|;)\s*(?:click|call|href|link|links|style|classDef|class|linkStyle|interpolate)\b/i,
  /%%\s*\{/, // init or config directive
  /<\s*\/?\s*[a-z!?]/i, // HTML tag, comment or processing instruction
  /\b[a-z][a-z0-9+.-]*:\/\//i, // URL with a scheme
  /\b(?:javascript|vbscript|data|mailto|file):/i,
  /\bwww\./i,
  /:::/, // class shorthand
  /@\{/, // shape/image/icon metadata
  /\b(?:fa|fab|fas|far|img):/i,
  /!\[/ // Markdown image
];

const FENCE = /^(`{3,}|~{3,})(.*)$/;
/** One layer of line prefix: indentation, a blockquote marker, or a list/task marker. */
const PREFIX = /^(?:[ \t]+|>|(?:[-*+]|\d+[.)])(?=[ \t])|\[[ xX]\](?=[ \t]))/;

/** The line without any mix of indentation, blockquote (callout) and list or task markers, in any order. */
function core(line: string): string {
  let rest = line;
  for (let match = PREFIX.exec(rest); match; match = PREFIX.exec(rest)) rest = rest.slice(match[0].length);
  return rest;
}

/** The fence on this line, or null. A backtick fence's info string cannot contain a backtick. */
function fenceOf(line: string): RegExpExecArray | null {
  const fence = FENCE.exec(core(line));
  return fence && !(fence[1][0] === "`" && fence[2].includes("`")) ? fence : null;
}

export function unsafeMermaid(body: readonly string[]): boolean {
  const lines = body.map(line => line.trim()).filter(Boolean);
  if (!lines.length) return false;
  // A leading `---` block is Mermaid front-matter configuration.
  if (lines[0] === "---") return true;
  const header = lines.find(line => !line.startsWith("%%"));
  if (!header || !ALLOWED_DIAGRAM.test(header)) return true;
  return lines.some(line => UNSAFE_LINE.some(pattern => pattern.test(line)));
}

/**
 * Turns every unsafe mermaid block (also inside callouts and lists) into a plain code block; everything else is
 * unchanged. Each mermaid opening is checked on its own, from the line after it to the first line that could close
 * it (or the end), whatever any other fence looks like. A block whose list or quote ends early is then checked with
 * the text after it, so a misread boundary only blocks more, never lets an unsafe block through. A mermaid fence
 * quoted inside another code block is checked as well, which only changes text that is never rendered.
 */
export function neutralizeUnsafeMermaid(markdown: string): string {
  const lines = markdown.split("\n");
  lines.forEach((line, index) => {
    const fence = fenceOf(line);
    if (!fence || !/^mermaid\b/i.test(fence[2].trim())) return;
    const body: string[] = [];
    for (let next = index + 1; next < lines.length; next++) {
      const content = core(lines[next]);
      const close = FENCE.exec(content);
      if (close && close[1][0] === fence[1][0] && close[1].length >= fence[1].length && !close[2].trim()) break;
      body.push(content);
    }
    if (unsafeMermaid(body)) lines[index] = line.replace(/mermaid/i, "text");
  });
  return lines.join("\n");
}
