// Merge topics, Phase 1 selection gestures: the pointer-intent table for the empty canvas.
const assert = require('node:assert/strict');
const { test, load } = require('../support.cjs');

const { canvasPointerIntent } = load('experiences/visual-map/canvas-gestures.ts');
const press = (over = {}) => canvasPointerIntent({ button: 0, integrationMode: false, spaceHeld: false, altKey: false, shiftKey: false, ...over });

test('canvas pointer intent, normal mode: plain drag and Alt drag pan, Shift drag box-selects', () => {
  assert.equal(press(), 'pan');
  assert.equal(press({ altKey: true }), 'pan', 'Alt+drag still pans outside selection mode');
  assert.equal(press({ shiftKey: true }), 'marquee-enter');
  assert.equal(press({ shiftKey: true, altKey: true }), 'pan', 'Alt wins over Shift so the old Alt pan never starts a box');
  assert.equal(press({ spaceHeld: true }), 'pan');
  assert.equal(press({ spaceHeld: true, shiftKey: true }), 'pan', 'Space always pans');
});

test('canvas pointer intent, selection mode: drag adds, Option drag removes, Space and the middle button pan', () => {
  assert.equal(press({ integrationMode: true }), 'marquee-add');
  assert.equal(press({ integrationMode: true, altKey: true }), 'marquee-subtract');
  assert.equal(press({ integrationMode: true, spaceHeld: true }), 'pan');
  assert.equal(press({ integrationMode: true, spaceHeld: true, altKey: true }), 'pan');
  assert.equal(press({ integrationMode: true, shiftKey: true }), 'marquee-add');
});

test('canvas pointer intent: the middle button always pans and other buttons do nothing', () => {
  for (const integrationMode of [false, true]) {
    assert.equal(press({ button: 1, integrationMode }), 'pan');
    assert.equal(press({ button: 1, integrationMode, altKey: true, shiftKey: true }), 'pan');
    assert.equal(press({ button: 2, integrationMode }), 'ignore');
  }
});

// Merge topics, Phase 2 (structure merge): eligibility, Detail concatenation, reading order.
const { mergeEligibility, mergedDetail, mergedStatus, readingOrder } = load('experiences/visual-map/merge-topics.ts', { obsidian: require('../support.cjs').obsidian });
const { node: mnode, plain } = require('../support.cjs');
const family = () => {
  const root = mnode('root'), a = mnode('a', 'root'), b = mnode('b', 'root'), c = mnode('c', 'root'), a1 = mnode('a1', 'a'), r2 = mnode('r2');
  return [root, a, b, c, a1, r2];
};
const check = (ids, over = {}) => plain(mergeEligibility({ ids, nodes: family(), hasNote: () => true, busy: () => false, ...over }));

test('merge eligibility: needs two or more cards', () => {
  assert.deepEqual(check([]), { ok: false, reason: 'ui.merge_needs_two' });
  assert.deepEqual(check(['a']), { ok: false, reason: 'ui.merge_needs_two' });
  assert.deepEqual(check(['a', 'ghost']), { ok: false, reason: 'ui.merge_needs_two' });
});

test('merge eligibility: siblings and all-root selections pass, other parents do not', () => {
  const ok = check(['a', 'b']);
  assert.equal(ok.ok, true); assert.equal(ok.parentId, 'root');
  const roots = check(['root', 'r2']);
  assert.equal(roots.ok, true); assert.equal(roots.parentId, null);
  assert.deepEqual(check(['a1', 'b']), { ok: false, reason: 'ui.merge_needs_same_parent' });
  assert.deepEqual(check(['root', 'a']), { ok: false, reason: 'ui.merge_ancestor_selected' });
});

test('merge eligibility: a topic with its own subtopic names the ancestor reason, not the parent reason', () => {
  assert.deepEqual(check(['a', 'a1']), { ok: false, reason: 'ui.merge_ancestor_selected' });
  assert.deepEqual(check(['root', 'a1', 'b']), { ok: false, reason: 'ui.merge_ancestor_selected' });
});

test('merge eligibility: a missing note or a running AI task blocks, in that order', () => {
  assert.deepEqual(check(['a', 'b'], { hasNote: id => id !== 'b' }), { ok: false, reason: 'ui.merge_missing_note' });
  assert.deepEqual(check(['a', 'b'], { busy: n => n.id === 'a' }), { ok: false, reason: 'ui.merge_busy' });
  assert.deepEqual(check(['a', 'b'], { hasNote: () => false, busy: () => true }), { ok: false, reason: 'ui.merge_missing_note' });
});

test('merge eligibility returns the sources in reading order (y, then x)', () => {
  const nodes = family();
  Object.assign(nodes[1], { x: 400, y: 300 }); Object.assign(nodes[2], { x: 400, y: 100 }); Object.assign(nodes[3], { x: 100, y: 100 });
  const result = mergeEligibility({ ids: ['a', 'b', 'c'], nodes, hasNote: () => true, busy: () => false });
  assert.deepEqual(plain(result.sources.map(n => n.id)), ['c', 'b', 'a']);
  assert.deepEqual(plain(readingOrder(nodes.slice(1, 4)).map(n => n.id)), ['c', 'b', 'a']);
});

test('merged Detail: ### title sections in order, empty sources skipped, inner headings kept', () => {
  const detail = mergedDetail([
    { title: 'First', detail: 'Alpha text' },
    { title: 'Empty', detail: '  \n ' },
    { title: 'Third', detail: '## Inner heading\n\nBody' }
  ]);
  assert.equal(detail, '### First\n\nAlpha text\n\n### Third\n\n## Inner heading\n\nBody');
  assert.equal(mergedDetail([{ title: 'A', detail: '' }, { title: 'B', detail: '\n' }]), '');
  assert.equal(mergedDetail([]), '');
});

test('merged status: completed when any content, idea when empty', () => {
  assert.equal(mergedStatus('### A\n\nx'), 'completed');
  assert.equal(mergedStatus(''), 'idea');
  assert.equal(mergedStatus('  \n'), 'idea');
});

// Merge topics, Phase 2 (AI merge): the content test, model resolution, the task text and the dialog's AI option.
const dom = require('../support-dom.cjs');
const phase2 = load('experiences/visual-map/merge-topics.ts', { obsidian: { ...require('../support.cjs').obsidian, Modal: dom.makeModal() } });
const { translate } = load('i18n.ts');
const label = key => translate('en', key);

test('hasMergeContent: any source with non-blank Detail counts, summary alone does not', () => {
  assert.equal(phase2.hasMergeContent([{ detail: '' }, { detail: '  \n' }, undefined, {}]), false);
  assert.equal(phase2.hasMergeContent([{ detail: '' }, { detail: 'x' }]), true);
  assert.equal(phase2.hasMergeContent([{ summary: 'only a summary' }]), false);
  assert.equal(phase2.hasMergeContent([]), false);
});

test('resolveMergeModel: the parent topic model wins, otherwise the workspace model', () => {
  assert.equal(phase2.resolveMergeModel('claude:haiku', 'claude:sonnet'), 'claude:haiku');
  assert.equal(phase2.resolveMergeModel(undefined, 'claude:sonnet'), 'claude:sonnet');
});

test('mergeGoalTask: both languages keep all information, drop duplicates, add no conclusion and cap the summary at 80', () => {
  const { mergeGoalTask, synthesisGoalTask } = load('experiences/visual-map/steps/fragments.ts');
  const en = mergeGoalTask('en'), zh = mergeGoalTask('zh-TW');
  assert.match(en, /every piece of information/); assert.match(en, /Do not add conclusions/); assert.match(en, /80 characters/); assert.match(en, /contradict/);
  assert.match(zh, /全部資訊/); assert.match(zh, /不加入來源沒有的結論/); assert.match(zh, /80/); assert.match(zh, /矛盾/);
  assert.notEqual(en, synthesisGoalTask('en'));
});

const mergeModal = (ai, over = {}) => {
  const log = { submitted: [], cancelled: 0 };
  const modal = new phase2.MergeTopicsModal({}, 3, 'First', title => log.submitted.push(title), () => { log.cancelled++; }, ai);
  modal.open();
  const input = dom.find(modal.contentEl, i => i.tag === 'input' && i.type === 'text');
  const box = dom.find(modal.contentEl, i => i.type === 'checkbox');
  const main = dom.find(modal.modalEl, i => i.tag === 'button' && /Merge/.test(i.text));
  return { modal, log, input, box, main };
};

test('merge dialog without AI (all sources empty) is the plain structure merge: no AI text, no checkbox', () => {
  const { modal, log, box, main, input } = mergeModal(undefined);
  assert.equal(box, undefined); assert.equal(main.text, label('ui.merge_confirm'));
  assert.equal(dom.texts(modal.contentEl).some(text => text === label('ui.merge_ai_desc').replace('{0}', '3')), false);
  main.click();
  assert.deepEqual(log.submitted, ['First']); assert.equal(log.cancelled, 0); assert.equal(input.value, 'First');
});

test('merge dialog with content: AI is the default, the checkbox switches to the plain merge', () => {
  let started = 0;
  const { modal, log, box, main } = mergeModal({ start: async () => { started++; return false; } });
  assert.ok(box, 'checkbox shown'); assert.equal(box.checked, false);
  assert.ok(dom.texts(modal.contentEl).includes(label('ui.merge_no_ai')));
  assert.ok(dom.texts(modal.contentEl).includes(label('ui.merge_ai_desc').replace('{0}', '3')));
  assert.equal(main.text, label('ui.merge_with_ai'));
  box.checked = true; box.change();
  assert.equal(main.text, label('ui.merge_confirm'));
  main.click();
  assert.deepEqual(log.submitted, ['First']); assert.equal(started, 0, 'the skip option never calls AI');
});

test('merge dialog AI path: a declined usage notice leaves the dialog open and starts nothing; accepting detaches without cancelling', async () => {
  const calls = [];
  let answer = false;
  const { modal, log, main } = mergeModal({ start: async (title, started, signal) => { calls.push([title, signal.aborted]); if (answer) started(); return answer; } });
  main.click(); await dom.tick();
  assert.deepEqual(calls, [['First', false]]); assert.equal(modal.closeCount, 0, 'declined: still open'); assert.equal(log.cancelled, 0); assert.equal(main.disabled, false, 'can press again');
  answer = true;
  main.click(); await dom.tick();
  assert.equal(modal.closeCount, 1, 'accepted: hidden'); assert.equal(log.cancelled, 0, 'detached: closing is not a cancel'); assert.deepEqual(log.submitted, []);
  assert.equal(calls[1][1], false, 'the signal was not aborted by the detach close');
});

test('merge dialog AI path: closing before AI starts aborts the pending start and cancels', async () => {
  let signal; let release;
  const { modal, log, main } = mergeModal({ start: (_title, _started, s) => { signal = s; return new Promise(resolve => { release = resolve; }); } });
  main.click(); await dom.tick();
  assert.equal(main.disabled, true, 'a second press while waiting is ignored');
  modal.close();
  assert.equal(signal.aborted, true); assert.equal(log.cancelled, 1);
  release(false); await dom.tick();
});
