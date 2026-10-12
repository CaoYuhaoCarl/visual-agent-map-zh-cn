const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('./build.cjs');

function load(entry) {
  const code = buildSync({ entryPoints: [entry], external: ['obsidian'] }).outputFiles[0].text;
  const moduleValue = { exports: {} };
  vm.runInNewContext(code, { module: moduleValue, exports: moduleValue.exports, require, process, console, setTimeout, clearTimeout, AbortController, DOMException });
  return moduleValue.exports;
}

const { aimContractSchema, foldAimContract, AIM_NO_QUESTION } = load('ai/aim-contracts.ts');
const { parseAimPlannerReview } = load('experiences/aim/planner-review.ts');
const { parseAimResearchPlan } = load('experiences/aim/manual-flow.ts');
const { parseDeliveryOutline } = load('experiences/aim/final-delivery.ts');
const baseSchema = require('../response-schema.json');
const plain = value => JSON.parse(JSON.stringify(value));
const result = (detail = 'Reader-facing body.', summary = 'Preview') => ({ summary, detail, suggestions: [{ title: 'Unrelated provider suggestion', task: 'x', contribution: 'y', parentTitle: '' }], visualReferences: [] });
const contracts = [
  { kind: 'intake' }, { kind: 'question', requireQuestion: true }, { kind: 'question', requireQuestion: false }, { kind: 'plan' }, { kind: 'reuse' },
  { kind: 'review', decisions: ['research_more', 'ask_user', 'conclude'] }, { kind: 'outline' }, { kind: 'delivery-research' }
];

/** Strict structured output requires every object to list all properties as required and forbid extras. */
function assertStrict(schema, path = 'aim') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${path}: additionalProperties`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path}: required`);
    for (const [key, value] of Object.entries(schema.properties)) assertStrict(value, `${path}.${key}`);
  }
  if (schema.items) assertStrict(schema.items, `${path}[]`);
  for (const option of schema.anyOf ?? []) assertStrict(option, path);
  for (const keyword of ['minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'oneOf', 'allOf']) assert.equal(keyword in schema, false, `${path}: ${keyword} is not portable across providers`);
}

test('AIM contract schemas stay strict-mode portable for every phase, with and without evidence lookup', () => {
  for (const contract of contracts) for (const lookup of [false, true]) {
    const schema = aimContractSchema(contract, baseSchema, lookup);
    assert.ok(schema.required.includes('aim'));
    assert.equal('$schema' in schema, false);
    assertStrict(schema.properties.aim);
    assert.equal('evidenceRequestIds' in schema.properties.aim.properties, lookup, `${contract.kind}: lookup field`);
  }
});

test('AIM review schema offers only the decisions the workflow allows', () => {
  const review = decisions => aimContractSchema({ kind: 'review', decisions }, baseSchema, false).properties.aim.properties.decision.enum;
  assert.deepEqual(plain(review(['research_more', 'ask_user'])), ['research_more', 'ask_user']);
  assert.deepEqual(plain(review(['ask_user'])), ['ask_user']);
  const question = requireQuestion => aimContractSchema({ kind: 'question', requireQuestion }, baseSchema, false).properties.aim.properties.decision.enum;
  assert.deepEqual(plain(question(true)), ['ask_user']);
  assert.deepEqual(plain(question(false)), ['ask_user', 'no_question']);
});

test('AIM review fold reads only the chosen decision fields and ignores the rest', () => {
  // Round7 failure shape: a valid ask_user that also filled fields belonging to other decisions.
  const askUser = foldAimContract({ kind: 'review', decisions: ['ask_user'] }, { decision: 'ask_user', rationale: 'Scope changes the answer.', stopReason: 'filled anyway', question: 'Which platform should the guide target?', answerOptions: ['macOS', 'Windows', 'macOS'], researchTarget: { title: 'ignored', task: 'ignored', expectedValue: 'ignored' } }, result());
  const parsed = parseAimPlannerReview(askUser);
  assert.equal(parsed.decision, 'ask_user');
  assert.equal(parsed.question, 'Which platform should the guide target?');
  assert.deepEqual(plain(parsed.answerOptions), ['macOS', 'Windows']);
  assert.equal(parsed.detail, 'Reader-facing body.');

  const more = parseAimPlannerReview(foldAimContract({ kind: 'review', decisions: ['research_more', 'ask_user'] }, { decision: 'research_more', rationale: 'Release date unverified.', stopReason: '', question: 'ignored?', answerOptions: ['a', 'b'], researchTarget: { title: 'Release date', task: 'Check the official changelog', expectedValue: 'Confirms the date' } }, result()));
  assert.deepEqual(plain(more.researchTarget), { title: 'Release date', task: 'Check the official changelog', expectedValue: 'Confirms the date' });

  const more2 = parseAimPlannerReview(foldAimContract({ kind: 'review', decisions: ['research_more'] }, { goalAnswered: true, decision: 'research_more', rationale: 'r', stopReason: '', question: '', answerOptions: [], researchTarget: { title: 't', task: 'k', expectedValue: 'e' } }, result()));
  assert.equal(more2.goalAnswered, true, 'goalAnswered reaches the parsed review');
  const done = parseAimPlannerReview(foldAimContract({ kind: 'review', decisions: ['conclude'] }, { decision: 'conclude', rationale: 'Supported.', stopReason: 'All sections sourced.', question: '', answerOptions: [], researchTarget: null }, result('<!-- aim-review {"decision":"ask_user"} -->\nBody')));
  assert.equal(done.stopReason, 'All sections sourced.');
  assert.equal(done.detail, 'Body', 'a stale marker in detail is replaced, not duplicated');
});

test('AIM plan fold keeps validity beside the exact source and drops null research fields', () => {
  const source = { branchId: 'b1', resultId: 'r1', notePath: 'N.md', version: 1, contentHash: 'a'.repeat(64) };
  const folded = foldAimContract({ kind: 'plan' }, { subtopics: [
    { id: 'baseline', title: 'Baseline', task: 'Reuse baseline', expectedValue: 'Version', action: 'reuse', dependsOn: [], rationale: 'Still applies', source, validity: { conditionKeys: ['Scope'], reason: 'Same scope' } },
    { id: 'changes', title: 'Changes', task: 'List changes', expectedValue: 'Complete list', action: 'research', dependsOn: ['baseline'], rationale: 'Not in report', source: null, validity: null }
  ] }, result());
  assert.deepEqual(plain(folded.suggestions), []);
  const plan = plain(parseAimResearchPlan(folded));
  assert.deepEqual(plan[0].source, source);
  assert.deepEqual(plan[0].validity, { conditionKeys: ['Scope'], reason: 'Same scope' });
  assert.equal('source' in plan[1] || 'validity' in plan[1], false);
});

test('AIM question fold sets the saved question or the no-question sentinel', () => {
  const asked = foldAimContract({ kind: 'question', requireQuestion: true }, { decision: 'ask_user', question: 'Which release channel matters?', answerOptions: ['Public', 'Insider'] }, result('Why it matters.'));
  assert.equal(asked.summary, 'Which release channel matters?');
  assert.deepEqual(plain(asked.suggestions.map(item => item.title)), ['Public', 'Insider']);
  assert.equal(asked.detail, 'Why it matters.');
  const none = foldAimContract({ kind: 'question', requireQuestion: false }, { decision: 'no_question', question: '', answerOptions: [] }, result());
  assert.equal(none.summary, AIM_NO_QUESTION);
});

test('AIM evidence lookup fold emits the first-line request marker and nothing else', () => {
  const folded = foldAimContract({ kind: 'review', decisions: ['conclude'] }, { decision: 'conclude', rationale: 'r', stopReason: 's', question: '', answerOptions: [], researchTarget: null, evidenceRequestIds: ['ev-1', ' '] }, result());
  assert.match(folded.detail, /^<!-- aim-evidence-request \{"ids":\["ev-1"\]\} -->/);
  assert.doesNotMatch(folded.detail, /aim-review/);
  const none = foldAimContract({ kind: 'review', decisions: ['conclude'] }, { decision: 'conclude', rationale: 'r', stopReason: 's', question: '', answerOptions: [], researchTarget: null, evidenceRequestIds: [] }, result());
  assert.match(none.detail, /^<!-- aim-review /);
});

test('AIM outline fold maps null source lists to the legacy all-sources meaning', () => {
  const folded = foldAimContract({ kind: 'outline' }, { sections: [
    { heading: 'Release', purpose: 'Know the version', searchTask: '', evidenceIds: ['s1'], dependencies: null },
    { heading: 'Changes', purpose: 'Know what changed', searchTask: 'Read changelog', evidenceIds: null, dependencies: null }
  ] }, result());
  const sections = plain(parseDeliveryOutline(folded.detail));
  assert.deepEqual(sections[0].evidenceIds, ['s1']);
  assert.equal('dependencies' in sections[0], false);
  assert.equal('evidenceIds' in sections[1], false);
});

test('AIM contract fold leaves legacy marker responses without aim unchanged', () => {
  const legacy = result('<!-- aim-plan {"subtopics":[]} -->');
  assert.equal(foldAimContract({ kind: 'plan' }, undefined, legacy), legacy);
});

test('AiTaskService sends the contract schema and folds the aim payload for AIM phases', async () => {
  const { AiTaskService } = load('core/ai-task-service.ts');
  const schemas = [];
  const service = new AiTaskService({
    pluginDirectory: () => '/plugin', language: () => 'en', defaultReasoning: () => 'low',
    exchangeLoggingEnabled: () => false, exchanges: () => null,
    codexRuntime: () => ({ runTask: async (_prompt, _model, _effort, schema) => { schemas.push(schema); return JSON.stringify({ summary: 'Need scope', detail: 'Body', suggestions: [], visualReferences: [], aim: { decision: 'ask_user', rationale: 'Scope matters.', stopReason: '', question: 'Which scope?', answerOptions: ['A', 'B'], researchTarget: null } }); } }),
    claudeRuntime: () => { throw new Error('unexpected provider'); }
  });
  const base = { title: 'Goal', summary: '', rules: '', detail: '', task: '<!-- aim-phase: report-review -->\nReview evidence.', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', promptProfile: 'aim' };
  const reviewed = await service.askModel({ ...base, aimContract: { kind: 'review', decisions: ['research_more', 'ask_user'] } }, 'gpt-6-luna', 'low');
  assert.deepEqual(plain(schemas[0].properties.aim.properties.decision.enum), ['research_more', 'ask_user']);
  const parsed = parseAimPlannerReview(reviewed);
  assert.equal(parsed.question, 'Which scope?');
  assert.deepEqual(plain(parsed.answerOptions), ['A', 'B']);
  await service.askModel(base, 'gpt-6-luna', 'low');
  assert.equal('aim' in schemas[1].properties, false, 'phases without a contract keep the ordinary schema');
});

test('AIM question fields tell the model questions are about the user, never about the workflow', () => {
  for (const contract of [{ kind: 'question', requireQuestion: true }, { kind: 'review', decisions: ['ask_user'] }]) {
    const description = aimContractSchema(contract, baseSchema, false).properties.aim.properties.question.description;
    assert.match(description, /user's goal, preferences, constraints or situation/);
    assert.match(description, /never about this tool's workflow, counts, nodes or branches/);
  }
});
