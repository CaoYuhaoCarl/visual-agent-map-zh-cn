// Captures the first TaskContext of every AIM phase-task variant at the flow's ask seam (the model-call boundary of
// AimManualFlow), by driving the unchanged flow with canned replies. Used by tests/prompt-snapshots.cjs to write the
// `aim-flow.*` snapshots; no product code is touched and nothing is exported from product modules.
// Variants already snapshotted by the older "AIM flow phase tasks" test (initial-question, research-plan, subtopic-research,
// report-review-first, delivery-*) are not repeated here.
const assert = require('node:assert/strict');
const support = require('./support.cjs');
const pipeline = require('./support-aim-fixture.cjs');

const { plannerReview, aimPhase } = support;
const MODEL = 'gpt-6-luna';

/** Every variant this module must capture; a missing one fails the run loudly instead of silently shrinking coverage. */
const EXPECTED = [
  'initial-clarification', 'evidence-reuse-audit', 'research-gap-audit', 'research-gap-audit-target-only',
  'decision-quality-review-user-condition', 'decision-quality-review-below-floor', 'decision-quality-review-answered-goal',
  'initial-question-correction', 'initial-question-saved-terminal', 'report-review-later',
  'research-plan-repair', 'targeted-followup-research', 'subtopic-research-update', 'subtopic-research-reuse-rejected',
  'format-repair-state-question', 'format-repair-imposed-options', 'format-repair-missing-choices',
  'format-repair-answered-without-target', 'format-repair-preserve-decision', 'format-repair-no-decision'
];

function variantOf(context) {
  const phase = context.task.match(/aim-phase:\s*([a-z-]+)/)?.[1];
  const task = context.task;
  switch (phase) {
    case 'research-gap-audit': return task.includes('TARGET-ONLY RECONCILIATION') ? 'research-gap-audit-target-only' : 'research-gap-audit';
    case 'decision-quality-review':
      if (task.includes('The local semantic audit classified')) return 'decision-quality-review-user-condition';
      if (task.includes('do not search and do not conclude')) return 'decision-quality-review-below-floor';
      if (task.includes('single bounded corrective pass; do not search.')) return 'decision-quality-review-answered-goal';
      return 'decision-quality-review-unclassified';
    case 'initial-question':
      if (task.includes('The user explicitly requested a new follow-up question')) return 'initial-question-saved-terminal';
      if (task.includes('The candidate skipped user input')) return 'initial-question-correction';
      return 'initial-question';
    case 'report-review': return /review 2 of 2/.test(task) ? 'report-review-later' : 'report-review-first';
    case 'subtopic-research':
      if (task.includes('Update only changed or unresolved claims')) return 'subtopic-research-update';
      if (task.includes('Copying earlier evidence was rejected')) return 'subtopic-research-reuse-rejected';
      return 'subtopic-research';
    case 'format-repair':
      if (task.includes('State the one clarification question you intended')) return 'format-repair-state-question';
      if (task.includes('Preserve the exact original question below')) return 'format-repair-imposed-options';
      if (task.includes('Repair only the missing answer choices')) return 'format-repair-missing-choices';
      if (task.includes('named no research target')) return 'format-repair-answered-without-target';
      if (task.includes('Repair only the malformed fields in the original')) return 'format-repair-preserve-decision';
      if (task.includes('Make one local format-repair review')) return 'format-repair-no-decision';
      return 'format-repair-unclassified';
    default: return phase ?? 'none';
  }
}

async function captureAimPhaseVariants() {
  const found = new Map();
  const note = context => { const key = variantOf(context); if (!found.has(key)) found.set(key, { ...context, onProgress: undefined, signal: undefined }); };
  const { AimManualFlow } = support.load('experiences/aim/manual-flow.ts');
  const { AimRunStore } = support.load('experiences/aim/research-run-store.ts');
  const { createAimMap } = support.load('experiences/aim/create-map.ts');
  const answer = (summary, detail, suggestions = []) => ({ summary, detail, suggestions, visualReferences: [] });
  const withFlow = (subject, intercept) => {
    const inner = subject.model.ask;
    const ask = async context => { note(context); return (await intercept?.(context)) ?? inner(context); };
    subject.flow = new AimManualFlow(subject.repo, new AimRunStore(subject.repo), ask);
    return subject;
  };

  // 1. initial-clarification (public entry; coverage fake answers it).
  {
    const subject = withFlow(await support.coverageSetup('Snapshot goal'));
    await subject.flow.prepareClarification(await subject.repo.readNote(subject.created.root.path));
  }

  // 2. initial-question correction: first Planner reply skips the question below the floor.
  {
    let skipped = false;
    const subject = withFlow(await support.coverageSetup('Snapshot goal'), context => {
      if (aimPhase(context, 'initial-question') && !skipped) { skipped = true; return answer('__AIM_NO_QUESTION__', ''); }
    });
    await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, MODEL, 'low', 'snapshot-question');
    assert.ok(skipped);
  }

  // 3. decision-quality-review below the floor: a concluding review is corrected into one question.
  {
    let concluded = false;
    const subject = withFlow(await support.coverageSetup('Snapshot goal'), context => {
      if (aimPhase(context, 'report-review') && !concluded) { concluded = true; return plannerReview('conclude', { rationale: 'Looks complete.', stopReason: 'Done.' }, 'Candidate', 'Candidate body'); }
      if (aimPhase(context, 'decision-quality-review')) return plannerReview('ask_user', { rationale: 'A new dimension matters.', question: 'Which budget range fits you?' }, 'Conditional answer', 'Existing reports remain valid.', ['Low budget', 'High budget']);
    });
    const question = (await subject.flow.planNextQuestion(subject.created.mapPath, subject.created.root.id, MODEL, 'low', 'snapshot-question')).node;
    await subject.flow.answerAndResearch(subject.created.mapPath, question.id, { requestId: 'snapshot-answer', selections: [question.aimQuestion.options[0].id], freeText: 'Specific condition' }, MODEL, 'low');
    assert.ok(concluded);
  }

  // 4. decision-quality-review at the floor: research_more on a goal its own review calls answered is re-decided.
  {
    let proposed = false;
    const target = { title: 'Extra example', task: 'Verify one more example.', contribution: 'Pad the result.' };
    const subject = withFlow(await support.coverageSetup('Snapshot goal'), context => {
      if (aimPhase(context, 'report-review') && /Hard floor: 3 answered/.test(context.task) && !proposed) {
        proposed = true;
        return answer('The reports already answer the goal.', '<!-- aim-review {"decision":"research_more","rationale":"No gap remains.","goalAnswered":true} -->\nSupported conditional answer.', [target]);
      }
      if (aimPhase(context, 'decision-quality-review')) return plannerReview('conclude', { rationale: 'Reports support delivery.', stopReason: 'Ready for delivery stages.' }, 'Candidate document', 'Candidate document');
    });
    await support.coverageThreeAnswers(subject);
    assert.ok(proposed);
  }

  // 5. initial-question from a saved terminal result (the "new follow-up question" entry).
  {
    const { repo } = support.fixture();
    const created = await createAimMap(repo, MODEL, { requestId: 'snapshot-saved-result-map', topic: 'Synthetic cooking plan', context: 'Use a cast-iron pan; no oven.' });
    const store = new AimRunStore(repo);
    const first = new AimManualFlow(repo, store, async () => answer('Which doneness do you prefer?', 'Synthetic initial question.', [{ title: 'Pink' }, { title: 'Well done' }]));
    const originalQuestion = (await first.planNextQuestion(created.mapPath, created.root.id, MODEL, 'low', 'snapshot-source-initial')).node;
    const branch = await store.createAnswerBranch(created.mapPath, { requestId: 'snapshot-source-answer', questionNodeId: originalQuestion.id, parentBranchId: null, answerSnapshot: { selections: [originalQuestion.aimQuestion.options[0].id], freeText: 'Synthetic answer.' }, inputSnapshot: { topic: created.map.title, conditions: { equipment: 'Cast-iron pan; no oven.' }, upstreamResults: [] } });
    const handle = await store.startAttempt(created.mapPath, branch.id, 'snapshot-saved-synthesis');
    const draft = (await store.createResultDraft(created.mapPath, handle, 'Saved synthesis', MODEL, 'low', { kind: 'synthesis' })).draft;
    await store.commitResult(created.mapPath, handle, draft.id, { summary: 'Synthetic method summary.', detail: 'Use the saved safety report and user conditions.' });
    store.releaseAttempt(created.mapPath, handle);
    const saved = await repo.readMap(created.mapPath);
    const resultRef = saved.aim.branches.find(item => item.id === branch.id).results.find(item => item.kind === 'synthesis');
    const planner = new AimManualFlow(repo, store, async context => { note(context); return answer('How much hands-on guidance would you like?', 'Synthetic new question.', [{ title: 'Step-by-step' }, { title: 'Brief overview' }]); });
    await planner.planNextQuestion(created.mapPath, resultRef.nodeId, MODEL, 'low', 'snapshot-new-question', branch.id);
  }

  // 6. gap audit (both forms), user-condition correction, targeted follow-up and the second report review.
  {
    const { repo } = support.fixture();
    const created = await createAimMap(repo, MODEL, { requestId: 'snapshot-range-map', topic: 'Prepare a herb roast chicken', context: 'Synthetic range-answer scenario.' });
    let searches = 0, reviews = 0;
    const target = { title: 'Small-chicken herb butter recipe', task: 'Find a published recipe for a chicken below 1.5 kg with herb, garlic and butter quantities.', contribution: 'Verify published ingredient ratios for a small bird.' };
    const plan = ['recipe', 'method', 'doneness'].map(id => ({ id, title: id, task: `Find ${id} evidence.`, expectedValue: `Support ${id}.` }));
    const flow = new AimManualFlow(repo, new AimRunStore(repo), async context => {
      note(context);
      if (aimPhase(context, 'initial-question')) return answer('How much does the chicken weigh?', 'Choose a range.', [{ title: 'Below 1.5 kg' }, { title: 'Above 1.5 kg' }]);
      if (aimPhase(context, 'research-plan')) return answer('Plan', `<!-- aim-plan ${JSON.stringify({ subtopics: plan })} -->`);
      if (aimPhase(context, 'subtopic-research')) { searches++; return answer(`Saved evidence ${searches}`, `Research status: search completed\nSaved evidence ${searches}.`); }
      if (aimPhase(context, 'report-review')) {
        reviews++;
        if (reviews === 1) return plannerReview('research_more', { rationale: 'The exact weight is not known, and the small-bird recipe ratios still need a published source.' }, 'A conditional method is available.', 'Preserve the saved evidence.', [target]);
        return plannerReview('ask_user', { rationale: 'Oven mode changes the practical instructions.', question: 'Which oven mode will you use?' }, 'Recipe evidence now saved.', 'Keep all four reports.', ['Fan', 'Conventional']);
      }
      if (aimPhase(context, 'research-gap-audit')) return context.task.includes('TARGET-ONLY RECONCILIATION')
        ? answer('external_evidence', 'A published recipe for the supplied weight range is an external fact.')
        : answer('user_condition', 'The exact weight of this particular bird cannot be found online.');
      if (aimPhase(context, 'decision-quality-review')) return plannerReview('ask_user', { rationale: 'More precise weight is needed.', question: 'How much does the chicken weigh?' }, 'Conditional method.', 'Existing reports remain valid.', ['Below 1 kg', '1 to 1.2 kg', '1.2 to 1.5 kg']);
      if (aimPhase(context, 'targeted-followup-research')) { searches++; return answer('Published small-bird recipe found.', 'Research status: search completed\nPublished recipe quantities and limitations.'); }
      throw new Error(`Unexpected phase: ${context.task.slice(0, 150)}`);
    });
    const question = (await flow.planNextQuestion(created.mapPath, created.root.id, MODEL, 'low', 'snapshot-range-question')).node;
    const map = await repo.readMap(created.mapPath);
    const prior = await repo.createNote('Earlier condition', MODEL, map, created.mapPath, 'workspace');
    prior.aimKind = 'question'; map.nodes.push(prior);
    map.aim.branches.push({ id: 'range-prior', questionNodeId: prior.id, parentBranchId: null, answerSnapshot: { selections: [], freeText: 'Known' }, inputSnapshot: { topic: map.title, conditions: { flavor: 'Herbs' }, upstreamResults: [] }, createdAt: '2026-10-09T00:00:00.000Z', results: [] });
    map.nodes.find(item => item.id === question.id).aimQuestion.parentBranchId = 'range-prior';
    await repo.saveMap(created.mapPath, map);
    const result = await flow.answerAndResearch(created.mapPath, question.id, { requestId: 'snapshot-range-answer', selections: [question.aimQuestion.options[0].id], freeText: '' }, MODEL, 'low');
    assert.equal(result.status, 'waiting-user');
  }

  // 7. evidence-reuse-audit, update research and a rejected reuse (deterministic in-memory fixture).
  const stop = context => { if (pipeline.phaseOf(context) === 'report-review') throw new Error('STOP_AT_REVIEW'); throw new Error(`Unexpected phase ${pipeline.phaseOf(context)}`); };
  const runResume = async (subject, ask, method = 'resumeAnswerResearch') => {
    const flow = new pipeline.AimManualFlow(subject.repository, subject.store, async context => { note(context); return ask(context); });
    await assert.rejects(flow[method]('Map.md', 'current', 'test', 'low'), /STOP_AT_REVIEW/);
  };
  {
    const subject = pipeline.fixture(); await subject.setPlan([pipeline.reuseTarget(subject.source)]);
    await runResume(subject, context => pipeline.phaseOf(context) === 'evidence-reuse-audit' ? pipeline.usableAudit : stop(context));
  }
  {
    const subject = pipeline.fixture({ conditions: { weight: '2kg' } });
    await subject.setPlan([{ ...pipeline.reuseTarget(subject.source), action: 'update', task: 'Update cooking time for the changed 2kg weight only' }]);
    await runResume(subject, context => pipeline.phaseOf(context) === 'subtopic-research' ? pipeline.answer('Updated time', 'Research status: search completed\nAdjusted cooking time https://example.org/update') : stop(context));
  }
  {
    const subject = pipeline.fixture(); await subject.setPlan([pipeline.reuseTarget(subject.source)]);
    await runResume(subject, context => {
      if (pipeline.phaseOf(context) === 'evidence-reuse-audit') return pipeline.answer('Not reusable', '<!-- aim-reuse {"usable":false,"rationale":"Source is stale","conditionKeys":[],"validity":"New verification required"} -->');
      if (pipeline.phaseOf(context) === 'subtopic-research') return pipeline.answer('Fresh method', 'Research status: search completed\nFRESH_TARGET_EVIDENCE https://example.org/fresh');
      return stop(context);
    });
  }
  // 8. research-plan-repair: the first plan reply has no machine-readable marker.
  {
    const subject = pipeline.fixture({ ancestor: false, plan: undefined }); await subject.setPlan(undefined);
    let planCalls = 0;
    await runResume(subject, context => {
      const phase = pipeline.phaseOf(context);
      if (phase === 'research-plan' || phase === 'research-plan-repair') {
        planCalls++;
        return planCalls === 1 ? pipeline.answer('Plan', 'No marker here.') : pipeline.answer('Plan', '<!-- aim-plan {"subtopics":[{"id":"a","title":"A","task":"Find a.","expectedValue":"Resolve a."}]} -->');
      }
      if (phase === 'subtopic-research') return pipeline.answer('Found', 'Research status: search completed\nhttps://example.org/a');
      return stop(context);
    }, 'retryAnswerResearch');
  }

  // 9. planner-review.ts repair tasks, driven through the flow's own format-repair wrapper.
  {
    const flow = new AimManualFlow({ settings: { language: 'en' } }, {}, async context => {
      note(context);
      return plannerReview('ask_user', { rationale: 'Repaired rationale.', question: 'Which pace do you prefer?' }, 'Repaired summary', 'Repaired body', ['Relaxed pace', 'Fast pace']);
    });
    const recoveryContext = { question: 'Original goal', answerSnapshot: '{"conditions":{"weight":"1kg"}}', reportSummary: 'Saved report summary', reportDetail: 'Saved report detail' };
    const taskContext = { title: 'Original goal', summary: '', detail: 'Goal background', ancestors: '', task: 'Planner review task', outputLanguage: 'en', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', aimContract: { kind: 'review', decisions: ['research_more', 'ask_user', 'conclude'] } };
    // The canned reply may be rejected by the product's own checks; only the task sent through the seam matters here.
    const run = (original, context) => flow.parsePlannerReviewWithRecovery(original, context, taskContext, MODEL, 'low').catch(error => { if (process.env.AIM_CAPTURE_DEBUG) console.log('repair run rejected:', error.message); });
    const unmarked = { summary: 'Needs a clarification.', detail: 'Based on the saved reports, a simple approach is advisable.', suggestions: [{ title: '30 minutes', task: '', contribution: '' }] };
    const floor = { ...recoveryContext, requiredDecision: 'ask_user', requiredDecisionRationale: 'The branch has 1 answered question node(s); at least 3 are required before conclusion.' };
    await run(unmarked, floor);
    await run(unmarked, { ...floor, preferredQuestion: 'How much preparation time can you spend?' });
    await run({ summary: 'A choice is needed.', detail: '<!-- aim-review {"decision":"ask_user","rationale":"This preference changes the recommendation.","question":"Which pace do you prefer?"} -->\nThe supported answer is conditional.', suggestions: [] }, recoveryContext);
    const answeredWithoutTarget = { summary: 'The reports already answer the goal.', detail: '<!-- aim-review {"decision":"research_more","rationale":"The reports answer every core outcome; no evidence gap remains.","goalAnswered":true} -->\nSupported conditional answer.', suggestions: [] };
    await run(answeredWithoutTarget, recoveryContext);
    await run({ ...answeredWithoutTarget, detail: answeredWithoutTarget.detail.replace('"goalAnswered":true', '"goalAnswered":false') }, recoveryContext);
    await run({ summary: 'Draft', detail: 'No usable decision marker. Draft body.', suggestions: [] }, recoveryContext);
  }

  const missing = EXPECTED.filter(name => !found.has(name));
  assert.deepEqual(missing, [], `AIM phase variants not captured: ${missing.join(', ')}`);
  assert.ok(!found.has('decision-quality-review-unclassified') && !found.has('format-repair-unclassified'), 'a captured repair/review task matched no known variant');
  return new Map([...found].filter(([name]) => EXPECTED.includes(name)));
}
module.exports = { captureAimPhaseVariants, EXPECTED };
