// Lane B2 (AIM support, repair and delivery texts): the format-repair and final-delivery task texts and the shared AIM
// rule constants live in Markdown templates under experiences/aim/steps/. These pins were computed on the unchanged
// code (a8d5d5b) and compare every rendered text, including variants the prompt snapshots do not reach, byte for byte.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { load, root } = require('./support-replay.cjs');

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const result = (marker, body, suggestions = [], summary = 'Original summary') => ({
  summary, detail: marker === undefined ? body : `<!-- aim-review ${JSON.stringify(marker)} -->\n${body}`, suggestions, visualReferences: []
});
const context = extra => ({ question: 'Which option?', answerSnapshot: '{"selected":"A"}', reportSummary: 'Report summary', reportDetail: 'Report detail', ...extra });

/** Every task text the Planner format repair sends, by variant. */
async function repairTasks() {
  const { parseAimPlannerReviewWithRecovery } = load('experiences/aim/planner-review.ts');
  const tasks = {}, options = {};
  const capture = async (name, original, ctx) => {
    const seen = [];
    await parseAimPlannerReviewWithRecovery(original, ctx, async (task, option) => { seen.push(task); options[name] = option; throw new Error('stop'); }).catch(() => undefined);
    tasks[name] = seen[0];
  };
  const noQuestion = result({ decision: 'ask_user', rationale: 'Because.' }, 'Body without a question.', [{ title: 'Only one', task: '', contribution: '' }]);
  await capture('state-question', noQuestion, context({ requiredDecision: 'ask_user', requiredDecisionRationale: 'Fixed rationale.' }));
  await capture('state-question-default-rationale', noQuestion, context({ requiredDecision: 'ask_user' }));
  const noChoices = result({ decision: 'ask_user', rationale: 'Because.', question: 'What fits you?' }, 'Body text.');
  await capture('imposed-options', noChoices, context({ requiredDecision: 'ask_user', requiredDecisionRationale: 'Fixed rationale.' }));
  await capture('imposed-options-default-rationale', noChoices, context({ requiredDecision: 'ask_user', preferredQuestion: 'Preferred?' }));
  await capture('missing-choices', noChoices, context());
  await capture('answered-without-target', result({ decision: 'research_more', rationale: 'None.', goalAnswered: true }, 'Answered body.'), context());
  await capture('preserve-decision', result({ decision: 'conclude', rationale: 'Done.' }, 'Concluding body.'), context());
  await capture('no-decision', result(undefined, 'No marker at all.'), context());
  return { tasks, options };
}

/** Every task text of the final delivery workflow, by scenario. */
async function deliveryTasks() {
  const { buildFinalDelivery } = load('experiences/aim/final-delivery.ts');
  const outputs = (outline, extra = {}) => ({
    'delivery-outline': { summary: 'Outline', detail: `<!-- aim-delivery-outline ${JSON.stringify(outline)} -->`, suggestions: [], visualReferences: [] },
    'delivery-research': { summary: 'Evidence', detail: '<!-- aim-delivery-research {"status":"searched"} -->\n## Plan\nhttps://example.org/r', suggestions: [], visualReferences: [] },
    'delivery-writing': { summary: 'Draft', detail: 'Full draft', suggestions: [], visualReferences: [] },
    'delivery-acceptance': { summary: 'Accepted', detail: '<!-- aim-review {"decision":"conclude","rationale":"Complete","stopReason":"Ready"} -->', suggestions: [], visualReferences: [] },
    ...extra
  });
  const run = async (outline, options) => {
    const reply = outputs(outline), tasks = [];
    await buildFinalDelivery({ title: 'Goal G', rules: 'Rule R', detail: 'Conditions C', outputLanguage: 'en' }, async ctx => {
      tasks.push(ctx.task);
      return reply[ctx.task.match(/aim-phase: ([a-z-]+)/)[1]];
    }, options);
    return tasks;
  };
  const evidence = [{ id: 'e1', hash: 'h1', detail: 'Evidence one' }, { id: 'e2', hash: 'h2', detail: 'Evidence two' }];
  return {
    mapped: await run({ sections: [{ heading: 'Plan', purpose: 'Deliver', searchTask: 'Find examples', evidenceIds: ['e1'] }, { heading: 'Limits', purpose: 'State limits', searchTask: '' }] }, { knownConditions: '{"goal":"G"}', evidence }),
    unmapped: await run({ sections: [{ heading: 'Plan', purpose: 'Deliver', searchTask: '', evidenceIds: [] }] }, { knownConditions: '{"goal":"G"}', evidence }),
    legacy: await run({ sections: [{ heading: 'Steps', purpose: 'Execute', searchTask: 'Find examples' }] }, {}),
    reused: await run({ sections: [{ heading: 'Steps', purpose: 'Execute', searchTask: '' }] }, {})
  };
}

function sharedTexts() {
  const support = load('experiences/aim/manual-flow-support.ts');
  const context = load('experiences/aim/evidence-context.ts');
  const request = load('experiences/aim/request-context.ts');
  const long = `${'x'.repeat(600)}\n\nUncertain limitation here\n\nSee https://a.example/1 and https://b.example/2 https://a.example/1`;
  return {
    PLANNER_COVERAGE_RULE: support.PLANNER_COVERAGE_RULE, SEARCHER_TARGET_RULE: support.SEARCHER_TARGET_RULE, USER_QUESTION_RULE: support.USER_QUESTION_RULE,
    FLOOR_ASK_RULE: support.FLOOR_ASK_RULE, OUTCOME_EXPECTATION_RULE: support.OUTCOME_EXPECTATION_RULE,
    EVIDENCE_LOOKUP_RULE: context.EVIDENCE_LOOKUP_RULE, EVIDENCE_LOOKUP_FIELD_RULE: context.EVIDENCE_LOOKUP_FIELD_RULE,
    'evidenceCard-urls': context.evidenceCard('ev-1', 'A summary', long), 'evidenceCard-empty': context.evidenceCard('ev-2', 'Another', 'No links, nothing else.'),
    dedup: JSON.stringify(request.deduplicateAimRequest({ title: 'T', task: 'a'.repeat(600), detail: `${'a'.repeat(600)}\n\n${'b'.repeat(600)}`, ancestors: 'b'.repeat(600), summary: 's', rules: '', workingFindings: '' }))
  };
}

const PINS = {
  "repair": {
    "state-question": "ca17c00fc8c08294586e95faacae9669bd68b7fa069ef037471a5b26abffcae8",
    "state-question-default-rationale": "ec9bdeed501d58e2230c55ef5132763bdb216388969567a7aff7632d9e514afb",
    "imposed-options": "da5ab83a3342603a895bd592796cd77d90f9338f61b03a39f772797427aa9a0f",
    "imposed-options-default-rationale": "f04843f04b1b646d93c001a050d11d580379d74db5d3789fe4f5f6a6d54d30d6",
    "missing-choices": "907339b769b6614b214bb7eb048516aff1e09fffb2c559d9e31c403d46bb1dea",
    "answered-without-target": "0cd72d4cf26850e43e9ecc5a8ce63d28009599a39e6befe74df8af0991586938",
    "preserve-decision": "f4a6e1b639bcbc09a2c5054bc65ebe1c80951f2ec8c243c151062821ed43fee2",
    "no-decision": "c0e51b27d704d01a94eee070591629b4d6994d749ae0d1e6ef705d868a2453bf"
  },
  "delivery": {
    "mapped": [
      "7a29389865cbc7a695f3988f99ba39d4a1d7b66b1c20f2a9fe27ba9a7126f138",
      "9b8289f160e654474dab0a4adf82819e9e46fc1d361cbac1fc5d2371353dd905",
      "b40deefa24ee2bd4c5f9a0fc87e6c303f2db49066b128b5c03b16a92cede3451",
      "e4fb1604b7a3c470fdf61a5d097d9ac72d52328d6b9fc525937e6f3e895a710f"
    ],
    "unmapped": [
      "7a29389865cbc7a695f3988f99ba39d4a1d7b66b1c20f2a9fe27ba9a7126f138",
      "19ccb7a2920e076fd7125f009f45b5d6ec12ead1211f55938fc09cd477008ec0",
      "edc8f32d42f6d481ae9097ff102d838ed58e689b43f27c6b203074fb46ff6b04"
    ],
    "legacy": [
      "0144597dc01e38dd83ef6b2c501d181f73efeb11237e77ac1bbe75370840d9b3",
      "abf7d0a43a99d0bf7dbdf023790127ca200a3d6d82a93a2833b0ee55d8325d09",
      "c41cc593b1e7b3f950ecf0229b69bc88f2040f6436ccda3d240f9e849889a12e",
      "7f8097ab6624c7837dc6d70882f38248dcfe619d0411c542927e92eecb975ef8"
    ],
    "reused": [
      "0144597dc01e38dd83ef6b2c501d181f73efeb11237e77ac1bbe75370840d9b3",
      "b9b5b6045d55c6c3d036cb7bc6db171aa7a6998f7e45be81706759681489a9d1",
      "6f9bad8888b16e29fa4e7e5eeed285587282f905782802e0c414531688d208bb"
    ]
  },
  "shared": {
    "PLANNER_COVERAGE_RULE": "d832692b73cbf2f9d6cdf33424539b805403755e47f6266ab2247ac73f2a7633",
    "SEARCHER_TARGET_RULE": "479ffed0dc54cdba83d20a3b5686e7eb10fcf1e6ef623daaaf3aa5b160ca29d1",
    "USER_QUESTION_RULE": "b7b515396cceea31cbddfec5e1ab1d4297b6bc511e26059dacfce1f330e5116c",
    "FLOOR_ASK_RULE": "b3b7560d9f7434e39c66b41e66c616199aeef09783d99c3da93b28f413fe77ca",
    "OUTCOME_EXPECTATION_RULE": "c73643d125886865fc0109ac8e7e9743f4fe43e780da160a781cb60d8c1c2a92",
    "EVIDENCE_LOOKUP_RULE": "b7a42d46a33d3f66a3dd6f1c86e3bbda6ef32dd96c5cc0944b4c0cb1572200ab",
    "EVIDENCE_LOOKUP_FIELD_RULE": "5a4b8bda93af1f26191fbc01455690a262fb3f17cf3bfec096d4d30f1781e49b",
    "evidenceCard-urls": "826c4a33636868fe1b00f550f8f73630880ae20004fcd987e078b2595d1d55e0",
    "evidenceCard-empty": "ed2fefb198c0b6fe4f125d6f0bf414168c4b2d0314b0bc63b25140da4a36ab9c",
    "dedup": "3f791d3e8de8cc6c8d8a847a08efc6d2ee3e2b5aff4d3c31425fc88951454852"
  }
};

test('Planner format-repair task texts render byte-identical to the pre-template code', async () => {
  const { tasks, options } = await repairTasks();
  assert.deepEqual(Object.fromEntries(Object.entries(tasks).map(([name, text]) => [name, sha(text)])), PINS.repair);
  assert.equal(JSON.stringify(options['answered-without-target']), '{"excludeDecisions":["research_more"]}', 'the answered-without-target repair still excludes research_more');
});

test('final-delivery task texts render byte-identical to the pre-template code (mapped, unmapped, legacy and reused-evidence scenarios)', async () => {
  const tasks = await deliveryTasks();
  assert.deepEqual(Object.fromEntries(Object.entries(tasks).map(([name, list]) => [name, list.map(sha)])), PINS.delivery);
});

test('shared AIM rules, evidence cards and passage references keep their exported names and values', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(sharedTexts()).map(([name, text]) => [name, sha(text)])), PINS.shared);
});

test('the AIM delivery step templates exist, every shared fragment is imported, and no whole-file allowlist is used', () => {
  const steps = path.join(root, 'experiences', 'aim', 'steps');
  for (const directory of ['format-repair', 'delivery-outline', 'delivery-research', 'delivery-writing', 'delivery-acceptance', '_shared'])
    assert.ok(fs.readdirSync(path.join(steps, directory)).some(name => name.endsWith('.md')), `${directory} has templates`);
  const shared = path.join(steps, '_shared');
  const source = fs.readFileSync(path.join(shared, 'rules.ts'), 'utf8') + fs.readFileSync(path.join(shared, 'evidence-card.ts'), 'utf8');
  for (const name of fs.readdirSync(shared).filter(item => item.endsWith('.md'))) assert.ok(source.includes(`./${name}`), `${name} is imported by a _shared module`);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'literal-scan', 'aim-delivery.json'), 'utf8'));
  for (const entry of config.allow) assert.ok(entry.text, `${entry.file}: allowlist entries are per-literal prefixes`);
});
