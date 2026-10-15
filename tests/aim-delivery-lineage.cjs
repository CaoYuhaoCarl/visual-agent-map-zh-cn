const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('./build.cjs');
const code = buildSync({ entryPoints: ['experiences/aim/final-delivery.ts'] }).outputFiles[0].text;
const moduleValue = { exports: {} };
vm.runInNewContext(code, { module: moduleValue, exports: moduleValue.exports, require });
const { buildFinalDelivery } = moduleValue.exports;
const base = { title: 'Goal', detail: 'Conditions' };
const answer = detail => ({ summary: 'Preview', detail, suggestions: [], visualReferences: [] });
const phaseOf = context => context.task.match(/aim-phase: ([a-z-]+)/)[1];
const current = [{ id: 'cur-1', hash: 'h1', detail: '## Current\n\nCURRENT-DETAIL' }];
const lineage = [{ id: 'L-v6', hash: 'hl', detail: '## Earlier\n\n史前博物館週一休' }];
const outlineWith = section => answer(`<!-- aim-delivery-outline ${JSON.stringify({ sections: [{ heading: 'Steps', purpose: 'Execute', searchTask: '', ...section }] })} -->`);

async function run(outline, options) {
  const tasks = {};
  await buildFinalDelivery(base, async context => {
    const phase = phaseOf(context);
    tasks[phase] = context.task;
    if (phase === 'delivery-outline') return outline;
    if (phase === 'delivery-research') return answer('<!-- aim-delivery-research {"status":"searched"} -->');
    if (phase === 'delivery-writing') return answer('Draft');
    return answer('<!-- aim-review {"decision":"conclude","rationale":"ok","stopReason":"Ready"} -->');
  }, { evidence: current, knownConditions: '{}', ...options, onCheckpoint: c => { tasks.checkpoint = JSON.parse(JSON.stringify(c)); } });
  return tasks;
}

test('writer reads a lineage source the outline maps; outline and acceptance do not carry it', async () => {
  const tasks = await run(outlineWith({ evidenceIds: ['L-v6'] }), { lineageEvidence: lineage });
  assert.ok(tasks['delivery-writing'].includes('史前博物館週一休'));
  assert.deepEqual(tasks.checkpoint.sections.document.evidenceIds, ['L-v6']);
  assert.ok(!tasks['delivery-outline'].includes('史前博物館週一休'));
  assert.ok(!tasks['delivery-acceptance'].includes('史前博物館週一休'));
});

test('an id in neither pool is dropped', async () => {
  const tasks = await run(outlineWith({ evidenceIds: ['L-v6', 'invented'] }), { lineageEvidence: lineage });
  assert.deepEqual(tasks.checkpoint.sections.document.evidenceIds, ['L-v6']);
  const none = await run(outlineWith({ evidenceIds: ['invented'] }), { lineageEvidence: lineage });
  assert.deepEqual(none.checkpoint.sections.document.evidenceIds, ['cur-1']);
});

test('a section without a mapping pulls only this round evidence', async () => {
  const tasks = await run(outlineWith({}), { lineageEvidence: lineage });
  assert.deepEqual(tasks.checkpoint.sections.document.evidenceIds, ['cur-1']);
  assert.ok(!tasks['delivery-writing'].includes('史前博物館週一休'));
});

test('a current-round source wins an id collision with lineage', async () => {
  const tasks = await run(outlineWith({ evidenceIds: ['cur-1'] }), { lineageEvidence: [{ id: 'cur-1', hash: 'x', detail: 'LINEAGE-COPY' }] });
  assert.ok(tasks['delivery-writing'].includes('CURRENT-DETAIL'));
  assert.ok(!tasks['delivery-writing'].includes('LINEAGE-COPY'));
});
