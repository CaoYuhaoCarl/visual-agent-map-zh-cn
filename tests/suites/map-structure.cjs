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

// ---- C3: AI structure review --------------------------------------------------------------------------------------
const { fixture, core, DEFAULT_SETTINGS, withExpansionCoordinator, until } = require('../support.cjs');

// The window alone, against a fake host.
function windowHarness({ review, stale = () => null, apply } = {}) {
  const Modal = dom.makeModal();
  const mod = load('experiences/visual-map/structure-review-modal.ts', { obsidian: { ...obsidian, Modal } });
  const calls = { review: 0, apply: [], highlight: [] };
  const titles = { root: 'Sleep', a: 'Body', b: 'Mind', c: 'REM', d: 'Dreams' };
  const host = {
    scope: 'map',
    review: review ?? (async () => { calls.review++; return { suggestions: [
      { kind: 'strengthen', targetId: 'root', title: 'Sleep hygiene', reason: 'Habits are missing.', basis: {} },
      { kind: 'move', targetId: 'c', newParentId: 'b', reason: 'REM is about the mind.', basis: {} },
      { kind: 'merge', targetId: 'd', mergeIntoId: 'b', reason: 'Dreams repeat Mind.', basis: {} },
      { kind: 'reduce', targetId: 'a', reason: 'Body is out of scope.', basis: {} }
    ], rejected: [{ index: 4, code: 'unknown_target' }] }; }),
    titleOf: id => titles[id] ?? '',
    staleReason: suggestion => stale(suggestion),
    apply: apply ?? (async (suggestion, title) => { calls.apply.push([suggestion.kind, title]); return true; }),
    highlight: ids => calls.highlight.push([...ids])
  };
  const modal = new mod.StructureReviewModal({}, host);
  modal.open();
  const rows = () => findAll(modal.contentEl, i => hasCls(i, 'vam-proposal'));
  const applyOf = row => find(row, i => i.tag === 'button' && hasCls(i, 'vam-structure-apply'));
  const noteOf = row => find(row, i => hasCls(i, 'vam-structure-note')).text;
  return { modal, host, calls, rows, applyOf, noteOf };
}

test('structure review window: starts on Close, runs on request, lists every kind with its reason and marks the cards', async () => {
  const h = windowHarness();
  assert.equal(h.modal.titleEl.text, 'Review the whole map');
  assert.ok(button(h.modal.modalEl, 'Close').focused, 'an Enter cannot start the review');
  assert.equal(h.calls.review, 0, 'nothing runs before Start');
  button(h.modal.modalEl, 'Start review').click(); await tick(); await tick();
  assert.equal(h.calls.review, 1);
  assert.deepEqual(h.rows().map(row => find(row, i => hasCls(i, 'vam-proposal-kind')).text), ['Add', 'Move', 'Merge', 'Remove']);
  assert.deepEqual(h.rows().map(row => find(row, i => hasCls(i, 'vam-proposal-reason')).text), ['Habits are missing.', 'REM is about the mind.', 'Dreams repeat Mind.', 'Body is out of scope.']);
  assert.deepEqual(h.rows().map(row => find(row, i => hasCls(i, 'vam-proposal-title')).value), ['Sleep hygiene', 'REM', 'Dreams', 'Body']);
  assert.deepEqual(h.rows().map(row => find(row, i => hasCls(i, 'vam-proposal-destination'))?.text), ['Under: Sleep', 'To: Mind', 'Into: Mind', undefined]);
  assert.ok(find(h.modal.contentEl, i => i.text === '1 suggestions could not be used (an unknown card, the root, a loop, a duplicate or no change) and were left out.'));
  assert.deepEqual(h.calls.highlight.at(-1), ['root', 'c', 'b', 'd', 'b', 'a'], 'every suggested card is marked');
  assert.deepEqual(h.calls.apply, [], 'nothing is applied until asked');
  h.modal.close();
  assert.deepEqual(h.calls.highlight.at(-1), [], 'closing clears the marks');
});

test('structure review window: each suggestion is applied on its own; a new topic name can be edited first', async () => {
  const h = windowHarness();
  button(h.modal.modalEl, 'Start review').click(); await tick(); await tick();
  const [add, move] = h.rows();
  find(add, i => hasCls(i, 'vam-proposal-title')).value = 'Sleep habits';
  h.applyOf(add).click(); await tick(); await tick();
  assert.deepEqual(h.calls.apply, [['strengthen', 'Sleep habits']]);
  assert.equal(h.applyOf(add).text, 'Applied'); assert.equal(h.applyOf(add).disabled, true); assert.ok(hasCls(add, 'is-applied'));
  assert.equal(h.noteOf(add), 'Applied. Undo reverts this change.');
  assert.deepEqual(h.calls.highlight.at(-1), ['c', 'b', 'd', 'b', 'a'], 'an applied suggestion is no longer marked');
  h.applyOf(add).click(); await tick();
  assert.equal(h.calls.apply.length, 1, 'applied once');
  h.applyOf(move).click(); await tick(); await tick();
  assert.deepEqual(h.calls.apply.map(c => c[0]), ['strengthen', 'move']);
});

test('structure review window: a stale suggestion is refused with its reason; a cancelled confirmation or a failure leaves it applicable', async () => {
  let staleIds = new Set();
  const outcomes = { merge: false, reduce: 'error' };
  const h = windowHarness({ stale: s => staleIds.has(s.targetId) ? 'This suggestion is out of date: the card was renamed or moved after the review.' : null,
    apply: async s => { h.calls.apply.push([s.kind]); if (outcomes[s.kind] === 'error') throw new Error('Disk is read-only'); return outcomes[s.kind] ?? true; } });
  button(h.modal.modalEl, 'Start review').click(); await tick(); await tick();
  const [add, , merge, reduce] = h.rows();
  staleIds = new Set(['root']);
  h.applyOf(add).click(); await tick();
  assert.deepEqual(h.calls.apply, [], 'a stale suggestion is never applied');
  assert.equal(h.applyOf(add).disabled, true); assert.ok(hasCls(add, 'is-stale'));
  assert.equal(h.noteOf(add), 'This suggestion is out of date: the card was renamed or moved after the review.');
  h.applyOf(merge).click(); await tick(); await tick();
  assert.deepEqual(h.calls.apply, [['merge']]);
  assert.equal(h.applyOf(merge).disabled, false, 'a cancelled confirmation can be applied later'); assert.equal(hasCls(merge, 'is-applied'), false);
  h.applyOf(reduce).click(); await tick(); await tick();
  assert.equal(h.noteOf(reduce), 'Disk is read-only'); assert.equal(h.applyOf(reduce).disabled, false);
});

test('structure review window: Cancel during the review and closing early write nothing', async () => {
  let signal;
  const h = windowHarness({ review: s => { signal = s; return new Promise((_resolve, reject) => s.addEventListener('abort', () => reject(new Error('aborted')))); } });
  button(h.modal.modalEl, 'Start review').click(); await tick();
  button(h.modal.modalEl, 'Cancel').click(); await tick(); await tick();
  assert.equal(signal.aborted, true);
  assert.ok(find(h.modal.modalEl, i => i.text === 'Review cancelled. Nothing was changed.'));
  assert.deepEqual(h.calls.apply, []); assert.equal(h.rows().length, 0);
  const late = windowHarness({ review: s => { signal = s; return new Promise(() => {}); } });
  button(late.modal.modalEl, 'Start review').click(); late.modal.close();
  assert.equal(signal.aborted, true); assert.deepEqual(late.calls.apply, []);
});

test('structure review window: a review that still resolves after Cancel offers Start again and shows nothing', async () => {
  let finish, reviews = 0;
  const suggestions = { suggestions: [{ kind: 'reduce', targetId: 'a', reason: 'Body is out of scope.', basis: {} }], rejected: [] };
  const h = windowHarness({ review: () => { reviews++; return new Promise(resolve => { finish = resolve; }); } });
  button(h.modal.modalEl, 'Start review').click(); await tick();
  const cancel = button(h.modal.modalEl, 'Cancel');
  cancel.click(); finish(suggestions); await tick(); await tick();
  assert.ok(find(h.modal.modalEl, i => i.text === 'Review cancelled. Nothing was changed.'));
  assert.equal(button(h.modal.modalEl, 'Cancel'), undefined, 'the button no longer reads Cancel');
  const start = button(h.modal.modalEl, 'Start review');
  assert.equal(start, cancel); assert.ok(hasCls(start, 'mod-cta'));
  assert.equal(h.rows().length, 0, 'the late review is not shown'); assert.deepEqual(h.calls.apply, []);
  assert.equal(reviews, 1);
  start.click(); await tick();
  assert.equal(reviews, 2, 'Start runs a new review only when it says so');
  assert.equal(button(h.modal.modalEl, 'Cancel'), start);
});

test('structure review window: focus stays in the window when Start goes away, and each Apply names its suggestion', async () => {
  const h = windowHarness();
  const doc = {};
  const start = button(h.modal.modalEl, 'Start review');
  start.ownerDocument = doc; start.root = doc; start.focus();
  start.click(); await tick(); await tick();
  assert.equal(button(h.modal.modalEl, 'Start review'), undefined);
  const [add, move, merge, reduce] = h.rows();
  assert.equal(h.applyOf(add).focused, true, 'the first suggestion takes the focus Start had');
  assert.deepEqual([add, move, merge, reduce].map(row => h.applyOf(row).attrs['aria-label']), ['Apply: Sleep hygiene', 'Apply: REM', 'Apply: Dreams', 'Apply: Body']);
  const name = find(add, i => hasCls(i, 'vam-proposal-title'));
  name.value = 'Sleep habits'; name.input();
  assert.equal(h.applyOf(add).attrs['aria-label'], 'Apply: Sleep habits');
  h.applyOf(move).click(); await tick(); await tick();
  assert.equal(h.applyOf(move).attrs['aria-label'], 'Applied: REM');
  // Without focus on Start, nothing is focused for the user.
  const other = windowHarness({ review: async () => ({ suggestions: [], rejected: [] }) });
  button(other.modal.modalEl, 'Start review').click(); await tick(); await tick();
  assert.equal(button(other.modal.modalEl, 'Close').focused, true, 'Close keeps the focus it got on open');
});

test('structure review window: with no suggestions, focus moves from Start to Close', async () => {
  const h = windowHarness({ review: async () => ({ suggestions: [], rejected: [] }) });
  const doc = {};
  const close = button(h.modal.modalEl, 'Close'); close.focused = false;
  const start = button(h.modal.modalEl, 'Start review');
  start.ownerDocument = doc; start.root = doc; start.focus();
  start.click(); await tick(); await tick();
  assert.equal(close.focused, true);
});

// The real view and repository, with a fake provider behind the real structure review service.
class Setting {
  constructor(el) { this.el = el; }
  setName() { return this; } setDesc() { return this; }
  addButton(callback) { const b = { setButtonText(text) { this.text = text; return this; }, onClick(fn) { this.run = fn; return this; }, setDestructive() { return this; } }; callback(b); (this.el.choiceButtons ??= []).push(b); return this; }
}
async function viewHarness(reply) {
  const { repo, app } = fixture('en');
  const settings = { ...DEFAULT_SETTINGS, language: 'en', cliModel: 'gpt-6-luna' };
  repo.settings = settings;
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'Sleep map', version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await repo.ensureTopicFolders('Agent Workspace/Topics/map-a');
  const ids = {};
  const add = async (key, title, parent) => {
    const created = await repo.createNote(title, 'gpt-6-luna', mapDoc, mapPath, parent ? 'inherited' : 'workspace');
    Object.assign(created, { parentId: parent ? ids[parent] : null, x: parent ? 400 : 80, y: 80 + mapDoc.nodes.length * 200 });
    mapDoc.nodes.push(created); ids[key] = created.id;
    return created;
  };
  await add('root', 'Sleep'); await add('a', 'Body', 'root'); await add('b', 'Mind', 'root'); await add('c', 'REM', 'a');
  await add('d', 'Dreams', 'b'); await add('e', 'Misc', 'root'); await add('f', 'Leftover', 'e');
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  await repo.rebuildDerivedData();
  const body = mapDoc.nodes.find(n => n.id === ids.a);
  await repo.updateNote(body.path, { summary: 'How the body sleeps.', detail: '### Findings\n\nSECRET FULL NOTE BODY' });
  const opened = [], notices = [];
  const Base = dom.makeModal();
  class Modal extends Base { open() { opened.push(this); super.open(); } }
  const plugin = withExpansionCoordinator({ repo, settings, running: new Set(), rebuildDerivedData: () => repo.rebuildDerivedData(), mutate: async work => work(), confirmAiUsage: async (_model, run) => { await run(); return true; } });
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Modal, Setting, Notice: class { constructor(m) { notices.push(m); } } } });
  const { StructureReviewService } = load('core/structure-review-service.ts');
  const requests = [];
  plugin.structureReview = new StructureReviewService(async request => { requests.push(request); return JSON.stringify(typeof reply === 'function' ? reply(ids) : reply); });
  const view = new VisualAgentMapView({ app }, plugin);
  const reload = async () => { view.notes = new Map(await Promise.all(view.map.nodes.map(async n => [n.id, await repo.readNote(n.path)]))); };
  view.path = mapPath; view.map = await repo.readMap(mapPath); view.render = () => {}; view.focusNode = () => {}; view.hydrate = reload;
  await reload();
  const cards = new Map(view.map.nodes.map(n => [n.id, element('div', 'vam-node')]));
  for (const [id, card] of cards) view.cardEls.set(id, card);
  const saved = async () => (await repo.readMap(mapPath)).nodes;
  const parentOf = async key => (await saved()).find(n => n.id === ids[key])?.parentId;
  const start = async scope => {
    view.openStructureReview(scope);
    const modal = opened.at(-1);
    button(modal.modalEl, 'Start review').click();
    await until(() => findAll(modal.contentEl, i => hasCls(i, 'vam-proposal')).length || find(modal.modalEl, i => /suggestions|could not/.test(i.text ?? '')));
    const rows = () => findAll(modal.contentEl, i => hasCls(i, 'vam-proposal'));
    const apply = async (index, settle = true) => { find(rows()[index], i => hasCls(i, 'vam-structure-apply')).click(); if (settle) { await tick(); await tick(); } };
    return { modal, rows, apply };
  };
  const choose = async label => {
    const dialog = opened.at(-1);
    const choice = dialog.contentEl.choiceButtons.find(b => b.text === label);
    assert.ok(choice, `choice ${label}`); choice.run();
    await until(() => true); await tick(); await tick(); await tick();
  };
  return { repo, app, view, plugin, ids, requests, opened, notices, cards, saved, parentOf, start, choose, mapPath };
}
const fullReply = ids => ({ suggestions: [
  { kind: 'strengthen', targetId: ids.root, reason: 'Habits are missing.', title: 'Sleep hygiene', newParentId: '', mergeIntoId: '' },
  { kind: 'move', targetId: ids.c, reason: 'REM is about the mind.', title: '', newParentId: ids.b, mergeIntoId: '' },
  { kind: 'merge', targetId: ids.e, reason: 'Misc repeats Body.', title: '', newParentId: '', mergeIntoId: ids.a },
  { kind: 'reduce', targetId: ids.d, reason: 'Dreams are out of scope.', title: '', newParentId: '', mergeIntoId: '' },
  { kind: 'reduce', targetId: 'invented-id', reason: 'Not on the map.', title: '', newParentId: '', mergeIntoId: '' }
] });

integrationTest('structure review on the map: the AI gets titles, summaries and status only, unknown ids are dropped, cards are marked until the window closes', async () => {
  const h = await viewHarness(fullReply);
  const { modal, rows } = await h.start(null);
  const sent = h.requests[0];
  assert.equal(sent.rootQuestion, 'Sleep map');
  assert.deepEqual(Object.keys(sent.nodes[0]).sort(), ['depth', 'id', 'parentId', 'status', 'summary', 'title']);
  assert.ok(sent.nodes.some(n => n.title === 'Body' && n.summary === 'How the body sleeps.'));
  assert.equal(JSON.stringify(sent).includes('SECRET FULL NOTE BODY'), false, 'no note body is sent');
  assert.equal(rows().length, 4, 'the invented id is not offered');
  assert.ok(find(modal.contentEl, i => i.text === '1 suggestions could not be used (an unknown card, the root, a loop, a duplicate or no change) and were left out.'));
  const marked = [...h.cards].filter(([, card]) => hasCls(card, 'vam-structure-suggested')).map(([id]) => id).sort();
  assert.deepEqual(marked, [h.ids.root, h.ids.a, h.ids.b, h.ids.c, h.ids.d, h.ids.e].sort());
  modal.close();
  assert.equal([...h.cards.values()].filter(card => hasCls(card, 'vam-structure-suggested')).length, 0, 'closing clears every mark');
});

integrationTest('structure review: a branch review sends only that branch with the branch topic as its root', async () => {
  const h = await viewHarness({ suggestions: [] });
  h.view.openStructureReview(h.ids.a);
  const branch = h.opened.at(-1);
  assert.equal(branch.titleEl.text, 'Review this branch');
  button(branch.modalEl, 'Start review').click(); await until(() => h.requests.length);
  assert.equal(h.requests[0].rootQuestion, 'Body');
  assert.equal(JSON.stringify(h.requests[0].nodes.map(n => [n.title, n.parentId === null])), JSON.stringify([['Body', true], ['REM', false]]));
  await until(() => find(branch.contentEl, i => i.text === 'AI has no structure suggestions for this part of the map.'));
});

integrationTest('structure review: add, move, merge and remove each apply as one undo step', async () => {
  const h = await viewHarness(fullReply);
  const { rows, apply } = await h.start(null);
  const before = JSON.stringify((await h.saved()).map(n => [n.id, n.parentId]));
  // Add: a new child of the root.
  await apply(0);
  let nodes = await h.saved();
  const added = nodes.find(n => n.parentId === h.ids.root && !Object.values(h.ids).includes(n.id));
  assert.ok(added); assert.equal((await h.repo.readNote(added.path)).title, 'Sleep hygiene');
  await h.view.history.undo().undo();
  assert.equal(JSON.stringify((await h.saved()).map(n => [n.id, n.parentId])), before, 'one undo removes the added topic');
  // Move: REM goes under Mind.
  await apply(1);
  assert.equal(await h.parentOf('c'), h.ids.b);
  await h.view.history.undo().undo();
  assert.equal(await h.parentOf('c'), h.ids.a);
  // Merge: through the delete confirmation; Misc's subtopic moves to Body, Misc leaves the map.
  await apply(2, false); await tick();
  assert.equal(h.opened.at(-1).titleEl.text, 'Merge “Misc” into “Body”');
  await h.choose('Merge and remove “Misc”');
  nodes = await h.saved();
  assert.equal(nodes.some(n => n.id === h.ids.e), false);
  assert.equal(await h.parentOf('f'), h.ids.a);
  assert.equal((await h.repo.collectionFiles(h.mapPath, 'Unassigned')).length, 1);
  await h.view.history.undo().undo();
  assert.equal(await h.parentOf('e'), h.ids.root); assert.equal(await h.parentOf('f'), h.ids.e);
  // Remove: the existing delete confirmation, entire branch.
  await apply(3, false); await tick();
  assert.equal(h.opened.at(-1).titleEl.text, 'Remove from map');
  await h.choose('Remove entire branch');
  assert.equal((await h.saved()).some(n => n.id === h.ids.d), false);
  await h.view.history.undo().undo();
  assert.equal(await h.parentOf('d'), h.ids.b);
  assert.equal(JSON.stringify((await h.saved()).map(n => [n.id, n.parentId])), before, 'every change undone');
  assert.equal(rows().length, 4);
});

integrationTest('structure review: a stale suggestion is blocked, a cancelled confirmation and closing the window write nothing', async () => {
  const h = await viewHarness(fullReply);
  const { modal, rows, apply } = await h.start(null);
  const before = JSON.stringify(await h.saved());
  // The map changes after the review: REM is renamed, so the move suggestion is out of date.
  h.view.notes.get(h.ids.c).title = 'REM sleep';
  await apply(1);
  assert.equal(JSON.stringify(await h.saved()), before, 'nothing written');
  assert.ok(hasCls(rows()[1], 'is-stale'));
  assert.equal(find(rows()[1], i => hasCls(i, 'vam-structure-note')).text, 'This suggestion is out of date: the card was renamed or moved after the review.');
  assert.equal(find(rows()[1], i => hasCls(i, 'vam-structure-apply')).disabled, true);
  // A card removed from the map makes its suggestion stale too.
  h.view.map.nodes = h.view.map.nodes.filter(n => n.id !== h.ids.d);
  await apply(3);
  assert.match(find(rows()[3], i => hasCls(i, 'vam-structure-note')).text, /no longer on the map/);
  h.view.map = await h.repo.readMap(h.mapPath);
  // Cancel the merge confirmation: nothing changes and the suggestion stays available.
  await apply(2, false); await tick();
  h.opened.at(-1).close(); await tick(); await tick();
  assert.equal(JSON.stringify(await h.saved()), before);
  assert.equal(find(rows()[2], i => hasCls(i, 'vam-structure-apply')).disabled, false);
  assert.equal(h.view.history.canUndo, false, 'no undo entry was recorded');
  modal.close();
  assert.equal(JSON.stringify(await h.saved()), before, 'closing the window writes nothing');
});

integrationTest('structure review: a card renamed or moved while the remove or merge confirmation is open is checked again inside the write', async () => {
  const h = await viewHarness(fullReply);
  const { rows, apply } = await h.start(null);
  const before = JSON.stringify(await h.saved());
  // Remove: the confirmation opens, then Dreams is renamed before the user picks.
  await apply(3, false); await tick();
  assert.equal(h.opened.at(-1).titleEl.text, 'Remove from map');
  h.view.notes.get(h.ids.d).title = 'Dream journal';
  await h.choose('Remove entire branch');
  assert.equal(JSON.stringify(await h.saved()), before, 'nothing written');
  assert.ok(hasCls(rows()[3], 'is-stale'));
  assert.equal(find(rows()[3], i => hasCls(i, 'vam-structure-note')).text, 'This suggestion is out of date: the card was renamed or moved after the review.');
  assert.equal(find(rows()[3], i => hasCls(i, 'vam-structure-apply')).disabled, true);
  // Merge: the confirmation opens, then Misc is moved under Mind before the user picks.
  await apply(2, false); await tick();
  assert.equal(h.opened.at(-1).titleEl.text, 'Merge “Misc” into “Body”');
  h.view.map.nodes.find(n => n.id === h.ids.e).parentId = h.ids.b;
  await h.choose('Merge and remove “Misc”');
  assert.equal(JSON.stringify(await h.saved()), before, 'nothing written');
  assert.ok(hasCls(rows()[2], 'is-stale'));
  assert.equal(find(rows()[2], i => hasCls(i, 'vam-structure-note')).text, 'This suggestion is out of date: the card was renamed or moved after the review.');
  assert.equal(h.view.history.canUndo, false, 'no undo entry was recorded');
});

test('structure review entry copy in Traditional Chinese; the review window titles stay as they are', () => {
  const { translate } = load('i18n.ts');
  assert.equal(translate('zh-TW', 'ui.structure_review_entry_label'), 'AI 結構建議：');
  assert.equal(translate('zh-TW', 'ui.structure_review_entry_map'), '哪裡該加強或刪減？（整張圖）');
  assert.equal(translate('zh-TW', 'ui.structure_review_entry_branch'), '哪裡該加強或刪減？（這個分支）');
  assert.equal(translate('zh-TW', 'ui.structure_review_entry_hint'), 'AI 只讀標題、摘要與狀態，建議新增、刪減、移動或合併議題；每條可單獨套用、可復原。');
  assert.equal(translate('zh-TW', 'ui.structure_review_map'), '檢視整張圖');
  assert.equal(translate('zh-TW', 'ui.structure_review_branch'), '檢視這個分支');
});

integrationTest('structure review entry: the root topic offers the whole map, a subtopic with subtopics its branch, a leaf nothing', async () => {
  const h = await viewHarness({ suggestions: [] });
  const entry = id => h.view.structureReviewEntry(h.view.map.nodes.find(n => n.id === id));
  assert.equal(entry(h.ids.root).label, 'What to strengthen or cut? (whole map)');
  assert.equal(entry(h.ids.a).label, 'What to strengthen or cut? (this branch)');
  assert.equal(entry(h.ids.c), undefined);
  // The Next Step dialog shows it and opens the review in its place.
  const notices = [];
  const Modal = dom.makeModal();
  const { NextStepModal } = load('main.ts', { obsidian: { ...obsidian, Modal, setIcon: () => {}, Notice: class { constructor(m) { notices.push(m); } } } });
  const modelState = provider => ({ provider, status: 'ready', models: [] });
  const plugin = { settings: { codexUsageNoticeSeen: true, claudeUsageNoticeSeen: true, models: 'gpt-test', cliModel: 'gpt-test', cliReasoning: 'low', language: 'en' }, aiReadyForModel: async () => true, confirmAiUsage: async (_m, run) => { await run(); return true; }, saveSettings: async () => {}, activeTasks: new Map(), availableModels: () => ['gpt-test'], modelLabel: m => m, modelDiscoveryState: modelState, subscribeModelDiscovery: () => () => {}, refreshModelDiscovery: async p => modelState(p) };
  let opened = 0;
  const modal = new NextStepModal({}, 'Sleep', 'normal', 3, 0, plugin, async () => {}, async () => {}, async () => {}, { model: 'gpt-test', modelSource: 'workspace', reasoning: 'low', save: async () => {}, structureReview: { label: 'What to strengthen or cut? (whole map)', open: () => { opened++; } } });
  modal.open();
  assert.ok(find(modal.contentEl, i => hasCls(i, 'vam-next-structure-label') && i.text === 'AI structure suggestions:'));
  assert.ok(find(modal.contentEl, i => hasCls(i, 'vam-next-structure-hint') && i.text === 'AI reads only titles, summaries and status, then suggests topics to add, cut, move or merge; apply each one on its own, and undo any.'));
  button(modal.contentEl, 'What to strengthen or cut? (whole map)').click();
  assert.equal(opened, 1); assert.equal(modal.closeCount, 1);
});

// ---- Adversarial cases from the Phase C test pass: late results, cancelled confirms and entry points -------------
const diffWorld = (a0, b0) => { const strip = j => JSON.stringify(JSON.parse(j).map(([k, v]) => [k, v.replace(/^updated: .*\n/gm, '').replace(/^updated: .*$/gm, '').replace(/^agent-map-id: .*\n/gm, '')])); const a = strip(a0), b = strip(b0); return diffWorld0(a, b); };
const diffWorld0 = (a, b) => { const A = new Map(JSON.parse(a)), B = new Map(JSON.parse(b)); const out = []; for (const k of new Set([...A.keys(), ...B.keys()])) { if (!A.has(k)) out.push('ADDED ' + k); else if (!B.has(k)) out.push('MISSING ' + k); else if (A.get(k) !== B.get(k)) { const x = A.get(k).split('\n'), y = B.get(k).split('\n'); out.push('CHANGED ' + k + JSON.stringify([A.get(k).slice(0,400), B.get(k).slice(0,400)]) + ': ' + x.filter(l => !y.includes(l)).join(' | ') + ' => ' + y.filter(l => !x.includes(l)).join(' | ')); } } return out.join('\n'); };
const world = async h => { const files = h.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path)); const out = []; for (const f of files) out.push([f.path, await h.app.vault.read(f)]); return JSON.stringify(out); };
const noteText = (row) => find(row, i => hasCls(i, 'vam-structure-note')).text;
const applyBtn = (row) => find(row, i => hasCls(i, 'vam-structure-apply'));
integrationTest('structure review: cancelled confirm for reduce and merge: suggestion applicable, nothing written; Escape-like close path too', async () => {
  const h = await viewHarness(fullReply);
  const { rows, apply } = await h.start(null);
  const w0 = await world(h);
  for (const idx of [3, 2]) {
    await apply(idx, false); await tick();
    h.opened.at(-1).close(); await tick(); await tick();
    assert.equal(applyBtn(rows()[idx]).disabled, false, `row ${idx} still applicable`);
    assert.equal(await world(h), w0); assert.equal(h.view.history.canUndo, false);
  }
  // now actually apply after cancelling: still works
  await apply(3, false); await tick(); await h.choose('Remove entire branch');
  assert.equal((await h.saved()).some(n => n.id === h.ids.d), false);
});
integrationTest('structure review entries: leaf, AIM map, builtin sample, outside topics folder', async () => {
  const h = await viewHarness({ suggestions: [] });
  const entry = id => h.view.structureReviewEntry(h.view.map.nodes.find(n => n.id === id));
  assert.equal(entry(h.ids.c), undefined); assert.equal(entry(h.ids.f), undefined);
  assert.ok(entry(h.ids.root)); assert.ok(entry(h.ids.a));
  h.view.map.aim = { kind: 'aim' };
  assert.equal(entry(h.ids.root), undefined, 'aim: root'); assert.equal(entry(h.ids.a), undefined, 'aim: branch');
  delete h.view.map.aim;
  h.view.builtIn = true;
  assert.equal(entry(h.ids.root), undefined, 'sample root'); assert.equal(entry(h.ids.a), undefined);
  h.view.openStructureReview(null); assert.equal(h.opened.length, 0, 'direct open refused on sample');
  h.view.builtIn = false;
  h.view.openStructureReview(null); assert.equal(h.opened.length, 1);
  const p = h.view.path; h.view.path = 'Other/Map.md';
  assert.equal(entry(h.ids.root), undefined);
  h.view.path = p;
});

test('structure review window: a host that ignores abort and resolves late writes nothing into a closed or cancelled window', async () => {
  const result = { suggestions: [{ kind: 'strengthen', targetId: 'root', title: 'T', reason: 'r', basis: {} }], rejected: [] };
  for (const how of ['close', 'cancel']) {
    let release; const h = windowHarness({ review: () => new Promise(r => { release = () => r(result); }) });
    button(h.modal.modalEl, 'Start review').click(); await tick();
    if (how === 'close') h.modal.close(); else button(h.modal.modalEl, 'Cancel').click();
    await tick(); release(); await tick(); await tick();
    assert.equal(h.rows().length, 0, how + ': no rows');
    assert.deepEqual(h.calls.highlight.at(-1) ?? [], [], how + ': highlight clear');
    assert.equal(h.calls.highlight.some(ids => ids.length), false, how + ': never highlighted');
  }
});
test('outline modal: a generator that ignores abort and resolves late changes nothing after Stop or close; prose reply shows error and blocks add', async () => {
  for (const how of ['stop', 'close']) {
    let release; const h = importHarness({ generate: () => new Promise(r => { release = () => r('# Late\n## Result'); }) });
    h.textarea().value = '# Mine'; h.textarea().fire('input');
    button(h.ai, 'Generate outline').click(); await tick();
    if (how === 'stop') button(h.ai, 'Stop').click(); else h.modal.close();
    await tick(); release(); await tick(); await tick();
    assert.equal(h.textarea().value, '# Mine', how);
  }
  const outline = load('core/outline-generation-service.ts', { obsidian });
  const cases = { leadingProse: 'Here is your outline:\n# Sleep\n## Stages', trailingProse: '# Sleep\n## Stages\nHope this helps!', bullets: '# Sleep\n- item', proseFenceMix: 'Sure!\n```markdown\n# Sleep\n## A\n```', fenceThenProse: '```md\n# Sleep\n## A\n```\nDone.', frontMatter: '---\ntitle: x\n---\n# Sleep\n## A', html: '<!-- c -->\n# Sleep\n## A', empty: '', onlyProse: 'No headings here' };
  for (const [name, raw] of Object.entries(cases)) assert.throws(() => outline.parseOutlineReply(raw, 'en'), e => e.name === 'OutlineGenerateError', name);
  assert.doesNotThrow(() => outline.parseOutlineReply('```markdown\n# Sleep\n## A\n```', 'en'));
  assert.doesNotThrow(() => outline.parseOutlineReply('# Sleep\n## A\n', 'en'));
});
