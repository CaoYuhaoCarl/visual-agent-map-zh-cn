import { randomUUID } from "node:crypto";
import { baselineFromVersions, type CoffeeInsight } from "./insights";
import type { CoffeeSession } from "./types";

export interface CoffeeSource {
  content: string;
  sourceSnapshot: string;
  question: string;
  artifactId: string;
  identityKind: "persisted-insight" | "snapshot";
}
function references(session: CoffeeSession): Array<{ name: string; content: string }> {
  return [
    ...new Map(
      [...(session.referenceFiles ?? []), ...(session.guests?.referenceFiles ?? [])].map(item => [
        JSON.stringify(item),
        item
      ])
    ).values()
  ];
}
export function coffeeCommittedKey(session: CoffeeSession): string {
  return JSON.stringify({
    id: session.id,
    topic: session.topic,
    status: session.status,
    language: session.language,
    model: session.model,
    reasoning: session.reasoning,
    dirtyNotes: session.dirtyNotes === true,
    dialogue: (session.rounds ?? []).map(item => ({ id: item.id, markdown: item.markdown, status: item.status })),
    transcript: session.transcriptMarkdown,
    questions: session.questions
      .filter(item => item.status === "complete")
      .map(item => ({ id: item.id, question: item.question, answer: item.answer })),
    interventions: session.interventions ?? [],
    insights: session.observerNotes ?? [],
    background: session.guests?.background ?? "",
    references: references(session)
  });
}
function insightText(item: CoffeeInsight): string {
  return [item.summary, item.detail, item.question, item.proposedSolution, item.limitations]
    .filter(Boolean)
    .join("\n\n");
}
const normalize = (text: string): string => text.normalize("NFKC").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
export function buildCoffeeSource(session: CoffeeSession, insightId?: string): CoffeeSource {
  const text = (english: string, simplified: string): string => (session.language === "zh-CN" ? simplified : english);
  const insights = baselineFromVersions(session.observerNotes ?? [], session.language);
  const selected = insightId ? insights.find(item => item.id === insightId) : undefined;
  if (insightId && !selected)
    throw new Error(
      text("The selected insight changed; reopen the latest table.", "所选洞见已变更，请重新打开最新桌聊。")
    );
  const dialogue = (
    session.rounds?.length
      ? session.rounds
          .filter(item => item.markdown.trim())
          .map(item =>
            item.status === "completed"
              ? item.markdown
              : `${text("Saved segment", "已保存的段落")} (${item.status}):\n${item.markdown}`
          )
      : [session.transcriptMarkdown]
  ).filter(Boolean);
  const answers = session.questions
    .filter(item => item.status === "complete")
    .map(item => `${item.question}\n${item.answer}`);
  const committed = [...dialogue, ...answers];
  const unresolved: string[] = [],
    excerpts: string[] = [];
  for (const source of selected?.sources ?? []) {
    const needle = normalize(source);
    let count = 0;
    for (const text of committed) {
      const haystack = normalize(text);
      let at = 0;
      while (needle && (at = haystack.indexOf(needle, at)) >= 0) {
        count++;
        at += needle.length;
      }
    }
    if (count === 1) excerpts.push(source);
    else unresolved.push(source);
  }
  const snapshotText = selected
    ? [
        insightText(selected),
        `${text("Category", "类别")}: ${selected.category}`,
        selected.sources.length
          ? `${text("Original source annotations (not proof)", "原始来源标注（并非证据）")}: ${JSON.stringify(selected.sources)}`
          : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    : (session.observerNotes ?? []).join("\n\n") ||
      text("No cumulative insight snapshot was available.", "没有可用的累计洞见快照。");
  const status = [
    text(
      "Simulated Coffee Tables discussion. All ideas are unverified candidates, not the user's conclusion.",
      "这是 Coffee Tables 模拟讨论。所有想法均未经验证，不代表用户的结论。"
    ),
    session.dirtyNotes
      ? text(
          "Observer notes are stale / not updated after conversation edits.",
          "观察者整理已过时，尚未根据对谈编辑更新。"
        )
      : ""
  ]
    .filter(Boolean)
    .join("\n");
  const sourceSnapshot = [status, snapshotText].join("\n\n");
  const content = selected
    ? [
        session.topic,
        status,
        sourceSnapshot,
        excerpts.length
          ? `${text("Uniquely verified source excerpts", "已唯一定位的来源摘录")}:\n${excerpts.join("\n\n")}`
          : text("No uniquely located dialogue source.", "没有可唯一定位的对谈来源。"),
        unresolved.length
          ? `${text("Unresolved source annotations (not verified excerpts)", "未能定位的来源标注（并非已验证摘录）")}:\n${JSON.stringify(unresolved)}`
          : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    : [
        session.topic,
        status,
        ...committed,
        ...(session.interventions ?? [])
          .filter(item => item.status === "sent" || item.status === undefined)
          .map(item => `${text("Saved user intervention", "已保存的用户介入")}: ${item.text}`),
        sourceSnapshot,
        session.guests?.background,
        ...references(session).map(item => `${text("Background reference", "背景参考")}: ${item.name}\n${item.content}`)
      ]
        .filter(Boolean)
        .join("\n\n");
  return {
    content,
    sourceSnapshot,
    question: selected?.question || selected?.summary || session.topic,
    artifactId: selected?.persistedId ? selected.id : randomUUID(),
    identityKind: selected?.persistedId ? "persisted-insight" : "snapshot"
  };
}
