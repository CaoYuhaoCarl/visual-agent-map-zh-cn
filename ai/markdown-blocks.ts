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
