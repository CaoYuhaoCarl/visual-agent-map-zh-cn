// Generated note layout: the answer comes first, internal review text stays out of Detail, and Detail headings sit
// below "## Detail" without skipped levels.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promptsFor, makeService } = require('./support-replay.cjs');
const support = require('./support.cjs');
const { load, obsidian } = support;

const reply = detail => JSON.stringify({ summary: 'S', detail, suggestions: [], visualReferences: [] });
const ask = async (context, detail) => {
  const runtime = { runTask: async () => reply(detail) };
  return makeService(runtime, { language: 'en' }).askModel({ title: 'T', summary: '', rules: '', detail: '', task: 'X', ancestors: '', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', outputLanguage: 'en', ...context }, 'gpt-6-luna', 'low');
};

test('P1-b: reader-facing detail headings start at ### and never skip a level', async () => {
  const written = '## Route overview\n\ntext\n\n#### Meals\n\n- a\n\n```md\n## not a heading\n```\n\n## Checklist\n\n###### Deep';
  const expected = '### Route overview\n\ntext\n\n#### Meals\n\n- a\n\n```md\n## not a heading\n```\n\n### Checklist\n\n#### Deep';
  assert.equal((await ask({ mode: undefined, detailFormat: 'adaptive' }, written)).detail, expected);
  assert.equal((await ask({ mode: 'task', promptProfile: 'aim', task: '<!-- aim-phase: delivery-writing -->\nWrite.', detailFormat: 'adaptive' }, written)).detail, expected);
  assert.equal((await ask({ mode: undefined, detailFormat: 'adaptive' }, '# Title\n\n## Part\n\n### Sub')).detail, '### Title\n\n#### Part\n\n##### Sub');
  // Machine-read structures of control phases keep their headings.
  assert.equal((await ask({ mode: 'task', promptProfile: 'aim', task: '<!-- aim-phase: delivery-outline -->\nOutline.' }, written)).detail, written);
  assert.equal((await ask({ mode: 'decompose' }, written)).detail, written);
});

test('P0/P1-b: reader-facing prompts forbid internal IDs and review comments and ask for headings from ###', async () => {
  for (const [language, rules] of [['en', ['internal IDs', 'level-three']], ['zh-TW', ['內部 ID', '三級標題']]]) {
    const prompt = (await promptsFor({ title: 'T', summary: 'S', rules: '', detail: 'D', task: 'X', ancestors: '', mode: 'task', researchMode: 'local', researchDepth: 'fast', visualMode: 'off', outputLanguage: language }, { language })).at(-1).prompt;
    for (const rule of rules) assert.ok(prompt.includes(rule), `${language}: ${rule}`);
  }
});

test('P0: an AIM delivery task asks for ### section headings', () => {
  const { renderWritingTask } = load('experiences/aim/steps/delivery-writing/step.ts');
  const task = renderWritingTask({ outline: 'A; B', knownConditions: 'C', evidence: 'E' });
  assert.match(task, /each section heading as a ### heading/);
});

test('P0: the open items marker is kept outside the Detail block and still read back', async () => {
  const { openItemsMarker, readOpenItems } = load('experiences/aim/manual-flow.ts', { obsidian });
  const { repo, contents } = support.fixture('en');
  const note = await support.topicNote(repo);
  await repo.updateNote(note.path, { detail: `### Answer\n\nBody.\n\n${openItemsMarker(['Budget'])}` });
  const markdown = contents.get(note.path);
  const block = markdown.slice(markdown.indexOf('<!-- visual-agent-map:detail:start -->'), markdown.indexOf('<!-- visual-agent-map:detail:end -->'));
  assert.ok(!block.includes('aim-open-items'), 'the marker is not inside the Detail block');
  assert.match(markdown, /<!-- aim-open-items \["Budget"\] -->/, 'the marker is saved in the note');
  assert.deepEqual([...readOpenItems((await repo.readNote(note.path)).detail)], ['Budget']);
  // A new detail without open items drops the old marker.
  await repo.updateNote(note.path, { detail: '### Answer\n\nRevised.' });
  assert.ok(!contents.get(note.path).includes('aim-open-items'));
  // A note saved before this change (marker inside the block) still reads.
  const legacy = markdown.replace(/\n*<!-- aim-open-items[^\n]*-->/, '').replace('Body.', `Body.\n\n${openItemsMarker(['Legacy'])}`);
  contents.set(note.path, legacy);
  assert.deepEqual([...readOpenItems((await repo.readNote(note.path)).detail)], ['Legacy']);
});

test('P1-a: the answer comes before Preview and Prompt, and an empty Prompt is left out', async () => {
  const { repo, contents } = support.fixture('en');
  const note = await support.topicNote(repo);
  await repo.updateNote(note.path, { summary: 'One-line answer.', detail: '### Answer\n\nBody.' });
  let markdown = contents.get(note.path);
  const at = heading => markdown.search(new RegExp(`^## ${heading}\\s*$`, 'm'));
  assert.ok(at('Current Summary') >= 0 && at('Current Summary') < at('Detail'), 'summary, then Detail');
  assert.ok(at('Detail') < at('Preview'), 'Detail before Preview');
  assert.equal(at('Prompt'), -1, 'an empty Prompt section is not written');
  assert.equal((await repo.readNote(note.path)).prompt, '');
  await repo.updateNote(note.path, { prompt: 'Research the route.' });
  markdown = contents.get(note.path);
  assert.ok(at('Prompt') > at('Detail'), 'a Prompt with text comes after Detail');
  assert.equal((await repo.readNote(note.path)).prompt, 'Research the route.');
});

test('P0: the rejected-document warning lists what to fix in reader wording, without internal IDs', () => {
  const { rejectedDeliveryWarning } = load('experiences/aim/rejected-warning.ts');
  const zh = rejectedDeliveryWarning(['高雄鹽埕／鼓山一帶單人住宿候選', '依 9a7207f4-…-v3、64442f66-…-v5 補租車規定', '高雄鹽埕／鼓山一帶單人住宿候選'], 'zh-TW');
  assert.match(zh, /^> \[!warning\] 這份文件未通過最終審查\n/);
  assert.match(zh, /^> - 高雄鹽埕／鼓山一帶單人住宿候選$/m);
  assert.match(zh, /^> - 依 補租車規定$|^> - 補租車規定$/m);
  assert.equal((zh.match(/高雄鹽埕/g) ?? []).length, 1, 'each item once');
  assert.ok(!/[0-9a-f]{8}-/.test(zh), 'no internal IDs');
  assert.match(rejectedDeliveryWarning(['Commute'], 'en'), /^> \[!warning\] This document did not pass the final review\n(?:>.*\n)*> - Commute$/);
  assert.equal(rejectedDeliveryWarning([], 'en'), '');
});
