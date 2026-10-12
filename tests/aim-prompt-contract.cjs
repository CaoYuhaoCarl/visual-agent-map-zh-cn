const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

function load(entry) {
  const code = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
  const moduleValue = { exports: {} };
  vm.runInNewContext(code, { module: moduleValue, exports: moduleValue.exports, require, process, console, setTimeout, clearTimeout, AbortController, DOMException });
  return moduleValue.exports;
}

const { buildAimPrompt } = load('ai/aim-prompt.ts');
const task = '<!-- aim-phase: report-review -->\nReview reports and return a decision marker.';
const context = {
  title: 'Goal', summary: 'Preview', rules: 'Preserve the user constraints.', detail: 'Persisted report and evidence.', task,
  ancestors: 'Original goal and known conditions.', workingFindings: 'Prior findings.', sourceContext: 'Source [S1]: verified fact.',
  outputLanguage: 'en', mode: 'task', researchMode: 'research', researchDepth: 'normal', visualMode: 'off', promptProfile: 'aim'
};

test('AIM prompt retains phase contract, safety, citations, language, and supplied context without general task structure', () => {
  const prompt = buildAimPrompt(context, 'en');
  assert.match(prompt, /research_more, give exactly one aim\.researchTarget/);
  assert.match(prompt, /ask_user, give one direct aim\.question and 2–5 distinct aim\.answerOptions/);
  assert.match(prompt, /visualReferences must be an empty array/);
  assert.match(prompt, /Write generated content in English/);
  assert.match(prompt, /untrusted evidence/);
  assert.match(prompt, /\[S#\]/);
  for (const value of ['Preserve the user constraints.', 'Persisted report and evidence.', 'Prior findings.', 'Source [S1]: verified fact.', 'Original goal and known conditions.', task]) assert.ok(prompt.includes(value));
  assert.doesNotMatch(prompt, /General task:|### Core conclusions|### Key knowledge|search for visual references|image search/i);
  assert.doesNotMatch(prompt, /Quick overview|answer the core question first|do not conduct a full investigation/i);
});

test('AIM prompt localizes output language and applies phase rules from the explicit marker', () => {
  const prompt = buildAimPrompt({ ...context, task: '<!-- aim-phase: initial-question -->\nAsk when needed.' }, 'zh-TW');
  assert.match(prompt, /新產生的內容使用繁體中文/);
  assert.match(prompt, /在 aim\.question 寫一個直接的問句/);
  assert.match(prompt, /2–5 個不同選項/);
  assert.doesNotMatch(prompt, /report-review|一般任務|### 核心結論|### 關鍵知識/);
  assert.doesNotMatch(prompt, /快速總覽|先回答核心問題|不要進行完整調查/);
});

test('phase guidance preserves decisions during format repair and keeps delivery acceptance concise', () => {
  const repair = buildAimPrompt({ ...context, task: '<!-- aim-phase: format-repair -->\nRepair this response.' }, 'en');
  assert.match(repair, /Preserve the existing decision and user question exactly/);
  assert.match(repair, /do not reinterpret evidence, change the decision/);
  const acceptance = buildAimPrompt({ ...context, task: '<!-- aim-phase: delivery-acceptance -->\nReview this draft.' }, 'en');
  assert.match(acceptance, /brief acceptance note or list of issues/);
  assert.match(acceptance, /do not reproduce or rewrite the draft/);
});

test('AiTaskService selects the compact prompt only for the explicit AIM profile', async () => {
  const { AiTaskService } = load('core/ai-task-service.ts');
  const captured = [];
  const service = new AiTaskService({
    pluginDirectory: () => '/plugin', language: () => 'en', defaultReasoning: () => 'low',
    exchangeLoggingEnabled: () => false, exchanges: () => null,
    codexRuntime: () => ({ runTask: async prompt => { captured.push(prompt); return '{"summary":"done","detail":"details","suggestions":[],"visualReferences":[]}'; } }),
    claudeRuntime: () => { throw new Error('unexpected provider'); }
  });
  const base = { title: 'Goal', summary: 'Summary', rules: '', detail: '', task: '<!-- aim-phase: report-review -->\nReview evidence.', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off' };
  await service.askModel({ ...base, promptProfile: 'aim' }, 'gpt-6-luna', 'low');
  await service.askModel(base, 'gpt-6-luna', 'low');
  assert.equal(captured.length, 2);
  assert.match(captured[0], /For research_more, give exactly one aim\.researchTarget/);
  assert.doesNotMatch(captured[0], /General task:|### Core conclusions|### Key knowledge/);
  assert.match(captured[1], /General task:/);
  assert.match(captured[1], /six standard Detail headings/);
});

test('research planning requires 2–5 targets in both languages', () => {
  for (const language of ['en', 'zh-TW']) {
    for (const phase of ['research-plan', 'research-plan-repair']) {
      const prompt = buildAimPrompt({ ...context, task: `<!-- aim-phase: ${phase} -->\nPlan the research.` }, language);
      assert.match(prompt, /0–5/);
      assert.doesNotMatch(prompt, /2–5/);
    }
  }
});

test('answer planning, research, and review prompts carry each data block once and retain broad subtopic planning', async () => {
  const { AimManualFlow } = load('experiences/aim/manual-flow.ts');
  const captured = [];
  const flow = new AimManualFlow({ settings: { language: 'en' } }, {}, async value => {
    captured.push(value);
    return { summary: 'ok', detail: 'ok', suggestions: [], visualReferences: [] };
  });
  const values = {
    goal: 'GOAL_SENTINEL: choose a suitable option',
    background: 'BACKGROUND_SENTINEL: limited weekday availability',
    answer: 'ANSWER_SENTINEL: selected flexible schedule',
    condition: 'CONDITION_SENTINEL: budget under 500',
    evidence: 'EVIDENCE_SENTINEL: provider availability varies by location'
  };
  const phases = ['research-plan', 'subtopic-research', 'report-review'];
  const lengths = {};
  for (const phase of phases) {
    const marker = phase === 'research-plan'
      ? 'Plan 0–5 distinct evidence tasks with explicit reuse, update, research and dependencies.'
      : phase === 'subtopic-research' ? 'Research only the assigned target.' : 'Review the evidence and return a decision.';
    const task = `<!-- aim-phase: ${phase} -->\n${marker}\nCurrent question: QUESTION_SENTINEL\nCurrent answer: ${values.answer}`;
    await flow.askAimModel({
      title: 'AIM', summary: '', rules: '',
      detail: `Known conditions: ${values.condition}\n\nPersisted report: ${values.evidence}`,
      task,
      ancestors: `Original goal and background:\n${values.goal}\n${values.background}\n\nBranch lineage: none`,
      outputLanguage: 'en', mode: 'task', researchMode: phase === 'research-plan' ? 'local' : 'research', researchDepth: 'normal', visualMode: 'off'
    }, 'gpt-6-luna', 'low');
    const actual = buildAimPrompt(captured.at(-1), 'en');
    for (const value of Object.values(values)) assert.equal(actual.split(value).length - 1, 1, `${phase}: ${value} should appear exactly once`);
    if (phase === 'research-plan') {
      assert.match(actual, /0–5 distinct evidence tasks/);
      assert.match(actual, /reuse\/update\/research and dependsOn/);
    }
    const syntheticDuplicatedShape = {
      ...captured.at(-1), title: values.goal, summary: values.goal,
      detail: `${values.background}\nKnown conditions: ${values.condition}\nPersisted report: ${values.evidence}`,
      ancestors: `Original goal: ${values.goal}\n${values.background}`,
      task: `${captured.at(-1).task}\nOriginal goal: ${values.goal}\nBACKGROUND_SENTINEL: limited weekday availability\nCurrent question: QUESTION_SENTINEL\nCurrent answer: ${values.answer}\nKnown conditions: ${values.condition}\nPersisted report: ${values.evidence}`
    };
    const duplicatedFixture = buildAimPrompt(syntheticDuplicatedShape, 'en');
    lengths[phase] = { syntheticDuplicated: duplicatedFixture.length, current: actual.length };
    assert.ok(actual.length < duplicatedFixture.length, `${phase}: expected compact prompt (${actual.length}) below duplicated fixture (${duplicatedFixture.length})`);
  }
  console.log(`AIM prompt chars (synthetic duplicate fixture vs current; not measured old implementation): ${JSON.stringify(lengths)}`);
});
