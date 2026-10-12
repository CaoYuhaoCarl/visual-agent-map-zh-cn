import { renderEvidenceCard } from "./steps/_shared/evidence-card";
export { EVIDENCE_LOOKUP_RULE, EVIDENCE_LOOKUP_FIELD_RULE } from "./steps/_shared/rules";

/** A compact index, never a replacement for the report retained in the Vault. */
export function evidenceCard(id: string, summary: string, detail: string): string {
  const urls = [...new Set(detail.match(/https?:\/\/[^\s)<>\]"']+/g) ?? [])];
  const limits = detail
    .split(/\n\n/)
    .filter(part => /uncertain|unresolved|limitation|unknown|不足|不確定|限制|缺口|尚未|待確認/i.test(part));
  return renderEvidenceCard({
    id,
    summary,
    limitations: limits.join("\n").slice(0, 600),
    urls,
    length: detail.length
  });
}
