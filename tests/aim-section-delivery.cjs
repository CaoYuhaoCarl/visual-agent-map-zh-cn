const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('./build.cjs');
const code = buildSync({ entryPoints: ['experiences/aim/final-delivery.ts'] }).outputFiles[0].text;
const moduleValue = { exports: {} };
vm.runInNewContext(code, { module: moduleValue, exports: moduleValue.exports, require });
const { buildFinalDelivery } = moduleValue.exports;
const answer = detail => ({ summary: 'Preview only', detail, suggestions: [], visualReferences: [] });
const base = { title: 'Goal', detail: 'ALL PRIOR REPORTS including unrelated source B', rules: '' };
const outline = answer('<!-- aim-delivery-outline {"sections":[{"heading":"First","purpose":"Use first evidence","searchTask":"","evidenceIds":["source-a"]},{"heading":"Second","purpose":"Use second evidence","searchTask":"","evidenceIds":["source-b"]}]} -->');
const acceptance = answer('<!-- aim-review {"decision":"conclude","rationale":"Coherent and supported","stopReason":"All sections complete"} -->');
const evidence = [{ id: 'source-a', hash: 'a-v1', detail: 'First proof https://a.example/docs' }, { id: 'source-b', hash: 'b-v1', detail: 'Second proof https://b.example/docs' }];
const phaseOf = context => context.task.match(/aim-phase: ([a-z-]+)/)[1];
const options = { evidence, knownConditions: 'Original goal and known conditions only' };
function provider(calls, failWriting = false) {
  return async context => {
    const phase = phaseOf(context);
    calls.push(phase);
    if (phase === 'delivery-outline') {
      assert.ok(context.task.includes('Source ID: source-a'));
      return outline;
    }
    if (phase === 'delivery-writing') {
      if (failWriting) throw new Error('writing provider failed');
      assert.ok(context.task.includes('Source ID: source-a') && context.task.includes('Source ID: source-b'), 'the one writer reads every mapped source');
      assert.ok(context.task.includes('"heading":"First"') && context.task.includes('"heading":"Second"'), 'the writer sees the whole outline');
      assert.ok(!context.detail.includes('ALL PRIOR REPORTS'));
      return answer('## First\n\nDetailed First content https://a.example/docs\n\n## Second\n\nDetailed Second content https://b.example/docs');
    }
    assert.equal(phase, 'delivery-acceptance');
    assert.ok(context.task.includes('cross-section coherence'));
    assert.ok(context.task.includes('duplicate passages'));
    assert.ok(context.task.includes('wrong claims'));
    assert.ok(context.task.includes('missing sections'));
    return acceptance;
  };
}
test('the whole document is written in one call, and a failed write alone resumes after reload', async () => {
  let saved;
  const firstCalls = [];
  await assert.rejects(buildFinalDelivery(base, provider(firstCalls, true), { ...options, onCheckpoint: value => { saved = JSON.parse(JSON.stringify(value)); } }), /writing provider failed/);
  assert.deepEqual(firstCalls, ['delivery-outline', 'delivery-writing']);
  const retryCalls = [];
  const delivery = await buildFinalDelivery(base, provider(retryCalls), { ...options, checkpoint: saved });
  assert.deepEqual(retryCalls, ['delivery-writing', 'delivery-acceptance']);
  assert.ok(delivery.result.detail.includes('Detailed First content'));
  assert.ok(delivery.result.detail.includes('Detailed Second content'));
});
test('changing a mapped source rewrites the document and reruns acceptance', async () => {
  let saved;
  await buildFinalDelivery(base, provider([]), { ...options, onCheckpoint: value => { saved = JSON.parse(JSON.stringify(value)); } });
  const calls = [];
  await buildFinalDelivery({ ...base, detail: 'Updated full report text' }, provider(calls), { ...options, evidence: [{ ...evidence[0], hash: 'a-v2', detail: 'Updated first proof https://a.example/docs' }, evidence[1]], checkpoint: saved });
  assert.deepEqual(calls, ['delivery-writing', 'delivery-acceptance']);
});
test('cancellation after the written document is saved resumes at acceptance without rewriting', async () => {
  let saved;
  const controller = new AbortController();
  await assert.rejects(buildFinalDelivery({ ...base, signal: controller.signal }, provider([]), { ...options, onCheckpoint: value => {
    saved = JSON.parse(JSON.stringify(value));
    if (value.draft) controller.abort();
  } }));
  const calls = [];
  await buildFinalDelivery(base, provider(calls), { ...options, checkpoint: saved });
  assert.deepEqual(calls, ['delivery-acceptance']);
});
test('acceptance failure retries only the final join review with the document intact', async () => {
  let saved;
  const ask = provider([]);
  await assert.rejects(buildFinalDelivery(base, async context => {
    if (phaseOf(context) === 'delivery-acceptance') throw new Error('join review failed');
    return ask(context);
  }, { ...options, onCheckpoint: value => { saved = JSON.parse(JSON.stringify(value)); } }), /join review failed/);
  const calls = [];
  await buildFinalDelivery(base, provider(calls), { ...options, checkpoint: saved });
  assert.deepEqual(calls, ['delivery-acceptance']);
});
test('an outline source ID that does not exist is dropped and never read, and the document still gets evidence', async () => {
  const tasks = [];
  await buildFinalDelivery(base, async context => {
    tasks.push(context);
    const phase = phaseOf(context);
    if (phase === 'delivery-outline') return answer(outline.detail.replace('"source-b"', '"unknown-source"'));
    if (phase === 'delivery-writing') return answer('## First\n\nContent https://a.example/docs');
    return acceptance;
  }, options);
  const [writing] = tasks.filter(context => phaseOf(context) === 'delivery-writing');
  assert.ok(!/Source ID: unknown-source/.test(writing.task), 'the invented ID is never read');
  assert.ok(/Source ID: source-a/.test(writing.task) && /Source ID: source-b/.test(writing.task), 'a section left without IDs brings in all supplied evidence');
});
test('changed known user conditions rewrite the outline and the document', async () => {
  let saved;
  await buildFinalDelivery(base, provider([]), { ...options, onCheckpoint: value => { saved = JSON.parse(JSON.stringify(value)); } });
  const calls = [];
  await buildFinalDelivery(base, provider(calls), { ...options, knownConditions: 'Changed condition', checkpoint: saved });
  assert.deepEqual(calls, ['delivery-outline', 'delivery-writing', 'delivery-acceptance']);
});
test('changed source backing a supplemental search reruns that research and the document', async () => {
  let saved; let revision = 1;
  const gapOutline = answer(outline.detail.replace('"searchTask":""', '"searchTask":"Verify the first source gap"'));
  const calls = [];
  const ask = async context => {
    const phase = phaseOf(context);
    calls.push(phase);
    if (phase === 'delivery-outline') return gapOutline;
    if (phase === 'delivery-research') return answer(`<!-- aim-delivery-research {"status":"searched"} -->\nUpdated supplemental research ${revision} https://extra.example/docs`);
    if (phase === 'delivery-writing') {
      assert.ok(context.task.includes(`Updated supplemental research ${revision}`), 'the writer gets the research once');
      return answer(`## First\n\nFull document ${revision}`);
    }
    return acceptance;
  };
  await buildFinalDelivery(base, ask, { ...options, onCheckpoint: value => { saved = JSON.parse(JSON.stringify(value)); } });
  calls.length = 0; revision = 2;
  await buildFinalDelivery(base, ask, { ...options, checkpoint: saved, evidence: [{ ...evidence[0], hash: 'a-v2' }, evidence[1]] });
  assert.deepEqual(calls, ['delivery-research', 'delivery-writing', 'delivery-acceptance']);
});
test('a supplemental research failure after a source update resumes at research', async () => {
  let saved;
  const gapOutline = answer(outline.detail.replace('"searchTask":""', '"searchTask":"Verify first source"'));
  const ask = async context => {
    if (phaseOf(context) === 'delivery-outline') return gapOutline;
    if (phaseOf(context) === 'delivery-research') return answer('<!-- aim-delivery-research {"status":"searched"} -->\nFirst supplemental source');
    if (phaseOf(context) === 'delivery-writing') return answer('## First\n\nFull content');
    return acceptance;
  };
  await buildFinalDelivery(base, ask, { ...options, onCheckpoint: value => { saved = JSON.parse(JSON.stringify(value)); } });
  const updatedEvidence = [{ ...evidence[0], hash: 'a-v2' }, evidence[1]];
  await assert.rejects(buildFinalDelivery(base, async context => {
    if (phaseOf(context) === 'delivery-research') throw new Error('supplemental provider failure');
    return ask(context);
  }, { ...options, evidence: updatedEvidence, checkpoint: saved, onCheckpoint: value => { saved = JSON.parse(JSON.stringify(value)); } }), /supplemental provider failure/);
  const calls = [];
  await buildFinalDelivery(base, async context => { calls.push(phaseOf(context)); return ask(context); }, { ...options, evidence: updatedEvidence, checkpoint: saved });
  assert.deepEqual(calls, ['delivery-research', 'delivery-writing', 'delivery-acceptance']);
});
test('a malformed outline source mapping is cleaned instead of ending the delivery', async () => {
  const tasks = [];
  const messy = answer('<!-- aim-delivery-outline {"sections":[{"heading":"First","purpose":"Use first evidence","searchTask":"","evidenceIds":["source-a","source-a",""," ",3]},{"heading":"Second","purpose":"Use second evidence","searchTask":"","evidenceIds":null,"dependencies":"source-b"}]} -->');
  await buildFinalDelivery(base, async context => {
    tasks.push(context);
    const phase = phaseOf(context);
    if (phase === 'delivery-outline') return messy;
    if (phase === 'delivery-writing') return answer('## First\n\nContent https://a.example/docs');
    return acceptance;
  }, options);
  const [writing] = tasks.filter(context => phaseOf(context) === 'delivery-writing');
  assert.ok(/Source ID: source-a/.test(writing.task) && /Source ID: source-b/.test(writing.task), 'a section without a usable mapping uses all supplied evidence');
});
