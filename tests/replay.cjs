// Replay provider tests. Recorded raw replies are fed through the real AiTaskService parsing path (and, for AIM
// review cases, the real Planner-review parser) at the single runtime.runTask seam. No live provider is involved.
// Set VAM_REPLAY_CORPUS=<dir> to also run every *.replay.json case in that directory (private corpus, optional layer).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { load, makeService, replayRuntime, ReplayMiss, readJson, sha256 } = require('./support-replay.cjs');

const fixtures = path.join(__dirname, 'fixtures', 'replay');
const plain = value => JSON.parse(JSON.stringify(value));
const { parseAimPlannerReview } = load('experiences/aim/planner-review.ts');

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

const corpusDirectory = process.env.VAM_REPLAY_CORPUS;
if (corpusDirectory) {
  const files = fs.readdirSync(corpusDirectory).filter(file => file.endsWith('.replay.json')).sort();
  test(`private replay corpus ${corpusDirectory} contains cases`, () => assert.ok(files.length > 0, 'VAM_REPLAY_CORPUS is set but holds no *.replay.json'));
  for (const file of files) test(`corpus case ${file}`, async () => { await runCase(readJson(path.join(corpusDirectory, file))); });
}
