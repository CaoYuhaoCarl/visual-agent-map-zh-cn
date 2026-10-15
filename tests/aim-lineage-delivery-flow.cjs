// A later answer's final delivery can read an earlier answer's saved results when the outline maps to their
// evidence-card ids (`${nodeId}-v${version}`). Real AimManualFlow over the coverage model.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./support.cjs');

const { AimManualFlow } = S.load('experiences/aim/manual-flow.ts');
const { AimRunStore } = S.load('experiences/aim/research-run-store.ts');
const { createAimMap } = S.load('experiences/aim/create-map.ts');
const MODEL = 'gpt-6-luna';
const phaseOf = context => context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1];

test('a child branch delivery resolves parent results as lineage evidence by evidence-card id', async () => {
  const data = S.fixture();
  const model = S.coverageModel();
  const created = await createAimMap(data.repo, MODEL, { requestId: 'lineage-flow', topic: 'lineage', context: 'Initial clarification: known background.', minimumAnswersBeforeConclusion: 3, outcomeExpectation: { goal: 'execute', description: '', formats: ['steps', 'table'] } });
  const repo = new S.Repository(data.app, { ...S.DEFAULT_SETTINGS, language: 'zh-TW' });
  const tasks = {};
  let outlineIds = [];
  const ask = async (context, ...rest) => {
    const phase = phaseOf(context);
    if (phase === 'delivery-outline') {
      tasks.outline = context.task;
      outlineIds = [...new Set(`${context.task}\n${context.ancestors ?? ''}\n${context.detail ?? ''}`.match(/[0-9a-zA-Z-]+-v\d+/g) ?? [])];
      return { summary: 'Outline', detail: `<!-- aim-delivery-outline ${JSON.stringify({ sections: [{ heading: 'All', purpose: 'Use earlier results', searchTask: '', evidenceIds: outlineIds }] })} -->`, suggestions: [], visualReferences: [] };
    }
    if (phase === 'delivery-writing') tasks.writing = context.task;
    return model.ask(context, ...rest);
  };
  const flow = new AimManualFlow(repo, new AimRunStore(repo), ask);
  let question = (await flow.planNextQuestion(created.mapPath, created.root.id, MODEL, 'low', 'q')).node;
  let outcome;
  for (let round = 1; round <= 3; round++) {
    outcome = await flow.answerAndResearch(created.mapPath, question.id, { requestId: `a-${round}`, selections: [question.aimQuestion.options[0].id], freeText: `Specific condition ${round}` }, MODEL, 'low');
    if (round < 3) question = (await repo.readMap(created.mapPath)).nodes.find(node => node.id === outcome.questionNodeId);
  }
  assert.equal(outcome.status, 'completed');
  const map = await repo.readMap(created.mapPath);
  const parent = map.aim.branches[0];
  const parentIds = parent.results.map(result => `${result.nodeId}-v${result.version}`);
  const mapped = parentIds.filter(id => outlineIds.includes(id));
  assert.ok(mapped.length, 'the outline saw the parent results as evidence cards');
  const parentResult = parent.results.find(result => `${result.nodeId}-v${result.version}` === mapped[0]);
  const note = await repo.readNote(parentResult.notePath);
  assert.ok(tasks.writing.includes(`Source ID: ${mapped[0]}`), 'the writer received the parent result under its card id');
  assert.ok(tasks.writing.includes(note.detail.slice(0, 40)), 'the writer received the parent result text');
});
