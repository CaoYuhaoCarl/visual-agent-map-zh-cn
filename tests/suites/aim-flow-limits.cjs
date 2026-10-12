// L1 coverage for the injectable AIM flow limits: the production defaults still enforce every gate, and the smoke
// limits (which only tests/smoke/build-smoke.mjs can put into a bundle) behave as documented without leaving a
// half-written attempt behind. Prompts and parsers are untouched by the limits; the prompt snapshots and
// tests/aim-fingerprints.cjs prove that separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { integrationTest, load, plain, plannerReview, aimPhase, coverageSetup, coverageThreeAnswers, obsidian } = require('../support.cjs');

const production = load('experiences/aim/flow-limits.ts');
const smoke = load('tests/smoke/flow-limits.smoke.ts');
const { AimManualFlow, MIN_ANSWERED_QUESTIONS_BEFORE_CONCLUSION } = load('experiences/aim/manual-flow.ts', { obsidian });
const { AimRunStore } = load('experiences/aim/research-run-store.ts');
const { parseAimPlannerReview, AIM_MAX_RESEARCH_TURNS } = load('experiences/aim/planner-review.ts');
const { floorDecisions } = load('experiences/aim/manual-flow-support.ts');
const { scheduleAimResearch } = load('experiences/aim/research-scheduler.ts');
const { buildFinalDelivery } = load('experiences/aim/final-delivery.ts');
const smokeLimits = plain(smoke.SMOKE_AIM_FLOW_LIMITS);
const reply = (summary, detail) => ({ summary, detail, suggestions: [], visualReferences: [] });
const tick = () => new Promise(resolve => setImmediate(resolve));
const target = (id) => ({ id, title: `Target ${id}`, task: `Find ${id}`, expectedValue: `Resolve ${id}`, action: 'research', dependsOn: [] });

integrationTest('AIM flow limits: production defaults equal the legacy values and the smoke module cannot shift derived constants', () => {
  assert.deepEqual(plain(production.DEFAULT_AIM_FLOW_LIMITS), { minAnsweredBeforeConclusion: 3, maxResearchTurns: 2, researchParallelism: 2, webSearch: true, acceptGapAtBudget: false, publishDeliveryAtBudget: false });
  assert.ok(Object.isFrozen(production.DEFAULT_AIM_FLOW_LIMITS));
  assert.equal(production.ACTIVE_AIM_FLOW_LIMITS, production.DEFAULT_AIM_FLOW_LIMITS, 'the flow uses the defaults unless a test injects limits');
  assert.equal(MIN_ANSWERED_QUESTIONS_BEFORE_CONCLUSION, 3);
  assert.equal(AIM_MAX_RESEARCH_TURNS, 2);
  assert.deepEqual(plain(smoke.DEFAULT_AIM_FLOW_LIMITS), plain(production.DEFAULT_AIM_FLOW_LIMITS), 'constants derived from the defaults stay identical in the smoke bundle');
  assert.deepEqual(smokeLimits, { minAnsweredBeforeConclusion: 1, maxResearchTurns: 2, researchParallelism: 1, webSearch: true, acceptGapAtBudget: true, publishDeliveryAtBudget: true });
  const shown = [];
  production.announceTestOverrides(message => shown.push(message));
  assert.deepEqual(shown, [], 'production announces nothing');
  smoke.announceTestOverrides(message => shown.push(message));
  assert.match(shown[0], /Test overrides active/);
  assert.match(shown[0], /profile=smoke/);
});

integrationTest('AIM flow limits: floorDecisions withholds conclude below the production floor of 3 and follows injected limits', () => {
  assert.deepEqual(plain(floorDecisions(0)), ['research_more', 'ask_user']);
  assert.deepEqual(plain(floorDecisions(2)), ['research_more', 'ask_user']);
  assert.deepEqual(plain(floorDecisions(3)), ['research_more', 'ask_user', 'conclude']);
  assert.deepEqual(plain(floorDecisions(2, production.DEFAULT_AIM_FLOW_LIMITS)), ['research_more', 'ask_user']);
  assert.deepEqual(plain(floorDecisions(1, smokeLimits)), ['research_more', 'ask_user', 'conclude']);
  assert.deepEqual(plain(floorDecisions(0, smokeLimits)), ['research_more', 'ask_user']);
});

async function qualityReview(limits, answered) {
  const calls = [];
  const flow = new AimManualFlow({ settings: { language: 'en' } }, {}, async context => {
    calls.push(context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1]);
    if (aimPhase(context, 'delivery-outline')) throw new Error('STOP_AT_DELIVERY');
    if (aimPhase(context, 'decision-quality-review')) return reply('How much time can you spend?', 'A useful conditional answer remains available.');
    if (aimPhase(context, 'format-repair')) return plannerReview('ask_user', { rationale: 'Replaced.', question: 'Other?' }, 'Changed.', 'Changed.', ['Under an hour', 'One to two hours']);
    throw new Error(`Unexpected phase ${context.task.slice(0, 80)}`);
  }, undefined, undefined, limits);
  const context = { goal: 'Plan a routine', goalDetail: '', outputLanguage: 'en', conditions: {}, currentQuestion: 'Do you exercise?', currentAnswer: 'Sometimes', answeredQuestionCount: answered, questionHistory: ['Do you exercise?'], lineage: '', reportSummary: 'Saved.', reportDetail: 'Saved reports.' };
  const candidate = parseAimPlannerReview(plannerReview('conclude', { rationale: 'Sufficient.', stopReason: 'No gap.' }, 'Candidate.', 'Candidate answer.'));
  // A conclude that survives the floor goes on to final delivery; that first delivery call is where these tests stop.
  try { return { review: await flow.reviewPlannerDecisionQuality(candidate, context, 'gpt-6-luna', 'low'), calls }; }
  catch (error) { if (/STOP_AT_DELIVERY/.test(error.message)) return { review: { decision: 'conclude' }, calls }; throw error; }
}
integrationTest('AIM flow limits: the production flow still turns a conclude below three answers into ask_user', async () => {
  for (const limits of [undefined, production.DEFAULT_AIM_FLOW_LIMITS]) {
    const { review, calls } = await qualityReview(limits, 2);
    assert.equal(review.decision, 'ask_user');
    assert.equal(review.question, 'How much time can you spend?');
    assert.equal(review.rationale, 'The branch has 2 answered question node(s); at least 3 are required before conclusion.');
    assert.deepEqual(plain(calls.slice(0, 1)), ['decision-quality-review'], 'the bounded correction ran');
  }
  const atFloor = await qualityReview(undefined, 3);
  assert.equal(atFloor.review.decision, 'conclude');
  assert.deepEqual(atFloor.calls, ['delivery-outline'], 'three answers meet the floor, so no correction runs and delivery starts');
});
integrationTest('AIM flow limits: smoke limits let one answer conclude without a correction call', async () => {
  const { review, calls } = await qualityReview(smokeLimits, 1);
  assert.equal(review.decision, 'conclude');
  assert.deepEqual(calls, ['delivery-outline'], 'no correction call; the conclusion proceeds to delivery');
  const below = await qualityReview(smokeLimits, 0);
  assert.equal(below.review.decision, 'ask_user', 'the injected floor of one still withholds conclude with no answer');
});

const gapTarget = { title: 'Missing evidence', task: 'Search for the missing evidence.', contribution: 'Closes the gap.' };
/** A Planner that always wants more research, so the flow must end through the research-budget exit. */
function gapModel(base, seen) {
  return async (context, ...rest) => {
    const phase = context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1];
    seen?.push({ phase, researchMode: context.researchMode });
    if (aimPhase(context, 'report-review')) return plannerReview('research_more', { rationale: 'Evidence is still missing.' }, 'Partial', 'Detail.', [gapTarget]);
    if (aimPhase(context, 'research-gap-audit')) return reply('external_evidence', 'An external fact is missing.');
    if (aimPhase(context, 'targeted-followup-research')) return reply('Follow-up', `Research status: search completed\nMore evidence ${'https://example.org/more'}`);
    if (context.aimContract?.kind === 'review' && !aimPhase(context, 'decision-quality-review') && !aimPhase(context, 'saved-evidence-review')) return plannerReview('research_more', { rationale: 'Evidence is still missing.' }, 'Partial', 'Detail.', [gapTarget]);
    return base(context, ...rest);
  };
}
async function runOneAnswer(limits, seen) {
  const subject = await coverageSetup(`Limits ${limits ? 'smoke' : 'production'}`);
  subject.flow = new AimManualFlow(subject.repo, new AimRunStore(subject.repo), gapModel(subject.model.ask, seen), undefined, undefined, limits);
  const question = (await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'limits-question')).node;
  const outcome = await subject.flow.answerAndResearch(subject.created.mapPath, question.id, { requestId: 'limits-answer', selections: [question.aimQuestion.options[0].id], freeText: 'Specific condition' }, 'gpt-6-luna', 'low');
  const saved = await subject.repo.readMap(subject.created.mapPath);
  const results = saved.aim.branches.flatMap(branch => branch.results);
  const notes = await Promise.all(results.map(result => subject.repo.readNote(result.notePath)));
  return { outcome, saved, results, notes, attempts: saved.aim.runs.flatMap(run => run.attempts), seen };
}
integrationTest('AIM flow limits: with production limits a research_more left at the second turn is saved partial', async () => {
  for (const limits of [undefined, production.DEFAULT_AIM_FLOW_LIMITS]) {
    const seen = [];
    const { outcome, attempts } = await runOneAnswer(limits, seen);
    assert.equal(outcome.status, 'partial');
    assert.equal(outcome.result.resultStatus, 'partial');
    assert.deepEqual(plain(attempts.map(attempt => attempt.status).filter(status => status !== 'completed')), ['partial'], 'only the final synthesis attempt is partial');
    assert.equal(seen.filter(item => item.phase === 'targeted-followup-research').length, 1, 'exactly one bounded follow-up search before the budget ends');
  }
});
integrationTest('AIM flow limits: with smoke limits the Planner\'s own research_more at the budget is accepted as a synthesis, never published as a conclusion', async () => {
  const seen = [];
  const { outcome, attempts, results, notes } = await runOneAnswer(smokeLimits, seen);
  assert.equal(outcome.status, 'completed');
  assert.ok(!results.some(result => result.kind === 'conclusion'), 'no conclusion node');
  assert.ok(results.some(result => result.kind === 'synthesis'));
  assert.ok(!notes.some(note => /profile=smoke/.test(note.detail)), 'no smoke publication label');
  assert.ok(!seen.some(item => item.phase === 'delivery-acceptance'), 'no delivery was written or accepted');
  assert.ok(attempts.length >= 1 && attempts.every(attempt => attempt.status === 'completed'), `every attempt completed: ${attempts.map(attempt => attempt.status)}`);
  assert.ok(!attempts.some(attempt => ['running', 'saving'].includes(attempt.status)), 'no in-progress attempt is left behind');
  assert.equal(seen.filter(item => item.phase === 'targeted-followup-research').length, 1, 'the research budget (two turns) is unchanged');
});

integrationTest('AIM flow limits: the scheduler runs two independent tasks at once by default and an injected value caps it', async () => {
  const peak = async options => {
    let active = 0, max = 0;
    await scheduleAimResearch([target('a'), target('b'), target('c')], async item => { max = Math.max(max, ++active); await tick(); await tick(); active--; return item.id; }, undefined, options);
    return max;
  };
  assert.equal(await peak(undefined), 2);
  assert.equal(await peak({}), 2);
  assert.equal(await peak({ parallelism: 1 }), 1);
  assert.equal(await peak({ parallelism: 3 }), 3);
});
integrationTest('AIM flow limits: the flow researches two subtopics in parallel by default and one at a time under smoke limits', async () => {
  for (const [limits, expected] of [[undefined, 2], [smokeLimits, 1]]) {
    const subject = await coverageSetup(`Parallel ${expected}`);
    let active = 0, max = 0;
    const base = subject.model.ask;
    subject.flow = new AimManualFlow(subject.repo, new AimRunStore(subject.repo), async (context, ...rest) => {
      if (aimPhase(context, 'research-plan')) return reply('Two independent dimensions.', '<!-- aim-plan {"subtopics":[{"id":"method","title":"Method","task":"Research methods.","expectedValue":"Compare methods.","action":"research","dependsOn":[]},{"id":"constraints","title":"Constraints","task":"Research constraints.","expectedValue":"Find limits.","action":"research","dependsOn":[]}]} -->');
      if (aimPhase(context, 'subtopic-research')) { max = Math.max(max, ++active); await tick(); await tick(); active--; }
      return base(context, ...rest);
    }, undefined, undefined, limits);
    const question = (await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'parallel-question')).node;
    await subject.flow.answerAndResearch(subject.created.mapPath, question.id, { requestId: 'parallel-answer', selections: [question.aimQuestion.options[0].id], freeText: 'Condition' }, 'gpt-6-luna', 'low');
    assert.equal(max, expected);
  }
});

integrationTest('AIM flow limits: web search stays on by default and an injected off switches research phases to local mode', async () => {
  const modes = async limits => {
    const seen = [];
    const subject = await coverageSetup(`Search ${limits ? 'off' : 'on'}`);
    const base = subject.model.ask;
    subject.flow = new AimManualFlow(subject.repo, new AimRunStore(subject.repo), async context => {
      seen.push({ phase: context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1], researchMode: context.researchMode });
      return base({ ...context, researchMode: context.researchMode === 'local' && aimPhase(context, 'subtopic-research') ? 'research' : context.researchMode });
    }, undefined, undefined, limits);
    const question = (await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'search-question')).node;
    await subject.flow.answerAndResearch(subject.created.mapPath, question.id, { requestId: 'search-answer', selections: [question.aimQuestion.options[0].id], freeText: 'Condition' }, 'gpt-6-luna', 'low');
    return seen.filter(item => item.phase === 'subtopic-research').map(item => item.researchMode);
  };
  assert.deepEqual([...new Set(await modes(undefined))], ['research']);
  assert.deepEqual([...new Set(await modes({ ...production.DEFAULT_AIM_FLOW_LIMITS, webSearch: false }))], ['local']);
});
integrationTest('AIM flow limits: final delivery research uses web search unless a test turns it off, and its acceptance check is unchanged', async () => {
  const base = { title: 'Goal', detail: 'Known conditions and prior reports', signal: new AbortController().signal };
  const outline = '<!-- aim-delivery-outline {"sections":[{"heading":"Steps","purpose":"Execute the goal","searchTask":"Find concrete examples"}]} -->';
  const run = async options => {
    const modes = [];
    const outputs = [outline, '<!-- aim-delivery-research {"status":"searched"} -->\nSource: https://example.org/docs', 'Complete actionable document', '<!-- aim-review {"decision":"conclude","rationale":"Complete","stopReason":"All sections usable"} -->\nComplete actionable document'];
    await buildFinalDelivery(base, async context => { modes.push(`${context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1]}:${context.researchMode}`); return reply('Preview', outputs[modes.length - 1]); }, options);
    return modes;
  };
  assert.deepEqual(await run({}), ['delivery-outline:local', 'delivery-research:research', 'delivery-writing:local', 'delivery-acceptance:local']);
  assert.deepEqual(await run({ webSearch: false }), ['delivery-outline:local', 'delivery-research:local', 'delivery-writing:local', 'delivery-acceptance:local']);
  await assert.rejects(() => buildFinalDelivery(base, async context => reply('Preview', aimPhase(context, 'delivery-outline') ? outline : 'No search happened'), { webSearch: false }), /unavailable or not completed/);
});

integrationTest('AIM flow limits: the smoke bundle is built outside the repository and the production bundle carries no smoke marker', async () => {
  const { buildSmoke } = await import('../smoke/build-smoke.mjs');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vam-smoke-build-'));
  try {
    const result = await buildSmoke({ out, webSearch: false });
    const bundle = fs.readFileSync(path.join(out, 'main.js'), 'utf8');
    assert.match(bundle, /VAM_SMOKE_PROFILE_ACTIVE/);
    assert.match(bundle, /Test overrides active/);
    assert.equal(result.profile, 'smoke');
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'smoke-profile.json'), 'utf8')).webSearch, false);
    assert.match(bundle, /acceptGapAtBudget: true/);
    assert.match(bundle, /researchParallelism: 1/);
    await assert.rejects(() => buildSmoke({ out: path.join(path.resolve(__dirname, '..', '..'), 'tests', 'smoke-output-must-not-exist') }), /outside the repository/);
    assert.ok(!fs.existsSync(path.join(path.resolve(__dirname, '..', '..'), 'tests', 'smoke-output-must-not-exist', 'main.js')));
  } finally { fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(path.join(path.resolve(__dirname, '..', '..'), 'tests', 'smoke-output-must-not-exist'), { recursive: true, force: true }); }
  const productionBundle = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8');
  for (const marker of ['VAM_SMOKE_PROFILE_ACTIVE', 'Test overrides active', 'flow-limits.smoke']) assert.ok(!productionBundle.includes(marker), `production main.js must not contain ${marker}`);
});

/** Final delivery acceptance keeps asking for more research, so the flow ends through the delivery-acceptance budget exit. */
async function deliveryRejected(limits) {
  const smoked = limits?.minAnsweredBeforeConclusion === 1;
  const subject = await coverageSetup(`Delivery rejected ${smoked ? 'smoke' : 'production'}`);
  const base = subject.model.ask, phases = [];
  subject.flow = new AimManualFlow(subject.repo, new AimRunStore(subject.repo), async (context, ...rest) => {
    phases.push(context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1]);
    if (aimPhase(context, 'research-gap-audit')) return reply('external_evidence', 'An external fact is missing.');
    if (smoked && aimPhase(context, 'report-review')) return plannerReview('conclude', { rationale: 'One answer meets the injected floor.', stopReason: 'Ready for delivery stages.' }, 'Candidate document', 'Candidate document');
    if (aimPhase(context, 'delivery-acceptance')) {
      const rejected = plannerReview('research_more', { rationale: 'A cited claim does not match its source.' }, 'Rejected draft', 'Draft pending completion', [{ title: 'Verify claim', task: 'Find a source for the claim.', contribution: 'Resolve the mismatch.' }]);
      return rejected;
    }
    return base(context, ...rest);
  }, undefined, undefined, limits);
  const outcome = smoked
    ? await (async () => {
        const question = (await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'rejected-question')).node;
        return subject.flow.answerAndResearch(subject.created.mapPath, question.id, { requestId: 'rejected-answer', selections: [question.aimQuestion.options[0].id], freeText: 'Condition' }, 'gpt-6-luna', 'low');
      })()
    : await coverageThreeAnswers(subject);
  const saved = await subject.repo.readMap(subject.created.mapPath);
  const results = saved.aim.branches.flatMap(branch => branch.results);
  const notes = await Promise.all(results.map(async result => ({ result, note: await subject.repo.readNote(result.notePath) })));
  assert.ok(phases.includes('delivery-acceptance'), 'the scenario reached final delivery acceptance');
  return { outcome, saved, results, notes, attempts: saved.aim.runs.flatMap(run => run.attempts) };
}
integrationTest('AIM flow limits: with production limits a rejected final delivery at the budget still saves partial and no conclusion', async () => {
  for (const limits of [undefined, production.DEFAULT_AIM_FLOW_LIMITS]) {
    const { outcome, results, notes, attempts } = await deliveryRejected(limits);
    assert.equal(outcome.status, 'partial');
    assert.ok(!results.some(result => result.kind === 'conclusion'), 'no conclusion is published');
    assert.ok(!notes.some(item => /profile=smoke/.test(item.note.detail)), 'production notes never carry the smoke label');
    assert.ok(attempts.some(attempt => attempt.status === 'partial'));
  }
});
integrationTest('AIM flow limits: with smoke limits a rejected final delivery at the budget is published as a labelled conclusion that keeps the rejection reason', async () => {
  const { outcome, results, notes, attempts } = await deliveryRejected(smokeLimits);
  assert.equal(outcome.status, 'completed');
  const conclusion = notes.find(item => item.result.kind === 'conclusion');
  assert.ok(conclusion, 'a conclusion note is published through the normal commit path');
  assert.match(conclusion.note.detail, /profile=smoke/);
  assert.match(conclusion.note.detail, /A cited claim does not match its source\./);
  assert.ok(attempts.length >= 1 && attempts.every(attempt => attempt.status === 'completed'), `every attempt completed: ${attempts.map(attempt => attempt.status)}`);
  assert.ok(!attempts.some(attempt => ['running', 'saving'].includes(attempt.status)));
  assert.equal(results.filter(result => result.kind === 'conclusion').length, 1);
});
