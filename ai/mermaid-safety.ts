/**
 * Mermaid blocks in a model-written detail are rendered by Obsidian, so the prompt's limits are enforced here too:
 * only flowchart/graph or a type in DIAGRAM_TYPES, with text labels. A block that breaks a limit (click, link,
 * callback or cssClass directives, HTML tags, init/config, URLs, images, icons, styles, sequence actor menus,
 * mindmap icons, C4 links/sprites/tags/styling, quadrant point styling) keeps its text but loses the `mermaid` info
 * string, so Obsidian shows it as plain code and never renders it. An unknown header is neutralized too.
 */
/** Diagram types the mermaid in Obsidian 1.14.4 (11.13.0) detects and draws offline; checked against the bundle 2026-10-19. */
export const DIAGRAM_TYPES: readonly string[] = [
  "sequenceDiagram",
  "classDiagram",
  "classDiagram-v2",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
  "mindmap",
  "timeline",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "packet-beta",
  "kanban",
  "architecture-beta",
  "radar-beta",
  "treemap-beta",
  "venn-beta",
  "ishikawa",
  "ishikawa-beta"
];
const FLOWCHART_HEADER = /^(?:flowchart|graph)(?:\s+(?:LR|RL|TD|TB|BT))?\s*;?\s*$/i;
const TYPE_HEADER = new RegExp(`^(?:${DIAGRAM_TYPES.map(t => t.replace(/[-]/g, "\\-")).join("|")})(?![\\w-])`);
const allowedHeader = (header: string): boolean => FLOWCHART_HEADER.test(header) || TYPE_HEADER.test(header);
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
  /!\[/, // Markdown image
  /(?:^|;)\s*(?:callback|cssClass)\b/i, // class diagram callbacks and CSS classes
  /^(?:properties|details)\b[^:]*:/i, // sequence actor menus (they carry links)
  /::icon\s*\(/i, // mindmap icon (Font Awesome is not loaded in Obsidian)
  /\$(?:link|sprite|tags)\b/i, // C4 links, sprites and tags
  /\b(?:Update(?:Element|Rel|Boundary)Style|UpdateLayoutConfig|Add(?:Element|Rel|Boundary)Tag)\s*\(/, // C4 styling
  /\]\s*(?:radius|color|stroke-color|stroke-width)\s*:/i // quadrantChart point styling
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
  if (!header || !allowedHeader(header)) return true;
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
