/**
 * Makes a cloned mermaid SVG safe to show in the viewer. The viewer only ever shows a copy; the note's own SVG is
 * never touched. Removes everything that could run code or load something from outside the clone:
 * scripts, `on*` handlers, scripting URLs, external references, animation elements and non-mermaid embedded HTML.
 *
 * Mermaid draws flowchart labels as HTML inside `<foreignObject>` (div/span/p with text and light formatting), so a
 * foreignObject is kept only when everything inside it is plain label markup; otherwise it is dropped whole.
 */

/** The minimal node surface used here, so tests can run it on a small stand-in as well as on real DOM nodes. */
export interface SvgNode {
  localName: string;
  attributes: ArrayLike<{ name: string; value: string }>;
  children: ArrayLike<SvgNode>;
  textContent: string | null;
  removeAttribute(name: string): void;
  setAttribute?(name: string, value: string): void;
  remove(): void;
}

const REMOVED = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "image",
  "audio",
  "video",
  "canvas",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "use",
  "link",
  "meta",
  "base"
]);
const LABEL_HTML = new Set([
  "div",
  "span",
  "p",
  "br",
  "b",
  "i",
  "em",
  "strong",
  "u",
  "s",
  "code",
  "small",
  "sub",
  "sup"
]);

function unsafeUrl(value: string): boolean {
  const compact = Array.from(value)
    .filter(ch => ch.charCodeAt(0) > 0x20 && (ch.charCodeAt(0) < 0x7f || ch.charCodeAt(0) > 0x9f))
    .join("")
    .toLowerCase();
  // Only a fragment reference inside the clone itself (for example a marker or gradient) is allowed.
  return compact.length > 0 && !compact.startsWith("#");
}

function cleanStyle(value: string): string {
  return value.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none");
}

function cleanAttributes(node: SvgNode): void {
  for (const { name, value } of Array.from(node.attributes)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on")) node.removeAttribute(name);
    else if ((lower === "href" || lower === "xlink:href" || lower === "src") && unsafeUrl(value))
      node.removeAttribute(name);
    else if (lower === "style" && cleanStyle(value) !== value) node.setAttribute?.(name, cleanStyle(value));
  }
}

function plainLabel(node: SvgNode): boolean {
  return Array.from(node.children).every(child => LABEL_HTML.has(child.localName) && plainLabel(child));
}

function clean(node: SvgNode): void {
  for (const child of Array.from(node.children)) {
    const name = child.localName.toLowerCase();
    if (REMOVED.has(name) || (name === "foreignobject" && !plainLabel(child))) {
      child.remove();
      continue;
    }
    cleanAttributes(child);
    if (name === "style") child.textContent = cleanStyle(child.textContent ?? "");
    clean(child);
  }
}

/** Cleans `root` in place and returns it. Pass a clone, never the diagram that lives in the note. */
export function sanitizeSvgClone<T extends SvgNode>(root: T): T {
  cleanAttributes(root);
  clean(root);
  return root;
}
