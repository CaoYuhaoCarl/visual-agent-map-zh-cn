const assert = require('node:assert/strict');
const { integrationTest, load, plain, plannerReview, mindSearchPhase, fixture, coverageSetup, coverageThreeAnswers } = require('../support.cjs');
integrationTest('coverage: three researched answers produce an outline-searched-written-checked complete document', async () => {
  const subject = await coverageSetup(); const outcome = await coverageThreeAnswers(subject);
  assert.equal(outcome.status, 'completed');
  const saved = await subject.repo.readMap(subject.created.mapPath);
  assert.equal(saved.mindSearch.branches.length, 3);
  assert.deepEqual(subject.model.phases.filter(p => p?.startsWith('delivery-')), ['delivery-outline', 'delivery-research', 'delivery-writing', 'delivery-acceptance']);
  const note = await subject.repo.readNote(outcome.result.notePath);
  assert.match(note.detail, /Complete execution plan/); assert.match(note.detail, /https:\/\/example.org\/reference/);
});
integrationTest('coverage: final search unavailable preserves prior research and never publishes conclusion', async () => {
  const subject = await coverageSetup('Search unavailable scenario', { unavailableDelivery: true });
  await assert.rejects(() => coverageThreeAnswers(subject), /web research was unavailable/);
  const saved = await subject.repo.readMap(subject.created.mapPath);
  assert.equal(saved.mindSearch.branches.flatMap(b => b.results).filter(r => r.kind === 'research').length, 6);
  assert.equal(saved.mindSearch.branches.some(b => b.results.some(r => r.kind === 'conclusion')), false);
});
integrationTest('coverage: failed search resumes the saved default plan on the same answer branch', async () => {
  const subject = await coverageSetup('Retry scenario', { failSearch: true });
  const q = await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'retry-question');
  await assert.rejects(() => subject.flow.answerAndResearch(subject.created.mapPath, q.node.id, { requestId: 'retry-answer', selections: [q.options[0].id], freeText: 'Saved condition' }, 'gpt-6-luna', 'low'));
  let saved = await subject.repo.readMap(subject.created.mapPath); assert.equal(saved.mindSearch.branches.length, 1);
  const branchId = saved.mindSearch.branches[0].id;
  assert.deepEqual(plain(saved.mindSearch.branches[0].researchPlan.map(target => target.id)), ['method', 'constraints']);
  subject.model.state.failSearch = false;
  const resumed = await subject.flow.resumeAnswerResearch(subject.created.mapPath, branchId, 'gpt-6-luna', 'low');
  assert.equal(resumed.status, 'waiting-user');
  saved = await subject.repo.readMap(subject.created.mapPath); const branch = saved.mindSearch.branches.find(item => item.id === branchId);
  assert.equal(saved.mindSearch.branches.length, 1); assert.equal(branch.answerSnapshot.freeText, 'Saved condition');
  assert.deepEqual(plain(branch.researchPlan.map(target => target.id)), ['method', 'constraints']);
  assert.equal(branch.results.filter(r => r.kind === 'research').length, 2);
  assert.equal(saved.nodes.find(node => node.id === branch.results.find(r => r.kind === 'research').nodeId).parentId, branch.questionNodeId);
});
integrationTest('coverage: changed answers keep independent research parents and do not count sibling answers', async () => {
  const subject = await coverageSetup('Independent answers scenario');
  const q = await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'branch-question');
  for (let index = 0; index < 2; index++) await subject.flow.answerAndResearch(subject.created.mapPath, q.node.id, { requestId: `branch-answer-${index}`, selections: [q.options[index].id], freeText: '' }, 'gpt-6-luna', 'low');
  const saved = await subject.repo.readMap(subject.created.mapPath), branches = saved.mindSearch.branches;
  assert.equal(branches.length, 2); assert.notEqual(branches[0].questionNodeId, branches[1].questionNodeId);
  const { countMindSearchAnsweredQuestions } = load('experiences/mind-search/manual-flow.ts');
  for (const b of branches) { assert.equal(countMindSearchAnsweredQuestions(saved, b.id), 1); for (const r of b.results.filter(r => r.kind === 'research')) assert.equal(saved.nodes.find(n => n.id === r.nodeId).parentId, b.questionNodeId); }
});
integrationTest('coverage: two simultaneous MindSearch maps run without mixing branches or evidence', async () => {
  const sharedRepo = fixture().repo;
  const subjects = await Promise.all([coverageSetup('Travel document', { sharedRepo }), coverageSetup('Learning document', { sharedRepo })]);
  const results = await Promise.all(subjects.map(coverageThreeAnswers));
  for (let i = 0; i < 2; i++) { assert.equal(results[i].status, 'completed'); const saved = await subjects[i].repo.readMap(subjects[i].created.mapPath); assert.equal(saved.title, i === 0 ? 'Travel document' : 'Learning document'); assert.equal(saved.mindSearch.branches.length, 3); }
});
integrationTest('coverage: initial clarification is separate from answered exploration count', async () => {
  const subject = await coverageSetup('Intake scenario'); const topic = await subject.repo.readNote(subject.created.root.path);
  const questions = await subject.flow.prepareClarification(topic); assert.equal(questions.length, 1);
  const saved = await subject.repo.readMap(subject.created.mapPath); assert.equal(saved.mindSearch.branches.length, 0);
  const { countMindSearchAnsweredQuestions } = load('experiences/mind-search/manual-flow.ts'); assert.equal(countMindSearchAnsweredQuestions(saved, null), 0);
});
integrationTest('coverage: repeated identical answer is idempotent and unknown is exclusive', async () => {
  const subject = await coverageSetup('Idempotency scenario');
  const q = await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'idempotency-question');
  const input = { requestId: 'same-answer', selections: [q.options[0].id], freeText: 'Known condition' };
  const first = await subject.flow.answerAndResearch(subject.created.mapPath, q.node.id, input, 'gpt-6-luna', 'low');
  const calls = subject.model.phases.length;
  const second = await subject.flow.answerAndResearch(subject.created.mapPath, q.node.id, input, 'gpt-6-luna', 'low');
  assert.equal(first.branchId, second.branchId); assert.equal(subject.model.phases.length, calls);
  await assert.rejects(() => subject.flow.answerAndResearch(subject.created.mapPath, q.node.id, { requestId: 'bad-multiple', selections: [q.options[0].id, '__mindsearch_unknown__'], freeText: '' }, 'gpt-6-luna', 'low'), /cannot be combined/);
  const saved = await subject.repo.readMap(subject.created.mapPath); assert.equal(saved.mindSearch.branches.length, 1);
});
integrationTest('coverage: preflight failures are persisted and cancellation does not fabricate failure', async () => {
  const { MindSearchManualFlow } = load('experiences/mind-search/manual-flow.ts'); let captured;
  const flow = new MindSearchManualFlow({}, { saveResearchPlanError: async (_map, _branch, error) => { captured = error.message; } });
  flow.executeSubtopicWorkflow = async () => { throw new Error('Preflight rejected'); };
  await assert.rejects(() => flow.runSubtopicWorkflow('map', 'branch', {}, {}, [], '', '', 'model', 'low'), /Preflight rejected/); assert.equal(captured, 'Preflight rejected');
  captured = undefined; const controller = new AbortController(); controller.abort();
  await assert.rejects(() => flow.runSubtopicWorkflow('map', 'branch', {}, {}, [], '', '', 'model', 'low', controller.signal)); assert.equal(captured, undefined);
});
integrationTest('coverage: reload uses persisted reports without regenerating an already completed answer', async () => {
  const subject = await coverageSetup('Reopen scenario');
  const q = await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, 'gpt-6-luna', 'low', 'reopen-question');
  const input = { requestId: 'reopen-answer', selections: [q.options[0].id], freeText: 'Persisted condition' };
  const first = await subject.flow.answerAndResearch(subject.created.mapPath, q.node.id, input, 'gpt-6-luna', 'low');
  const { MindSearchManualFlow } = load('experiences/mind-search/manual-flow.ts'); const { MindSearchRunStore } = load('mindsearch-mve/research-run-store.ts');
  const reopened = new MindSearchManualFlow(subject.repo, new MindSearchRunStore(subject.repo), async () => { throw new Error('Must reuse persisted answer'); });
  const result = await reopened.answerAndResearch(subject.created.mapPath, q.node.id, input, 'gpt-6-luna', 'low'); assert.equal(result.branchId, first.branchId);
});
integrationTest('coverage: third answer researches first and conflicting responsibility keeps exploration open', async () => {
  const subject = await coverageSetup('Conflicting operations responsibilities', { clarifyConflict: true });
  const outcome = await coverageThreeAnswers(subject);
  assert.equal(outcome.status, 'waiting-user');
  const saved = await subject.repo.readMap(subject.created.mapPath);
  const branch = saved.mindSearch.branches.find(b => b.id === outcome.branchId);
  assert.equal(branch.results.filter(r => r.kind === 'research').length, 2);
  assert.equal(branch.results.some(r => r.kind === 'conclusion'), false);
  assert.equal(subject.model.phases.includes('saved-evidence-review'), false);
  assert.equal(subject.model.phases.some(p => p?.startsWith('delivery-')), false);
  assert.match((await subject.repo.readNote(saved.nodes.find(n => n.id === outcome.questionNodeId).path)).summary, /occasional contributor|primary operations owner/i);
});
integrationTest('MindSearch reconciles a repeated weight question against the original recipe target and saves the next step', async () => {
  const { repo } = fixture();
  const { createMindSearchMap } = load('experiences/mind-search/create-map.ts');
  const { MindSearchRunStore } = load('mindsearch-mve/research-run-store.ts');
  const { MindSearchManualFlow } = load('experiences/mind-search/manual-flow.ts');
  const created = await createMindSearchMap(repo, 'gpt-6-luna', { requestId: 'range-reconcile-map', topic: 'Prepare a herb roast chicken', context: 'Synthetic range-answer regression.' });
  let searches = 0, reviews = 0, reconciliations = 0, corrections = 0;
  const target = { title: 'Small-chicken herb butter recipe', task: 'Find a published recipe for a chicken below 1.5 kg with herb, garlic and butter quantities.', contribution: 'Verify published ingredient ratios for a small bird.' };
  const plan = ['recipe', 'method', 'doneness'].map(id => ({ id, title: id, task: `Find ${id} evidence.`, expectedValue: `Support ${id}.` }));
  const flow = new MindSearchManualFlow(repo, new MindSearchRunStore(repo), async context => {
    if (mindSearchPhase(context, 'initial-question')) return { summary: 'How much does the chicken weigh?', detail: 'Choose a range.', suggestions: [{ title: 'Below 1.5 kg' }, { title: 'Above 1.5 kg' }], visualReferences: [] };
    if (mindSearchPhase(context, 'research-plan')) return { summary: 'Plan', detail: `<!-- mindsearch-plan ${JSON.stringify({ subtopics: plan })} -->`, suggestions: [], visualReferences: [] };
    if (mindSearchPhase(context, 'subtopic-research')) { searches++; return { summary: `Saved evidence ${searches}`, detail: `Research status: search completed\nSaved evidence ${searches}.`, suggestions: [], visualReferences: [] }; }
    if (mindSearchPhase(context, 'report-review')) {
      reviews++;
      if (reviews === 1) return plannerReview('research_more', { rationale: 'The exact weight is not known, and the small-bird recipe ratios still need a published source.' }, 'A conditional method is available.', 'Preserve the saved evidence.', [target]);
      return plannerReview('ask_user', { rationale: 'Oven mode changes the practical instructions.', question: 'Which oven mode will you use?' }, 'Recipe evidence now saved.', 'Keep all four reports.', ['Fan', 'Conventional']);
    }
    if (mindSearchPhase(context, 'research-gap-audit')) {
      if (context.task.includes('TARGET-ONLY RECONCILIATION')) {
        reconciliations++;
        assert.ok(context.task.includes(target.task));
        assert.doesNotMatch(context.task, /Candidate research gap|Saved evidence/);
        return { summary: 'external_evidence', detail: 'A published recipe for the supplied weight range is an external fact; the target does not ask for the actual weight.', suggestions: [], visualReferences: [] };
      }
      return { summary: 'user_condition', detail: 'The exact weight of this particular bird cannot be found online.', suggestions: [], visualReferences: [] };
    }
    if (mindSearchPhase(context, 'decision-quality-review')) {
      corrections++;
      assert.match(context.task, /Earlier user questions in this path/);
      return plannerReview('ask_user', { rationale: 'More precise weight is needed.', question: 'How much does the chicken weigh?' }, 'Conditional method.', 'Existing reports remain valid.', ['Below 1 kg', '1 to 1.2 kg', '1.2 to 1.5 kg']);
    }
    if (mindSearchPhase(context, 'targeted-followup-research')) {
      searches++; assert.ok(context.task.includes(target.task));
      return { summary: 'Published small-bird recipe found.', detail: 'Research status: search completed\nPublished recipe quantities and limitations.', suggestions: [], visualReferences: [] };
    }
    throw new Error(`Unexpected phase: ${context.task.slice(0, 150)}`);
  });
  const question = (await flow.planNextQuestion(created.mapPath, created.root.id, 'gpt-6-luna', 'low', 'range-reconcile-question')).node;
  const saved = await repo.readMap(created.mapPath);
  const prior = await repo.createNote('Earlier condition', 'gpt-6-luna', saved, created.mapPath, 'workspace');
  prior.mindSearchKind = 'question'; saved.nodes.push(prior);
  saved.mindSearch.branches.push({ id: 'range-prior', questionNodeId: prior.id, parentBranchId: null, answerSnapshot: { selections: [], freeText: 'Known' }, inputSnapshot: { topic: saved.title, conditions: { flavor: 'Herbs' }, upstreamResults: [] }, createdAt: new Date().toISOString(), results: [] });
  saved.nodes.find(n => n.id === question.id).mindSearchQuestion.parentBranchId = 'range-prior';
  await repo.saveMap(created.mapPath, saved);
  const result = await flow.answerAndResearch(created.mapPath, question.id, { requestId: 'range-reconcile-answer', selections: [question.mindSearchQuestion.options[0].id], freeText: '' }, 'gpt-6-luna', 'low');
  assert.equal(result.status, 'waiting-user');
  assert.equal(searches, 4, 'three original reports and one bounded follow-up, no repeated original search');
  assert.equal(reconciliations, 1); assert.equal(corrections, 1);
  const after = await repo.readMap(created.mapPath);
  const branch = after.mindSearch.branches.find(b => b.id === result.branchId);
  assert.equal(branch.results.filter(r => r.kind === 'research').length, 3);
  assert.equal(await repo.readNote(after.nodes.find(n => n.id === result.questionNodeId).path).then(n => n.summary), 'Which oven mode will you use?');
  assert.ok(after.mindSearch.runs.filter(r => r.branchId === branch.id).every(r => r.attempts.every(a => a.status !== 'failed')));
});
integrationTest('MindSearch target reconciliation keeps private values local and bounds clarification recovery', async () => {
  const { repo } = fixture();
  const { MindSearchManualFlow } = load('experiences/mind-search/manual-flow.ts');
  const { MindSearchRunStore } = load('mindsearch-mve/research-run-store.ts');
  const { parseMindSearchPlannerReview } = load('mindsearch-mve/planner-review.ts');
  const candidate = parseMindSearchPlannerReview(plannerReview('research_more', { rationale: 'The supplied weight range is insufficient for the requested exact calculation.' }, 'Conditional guidance.', 'Preserve this body.', [{ title: 'Actual weight', task: 'Establish the exact weight of this user-owned item.', contribution: 'Enable the requested exact calculation.' }]));
  const context = { goal: 'Calculate exact quantities', goalDetail: '', conditions: { 'What is its weight?': 'Below 1.5 kg' }, currentQuestion: 'What is its weight?', currentAnswer: 'Below 1.5 kg', answeredQuestionCount: 3, questionHistory: ['What is its weight?'], lineage: '', reportSummary: 'Saved public guidance.', reportDetail: '' };
  let audits = 0, questions = 0;
  const flow = new MindSearchManualFlow(repo, new MindSearchRunStore(repo), async task => {
    assert.equal(task.researchMode, 'local', 'no web search for the private value');
    if (mindSearchPhase(task, 'research-gap-audit')) { audits++; return { summary: 'user_condition', detail: 'This target explicitly requires the exact private weight; a published range cannot supply it.', suggestions: [], visualReferences: [] }; }
    questions++;
    return plannerReview('ask_user', { rationale: 'Exact calculation needs more precision than the supplied range.', question: questions === 1 ? 'What is its weight?' : 'Can you provide the exact label weight for this calculation?' }, 'Question', 'No replacement assumptions.', ['1.1 kg', '1.3 kg', 'Exact weight unavailable']);
  });
  const result = await flow.reviewPlannerDecisionQuality(candidate, context, 'gpt-6-luna', 'low');
  assert.equal(result.decision, 'ask_user'); assert.equal(audits, 2); assert.equal(questions, 2);
  assert.equal(result.question, 'Can you provide the exact label weight for this calculation?');
  assert.equal(result.detail, 'Preserve this body.'); assert.ok(result.answerOptions.includes('Exact weight unavailable'));

  let rejectedCalls = 0;
  const invalid = new MindSearchManualFlow(repo, new MindSearchRunStore(repo), async task => {
    rejectedCalls++; assert.equal(task.researchMode, 'local');
    return mindSearchPhase(task, 'research-gap-audit')
      ? { summary: 'user_condition', detail: 'The private exact weight is required.', suggestions: [], visualReferences: [] }
      : plannerReview('ask_user', { rationale: 'Weight is needed.', question: 'What is its weight?' }, 'Question', 'Body.', ['Small', 'Large']);
  });
  await assert.rejects(invalid.reviewPlannerDecisionQuality(candidate, context, 'gpt-6-luna', 'low'), /without repeating a prior question/);
  assert.equal(rejectedCalls, 4, 'one reconciliation and one clarification retry, then stop');

  const controller = new AbortController(); let cancelledCalls = 0;
  const cancelled = new MindSearchManualFlow(repo, new MindSearchRunStore(repo), async task => {
    cancelledCalls++;
    if (mindSearchPhase(task, 'research-gap-audit')) return { summary: 'user_condition', detail: 'A private value is required.', suggestions: [], visualReferences: [] };
    controller.abort();
    return plannerReview('ask_user', { rationale: 'More precision.', question: 'What is its weight?' }, 'Question', 'Body.', ['Small', 'Large']);
  });
  await assert.rejects(cancelled.reviewPlannerDecisionQuality(candidate, context, 'gpt-6-luna', 'low', controller.signal));
  assert.equal(cancelledCalls, 2, 'cancellation prevents reconciliation or another provider call');
});
integrationTest('MindSearch delivery timeout persists stages and resumes writing after reload without repeating research', async () => {
  const subject = await coverageSetup('Delivery timeout recovery');
  const original = subject.model.ask;
  let failWriting = true;
  const calls = [];
  const ask = async context => {
    const phase = context.task.match(/mindsearch-phase:\s*([a-z-]+)/)?.[1]; calls.push({ phase, timeout: context.timeoutMs });
    if (phase === 'delivery-writing' && failWriting) throw new Error('AI 任務超過 3 分鐘');
    return original(context);
  };
  const { MindSearchManualFlow } = load('experiences/mind-search/manual-flow.ts');
  const { MindSearchRunStore } = load('mindsearch-mve/research-run-store.ts');
  subject.flow = new MindSearchManualFlow(subject.repo, new MindSearchRunStore(subject.repo), ask);
  await assert.rejects(coverageThreeAnswers(subject), /超過 3 分鐘/);
  let map = await subject.repo.readMap(subject.created.mapPath);
  const branch = map.mindSearch.branches.at(-1);
  assert.equal(branch.deliveryRecovery.phase, 'delivery-writing');
  assert.ok(branch.deliveryRecovery.checkpoint.outline);
  assert.ok(branch.deliveryRecovery.checkpoint.research);
  assert.equal(branch.deliveryRecovery.checkpoint.draft, undefined);
  const before = calls.length;
  const runs = new MindSearchRunStore(subject.repo);
  await runs.configureRetryTimeout(subject.created.mapPath, branch.id, 600_000);
  failWriting = false;
  const reopened = new MindSearchManualFlow(subject.repo, runs, ask);
  const outcome = await reopened.resumeAnswerResearch(subject.created.mapPath, branch.id, 'gpt-6-luna', 'low');
  assert.equal(outcome.status, 'completed');
  const resumed = calls.slice(before);
  assert.deepEqual(resumed.map(item => item.phase), ['delivery-writing', 'delivery-acceptance']);
  assert.ok(resumed.every(item => item.timeout === 600_000));
  map = await subject.repo.readMap(subject.created.mapPath);
  assert.ok(map.mindSearch.branches.at(-1).results.some(result => result.kind === 'conclusion'));
  const handle = await runs.startAttempt(subject.created.mapPath, branch.id, undefined, { model: 'gpt-6-luna', reasoning: 'low', maxResearchTurns: 1 });
  await runs.cancelAttempt(subject.created.mapPath, handle, 'Cancelled');
  await assert.rejects(runs.saveDeliveryRecovery(subject.created.mapPath, handle, branch.deliveryRecovery), /no longer current/);
  await assert.rejects(runs.configureRetryTimeout(subject.created.mapPath, branch.id, 999999), /Invalid retry timeout/);
});
integrationTest('MindSearch delivery resume retains turn-two follow-up evidence and invalidates changed source reports', async () => {
  for (const changeSource of [false, true]) {
    const subject = await coverageSetup(`Turn-two delivery recovery ${changeSource}`);
    const original = subject.model.ask, calls = [];
    let needsFollowup = true, failWriting = true;
    const ask = async context => {
      const phase = context.task.match(/mindsearch-phase:\s*([a-z-]+)/)?.[1]; calls.push(context);
      if (phase === 'report-review' && /Hard floor: 3/.test(context.task) && needsFollowup) {
        needsFollowup = false;
        return plannerReview('research_more', {rationale:'Need one concrete example.'}, 'Gap', 'Gap', [{title:'Example',task:'Verify an example.',contribution:'Resolve example gap.'}]);
      }
      if (phase === 'research-gap-audit') return {summary:'external_evidence',detail:'The concrete example can be externally checked.',suggestions:[],visualReferences:[]};
      if (phase === 'targeted-followup-research') return {summary:'Unique followup',detail:'Research status: search completed\nUNIQUE_FOLLOWUP_EVIDENCE https://example.org/followup',suggestions:[],visualReferences:[]};
      if (phase === 'delivery-writing' && failWriting) throw new Error('timeout');
      return original(context);
    };
    const { MindSearchManualFlow } = load('experiences/mind-search/manual-flow.ts');
    const { MindSearchRunStore } = load('mindsearch-mve/research-run-store.ts');
    subject.flow = new MindSearchManualFlow(subject.repo, new MindSearchRunStore(subject.repo), ask);
    await assert.rejects(coverageThreeAnswers(subject), /timeout/);
    const map = await subject.repo.readMap(subject.created.mapPath), branch = map.mindSearch.branches.at(-1);
    assert.equal(branch.deliveryRecovery.researchTurn, 2);
    assert.ok(branch.deliveryRecovery.reports.detail.includes('UNIQUE_FOLLOWUP_EVIDENCE'));
    if (changeSource) {
      const path = branch.results.find(r => r.kind === 'research').notePath;
      const note = await subject.repo.readNote(path);
      await subject.repo.updateNote(path, {detail: note.detail + '\nCHANGED_SOURCE'});
    }
    const before = calls.length; failWriting = false;
    const reopened = new MindSearchManualFlow(subject.repo, new MindSearchRunStore(subject.repo), ask);
    const outcome = await reopened.resumeAnswerResearch(subject.created.mapPath, branch.id, 'gpt-6-luna','low');
    assert.equal(outcome.status,'completed');
    const phases = calls.slice(before).map(c => c.task.match(/mindsearch-phase:\s*([a-z-]+)/)?.[1]);
    if (!changeSource) {
      assert.deepEqual(phases, ['delivery-writing','delivery-acceptance']);
      assert.ok(calls.slice(before)[0].task.includes('UNIQUE_FOLLOWUP_EVIDENCE'));
    } else {
      assert.ok(phases.includes('report-review'));
      assert.ok(!phases.includes('delivery-outline'), 'the unchanged document outline is retained while affected sections are revalidated');
      assert.ok(calls.slice(before).some(c => c.detail.includes('CHANGED_SOURCE')));
    }
  }
});
integrationTest('MindSearch resumed delivery acceptance can request fresh evidence instead of reusing old checkpoints', async () => {
  const subject = await coverageSetup('Acceptance continuation adds fresh evidence');
  const original = subject.model.ask, calls = [];
  let failAcceptance = true, requestGap = true;
  const ask = async context => {
    const phase = context.task.match(/mindsearch-phase:\s*([a-z-]+)/)?.[1]; calls.push(context);
    if (phase === 'delivery-acceptance' && failAcceptance) throw new Error('timeout at acceptance');
    if (phase === 'delivery-acceptance' && requestGap) {
      requestGap = false;
      return plannerReview('research_more', {rationale:'A concrete reference is missing.'}, 'Gap', 'Need reference', [{title:'Reference',task:'Verify a concrete reference.',contribution:'Complete the document.'}]);
    }
    if (phase === 'research-gap-audit') return {summary:'external_evidence',detail:'The reference needs source verification.',suggestions:[],visualReferences:[]};
    if (phase === 'targeted-followup-research') return {summary:'Fresh reference',detail:'Research status: search completed\nFRESH_ACCEPTANCE_EVIDENCE https://example.org/fresh',suggestions:[],visualReferences:[]};
    return original(context);
  };
  const { MindSearchManualFlow } = load('experiences/mind-search/manual-flow.ts');
  const { MindSearchRunStore } = load('mindsearch-mve/research-run-store.ts');
  subject.flow = new MindSearchManualFlow(subject.repo, new MindSearchRunStore(subject.repo), ask);
  await assert.rejects(coverageThreeAnswers(subject), /timeout at acceptance/);
  const branch = (await subject.repo.readMap(subject.created.mapPath)).mindSearch.branches.at(-1);
  const before = calls.length; failAcceptance = false;
  const reopened = new MindSearchManualFlow(subject.repo, new MindSearchRunStore(subject.repo), ask);
  const outcome = await reopened.resumeAnswerResearch(subject.created.mapPath, branch.id, 'gpt-6-luna','low');
  assert.equal(outcome.status,'completed');
  const resumed = calls.slice(before);
  assert.ok(mindSearchPhase(resumed[0], 'delivery-acceptance'));
  assert.equal(resumed.filter(c => mindSearchPhase(c,'delivery-writing')).length,1);
  const laterWriter = resumed.find(c => mindSearchPhase(c,'delivery-writing'));
  assert.ok(laterWriter.task.includes('FRESH_ACCEPTANCE_EVIDENCE'));
});
integrationTest('MindSearch final acceptance pins the complete review marker to detail for both providers', async () => {
  const { AiTaskService } = load('core/ai-task-service.ts');
  const marker = '<!-- mindsearch-review {"decision":"conclude","rationale":"Source-backed document is complete","stopReason":"All requested sections supported"} -->';
  for (const model of ['gpt-6-luna', 'claude:sonnet']) {
    let seen;
    const runtime = { runTask: async (_p, _m, _e, schema) => { seen = schema; return JSON.stringify({summary:'Ready',detail:marker,suggestions:[],visualReferences:[]}); } };
    const service = new AiTaskService({ pluginDirectory:()=>'/plugin', language:()=> 'en', defaultReasoning:()=> 'low', exchangeLoggingEnabled:()=>false, exchanges:()=>null, codexRuntime:()=>runtime, claudeRuntime:()=>runtime });
    const result = await service.askModel({title:'Goal',summary:'',rules:'',detail:'',task:'<!-- mindsearch-phase: delivery-acceptance -->\nReview full document',ancestors:'',mode:'task',researchMode:'local',promptProfile:'mindsearch',responseContract:'mindsearch-delivery-acceptance'}, model, 'low');
    const pattern = new RegExp(seen.properties.detail.pattern);
    assert.ok(pattern.test(marker));
    assert.ok(!pattern.test('Issues: the review marker was misplaced'));
    assert.match(seen.properties.summary.description, /Never put machine-readable/);
    assert.equal(result.detail, marker);
    assert.equal(result.summary, 'Ready');
  }
});
