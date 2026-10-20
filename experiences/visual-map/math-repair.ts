import type { TFile, Vault } from "obsidian";
import { normalizeMathDelimiters } from "../../ai/markdown-blocks";

/** One note whose body would change, with the exact text the preview was computed from. */
export interface MathRepairItem {
  file: TFile;
  original: string;
}
export interface MathRepairPlan {
  items: MathRepairItem[];
  /** At most five paths, for the confirm window. */
  examples: string[];
}
export interface MathRepairResult {
  changed: number;
  /** Notes that changed on disk after the preview and were therefore left alone. */
  skipped: number;
}

/** The text with its leading frontmatter block (delimiter lines and the newline after the closing one) split off. */
export function splitFrontmatter(content: string): { head: string; body: string } {
  const head = content.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? "";
  return { head, body: content.slice(head.length) };
}

/** The note with math delimiters normalized in the body only; the frontmatter stays byte-identical. */
export function repairNoteMath(content: string): string {
  const { head, body } = splitFrontmatter(content);
  return head + normalizeMathDelimiters(body);
}

/** Reads every given note and lists those the repair would change. Writes nothing. */
export async function planMathRepair(vault: Vault, files: TFile[]): Promise<MathRepairPlan> {
  const items: MathRepairItem[] = [];
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const original = await vault.read(file);
    if (repairNoteMath(original) !== original) items.push({ file, original });
  }
  return { items, examples: items.slice(0, 5).map(item => item.file.path) };
}

/** Writes the planned notes. A note that no longer matches the previewed text is skipped, never overwritten. */
export async function applyMathRepair(vault: Vault, plan: MathRepairPlan): Promise<MathRepairResult> {
  let changed = 0;
  let skipped = 0;
  for (const { file, original } of plan.items) {
    let wrote = false;
    await vault.process(file, current => {
      if (current !== original) return current;
      const next = repairNoteMath(current);
      if (next === current) return current;
      wrote = true;
      return next;
    });
    if (wrote) changed++;
    else skipped++;
  }
  return { changed, skipped };
}
