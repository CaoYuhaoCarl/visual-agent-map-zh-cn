// Retrying a failed AIM attempt's saved report runs on the attempt's own model, not the current workspace model.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const support = require('./support.cjs');

const { plannerReview, aimPhase } = support;
const { AimManualFlow } = support.load('experiences/aim/manual-flow.ts');

test('reviewFailedAttemptReport retries on the failed attempt model and reasoning, not the workspace settings', async () => {
  const { repo, mapPath, question, store } = await support.aimMapFixture();
  const map = await repo.readMap(mapPath);
  const questionNode = map.nodes.find(item => item.id === question.id);
  questionNode.aimKind = 'question';
  questionNode.aimQuestion = { requestId: 'model-q', parentBranchId: null, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], allowMultiple: false, allowFreeText: true };
  await repo.saveMap(mapPath, map);
  const branch = await store.createAnswerBranch(mapPath, { requestId: 'model-branch', questionNodeId: question.id, parentBranchId: null, answerSnapshot: { selections: [], freeText: 'Synthetic.' }, inputSnapshot: { topic: 'Synthetic topic', conditions: { provenance: 'synthetic fixture' }, upstreamResults: [] } });
  const handle = await store.startAttempt(mapPath, branch.id, 'model-run', { model: 'attempt-model', reasoning: 'medium', maxResearchTurns: 2 });
  await store.recordResearchTurn(mapPath, handle);
  const draft = (await store.createResultDraft(mapPath, handle, 'Saved report', 'attempt-model', 'low')).draft;
  await store.updateResultDraftReport(mapPath, handle, draft.id, 'Report 1: summary.', '## Searcher report 1\n\nResearch status: search completed\n\n### Findings\nPersisted content.');
  await store.recordSearchDiagnostic(mapPath, handle, { researchTurn: 1, startedEvents: 1, completedEvents: 1, completedSearchActions: 1, otherCompletedActions: 0 });
  await store.failAttempt(mapPath, handle, 'Synthetic: Planner response was invalid.');
  assert.notEqual(repo.settings.cliModel, 'attempt-model', 'the workspace model differs from the attempt model');
  const models = [], efforts = [];
  const flow = new AimManualFlow(repo, store, async (context, model, effort) => {
    models.push(model);
    efforts.push(effort);
    if (aimPhase(context, 'research-gap-audit')) return support.researchGapAudit('external_evidence', 'External fact.');
    return plannerReview('ask_user', { rationale: 'Preference matters.', question: 'Which option?' }, 'Conditional answer.', 'Keep reports.', ['Option A', 'Option B']);
  });
  await flow.reviewFailedAttemptReport(mapPath, 'model-run', draft.notePath);
  assert.ok(models.length > 0, 'the review asked the model');
  assert.deepEqual([...new Set(models)], ['attempt-model']);
  assert.notEqual(repo.settings.cliReasoning, 'medium', 'the workspace reasoning differs from the attempt reasoning');
  assert.deepEqual([...new Set(efforts)], ['medium'], 'retry uses the attempt reasoning too');
});
