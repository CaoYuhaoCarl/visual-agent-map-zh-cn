import { hasCompletedWebRetrieval } from "./search-diagnostic";
import type { MapDocument } from "../../map-model";
import type { AimAttemptRecord } from "../../map-model";
import type { Note } from "../../repository";
import type { AiResult } from "../../ai/types";

export interface AimRetryTarget {
  runId: string;
  diagnosticNotePath: string;
}

const diagnosticHeading = "### AIM incomplete-attempt diagnostic";
const originalHeading = "### Original draft response";
const detailEnd = "<!-- visual-agent-map:detail:end -->";

/** Reports stored as data on the failed attempt for exactly this diagnostic note. */
function structuredReports(attempt: AimAttemptRecord, notePath?: string): AiResult[] | null {
  const retained = attempt.retainedReports;
  if (!retained || (notePath !== undefined && retained.notePath !== notePath)) return null;
  if (!hasCompletedWebRetrieval(attempt.searchDiagnostics)) return null;
  return retained.reports.map(report => ({
    summary: report.summary,
    detail: report.detail,
    suggestions: [],
    visualReferences: []
  }));
}

/**
 * Extract only a retained report that belongs to this failed attempt and has completed-search telemetry.
 * Reports stored on the attempt are used when present; parsing the note's Markdown remains for maps
 * written before reports were stored as data.
 */
export function extractAimFailedReport(note: Note, attempt: AimAttemptRecord, notePath?: string): AiResult[] | null {
  if (note.status !== "error" || !note.detail.trim()) return null;
  if (attempt.retainedReports) return structuredReports(attempt, notePath);

  const reportMarker = "**Source boundary:** ";
  const reportStart = note.detail.indexOf(reportMarker);
  if (
    note.detail.includes("**Status:** Diagnostic only.") &&
    reportStart >= 0 &&
    note.detail.includes(` ${attempt.id}; the persisted attempt remains failed.`)
  ) {
    const reportDetail = note.detail.slice(reportStart + reportMarker.length).trim();
    return note.summary.trim() && /^Research status:\s*search completed\b/i.test(reportDetail)
      ? [{ summary: note.summary, detail: reportDetail, suggestions: [], visualReferences: [] }]
      : null;
  }

  // RunStore's native failed-draft format predates the normalized wrapper. Search completion is
  // proven by persisted Codex action telemetry, not inferred from report wording or URL fields.
  const exactAttempt = `This draft was not published because attempt ${attempt.id} did not complete successfully.`;
  const start = note.detail.indexOf(diagnosticHeading),
    originalStart = note.detail.indexOf(originalHeading);
  if (start < 0 || originalStart <= start || !note.detail.slice(start, originalStart).includes(exactAttempt))
    return null;
  if (!hasCompletedWebRetrieval(attempt.searchDiagnostics)) return null;
  const body = note.detail
    .slice(originalStart + originalHeading.length)
    .split(detailEnd, 1)[0]
    .trim();
  const summaryStart = body.indexOf("Original summary:");
  const firstReport = body.indexOf("## Searcher report 1");
  if (summaryStart < 0 || firstReport < 0 || firstReport <= summaryStart) return null;
  const summaries = [...body.slice(summaryStart, firstReport).matchAll(/^Original summary:\s*(.*)$/gm)].flatMap(match =>
    [...match[1].matchAll(/(?:^|\n)Report (\d+):\s*(.+)/g)].map(item => ({
      index: Number(item[1]),
      summary: item[2].trim()
    }))
  );
  const reports: AiResult[] = [];
  const headings = [...body.matchAll(/^## Searcher report (\d+)\s*$/gm)];
  if (!headings.length || headings.length !== summaries.length) return null;
  for (let index = 0; index < headings.length; index++) {
    const number = Number(headings[index][1]),
      next = headings[index + 1]?.index ?? body.length;
    const section = body.slice(headings[index].index + headings[index][0].length, next).trim();
    if (number !== index + 1 || summaries[index]?.index !== number || !summaries[index]?.summary || !section)
      return null;
    reports.push({ summary: summaries[index].summary, detail: section, suggestions: [], visualReferences: [] });
  }
  return reports;
}

/** Match one map-local completed-search diagnostic to a currently failed attempt/question. */
export function matchAimFailedReportTargets(
  map: MapDocument,
  candidates: { path: string; note: Note }[]
): Map<string, AimRetryTarget> {
  const currentFailed =
    map.aim?.runs.flatMap(run => {
      const attempt = run.attempts.find(item => item.id === run.currentAttemptId);
      return attempt?.status === "failed" ? [{ runId: run.id, attempt }] : [];
    }) ?? [];
  const failed =
    map.aim?.runs.flatMap(run => {
      const attempt = run.attempts.find(item => item.id === run.currentAttemptId);
      const branch = map.aim?.branches.find(item => item.id === run.branchId);
      const question = branch && map.nodes.find(item => item.id === branch.questionNodeId);
      return attempt?.status === "failed" && branch && question?.aimKind === "question"
        ? [{ runId: run.id, attempt, branchId: branch.id, questionNodeId: question.id }]
        : [];
    }) ?? [];
  const matches = new Map<string, AimRetryTarget[]>();
  for (const { path, note } of candidates) {
    const isWrapped = note.detail.includes("**Status:** Diagnostic only.");
    let selected: typeof failed = failed.filter(
      item =>
        item.attempt.retainedReports?.notePath === path && extractAimFailedReport(note, item.attempt, path) !== null
    );
    if (selected.length) {
      // Identified by the stored note path; no Markdown matching needed.
    } else if (isWrapped) {
      selected = failed.filter(
        item =>
          note.detail.includes(
            `**Prior attempt:** ${item.branchId} / ${item.attempt.id}; the persisted attempt remains failed.`
          ) && extractAimFailedReport(note, item.attempt) !== null
      );
    } else {
      const nativeAttemptId = note.detail.match(
        /This draft was not published because attempt ([^\s]+) did not complete successfully\./
      )?.[1];
      const sameOrdinalFailures = currentFailed.filter(item => item.attempt.id === nativeAttemptId);
      if (nativeAttemptId && sameOrdinalFailures.length === 1) {
        selected = failed.filter(
          item => item.runId === sameOrdinalFailures[0].runId && extractAimFailedReport(note, item.attempt) !== null
        );
      }
    }
    for (const item of selected) {
      if (!item.attempt.retainedReports && isWrapped && !note.detail.includes("**Source boundary:** ")) continue;
      const list = matches.get(item.questionNodeId) ?? [];
      list.push({ runId: item.runId, diagnosticNotePath: path });
      matches.set(item.questionNodeId, list);
    }
  }
  const targets = new Map<string, AimRetryTarget>();
  for (const [questionNodeId, items] of matches) if (items.length === 1) targets.set(questionNodeId, items[0]);
  return targets;
}
