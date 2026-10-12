const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('./build.cjs');

const code = buildSync({ entryPoints: ['experiences/aim/planner-review.ts'] }).outputFiles[0].text;
const moduleValue = { exports: {} };
vm.runInNewContext(code, { module: moduleValue, exports: moduleValue.exports });
const { extractPlannerQuestionCandidate, parseAimPlannerReviewWithRecovery } = moduleValue.exports;
const fixture = JSON.parse(fs.readFileSync(path.join('tests/fixtures/aim/ask_user_missing_options.json'), 'utf8'));
const context = { question: 'Fixture question', answerSnapshot: 'Synthetic answer snapshot', reportSummary: 'Private full report summary', reportDetail: 'Private full report detail' };

test('captured ask_user with missing suggestions repairs choices and preserves original content', async () => {
  const calls = [];
  const parsed = await parseAimPlannerReviewWithRecovery(fixture.result, context, async task => {
    calls.push(task);
    assert.match(task, /Repair only the missing answer choices/);
    assert.match(task, /Original question: 此合成分支選定的牛排熟度是哪一種？請選：三分熟、五分熟、七分熟、全熟，或其他。/);
    assert.doesNotMatch(task, /Private full report|Already completed report/);
    return {
      summary: '替換後的摘要不可採用。',
      detail: '<!-- aim-review {"decision":"ask_user","rationale":"替換後的理由不可採用。","question":"替換後的問題不可採用？"} -->\n替換後的正文不可採用。',
      suggestions: ['三分熟', '五分熟', '七分熟', '全熟', '其他'].map(title => ({ title, task: '', contribution: '' }))
    };
  });
  assert.equal(calls.length, 1);
  assert.equal(parsed.decision, 'ask_user');
  assert.equal(parsed.question, '此合成分支選定的牛排熟度是哪一種？請選：三分熟、五分熟、七分熟、全熟，或其他。');
  assert.equal(parsed.rationale, fixture.result.detail.match(/"rationale":"([^"]+)/)[1]);
  assert.equal(parsed.summary, fixture.result.summary);
  assert.equal(parsed.detail, fixture.result.detail.replace(/^<!--[\s\S]*?-->\s*/, '').trim());
  assert.deepEqual(Array.from(parsed.answerOptions), ['三分熟', '五分熟', '七分熟', '全熟', '其他']);
});

test('explicitly labeled 2–5 option bullets are recovered without a model call', async () => {
  const original = {
    summary: 'A choice is needed.',
    detail: '<!-- aim-review {"decision":"ask_user","rationale":"This preference changes the recommendation.","question":"Which pace do you prefer?"} -->\nThe supported answer is conditional.\n\nAnswer options:\n- Relaxed pace\n- Fast pace',
    suggestions: []
  };
  let calls = 0;
  const parsed = await parseAimPlannerReviewWithRecovery(original, context, async () => { calls++; throw new Error('must not call model'); });
  assert.equal(calls, 0);
  assert.deepEqual(Array.from(parsed.answerOptions), ['Relaxed pace', 'Fast pace']);
  assert.equal(parsed.question, 'Which pace do you prefer?');
  assert.equal(parsed.detail, 'The supported answer is conditional.\n\nAnswer options:\n- Relaxed pace\n- Fast pace');
});

test('repair cannot switch a valid original decision to conclude', async () => {
  await assert.rejects(() => parseAimPlannerReviewWithRecovery(fixture.result, context, async () => ({
    summary: 'Concluded.',
    detail: '<!-- aim-review {"decision":"conclude","rationale":"Complete","stopReason":"No more work."} -->\nChanged body.',
    suggestions: []
  })), /changed or omitted the original ask_user decision/);
});

test('malformed marker fallback uses one repair and does not pretend the original decision is known', async () => {
  const original = { summary: 'Draft', detail: 'No usable decision marker. Draft body.', suggestions: [] };
  let calls = 0;
  await assert.rejects(() => parseAimPlannerReviewWithRecovery(original, context, async task => {
    calls++;
    assert.match(task, /original decision marker is unusable/);
    assert.match(task, /Private full report summary/);
    return original;
  }), /missing its machine-readable decision block/);
  assert.equal(calls, 1);
});

test('invalid repair remains bounded to one model call', async () => {
  let calls = 0;
  await assert.rejects(() => parseAimPlannerReviewWithRecovery(fixture.result, context, async () => {
    calls++;
    return fixture.result;
  }), /did not provide 2–5 distinct answer choices/);
  assert.equal(calls, 1);
});
test('question followed only by answer bullets needs no format-repair model call', async () => {
  const question = 'How much time can you spend each day?';
  const original = { summary: 'Time changes the plan.', detail: `<!-- aim-review ${JSON.stringify({ decision: 'ask_user', rationale: 'Daily time is unknown.', question })} -->\n${question}\n\n- 1–2 hours\n- 3–5 hours\n- 6 hours or more`, suggestions: [] };
  const parsed = await parseAimPlannerReviewWithRecovery(original, context, async () => { throw new Error('should recover existing choices'); });
  assert.equal(parsed.question, question);
  assert.deepEqual(Array.from(parsed.answerOptions), ['1–2 hours', '3–5 hours', '6 hours or more']);
});

test('an imposed ask_user decision repairs an unmarked reply without reopening evidence or changing its question', async () => {
  const question = '你平常可以投入多少準備時間？';
  const original = {
    summary: '你平常可以投入多少準備時間？',
    detail: '依目前條件，建議先採簡單可行的做法。',
    suggestions: [{ title: '30 分鐘內', task: '', contribution: '' }]
  };
  const constrainedContext = {
    ...context,
    requiredDecision: 'ask_user',
    requiredDecisionRationale: '目前只回答 2 題，至少要回答 3 題才能結論。',
    preferredQuestion: question
  };
  let repairCalls = 0;
  const parsed = await parseAimPlannerReviewWithRecovery(original, constrainedContext, async task => {
    repairCalls++;
    assert.match(task, /workflow has imposed decision=ask_user/);
    assert.match(task, /Required decision: ask_user/);
    assert.match(task, new RegExp(question));
    assert.doesNotMatch(task, /Private full report|Already completed report/);
    assert.doesNotMatch(task, /Answer snapshot/);
    return {
      summary: '不得採用修復器的新摘要。',
      detail: `<!-- aim-review ${JSON.stringify({ decision: 'ask_user', rationale: '改寫理由不可採用。', question })} -->\n修復器的新正文不可採用。`,
      suggestions: ['30 分鐘內', '約 1 小時', '超過 1 小時'].map(title => ({ title, task: '', contribution: '' }))
    };
  });
  assert.equal(repairCalls, 1);
  assert.equal(parsed.decision, 'ask_user');
  assert.equal(parsed.question, question);
  assert.equal(parsed.rationale, constrainedContext.requiredDecisionRationale);
  assert.equal(parsed.summary, original.summary);
  assert.equal(parsed.detail, original.detail);
  assert.deepEqual(Array.from(parsed.answerOptions), ['30 分鐘內', '約 1 小時', '超過 1 小時']);
});

test('an imposed ask_user decision rejects a repairer that returns conclude', async () => {
  const question = 'Which constraint matters most?';
  const original = { summary: 'Which constraint matters most?', detail: 'A supported conditional response.', suggestions: [] };
  await assert.rejects(() => parseAimPlannerReviewWithRecovery(original, {
    ...context, requiredDecision: 'ask_user', preferredQuestion: question, requiredDecisionRationale: 'Two answers; three required.'
  }, async () => ({
    summary: 'Concluded.',
    detail: '<!-- aim-review {"decision":"conclude","rationale":"Enough evidence.","stopReason":"Done."} -->\nConclusion.',
    suggestions: []
  })), /changed or omitted the required ask_user decision/);
});

test('a parse-valid conclude cannot bypass an imposed ask_user decision', async () => {
  const original = {
    summary: 'Conclusion.',
    detail: '<!-- aim-review {"decision":"conclude","rationale":"Enough evidence.","stopReason":"Done."} -->\nConclusion body.',
    suggestions: []
  };
  let calls = 0;
  await assert.rejects(() => parseAimPlannerReviewWithRecovery(original, {
    ...context, requiredDecision: 'ask_user', preferredQuestion: 'Which constraint matters most?'
  }, async () => { calls++; throw new Error('must reject without repair'); }), /violated the required ask_user decision/);
  assert.equal(calls, 0);
});

test('explicit question metadata outranks rhetorical body and summary questions', () => {
  assert.equal(extractPlannerQuestionCandidate({
    summary: 'Could there be a better answer?',
    detail: 'Could this be more ambitious?\n問題：每天可以投入多少時間？'
  }), '每天可以投入多少時間？');
});

// Captured from a live Codex correction turn below the answered-question floor: no decision marker,
// the clarification phrased as a statement without a question mark, and valid answer choices.
const codexFloorCorrection = {
  summary: '需先釐清成功標準，再判斷版本摘要要多精簡或多詳細。',
  detail: '依現有研究摘要，Obsidian Desktop 最新公開穩定版為 1.14，於 2026-10-05 發布。這些資訊回答了原始問題；但尚不清楚你希望「主要更新」摘要到什麼程度，因此暫不結案。',
  suggestions: [{ title: '只要三項重點', task: '以每項一句話整理版本主要更新。', contribution: '提供精簡、易掃讀的回答。', parentTitle: '' }, { title: '附上功能細節', task: '補充各項更新的使用方式與限制。', contribution: '提供較完整的功能摘要。', parentTitle: '' }]
};
const floorContext = { ...context, requiredDecision: 'ask_user', requiredDecisionRationale: 'The branch has 1 answered question node(s); at least 3 are required before conclusion.' };

test('an imposed ask_user without a written question asks the model once to state its own question', async () => {
  assert.equal(extractPlannerQuestionCandidate(codexFloorCorrection), undefined);
  const tasks = [];
  const parsed = await parseAimPlannerReviewWithRecovery(codexFloorCorrection, floorContext, async task => {
    tasks.push(task);
    assert.match(task, /state the one clarification question you intended/i);
    assert.match(task, /需先釐清成功標準/);
    assert.doesNotMatch(task, /Private full report|Already completed report/);
    return {
      summary: '替換後的摘要不可採用。',
      detail: '<!-- aim-review {"decision":"ask_user","rationale":"替換後的理由不可採用。","question":"你希望主要更新摘要到什麼程度？"} -->\n替換後的正文不可採用。',
      suggestions: ['只要三項重點', '附上功能細節'].map(title => ({ title, task: '', contribution: '' }))
    };
  });
  assert.equal(tasks.length, 1);
  assert.equal(parsed.decision, 'ask_user');
  assert.equal(parsed.question, '你希望主要更新摘要到什麼程度？');
  assert.equal(parsed.rationale, floorContext.requiredDecisionRationale);
  assert.equal(parsed.summary, codexFloorCorrection.summary);
  assert.equal(parsed.detail, codexFloorCorrection.detail);
  assert.deepEqual(Array.from(parsed.answerOptions), ['只要三項重點', '附上功能細節']);
});

test('an imposed ask_user still fails when the model never states a question', async () => {
  let calls = 0;
  await assert.rejects(() => parseAimPlannerReviewWithRecovery(codexFloorCorrection, floorContext, async () => {
    calls++;
    return { summary: '仍未提出問題。', detail: '內容沒有決策標記。', suggestions: codexFloorCorrection.suggestions };
  }), /cannot invent a question that was absent from the original response/);
  assert.equal(calls, 1);
});

test('a bold-labelled question is extracted without its Markdown emphasis', () => {
  assert.equal(extractPlannerQuestionCandidate({
    summary: '版本資訊已整理；確認安裝需求是否影響你判斷「最新穩定版」的適用性。',
    detail: '**問題：**你目前使用的 Obsidian 安裝程式是否已更新到支援開啟 vault 外 Markdown 檔案的版本？\n\n- 已更新安裝程式\n- 尚未更新安裝程式'
  }), '你目前使用的 Obsidian 安裝程式是否已更新到支援開啟 vault 外 Markdown 檔案的版本？');
  assert.equal(extractPlannerQuestionCandidate({ summary: '', detail: '**Question:** Which platform do you use?' }), 'Which platform do you use?');
});

// Live replies chose research_more with researchTarget null while stating the goal was already answered.
const answeredWithoutTarget = {
  summary: 'The reports already answer the goal.',
  detail: '<!-- aim-review {"decision":"research_more","rationale":"The reports answer every core outcome; no evidence gap remains.","goalAnswered":true} -->\nSupported conditional answer.',
  suggestions: []
};

test('research_more without a target on an answered goal is re-decided without research_more instead of inventing a target', async () => {
  const calls = [];
  const parsed = await parseAimPlannerReviewWithRecovery(answeredWithoutTarget, context, async (task, options) => {
    calls.push({ task, options });
    return {
      summary: 'The reports already answer the goal.',
      detail: '<!-- aim-review {"decision":"ask_user","rationale":"Usage context changes which commands to list first.","question":"What will you use this environment for?"} -->\nSupported conditional answer.',
      suggestions: ['Project work', 'Teaching'].map(title => ({ title, task: '', contribution: '' }))
    };
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0].options.excludeDecisions), ['research_more']);
  assert.match(calls[0].task, /named no research target/);
  assert.doesNotMatch(calls[0].task, /Preserve that decision/);
  assert.match(calls[0].task, /Already completed report detail:\nPrivate full report detail/);
  assert.equal(parsed.decision, 'ask_user');
  assert.equal(parsed.question, 'What will you use this environment for?');
  assert.deepEqual(Array.from(parsed.answerOptions), ['Project work', 'Teaching']);
});

test('a re-decided answered goal still rejects a repairer that returns research_more', async () => {
  await assert.rejects(() => parseAimPlannerReviewWithRecovery(answeredWithoutTarget, context, async () => ({
    summary: 'More research.',
    detail: '<!-- aim-review {"decision":"research_more","rationale":"Padding."} -->\nBody.',
    suggestions: [{ title: 'Invented target', task: 'Search anything', contribution: 'None' }]
  })), /cannot choose research_more/);
});

test('research_more without a target on an unanswered goal keeps the decision and repairs only the target', async () => {
  const original = { ...answeredWithoutTarget, detail: answeredWithoutTarget.detail.replace('"goalAnswered":true', '"goalAnswered":false') };
  const calls = [];
  const parsed = await parseAimPlannerReviewWithRecovery(original, context, async (task, options) => {
    calls.push({ task, options });
    return {
      summary: 'A gap remains.',
      detail: '<!-- aim-review {"decision":"research_more","rationale":"Repaired."} -->\nBody.',
      suggestions: [{ title: 'Missing fact', task: 'Search the official source', contribution: 'Confirms the missing fact' }]
    };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options, undefined);
  assert.match(calls[0].task, /Preserve that decision/);
  assert.equal(parsed.decision, 'research_more');
  assert.equal(parsed.researchTarget.title, 'Missing fact');
});
