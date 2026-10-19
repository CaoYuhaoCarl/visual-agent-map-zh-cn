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
  // A parent with its direct subtopic is no longer blocked: it merges into the parent (see the parent-mode tests below).
  assert.equal(check(['root', 'a']).ok, true);
});

test('merge eligibility: a topic with its own subtopic names the ancestor reason, not the parent reason', () => {
  // Two separate parent/subtopic groups (a+a1 and root+b) stay blocked with the ancestor reason.
  assert.deepEqual(check(['a', 'a1', 'r2', 'r2c'], { nodes: [...family(), mnode('r2c', 'r2')] }), { ok: false, reason: 'ui.merge_ancestor_selected' });
  assert.deepEqual(check(['root', 'a', 'a1', 'r2', 'r2c'], { nodes: [...family(), mnode('r2c', 'r2')] }), { ok: false, reason: 'ui.merge_ancestor_selected' });
});

test('merge eligibility, parent mode: one parent plus direct subtopics merges into the parent, parent first', () => {
  const nodes = family();
  Object.assign(nodes[1], { x: 400, y: 300 }); Object.assign(nodes[2], { x: 400, y: 100 }); Object.assign(nodes[3], { x: 100, y: 200 });
  const result = plain(mergeEligibility({ ids: ['c', 'a', 'root', 'b'], nodes, hasNote: () => true, busy: () => false }));
  assert.equal(result.ok, true); assert.equal(result.targetId, 'root'); assert.equal(result.parentId, null);
  assert.deepEqual(result.sources.map(n => n.id), ['root', 'b', 'c', 'a'], 'parent first, then subtopics in reading order');
  const one = check(['root', 'c']); assert.equal(one.ok, true); assert.equal(one.targetId, 'root'); assert.deepEqual(one.sources.map(n => n.id), ['root', 'c']);
  // A subtopic with its own subtopic selected (without the topic above it) is the parent of that selection.
  const sub = check(['a', 'a1']); assert.equal(sub.ok, true); assert.equal(sub.targetId, 'a'); assert.equal(sub.parentId, 'root');
  assert.equal(check(['a', 'b']).targetId, null, 'sibling mode has no target');
  assert.equal(check(['root', 'r2']).targetId, null);
});

test('merge eligibility, parent mode: grandchildren, other branches and a second parent are blocked with their own reason', () => {
  assert.deepEqual(check(['root', 'a', 'a1']), { ok: false, reason: 'ui.merge_parent_direct_only' });
  assert.deepEqual(check(['root', 'a1']), { ok: false, reason: 'ui.merge_parent_direct_only' });
  assert.deepEqual(check(['root', 'a', 'r2']), { ok: false, reason: 'ui.merge_ancestor_selected' }, 'a parent topic plus one of its siblings is two groups');
  assert.deepEqual(check(['root', 'a1', 'b', 'c']), { ok: false, reason: 'ui.merge_parent_direct_only' });
  const nodes = [...family(), mnode('r2c', 'r2')];
  assert.deepEqual(check(['root', 'a', 'r2', 'r2c'], { nodes }), { ok: false, reason: 'ui.merge_ancestor_selected' });
});

test('merge eligibility, parent mode: missing note and busy cover the parent and the subtopics', () => {
  assert.deepEqual(check(['root', 'a'], { hasNote: id => id !== 'root' }), { ok: false, reason: 'ui.merge_missing_note' });
  assert.deepEqual(check(['root', 'a'], { hasNote: id => id !== 'a' }), { ok: false, reason: 'ui.merge_missing_note' });
  assert.deepEqual(check(['root', 'a'], { busy: n => n.id === 'root' }), { ok: false, reason: 'ui.merge_busy' });
  assert.deepEqual(check(['root', 'a', 'b'], { busy: n => n.id === 'b' }), { ok: false, reason: 'ui.merge_busy' });
  assert.deepEqual(check(['root', 'a'], { hasNote: () => false, busy: () => true }), { ok: false, reason: 'ui.merge_missing_note' });
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

test('mergeGoalTask: both languages ask for exactly one suggestion whose title is the merged topic name', () => {
  const { mergeGoalTask } = load('experiences/visual-map/steps/fragments.ts');
  assert.match(mergeGoalTask('en'), /exactly one suggestion/); assert.match(mergeGoalTask('en'), /title is the name you give the merged topic/); assert.doesNotMatch(mergeGoalTask('en'), /empty suggestions/);
  assert.match(mergeGoalTask('zh-TW'), /suggestions 只回傳一筆/); assert.match(mergeGoalTask('zh-TW'), /title 是你替合併後這個議題取的名稱/); assert.doesNotMatch(mergeGoalTask('zh-TW'), /空陣列/);
});

test('mergeTitleFromResult: the first suggestion title, tidied; missing, blank or over-long falls back to the first source title', () => {
  const name = (suggestions, fallback = 'First') => phase2.mergeTitleFromResult({ suggestions }, fallback);
  assert.equal(name([{ title: 'Heat transfer' }]), 'Heat transfer');
  assert.equal(name([{ title: '  “Heat\n transfer”  ' }, { title: 'Second' }]), 'Heat transfer', 'quotes and line breaks removed, only the first used');
  assert.equal(name([{ title: '「熱傳遞」' }]), '熱傳遞');
  assert.equal(name([]), 'First'); assert.equal(phase2.mergeTitleFromResult({}, 'First'), 'First');
  assert.equal(name([{ title: '   ' }]), 'First'); assert.equal(name([{ title: '""' }]), 'First');
  assert.equal(name([{ title: 'x'.repeat(phase2.MERGE_TITLE_MAX) }]), 'x'.repeat(phase2.MERGE_TITLE_MAX));
  assert.equal(name([{ title: 'x'.repeat(phase2.MERGE_TITLE_MAX + 1) }]), 'First');
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

test('merge dialog: the AI path hides the name field (the AI names the topic); skipping AI shows it again and still needs a name', async () => {
  const calls = [];
  const { modal, input, box, main } = mergeModal({ start: async title => { calls.push(title); return false; } });
  assert.equal(input.hidden, true); assert.equal(main.disabled, false);
  input.value = ''; input.input(); assert.equal(main.disabled, false, 'no typed name is needed with AI');
  main.click(); await dom.tick(); assert.deepEqual(calls, ['First'], 'the first source title is only the fallback name');
  box.checked = true; box.change();
  assert.equal(input.hidden, false); assert.equal(main.disabled, true, 'the plain merge needs a name');
  box.checked = false; box.change(); assert.equal(input.hidden, true); assert.equal(main.disabled, false);
});

test('draft review (still used by synthesis) has no name field: merging no longer reviews, the AI name is applied directly', async () => {
  const obsidian = { ...require('../support.cjs').obsidian, Modal: dom.makeModal(), Component: class { load() {} unload() {} addChild(c) { return c; } removeChild() {} }, MarkdownRenderer: { render: async () => {} }, setIcon: () => {} };
  const { DraftReviewModal } = load('main.ts', { obsidian });
  const got = [];
  const modal = new DraftReviewModal({}, 'S', 'D', { intro: 'Intro', confirmLabel: 'Confirm' }, (...args) => { got.push(args); });
  modal.open();
  assert.equal(dom.find(modal.contentEl, i => i.tag === 'input'), undefined, 'no name field');
  dom.button(modal.modalEl, 'Confirm').click(); await dom.tick();
  assert.deepEqual(got, [['S', 'D']]);
});
