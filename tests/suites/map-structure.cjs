// Map structure proposals (Phase C): the proposal list's kinds, the AI outline generator in the import window and
// in quick-explore, and the AI structure review. Dialogs run against tests/support-dom.cjs; the AI is a fake.
const assert = require('node:assert/strict');
const { test, integrationTest, load, plain, obsidian } = require('../support.cjs');
const dom = require('../support-dom.cjs');
const { hasCls, element, find, findAll, button, tick } = dom;

// ---- C1: proposal kinds ----------------------------------------------------------------------------------------
const proposals = () => load('experiences/visual-map/modals.ts', { obsidian });

test('proposal list: add, move, merge and remove each show their kind and reason', () => {
  const { renderProposalList } = proposals();
  const parent = element('div');
  renderProposalList(parent, [
    { kind: 'add', title: 'Sleep stages', task: 't', contribution: '', parentTitle: '', reason: 'The branch lacks the basics.' },
    { kind: 'move', title: 'Naps', task: '', contribution: '', parentTitle: '', reason: 'Belongs under habits.', destination: 'Habits' },
    { kind: 'merge', title: 'REM', task: '', contribution: '', parentTitle: '', reason: 'Same as dreaming.', destination: 'Dreaming' },
    { kind: 'remove', title: 'Misc', task: '', contribution: '', parentTitle: '', reason: 'Adds nothing.' }
  ], () => {});
  const rows = findAll(parent, i => hasCls(i, 'vam-proposal'));
  assert.deepEqual(rows.map(row => find(row, i => hasCls(i, 'vam-proposal-kind')).text), ['Add', 'Move', 'Merge', 'Remove']);
  assert.deepEqual(rows.map(row => find(row, i => hasCls(i, 'vam-proposal-kind')).cls.split(' ')[1]), ['vam-proposal-kind-add', 'vam-proposal-kind-move', 'vam-proposal-kind-merge', 'vam-proposal-kind-remove']);
  assert.deepEqual(rows.map(row => find(row, i => hasCls(i, 'vam-proposal-reason')).text), ['The branch lacks the basics.', 'Belongs under habits.', 'Same as dreaming.', 'Adds nothing.']);
  assert.equal(find(rows[1], i => hasCls(i, 'vam-proposal-destination')).text, 'To: Habits');
  assert.equal(find(rows[2], i => hasCls(i, 'vam-proposal-destination')).text, 'Into: Dreaming');
  // Only a new topic can be renamed or given a task; the others name an existing card.
  assert.deepEqual(rows.map(row => find(row, i => hasCls(i, 'vam-proposal-title')).readOnly), [false, true, true, true]);
  assert.deepEqual(rows.map(row => !!find(row, i => hasCls(i, 'vam-proposal-more'))), [true, false, false, false]);
});

test('proposal list: an add-only list renders as before, with no kind badge or reason', () => {
  const { renderProposalList } = proposals();
  const parent = element('div');
  const list = renderProposalList(parent, [{ title: 'Heat', task: 'Why', contribution: 'Base', parentTitle: '' }], () => {});
  assert.equal(find(parent, i => hasCls(i, 'vam-proposal-kind') || hasCls(i, 'vam-proposal-reason') || hasCls(i, 'vam-proposal-destination')), undefined);
  assert.ok(find(parent, i => hasCls(i, 'vam-proposal-more')));
  assert.equal(JSON.stringify(list.selected()), JSON.stringify([{ title: 'Heat', task: 'Why', contribution: 'Base', parentTitle: '' }]));
});

test('proposal list: keyed rows link children by key, so repeated titles stay in their own branch', () => {
  const { renderProposalList } = proposals();
  const parent = element('div');
  const list = renderProposalList(parent, [
    { key: '1', parentKey: '', title: 'Body', task: '', contribution: '' },
    { key: '2', parentKey: '1', title: 'Definition', task: '', contribution: '' },
    { key: '3', parentKey: '', title: 'Mind', task: '', contribution: '' },
    { key: '4', parentKey: '3', title: 'Definition', task: '', contribution: '' }
  ], () => {}, { compact: true });
  const rows = findAll(parent, i => hasCls(i, 'vam-proposal'));
  assert.deepEqual(rows.map(row => find(row, i => hasCls(i, 'vam-proposal-title')).value), ['Body', 'Definition', 'Mind', 'Definition']);
  assert.equal(find(parent, i => hasCls(i, 'vam-proposal-more')), undefined, 'compact rows have no details');
  const checks = findAll(parent, i => i.type === 'checkbox');
  checks[2].checked = false; checks[2].change();
  assert.deepEqual(checks.map(c => c.checked), [true, true, false, false], 'only the second Definition follows its parent');
  assert.equal(JSON.stringify(list.selected().map(item => [item.key, item.parentKey, item.title, item.parentTitle])), JSON.stringify([['1', '', 'Body', ''], ['2', '1', 'Definition', 'Body']]));
});

test('proposal list: review mode has no checkboxes and hands each row to the caller', () => {
  const { renderProposalList } = proposals();
  const parent = element('div');
  const handed = [];
  renderProposalList(parent, [
    { kind: 'remove', title: 'Misc', task: '', contribution: '', reason: 'r' },
    { kind: 'add', title: 'New', task: '', contribution: '', reason: 'r' }
  ], () => {}, { compact: true, apply: (item, row) => { handed.push(item.title); row.head.createEl('button', { text: 'Apply' }); } });
  assert.deepEqual(handed, ['Misc', 'New']);
  assert.ok(findAll(parent, i => i.type === 'checkbox').every(c => c.hidden && !c.checked));
  assert.equal(find(parent, i => hasCls(i, 'vam-proposal-toolbar')).hidden, true);
  assert.equal(findAll(parent, i => i.tag === 'button' && i.text === 'Apply').length, 2);
});

integrationTest('the plugin constructs the outline generator and the structure review next to reframing', () => {
  const { default: Plugin } = load('main.ts', { obsidian });
  const plugin = new Plugin();
  assert.equal(plugin.outlineGeneration.constructor.name, 'OutlineGenerationService');
  assert.equal(plugin.structureReview.constructor.name, 'StructureReviewService');
  assert.equal(typeof plugin.outlineGeneration.generate, 'function');
  assert.equal(typeof plugin.structureReview.review, 'function');
});


// ---- C2: AI outline in the import window ------------------------------------------------------------------------
function importHarness({ generate, presets = [], initialTopic = 'Sleep', language = 'en' } = {}) {
  const Modal = dom.makeModal();
  const notices = [];
  const mod = load('experiences/visual-map/outline-import-modal.ts', { obsidian: { ...obsidian, Modal, Notice: class { constructor(m) { notices.push(m); } } } });
  const host = { settings: { language, promptPresets: presets }, saves: 0, async saveSettings() { this.saves++; } };
  const requests = [], created = [];
  const generator = { presets: host, initialTopic, generate: generate ?? (async (request) => { requests.push(request); return '# Sleep\n## Stages\n### REM\n'; }) };
  const modal = new mod.OutlineImportModal({}, async request => { created.push(request); }, undefined, [], { map: 'editable' }, 'tree', generator);
  modal.open();
  const ai = find(modal.contentEl, i => i.tag === 'details' && hasCls(i, 'vam-outline-ai'));
  const status = () => find(ai, i => hasCls(i, 'vam-outline-ai-status')).text;
  const textarea = () => find(modal.contentEl, i => hasCls(i, 'vam-outline-text'));
  return { modal, host, requests, created, ai, status, textarea, notices };
}
const byLabel = (root, label) => find(root, i => i.attrs['aria-label'] === label);

test('outline import: AI fills the outline box from a topic and preset; nothing is added until the user confirms', async () => {
  const h = importHarness({ presets: [{ id: 'mine', kind: 'outline', name: 'Mine', text: 'Short tree for {research topic}' }, { id: 'tone', kind: 'tone', name: 'Tone', text: 'x' }] });
  assert.equal(find(h.ai, i => i.tag === 'summary').text, 'Generate an outline with AI');
  assert.equal(byLabel(h.ai, 'Research topic').value, 'Sleep', 'the selected topic is offered');
  const select = byLabel(h.ai, 'Outline preset');
  assert.deepEqual(plain(select.children.map(o => o.text)), ['Knowledge tree generator', 'Mine'], 'outline presets only');
  assert.equal(select.value, 'knowledge-tree');
  button(h.ai, 'Generate outline').click(); await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].topic, 'Sleep');
  assert.match(h.requests[0].presetText, /Knowledge Tree Generator/);
  assert.equal(h.textarea().value, '# Sleep\n## Stages\n### REM');
  assert.ok(find(h.modal.contentEl, i => i.text === '3 topics, 3 levels'), 'previewed like pasted text');
  assert.equal(h.status(), '3 headings filled in below. Edit them before adding.');
  assert.deepEqual(h.created, [], 'generating writes nothing');
  // The user edits the result before adding it.
  h.textarea().value = '# Sleep\n## Stages'; h.textarea().fire('input');
  button(h.modal.modalEl, 'Add to mind map').click(); await tick();
  assert.deepEqual(plain(h.created[0].nodes.map(node => node.title)), ['Sleep', 'Stages']);
  assert.equal(h.created[0].source, null);
});

test('outline import: an empty topic, a rejected reply and Stop each leave the outline box alone and say why', async () => {
  const empty = importHarness({ initialTopic: '' });
  button(empty.ai, 'Generate outline').click(); await tick();
  assert.equal(empty.requests.length, 0); assert.equal(empty.status(), 'Enter a research topic before generating an outline.');
  const bad = importHarness({ generate: async () => { throw new Error('The AI returned text that is not a heading (1 lines); only headings are accepted.'); } });
  bad.textarea().value = '# Mine'; bad.textarea().fire('input');
  button(bad.ai, 'Generate outline').click(); await tick();
  assert.equal(bad.textarea().value, '# Mine');
  assert.match(bad.status(), /not a heading/);
  let signal;
  const stop = importHarness({ generate: (_request, s) => { signal = s; return new Promise((_resolve, reject) => s.addEventListener('abort', () => reject(new Error('aborted')))); } });
  button(stop.ai, 'Generate outline').click(); await tick();
  assert.equal(stop.status(), 'AI is writing the outline…');
  button(stop.ai, 'Stop').click(); await tick();
  assert.equal(signal.aborted, true); assert.equal(stop.status(), 'Outline generation stopped.');
  assert.ok(button(stop.ai, 'Generate outline'), 'ready to run again');
  const closing = importHarness({ generate: (_request, s) => { signal = s; return new Promise(() => {}); } });
  button(closing.ai, 'Generate outline').click(); closing.modal.close();
  assert.equal(signal.aborted, true, 'closing the window stops the generation');
});

test('outline import: presets can be edited for one run, saved as a new preset, saved and deleted (asks twice)', async () => {
  const h = importHarness();
  const select = byLabel(h.ai, 'Outline preset');
  const editor = find(h.ai, i => hasCls(i, 'vam-outline-ai-editor'));
  assert.equal(editor.hidden, true);
  button(h.ai, 'Edit').click();
  assert.equal(editor.hidden, false);
  const text = byLabel(editor, 'Preset instructions'), name = byLabel(editor, 'Preset name');
  assert.equal(button(editor, 'Save').disabled, true, 'a built-in cannot be overwritten');
  assert.equal(button(h.ai, 'Delete').disabled, true, 'nor deleted');
  assert.equal(name.value, 'Knowledge tree generator copy');
  // An unsaved edit is used for the next run only.
  text.value = 'Edited for {research topic}';
  button(h.ai, 'Generate outline').click(); await tick();
  assert.equal(h.requests[0].presetText, 'Edited for {research topic}');
  assert.equal(h.host.saves, 0);
  // Save as a new custom preset; it becomes the selection.
  name.value = 'Brief tree';
  button(editor, 'Save as new preset').click(); await tick();
  assert.deepEqual(plain(h.host.settings.promptPresets.map(p => [p.kind, p.name, p.text])), [['outline', 'Brief tree', 'Edited for {research topic}']]);
  const id = h.host.settings.promptPresets[0].id;
  assert.equal(select.value, id); assert.equal(h.status(), 'Preset saved.');
  // Edit and save the custom one.
  assert.equal(button(editor, 'Save').disabled, false);
  byLabel(editor, 'Preset instructions').value = 'Tighter'; byLabel(editor, 'Preset name').value = 'Brief';
  button(editor, 'Save').click(); await tick();
  assert.deepEqual(plain(h.host.settings.promptPresets[0]), { id, kind: 'outline', name: 'Brief', text: 'Tighter' });
  // Delete asks twice.
  const remove = button(h.ai, 'Delete');
  remove.click(); await tick();
  assert.equal(h.host.settings.promptPresets.length, 1, 'the first press only arms');
  assert.equal(remove.text, 'Delete preset?');
  assert.match(h.status(), /Press again within 5 seconds/);
  remove.click(); await tick();
  assert.deepEqual(plain(h.host.settings.promptPresets), []);
  assert.equal(select.value, 'knowledge-tree');
  assert.equal(h.host.saves, 3);
  h.modal.close();
});

test('built-in outline presets put the topic into their placeholder in both languages', () => {
  const presets = load('ai/prompt-presets.ts');
  const outline = load('core/outline-generation-service.ts', { obsidian });
  for (const language of ['en', 'zh-TW']) {
    const [preset] = presets.builtinPresets(language, 'outline');
    const text = outline.applyTopicToPreset(preset.text, 'Sleep', language);
    assert.ok(text.includes('"Sleep"'), language);
    assert.equal(text.includes(presets.OUTLINE_TOPIC_PLACEHOLDER[language]), false, `${language}: no placeholder left`);
  }
});

// ---- C2: quick explore in the Next Step dialog --------------------------------------------------------------------
function quickHarness(quickOutline) {
  const notices = [];
  const Modal = dom.makeModal();
  const { NextStepModal } = load('main.ts', { obsidian: { ...obsidian, Modal, setIcon: () => {}, Notice: class { constructor(message) { notices.push(message); } } } });
  const modelState = provider => ({ provider, status: 'ready', models: provider === 'codex' ? ['gpt-test'] : [] });
  const plugin = { settings: { codexUsageNoticeSeen: true, claudeUsageNoticeSeen: true, models: 'gpt-test', cliModel: 'gpt-test', cliReasoning: 'low', language: 'en' },
    aiReadyForModel: async () => true, confirmAiUsage: async (_model, run) => { await run(); return true; }, saveSettings: async () => {}, activeTasks: new Map(), availableModels: () => ['gpt-test'], modelLabel: model => model,
    modelDiscoveryState: modelState, subscribeModelDiscovery: () => () => {}, refreshModelDiscovery: async provider => modelState(provider) };
  const expandCalls = [];
  const modal = new NextStepModal({}, 'Sleep', 'normal', 0, 0, plugin, async () => {}, async options => { expandCalls.push(options); }, async () => {},
    { model: 'gpt-test', modelSource: 'workspace', reasoning: 'low', save: async () => {}, topicStatus: 'completed', quickOutline });
  modal.open();
  const actions = () => find(modal.modalEl, i => hasCls(i, 'vam-next-actions'));
  const adjust = find(modal.contentEl, i => i.tag === 'details' && hasCls(i, 'vam-next-adjust'));
  button(adjust, 'Quickly explore a map').click();
  return { modal, notices, actions, adjust, expandCalls };
}
const outlineNodes = (markdown) => plain(load('experiences/visual-map/outline-import.ts', { obsidian }).parseOutline(markdown).nodes);

integrationTest('quick explore: the outline generator with a preset select replaces the number fields', () => {
  const h = quickHarness({ presets: [{ id: 'knowledge-tree', name: 'Knowledge tree generator' }, { id: 'mine', name: 'Mine' }], generate: async () => [], create: async () => {} });
  const limits = find(h.adjust, i => hasCls(i, 'vam-quick-limits'));
  assert.equal(hasCls(limits, 'is-hidden'), false);
  assert.deepEqual(plain(byLabel(limits, 'Outline preset').children.map(o => o.text)), ['Knowledge tree generator', 'Mine']);
  assert.equal(findAll(limits, i => i.tag === 'input' && i.type === 'number').length, 0, 'no level or count fields');
  assert.equal(button(h.actions(), 'Generate outline').hidden, false);
});

integrationTest('quick explore: the generated outline is reviewed in the dialog before anything is created', async () => {
  const requests = [], created = [];
  const h = quickHarness({
    presets: [{ id: 'knowledge-tree', name: 'Knowledge tree generator' }, { id: 'mine', name: 'Mine' }],
    generate: async (request, signal) => { requests.push({ ...request, signal }); return outlineNodes('# Sleep\n## Body\n### Definition\n## Mind\n### Definition'); },
    create: async (nodes, options) => { created.push({ nodes, options }); }
  });
  byLabel(h.adjust, 'Outline preset').value = 'mine';
  button(h.actions(), 'Generate outline').click(); await tick(); await tick();
  assert.equal(requests.length, 1); assert.equal(requests[0].presetId, 'mine'); assert.equal(requests[0].language, 'en');
  assert.deepEqual(created, [], 'nothing is created before review');
  assert.equal(h.expandCalls.length, 0, 'the old quick expansion is not used');
  const titles = findAll(h.modal.contentEl, i => hasCls(i, 'vam-proposal-title')).map(i => i.value);
  assert.deepEqual(titles, ['Body', 'Definition', 'Mind', 'Definition'], 'the topic itself is not proposed again');
  // Uncheck one branch and rename a row, then create.
  const checks = findAll(h.modal.contentEl, i => i.type === 'checkbox' && hasCls(i.parent ?? {}, 'vam-proposal-head'));
  checks[2].checked = false; checks[2].change();
  findAll(h.modal.contentEl, i => hasCls(i, 'vam-proposal-title'))[1].value = 'What it is';
  button(h.modal.contentEl, 'Create subtopics (2)').click(); await tick(); await tick();
  assert.equal(created.length, 1);
  assert.deepEqual(plain(created[0].nodes.map(node => [node.index, node.title, node.parent])), [[0, 'Body', null], [1, 'What it is', 0]]);
  assert.equal(h.modal.closeCount, 1); assert.ok(h.notices.includes('Subtopics created.'));
});

integrationTest('quick explore: closing the dialog while the outline is generated stops it and writes nothing', async () => {
  let signal; const created = [];
  const h = quickHarness({ presets: [{ id: 'knowledge-tree', name: 'Knowledge tree generator' }], generate: (_request, s) => { signal = s; return new Promise(resolve => s.addEventListener('abort', () => resolve(outlineNodes('# Sleep\n## Late')))); }, create: async nodes => { created.push(nodes); } });
  button(h.actions(), 'Generate outline').click(); await tick(); await tick();
  h.modal.close(); await tick(); await tick();
  assert.equal(signal.aborted, true);
  assert.deepEqual(created, []);
  assert.equal(findAll(h.modal.contentEl, i => hasCls(i, 'vam-proposal')).length, 0, 'no review shown in the closed dialog');
});

test('outline proposals round-trip: the root is dropped, keys keep repeated titles apart, parents come first', () => {
  const { outlineProposals, proposalOutline } = load('experiences/visual-map/modals.ts', { obsidian });
  const items = outlineProposals(outlineNodes('# Root\n## A\n### Same\n## B\n### Same'));
  assert.equal(JSON.stringify(items.map(i => [i.key, i.parentKey, i.title])), JSON.stringify([['1', '', 'A'], ['2', '1', 'Same'], ['3', '', 'B'], ['4', '3', 'Same']]));
  const nodes = proposalOutline([items[2], items[3]]);
  assert.equal(JSON.stringify(nodes.map(n => [n.index, n.title, n.parent, n.level])), JSON.stringify([[0, 'B', null, 1], [1, 'Same', 0, 2]]));
  assert.throws(() => proposalOutline([items[3]]), /parent/);
});
