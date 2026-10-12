// Replay provider tests. Recorded raw replies are fed through the real AiTaskService parsing path (and, for AIM
// review cases, the real Planner-review parser) at the single runtime.runTask seam. No live provider is involved.
// Case kinds: (default) one raw reply through AiTaskService; "flow" an ordered list of raw replies (one AIM flow run, each exchange
// keeps its step stepId@version); "aim-flow-result-layer" historical PARSED results fed through the AimManualFlow ask seam.
// Set VAM_REPLAY_CORPUS=<dir> to also run every *.replay.json case in that directory (private corpus, optional layer).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { load, makeService, replayRuntime, replayAsk, ReplayMiss, readJson, sha256 } = require('./support-replay.cjs');
const { fixture, AimManualFlow } = require('./support-aim-fixture.cjs');

const fixtures = path.join(__dirname, 'fixtures', 'replay');
const plain = value => JSON.parse(JSON.stringify(value));
const { parseAimPlannerReview } = load('experiences/aim/planner-review.ts');

/** Neutral, NON-historical stand-ins that let the flow reach the phase under test. They are never presented as recorded output. */
const aimReview = (decision, extra = {}) => ({ summary: 'Neutral review', detail: `<!-- aim-review ${JSON.stringify({ decision, ...extra })} -->\nNeutral review`, suggestions: [], visualReferences: [] });
const aimFills = headings => ({
  'subtopic-research': { summary: 'Neutral research', detail: 'Research status: search completed\nNeutral evidence https://example.org/neutral', suggestions: [], visualReferences: [] },
  'report-review': aimReview('conclude', { rationale: 'Neutral rationale.', stopReason: 'Neutral stop reason.' }),
  'delivery-outline': { summary: 'Neutral outline', detail: `<!-- aim-delivery-outline ${JSON.stringify({ sections: (headings ?? ['Section A']).map(heading => ({ heading, purpose: 'Neutral purpose.', searchTask: '' })) })} -->`, suggestions: [], visualReferences: [] },
  'delivery-writing': { summary: 'Neutral draft', detail: 'Neutral draft text.', suggestions: [], visualReferences: [] },
  'delivery-acceptance': aimReview('conclude', { rationale: 'Neutral rationale.', stopReason: 'Neutral stop reason.' })
});

/**
 * Result-layer replay. The historical values are already-parsed AiResult objects (old mindsearch-* marker contract); they enter
 * at the ask seam, AFTER AiTaskService has folded a structured aim payload. So this asserts what CURRENT code does with those
 * historical outputs; it does not reproduce the original failure layer.
 */
async function runResultLayerCase(replayCase) {
  assert.ok(replayCase.historical?.length && replayCase.scenarios?.length, `${replayCase.name}: result-layer case needs historical[] and scenarios[]`);
  for (const step of replayCase.historical) assert.equal(step.context.promptProfile, 'mindsearch', `${replayCase.name}: historical call carries the old mindsearch profile`);
  const outcomes = [];
  for (const scenario of replayCase.scenarios) {
    const label = `${replayCase.name} / ${scenario.name}`;
    const feed = scenario.feed.map(index => ({ phase: replayCase.historical[index].phase, result: replayCase.historical[index].result }));
    const all = aimFills(scenario.outlineHeadings);
    const fills = Object.fromEntries(scenario.fills.map(phase => [phase, all[phase]]));
    const subject = fixture({ depth: 1 });
    const replay = replayAsk(feed, fills);
    let next = 0;
    const flow = new AimManualFlow(subject.repository, subject.store, replay.ask, () => `replay-${++next}`);
    let failure;
    try { await flow.resumeAnswerResearch('Map.md', 'current', 'test', 'low'); } catch (error) { failure = error; }
    const { expect } = scenario;
    if (expect.phases) assert.deepEqual(replay.phases(), expect.phases, `${label}: phases the current flow requested`);
    if (expect.neverRequested) assert.ok(!replay.phases().includes(expect.neverRequested), `${label}: current flow never requests ${expect.neverRequested}`);
    assert.equal(replay.consumed(), expect.consumed, `${label}: historical results consumed`);
    if (expect.error === null) assert.ifError(failure);
    else { assert.ok(failure, `${label}: expected the current flow to reject`); assert.match(failure.message, new RegExp(expect.error), `${label}: rejection`); }
    if (expect.recoveryPhase !== undefined) assert.equal(subject.getMap().aim.branches.find(branch => branch.id === 'current').deliveryRecovery?.phase ?? null, expect.recoveryPhase, `${label}: saved delivery recovery phase`);
    for (const { phase, context } of replay.observed) assert.equal(context.promptProfile, 'aim', `${label}: current ${phase} context uses the aim profile, not the historical mindsearch profile`);
    outcomes.push({ scenario: scenario.name, failure, replay });
  }
  return outcomes;
}

/** A "flow" case: ordered raw exchanges for one flow run, replayed through one AiTaskService in order. */
async function runFlowCase(replayCase) {
  assert.ok(Array.isArray(replayCase.exchanges) && replayCase.exchanges.length, `${replayCase.name}: a flow case needs exchanges`);
  if (replayCase.expect?.stepOrder) assert.deepEqual(replayCase.exchanges.map(item => item.step), replayCase.expect.stepOrder, `${replayCase.name}: recorded step order`);
  const runtime = replayRuntime(replayCase.exchanges.map(item => ({ promptSha256: replayCase.matchPrompt === false ? undefined : item.promptSha256, response: item.response, error: item.error })));
  const service = makeService(runtime, { language: replayCase.language ?? 'en' });
  const observed = [];
  for (const [index, exchange] of replayCase.exchanges.entries()) {
    const label = `${replayCase.name}[${index}${exchange.step ? ` ${exchange.step}` : ''}]`;
    assert.ok(exchange.context && exchange.expect?.askModel, `${label}: a flow exchange needs "context" and "expect.askModel" (add them via the converter manifest)`);
    let result, failure;
    try { result = plain(await service.askModel(plain(exchange.context), exchange.model, exchange.effort)); } catch (error) { failure = error; }
    if (exchange.expect.askModel.error !== undefined) { assert.ok(failure, `${label}: expected askModel to reject`); assert.match(failure.message, new RegExp(exchange.expect.askModel.error), `${label}: rejection`); }
    else { assert.ifError(failure); assert.deepEqual(result, exchange.expect.askModel.result, `${label}: parsed AiResult`); }
    assert.equal(runtime.calls[index].hash, exchange.promptSha256 ?? runtime.calls[index].hash, `${label}: calls arrive in recorded order`);
    observed.push({ result, failure });
  }
  assert.deepEqual(runtime.unused(), [], `${replayCase.name}: every recorded reply was consumed`);
  return { observed, runtime };
}

/** Run any case kind. */
async function runAnyCase(replayCase) {
  if (replayCase.kind === 'aim-flow-result-layer') return runResultLayerCase(replayCase);
  if (replayCase.kind === 'flow') return runFlowCase(replayCase);
  return runCase(replayCase);
}

/** Drive one replay case through AiTaskService and assert its `expect` block. Returns the observed outcome. */
async function runCase(replayCase) {
  assert.ok(replayCase.context, `${replayCase.name}: a replay case needs "context" (the TaskContext to drive); add it via the converter manifest`);
  assert.ok(replayCase.expect, `${replayCase.name}: a replay case needs an "expect" block`);
  const entries = replayCase.exchanges.map(item => ({ promptSha256: replayCase.matchPrompt === false ? undefined : item.promptSha256, response: item.response, error: item.error }));
  const runtime = replayRuntime(entries);
  const service = makeService(runtime, { language: replayCase.language ?? 'en' });
  let result, failure;
  try { result = plain(await service.askModel(plain(replayCase.context), replayCase.model, replayCase.effort)); } catch (error) { failure = error; }
  const { askModel, plannerReview } = replayCase.expect;
  if (askModel.error !== undefined) {
    assert.ok(failure, `${replayCase.name}: expected askModel to reject`);
    assert.match(failure.message, new RegExp(askModel.error), `${replayCase.name}: rejection message`);
  } else {
    assert.ifError(failure);
    assert.deepEqual(result, askModel.result, `${replayCase.name}: parsed AiResult`);
  }
  if (askModel.schemaRequiresAim !== undefined) assert.equal(runtime.calls[0].schema.required.includes('aim'), askModel.schemaRequiresAim, `${replayCase.name}: provider schema requires the aim payload`);
  if (askModel.responseHasAim !== undefined) assert.equal('aim' in JSON.parse(replayCase.exchanges[0].response), askModel.responseHasAim, `${replayCase.name}: recorded reply carries an aim payload`);
  if (plannerReview) {
    assert.ok(result, `${replayCase.name}: Planner review needs a parsed result`);
    if (plannerReview.error !== undefined) assert.throws(() => parseAimPlannerReview(result), new RegExp(plannerReview.error), `${replayCase.name}: Planner review parser`);
    else assert.deepEqual(plain(parseAimPlannerReview(result)), plannerReview.review);
  }
  if (askModel.error === undefined || runtime.calls.length) assert.deepEqual(runtime.unused(), [], `${replayCase.name}: every recorded reply was consumed`);
  return { result, failure, runtime };
}

test('replay provider answers by prompt hash or in order, supports recorded errors, and never falls back', async () => {
  const runtime = replayRuntime([{ promptSha256: sha256('second'), response: 'R2' }, { response: 'R-seq-1' }, { error: 'recorded provider failure' }]);
  assert.equal(await runtime.runTask('second'), 'R2');
  assert.equal(await runtime.runTask('anything'), 'R-seq-1');
  await assert.rejects(runtime.runTask('third'), /recorded provider failure/);
  await assert.rejects(runtime.runTask('fourth'), error => error instanceof ReplayMiss && /no recorded response for prompt sha256/.test(error.message));
  assert.deepEqual(runtime.unused(), []);
  const hashed = replayRuntime([{ promptSha256: sha256('wanted'), response: 'X' }]);
  await assert.rejects(hashed.runTask('different'), ReplayMiss);
  assert.equal(sha256('a 2031-02-03T04:05:06.789Z b 12345678-1234-4123-8123-123456789abc'), sha256('a 2030-01-01T00:00:00Z b ffffffff-ffff-ffff-ffff-ffffffffffff'), 'time and UUID are normalized');
});

test('Round7 native ask_user response (de-identified): provider schema requires aim, reply has none, parser rejects it', async () => {
  const replayCase = readJson(path.join(fixtures, 'round7-native-ask-user.replay.json'));
  const { result } = await runCase(replayCase);
  // Current behavior is REJECT, not repair: AiTaskService passes the reply through unchanged (no aim payload to fold,
  // so no aim-review marker is produced) and parseAimPlannerReview refuses it. Nothing repairs the missing payload here.
  assert.equal(/aim-review/.test(result.detail), false);
  assert.equal(result.suggestions.length, 3);
});

test('Round6 failed exchange (de-identified) converts with the script and replays; current code rejects it at the Planner review parser (the recorded failure was in AiTaskService parsing)', async () => {
  const { convertExchanges } = await import(pathToFileURL(path.join(__dirname, 'tools', 'exchanges-to-replay.mjs')).href);
  const exchanges = readJson(path.join(fixtures, 'round6-failed-exchange.exchanges.json'));
  const manifest = readJson(path.join(fixtures, 'round6-failed-exchange.manifest.json'));
  assert.equal(exchanges[0].status, 'failed');
  assert.match(exchanges[0].error, /structured control response was invalid/);
  const [sequential] = convertExchanges(exchanges, { manifest, sequential: true });
  assert.equal(sequential.exchanges[0].promptSha256, sha256(exchanges[0].prompt), 'converter and test helper hash identically');
  assert.equal(sequential.source.status, 'failed');
  assert.equal(sequential.exchanges[0].error, undefined, 'a parse-stage failure replays the raw reply, not a provider error');
  const { result } = await runCase(sequential);
  assert.equal(result.suggestions.length, 3);
  // Hash-bound replay refuses a prompt that current code no longer builds: it must not silently answer.
  const [bound] = convertExchanges(exchanges, { manifest, sequential: false });
  await assert.rejects(runCase(bound), /no recorded response for prompt sha256/);
});

test('record once, convert, replay: the replayed run reproduces the live parsed result and failure', async () => {
  const { AiExchangeLog } = load('ai-exchange-log.ts');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vam-replay-'));
  try {
    const logFile = path.join(directory, 'ai-exchanges.json');
    const errors = [];
    const log = new AiExchangeLog(logFile, error => errors.push(error));
    const raw = {
      ok: JSON.stringify({ summary: 'Live summary', detail: 'Live detail with [S1]', suggestions: [{ title: 'Next', task: 'Do next', contribution: 'Why' }], visualReferences: [] }),
      review: JSON.stringify({ summary: 'Which option fits?', detail: 'Interim answer.', suggestions: [{ title: 'Option A', task: '', contribution: '' }, { title: 'Option B', task: '', contribution: '' }], visualReferences: [], aim: { goalAnswered: false, decision: 'ask_user', rationale: 'Needs one condition.', stopReason: '', question: 'Which option fits?', answerOptions: ['Option A', 'Option B'], researchTarget: null } })
    };
    const live = {
      runTask: async (prompt, _model, _effort, _schema, controls) => {
        controls.onRequest({ input: [{ type: 'text', text: prompt }] });
        if (prompt.includes('Failing topic')) throw new Error('provider boom');
        return prompt.includes('Review topic') ? raw.review : raw.ok;
      }
    };
    const contexts = {
      ok: { title: 'Ok topic', summary: '', rules: '', detail: '', task: 'Plain task', ancestors: '', sourceContext: 'Source [S1]: a fact', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off' },
      review: { title: 'Review topic', summary: '', rules: '', detail: 'Reports', task: '<!-- aim-phase: report-review -->\nReview', ancestors: '', mode: 'task', promptProfile: 'aim', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', aimContract: { kind: 'review', decisions: ['research_more', 'ask_user'] } },
      failing: { title: 'Failing topic', summary: '', rules: '', detail: '', task: 'Plain task', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off' }
    };
    const liveService = makeService(live, { logging: true, exchanges: log });
    const liveResults = {};
    for (const key of ['ok', 'review']) liveResults[key] = plain(await liveService.askModel(contexts[key], 'gpt-6-luna', 'low'));
    await assert.rejects(liveService.askModel(contexts.failing, 'gpt-6-luna', 'low'), /provider boom/);
    await log.flush();
    assert.deepEqual(errors, []);
    const recorded = readJson(logFile);
    assert.equal(recorded.length, 3);
    assert.deepEqual(recorded.map(item => item.status), ['parsed', 'parsed', 'failed']);

    const manifest = { 'Ok topic': { name: 'roundtrip-ok', context: contexts.ok, expect: { askModel: { result: liveResults.ok } } }, 'Review topic': { name: 'roundtrip-review', context: contexts.review, expect: { askModel: { result: liveResults.review }, plannerReview: { review: plain(parseAimPlannerReview(liveResults.review)) } } }, 'Failing topic': { name: 'roundtrip-failing', context: contexts.failing, expect: { askModel: { error: 'provider boom' } } } };
    const manifestFile = path.join(directory, 'manifest.json');
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    const corpus = path.join(directory, 'corpus');
    const output = execFileSync(process.execPath, [path.join(__dirname, 'tools', 'exchanges-to-replay.mjs'), logFile, corpus, '--manifest', manifestFile], { encoding: 'utf8' });
    assert.match(output, /3 replay case\(s\) written/);
    const files = fs.readdirSync(corpus).sort();
    assert.deepEqual(files, ['roundtrip-failing.replay.json', 'roundtrip-ok.replay.json', 'roundtrip-review.replay.json']);
    for (const file of files) {
      const replayCase = readJson(path.join(corpus, file));
      assert.equal(replayCase.matchPrompt, true);
      const { result } = await runCase(replayCase); // hash-bound: current code must rebuild the very same prompt
      if (file.includes('ok')) assert.deepEqual(result, liveResults.ok);
      if (file.includes('review')) assert.deepEqual(result, liveResults.review);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

for (const round of ['r4', 'r5']) {
  const file = path.join(fixtures, `${round}-result-layer.replay.json`);
  test(`${round.toUpperCase()} result-layer replay (de-identified): CURRENT code handling of historical parsed outputs (old mindsearch-* marker contract), not a reproduction of the original failure layer`, async () => {
    await runResultLayerCase(readJson(file));
  });
  test(`${round.toUpperCase()} public replay fixture is de-identified (no ids, paths, timestamps, research or user text from the evidence)`, () => {
    const text = fs.readFileSync(file, 'utf8');
    for (const [name, pattern] of Object.entries({
      uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, hex: /[0-9a-f]{16,}/i, time: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, path: /\/Users\/|[A-Za-z]:\\\\|\.md\b/,
      topic: /venv|powershell|unittest|python|windows|\.venv|Scripts/i, cjk: /[\u3040-\u30ff\u3400-\u9fff]/
    })) assert.equal(pattern.test(text), false, `${round}: fixture must not contain ${name}`);
    for (const url of text.match(/https?:\/\/[^\s"\\)]+/g) ?? []) assert.match(url, /^https:\/\/example\.org\/neutral$/, `${round}: only the neutral URL may appear`);
  });
}

test('flow case: converter keeps AiExchange step and order, and the ordered raw exchanges replay to the live parsed results', async () => {
  const { AiExchangeLog } = load('ai-exchange-log.ts');
  const { convertExchanges } = await import(pathToFileURL(path.join(__dirname, 'tools', 'exchanges-to-replay.mjs')).href);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vam-flow-'));
  try {
    const logFile = path.join(directory, 'ai-exchanges.json');
    const log = new AiExchangeLog(logFile, () => {});
    const replies = { 'Step one topic': JSON.stringify({ summary: 'One', detail: 'First detail', suggestions: [], visualReferences: [] }), 'Step two topic': JSON.stringify({ summary: 'Two', detail: 'Second detail', suggestions: [{ title: 'Next', task: 'Do next', contribution: 'Why' }], visualReferences: [] }) };
    const live = { runTask: async (prompt, _model, _effort, _schema, controls) => { controls.onRequest({ input: [{ type: 'text', text: prompt }] }); return replies[prompt.includes('Step one topic') ? 'Step one topic' : 'Step two topic']; } };
    const contexts = ['Step one topic', 'Step two topic'].map(title => ({ title, summary: '', rules: '', detail: '', task: 'Plain task', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off' }));
    const service = makeService(live, { logging: true, exchanges: log });
    const results = [];
    for (const context of contexts) results.push(plain(await service.askModel(context, 'gpt-6-luna', 'low')));
    await log.flush();
    const recorded = readJson(logFile);
    assert.equal(recorded.length, 2);
    recorded[0].step = 'aim.outline@1'; recorded[1].step = 'aim.write@2'; // a Step Runner call stamps stepId@version on its exchange
    const manifest = { '@flow': { language: 'en', expect: { stepOrder: ['aim.outline@1', 'aim.write@2'] } } };
    recorded.forEach((entry, index) => { manifest[entry.id] = { context: contexts[index], expect: { askModel: { result: results[index] } } }; });
    const [flow, ...rest] = convertExchanges(recorded, { manifest, flow: 'live-flow' });
    assert.equal(rest.length, 0, 'a flow converts to exactly one case');
    assert.equal(flow.kind, 'flow');
    assert.deepEqual(flow.exchanges.map(item => item.step), ['aim.outline@1', 'aim.write@2']);
    assert.deepEqual(flow.exchanges.map(item => item.exchangeId), recorded.map(item => item.id));
    assert.equal(flow.matchPrompt, true);
    const { observed } = await runFlowCase(JSON.parse(JSON.stringify(flow)));
    assert.deepEqual(observed.map(item => item.result), results);
    // CLI: --flow writes one file; a wrong step order is caught.
    const manifestFile = path.join(directory, 'manifest.json'); fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    fs.writeFileSync(logFile, JSON.stringify(recorded));
    const out = path.join(directory, 'corpus');
    assert.match(execFileSync(process.execPath, [path.join(__dirname, 'tools', 'exchanges-to-replay.mjs'), logFile, out, '--manifest', manifestFile, '--flow', 'live-flow'], { encoding: 'utf8' }), /1 replay case\(s\) written/);
    assert.deepEqual(fs.readdirSync(out), ['live-flow.replay.json']);
    const written = readJson(path.join(out, 'live-flow.replay.json'));
    await runAnyCase(written);
    await assert.rejects(runFlowCase({ ...written, expect: { stepOrder: ['aim.write@2', 'aim.outline@1'] } }), /recorded step order/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

const corpusDirectory = process.env.VAM_REPLAY_CORPUS;
if (corpusDirectory) {
  const files = fs.readdirSync(corpusDirectory).filter(file => file.endsWith('.replay.json')).sort();
  test(`private replay corpus ${corpusDirectory} contains cases`, () => assert.ok(files.length > 0, 'VAM_REPLAY_CORPUS is set but holds no *.replay.json'));
  for (const file of files) test(`corpus case ${file}`, async () => { await runAnyCase(readJson(path.join(corpusDirectory, file))); });
}
