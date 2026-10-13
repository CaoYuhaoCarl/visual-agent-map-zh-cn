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
