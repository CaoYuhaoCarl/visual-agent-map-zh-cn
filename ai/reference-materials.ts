import { App, TFile } from "obsidian";
import { t, translate } from "../i18n";

export interface ReferenceDocument {
  path: string;
  content: string;
  external?: boolean;
  key?: string;
}
export interface ReferenceGroup {
  id: string;
  name: string;
  location: string;
  documents: ReferenceDocument[];
}

export async function readMarkdownFile(app: App, file: TFile): Promise<ReferenceDocument> {
  if (file.extension.toLowerCase() !== "md")
    throw new Error(`Only Markdown can be used as local reference: ${file.path}`);
  return { path: file.path, content: await app.vault.read(file) };
}

export function dedupeReferenceGroups(groups: ReferenceGroup[]): ReferenceGroup[] {
  const seen = new Set<string>();
  return groups.map(group => ({
    ...group,
    documents: group.documents.filter(document => {
      const key = document.key || document.path;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  }));
}

export function packReferenceChunks(chunks: string[], characterLimit = 18_000): string[] {
  const batches: string[] = [];
  let batch = "";
  for (const chunk of chunks) {
    if (batch && batch.length + chunk.length > characterLimit) {
      batches.push(batch);
      batch = "";
    }
    batch += `${batch ? "\n\n" : ""}${chunk}`;
  }
  if (batch) batches.push(batch);
  return batches;
}

export function referenceBatches(groups: ReferenceGroup[], documentLimit = 14_000, batchLimit = 18_000): string[] {
  const chunks: string[] = [];
  let sourceNumber = 0;
  for (const group of dedupeReferenceGroups(groups))
    for (const document of group.documents) {
      sourceNumber++;
      const id = `S${sourceNumber}`;
      const citation = document.external
        ? "external Markdown; cite the exact path as plain text"
        : "Vault Markdown; cite as an Obsidian wikilink";
      const pieces = document.content.match(new RegExp(`[\\s\\S]{1,${documentLimit}}`, "g")) ?? [""];
      pieces.forEach((piece, index) =>
        chunks.push(
          `[${id}] ${citation}: ${document.path}${pieces.length > 1 ? ` (part ${index + 1}/${pieces.length})` : ""}\n${piece}`
        )
      );
    }
  return packReferenceChunks(chunks, batchLimit);
}

export function referenceCatalog(groups: ReferenceGroup[]): string {
  const documents = dedupeReferenceGroups(groups).flatMap(group => group.documents);
  return documents
    .map(
      (document, index) =>
        `[S${index + 1}] ${document.external ? "External file (plain path)" : "Vault note (wikilink)"}: ${document.path}`
    )
    .join("\n");
}

function resolveWikilinks(text: string, documents: ReferenceDocument[]): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (original, target: string) => {
    const name = target.split("|")[0].trim();
    const exact = documents.filter(document => document.path === name);
    const matches = exact.length
      ? exact
      : documents.filter(document => {
          const basename = document.path.split("/").pop() ?? document.path;
          return basename === name || basename.replace(/\.md$/i, "") === name;
        });
    if (matches.length > 1) return t("note.source_unconfirmed_0", name);
    if (matches.length !== 1 || !matches[0].external) return original;
    return t("note.external_source_0", matches[0].path);
  });
}

/** Stable short footnote label for a source path (same path => same label across runs). */
export function sourceFootnoteLabel(path: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < path.length; index++) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `src-${hash.toString(36).padStart(7, "0")}`;
}

/** Summary shows on map cards: drop `[S#]` markers and the punctuation they leave behind, keep other link handling. */
export function resolveSummaryReferences(summary: string, groups: ReferenceGroup[]): string {
  const documents = dedupeReferenceGroups(groups).flatMap(group => group.documents);
  const stripped = summary
    .replace(/[ \t]*\[S\d+\]/g, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/[ \t]+([,.;:!?，。；：！？、])/g, "$1")
    .replace(/[,，、;；]+(?=[,.;:!?，。；：！？、])/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return resolveWikilinks(stripped, documents);
}

const FOOTNOTE_DEFINITION = /^\[\^(src-[0-9a-z]+)\]:/;
const FOOTNOTE_REFERENCE = /\[\^(src-[0-9a-z]+)\](?!:)/g;

function footnoteDefinition(document: ReferenceDocument): string {
  const label = sourceFootnoteLabel(document.path);
  const basename = (document.path.split("/").pop() ?? document.path).replace(/\.md$/i, "");
  return `[^${label}]: ${document.external ? t("note.external_source_0", document.path) : `[[${document.path}|${basename}]]`}`;
}

/**
 * Detail: `[S#]` becomes a footnote reference with one definition per source, placed at the end of the evidence
 * section (or the detail). A footnote the reply kept without its definition is restored from the selected sources or
 * the previous detail; one that cannot be restored becomes a "source to confirm" note instead of a dead marker.
 */
export function resolveDetailReferences(detail: string, groups: ReferenceGroup[], previousDetail = ""): string {
  const documents = dedupeReferenceGroups(groups).flatMap(group => group.documents);
  const used = new Map<string, string>();
  const identified = detail.replace(/\[S(\d+)\]/g, (original, number: string) => {
    const document = documents[Number(number) - 1];
    if (!document) return t("note.source_unconfirmed_0", original);
    const label = sourceFootnoteLabel(document.path);
    if (!used.has(label)) used.set(label, footnoteDefinition(document));
    return `[^${label}]`;
  });
  let resolved = documents.length ? resolveWikilinks(identified, documents) : identified;
  const defined = new Set(
    resolved.split("\n").flatMap(line => {
      const match = FOOTNOTE_DEFINITION.exec(line);
      return match ? [match[1]] : [];
    })
  );
  const previous = new Map(
    previousDetail.split("\n").flatMap(line => {
      const match = FOOTNOTE_DEFINITION.exec(line);
      return match ? [[match[1], line] as const] : [];
    })
  );
  const byLabel = new Map(documents.map(document => [sourceFootnoteLabel(document.path), document]));
  const unresolved = new Set<string>();
  for (const [, label] of resolved.matchAll(FOOTNOTE_REFERENCE)) {
    if (defined.has(label) || used.has(label)) continue;
    const document = byLabel.get(label);
    const restored = document ? footnoteDefinition(document) : previous.get(label);
    if (restored) used.set(label, restored);
    else unresolved.add(label);
  }
  if (unresolved.size)
    resolved = resolved.replace(FOOTNOTE_REFERENCE, (original, label: string) =>
      unresolved.has(label) ? ` ${t("note.source_unconfirmed_0", label)}` : original
    );
  const definitions = [...used].filter(([label]) => !defined.has(label)).map(([, line]) => line);
  if (!definitions.length) return resolved;
  const headings = new Set(
    (["zh-TW", "en"] as const).map(locale => translate(locale, "detail.evidence_and_sources").toLocaleLowerCase())
  );
  const lines = resolved.split("\n");
  const start = lines.findIndex(line => {
    const match = /^###\s+(.+?)\s*$/.exec(line);
    return !!match && headings.has(match[1].toLocaleLowerCase());
  });
  if (start < 0) return `${resolved.replace(/\s+$/, "")}\n\n${definitions.join("\n")}\n`;
  let end = lines.findIndex((line, index) => index > start && /^###\s+/.test(line));
  if (end < 0) end = lines.length;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return [...lines.slice(0, end), "", ...definitions, ...lines.slice(end)].join("\n");
}
