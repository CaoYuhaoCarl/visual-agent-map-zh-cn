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

