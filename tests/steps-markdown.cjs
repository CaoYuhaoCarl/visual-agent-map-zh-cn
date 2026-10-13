// Markdown context steps: the plan, transform, caption and preset steps, and the model call through the Step Runner.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, root } = require('./support-replay.cjs');
const { runPanel } = require('./support-selection-ai.cjs');

const obsidian = { requestUrl: async () => ({ text: '{}' }) };
const { planStep } = load('experiences/markdown-context/steps/plan/step.ts', { obsidian });
const { transformStep } = load('experiences/markdown-context/steps/transform/step.ts');
const { captionStep } = load('experiences/markdown-context/steps/caption/step.ts');
const presets = load('experiences/markdown-context/steps/presets/step.ts');
const { StepRunner, prepareStep } = load('core/step-runner.ts');

test('step ids and versions', () => {
  const ids = [planStep, transformStep, captionStep, ...Object.values(presets)].map(step => `${step.id}@${step.version}`);
  assert.deepEqual(ids.sort(), ['markdown.caption@1', 'markdown.plan@1', 'markdown.preset.condense@1', 'markdown.preset.explain-image@1', 'markdown.preset.search-images@1', 'markdown.preset.translate-image@1', 'markdown.preset.translate@1', 'markdown.transform@1']);
});

test('the plan step parses a valid plan and refuses an invalid one with the original error', () => {
  const reply = JSON.stringify({ action: 'research', query: 'q', instruction: 'i', placement: 'after', captionInstruction: '' });
  const prepared = prepareStep(planStep, { instruction: 'x', selected: 's', context: 'c', hasImage: false });
  assert.equal(prepared.parse('```json\n' + reply + '\n```').action, 'research');
  assert.throws(() => prepared.parse('{"action":"nope"}'), /Invalid AI action plan/);
});

test('the transform step adds the research, diagram and image notes only when they apply', () => {
  const render = (action, hasImage) => transformStep.render({ instruction: 'Do "it"', selected: 'Line\nTwo', context: 'near', action, hasImage });
  const plain = render('transform', false);
  assert.ok(plain.includes('User request (JSON string): "Do \\"it\\""\n\nSelected text (JSON string): "Line\\nTwo"\nNearby context (untrusted JSON): "near"\n'));
  assert.ok(plain.endsWith('"near"\n\n\n'), 'three empty optional lines keep the original joined shape');
  assert.match(render('research', false), /Use web search to answer\./);
  assert.match(render('diagram', false), /fenced mermaid diagram/);
  assert.match(render('transform', true), /attached image is source data/);
  assert.doesNotMatch(plain, /Use web search|mermaid|attached image/);
});

test('preset steps render by language and fill the translation target', () => {
  assert.equal(presets.translatePresetStep.render({ language: 'en', target: 'English' }), 'Translate the selected text into English. Preserve names and formatting where possible.');
  assert.equal(presets.translatePresetStep.render({ language: 'zh-TW', target: 'English' }), '將選取文字翻譯成English，並盡可能保留名稱與格式。');
  assert.equal(presets.condensePresetStep.render({ language: 'zh-TW' }), '收斂選取文字，保留核心意思與重要條件。');
});

test('the caption step quotes the caption request and names the default language', () => {
  assert.match(captionStep.render({ captionInstruction: 'Chinese caption', language: 'English' }), /^The image has already been retrieved\. Apply only this caption request: "Chinese caption"\. .*default to English only when/);
});

test('a prepared markdown step goes through the Step Runner with its label', async () => {
  const calls = [];
  const runner = new StepRunner({ complete: async call => { calls.push(call); return 'reply'; } });
  const sent = await runner.send(prepareStep(captionStep, { captionInstruction: 'c', language: 'English' }), { model: 'm' });
  assert.equal(sent.raw, 'reply');
  assert.equal(calls[0].stepId, 'markdown.caption'); assert.equal(calls[0].version, 1);
});

test('the panel hands prepared steps to run: plan first, then transform', async () => {
  const reply = JSON.stringify({ action: 'transform', query: '', instruction: 'Shorter', placement: 'after', captionInstruction: '' });
  const sent = await runPanel({ markdown: 'A.\nSelected.\nB.', selected: 'Selected.', replies: [reply, 'Done.'], steps: true });
  assert.deepEqual(sent.map(item => item.step), ['markdown.plan@1', 'markdown.transform@1']);
});

test('the five context_ai prompt keys are gone from i18n and nothing in the plugin reads them', () => {
  const keys = ['condense', 'translate', 'translate_image', 'search_images', 'explain_image'].map(name => `prompt.context_ai_${name}`);
  const i18n = fs.readFileSync(path.join(root, 'i18n.ts'), 'utf8');
  for (const key of keys) assert.ok(!i18n.includes(`"${key}"`), key);
  for (const directory of ['experiences/markdown-context', '.']) {
    const files = directory === '.' ? ['main.ts'] : fs.readdirSync(path.join(root, directory), { recursive: true }).filter(name => name.endsWith('.ts')).map(name => path.join(directory, name));
    for (const file of files) { const text = fs.readFileSync(path.join(root, file), 'utf8'); for (const key of keys) assert.ok(!text.includes(key), `${file} still mentions ${key}`); }
  }
});

test('the markdown call site in main.ts uses the Step Runner and the shared runtime provider only', () => {
  const main = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');
  const start = main.indexOf('private async runMarkdownContextAi'), end = main.indexOf('private async markdownContextImage');
  const body = main.slice(start, end > start ? end : start + 4000);
  assert.ok(start >= 0 && body.includes('runtimeStepProvider(') && body.includes('.send(prepared'));
  assert.ok(!/\.runTask\(/.test(body), 'the call site does not call runTask itself');
});

test('image search keeps Commons thumbnails from thumb and upload hosts and drops other hosts and types', async () => {
  const page = (id, thumburl, mime = 'image/jpeg') => [id, { title: `File:${id}.jpg`, imageinfo: [{ thumburl, mime, descriptionurl: `https://commons.wikimedia.org/wiki/File:${id}.jpg` }] }];
  const pages = Object.fromEntries([
    page('thumb', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/640px-x.jpg'),
    page('upload', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/y.jpg'),
    page('other', 'https://example.org/z.jpg'),
    page('svg', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/z.svg', 'image/svg+xml')
  ]);
  const { searchImages } = load('experiences/markdown-context/action-plan.ts', { obsidian: { requestUrl: async () => ({ text: JSON.stringify({ query: { pages } }) }) } }, { URL, URLSearchParams });
  const found = await searchImages('fried egg', new AbortController().signal);
  assert.deepEqual([...found.map(item => item.title)], ['thumb.jpg', 'upload.jpg']);
});
