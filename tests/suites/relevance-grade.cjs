// Phase 3 on the real view and repository: goal chip, AI grading run, status bar, change summary and undo.
// The AI is a fake behind the real RelevanceGradeService (strict parser included); the DOM is tests/support-dom.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { integrationTest, root: projectRoot, load, core, DEFAULT_SETTINGS, fixture, withExpansionCoordinator, until, deferred, obsidian } = require('../support.cjs');
const dom = require('../support-dom.cjs');
const { hasCls, element, find, findAll, button, tick } = dom;

const MAP = 'Agent Workspace/Topics/map-a/Map.md';
const tierFor = title => ({ Body: 'core', Mind: 'support', REM: 'side', Dreams: 'support', Extra: 'support' })[title] ?? 'support';
// The default fake AI: a valid grade for every gradable card, with a reason that names the goal.
const gradeAll = (request, pick = tierFor) => ({ items: request.nodes.filter(n => n.parentId !== null).map(n => ({ id: n.id, tier: pick(n.title), reason: `${n.title} for ${request.goal}.` })) });

async function harness({ language = 'en', mapTitle = 'Sleep map' } = {}) {
  const { repo, app, contents } = fixture(language);
  const settings = { ...DEFAULT_SETTINGS, language, cliModel: 'gpt-6-luna' };
  repo.settings = settings;
  const mapDoc = { id: 'map-a', title: mapTitle, version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await repo.ensureTopicFolders('Agent Workspace/Topics/map-a');
  const ids = {};
  const add = async (key, title, parent) => {
    const created = await repo.createNote(title, 'gpt-6-luna', mapDoc, MAP, parent ? 'inherited' : 'workspace');
    Object.assign(created, { parentId: parent ? ids[parent] : null, x: parent ? 400 : 80, y: 80 + mapDoc.nodes.length * 200 });
    mapDoc.nodes.push(created); ids[key] = created.id;
    return created;
  };
  await add('root', 'Sleep'); await add('a', 'Body', 'root'); await add('b', 'Mind', 'root'); await add('c', 'REM', 'a'); await add('d', 'Dreams', 'b');
  await app.vault.create(MAP, core.serializeMap(mapDoc));
  await repo.rebuildDerivedData();
  const notices = [], opened = [];
  const Base = dom.makeModal();
  class Modal extends Base { open() { opened.push(this); super.open(); } }
  const ctx = {};
  const control = { decline: false, calls: [], reply: async request => gradeAll(request), usageAsks: 0 };
  const plugin = withExpansionCoordinator({
    repo, settings, running: new Set(), logs: { appendLog() {} }, rebuildDerivedData: () => repo.rebuildDerivedData(), relevanceGrades: new Map(),
    mutate: async work => { await work(); await ctx.view?.hydrate(); },
    confirmAiUsage: async (_model, run) => { control.usageAsks++; if (control.decline) return false; await run(); return true; }
  });
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Modal, Notice: class { constructor(m) { notices.push(m); } }, setTooltip() {} } });
  const gradeModule = load('core/relevance-grade-service.ts');
  const { RelevanceGradeService } = gradeModule;
  plugin.relevanceGrade = new RelevanceGradeService(async (request, signal, prepared) => {
    control.calls.push({ request, signal, step: prepared.step.id, prompt: prepared.prompt });
    const out = await control.reply(request, signal, prepared);
    return typeof out === 'string' ? out : JSON.stringify(out);
  });
  const view = new VisualAgentMapView({ app }, plugin);
  ctx.view = view;
  const rootEl = element('div');
  const reload = async () => {
    view.notes = new Map(await Promise.all(view.map.nodes.map(async n => [n.id, await repo.readNote(n.path)])));
    ({ goal: view.relevanceGoal, level: view.relevanceLevel, context: view.relevanceContext } = await repo.readRelevanceSetup(MAP));
  };
  view.path = MAP; view.map = await repo.readMap(MAP); view.contentEl = rootEl; view.focusNode = () => {}; view.hydrate = reload;
  let renders = 0;
  view.render = () => { renders++; rootEl.empty(); view.renderRelevanceStatus(rootEl); view.renderRelevanceGoalControl(rootEl.createDiv('vam-map-tools')); };
  await reload(); view.render();
  const cards = new Map(view.map.nodes.map(n => [n.id, element('div', 'vam-node')]));
  for (const [id, card] of cards) view.cardEls.set(id, card);
  const h = {
    repo, app, contents, view, plugin, ids, gradeModule, control, notices, opened, cards, rootEl,
    renders: () => renders,
    chip: () => find(rootEl, i => hasCls(i, 'vam-relevance-goal')),
    input: () => find(rootEl, i => hasCls(i, 'vam-relevance-goal-input')),
    bar: () => find(rootEl, i => hasCls(i, 'vam-relevance-statusbar')),
    barText: () => find(h.bar(), i => hasCls(i, 'vam-aim-status-value')).text,
    barButtons: () => findAll(h.bar() ?? element('div'), i => i.tag === 'button').map(b => b.text || b.attrs['aria-label']),
    run: () => plugin.relevanceGrades.get(MAP),
    note: key => repo.readNote(view.map.nodes.find(n => n.id === ids[key]).path),
    relevanceOf: async key => { const n = await h.note(key); return n.relevance ? [n.relevance.tier, n.relevance.reason] : undefined; },
    allRelevance: async () => Object.fromEntries(await Promise.all(Object.keys(ids).map(async key => [key, await h.relevanceOf(key)]))),
    // Click the goal chip, type, press Enter: the keyboard path.
    enter: async (goal, key = 'Enter') => {
      h.chip().click();
      const input = h.input(); assert.ok(input, 'the chip swaps in a text field');
      input.value = goal; input.fire('keydown', { key }); await tick();
    },
    settled: () => until(() => h.run() && h.run().status !== 'running'),
    saved: async () => (await repo.readMap(MAP)).nodes
  };
  return h;
}
const frontmatterOf = h => h.contents.get(MAP).match(/^---\n([\s\S]*?)\n---/)[1];
// The Undo button pops the history entry first and restores notes afterwards, so wait for the work as well.
const afterTravel = async h => { await until(() => h.view.history.canRedo); for (let i = 0; i < 12; i++) await tick(); };
const graded = async h => Object.values(await h.allRelevance()).filter(Boolean);

integrationTest('relevance: Set goal -> field -> Enter writes the goal and its first history entry, grades every non-top card and shows the result', async () => {
  const h = await harness();
  assert.equal(h.chip().text, 'Set goal'); assert.ok(hasCls(h.chip(), 'is-empty')); assert.equal(h.bar(), undefined, 'no status bar before any run');
  h.chip().click();
  const input = h.input();
  assert.equal(input.attrs['aria-label'], 'Map goal'); assert.equal(input.focused, true); assert.equal(h.chip(), undefined, 'the field replaces the chip in place');
  input.value = 'Sleep better\nthrough the night'; input.fire('keydown', { key: 'Enter' });
  assert.equal(h.run().status, 'running'); assert.ok(h.chip().disabled, 'the chip is disabled while grading');
  assert.equal(h.bar().attrs['aria-live'], 'polite'); assert.equal(h.barText(), 'Grading by goal…'); assert.deepEqual(h.barButtons(), ['Stop']);
  await h.settled();
  assert.equal(await h.repo.readRelevanceGoal(MAP), 'Sleep better through the night', 'newlines are removed');
  assert.match(frontmatterOf(h), /relevance-goal-history:\n  - "\d{4}-\d{2}-\d{2}: Sleep better through the night"/);
  const request = h.control.calls[0].request;
  assert.equal(request.goal, 'Sleep better through the night'); assert.equal(request.language, 'en'); assert.equal(request.contentLanguage, 'en');
  assert.equal(request.nodes.length, 5, 'the whole map is sent, the top-level card as context');
  assert.deepEqual(Object.keys(request.nodes[0]).sort(), ['depth', 'id', 'parentId', 'status', 'summary', 'title']);
  const all = await h.allRelevance();
  assert.equal(all.root, undefined, 'the top-level card is never graded');
  for (const key of ['a', 'b', 'c', 'd']) { assert.ok(['core', 'support', 'side'].includes(all[key][0])); assert.ok(all[key][1].trim()); }
  assert.deepEqual(all.c, ['side', 'REM for Sleep better through the night.']);
  assert.equal(h.view.notes.get(h.ids.a).relevance.tier, 'core', 'the view reads the new grade');
  assert.equal(h.barText(), 'Graded 4 topics, 4 changed (0 skipped)');
  assert.deepEqual(h.barButtons(), ['View changes', 'Undo', 'Dismiss']);
  assert.equal(h.chip().text, 'Goal: Sleep better through the night'); assert.equal(h.chip().disabled, false);
  assert.equal(h.control.usageAsks, 1);
  assert.equal(h.view.history.past.length, 2, 'goal and grading are two undo steps');
});

integrationTest('relevance: the map language, not the interface language, chooses the language of the reasons', async () => {
  const h = await harness({ language: 'en', mapTitle: '要如何在陽台養香草' });
  await h.enter('養出香草'); await h.settled();
  assert.equal(h.control.calls[0].request.contentLanguage, 'zh-TW'); assert.equal(h.control.calls[0].request.language, 'en');
  assert.match(load('core/relevance-grade-service.ts').buildRelevanceGradePrompt(h.control.calls[0].request), /繁體中文/);
});

integrationTest('relevance: changing the goal appends history and regrades; the summary lists only cards whose tier or reason changed', async () => {
  const h = await harness();
  await h.enter('First goal'); await h.settled();
  // Second run: Body and Mind keep tier and reason, REM changes tier, Dreams changes only the reason.
  h.control.reply = async request => ({ items: request.nodes.filter(n => n.parentId !== null).map(n => {
    if (n.title === 'Body') return { id: n.id, tier: 'core', reason: 'Body for First goal.' };
    if (n.title === 'Mind') return { id: n.id, tier: 'support', reason: 'Mind for First goal.' };
    if (n.title === 'REM') return { id: n.id, tier: 'core', reason: 'REM for First goal.' };
    return { id: n.id, tier: 'support', reason: 'A new reason.' };
  }) });
  await h.enter('Second goal'); await h.settled();
  assert.match(h.contents.get(MAP), /- "[\d-]+: First goal"\n  - "[\d-]+: Second goal"/);
  assert.equal(h.contents.get(MAP).match(/^  - "/gm).length, 2, 'both goals are in the history');
  assert.equal(h.barText(), 'Graded 4 topics, 2 changed (0 skipped)');
  button(h.bar(), 'View changes').click();
  const modal = h.opened.at(-1);
  assert.equal(modal.titleEl.text, 'Relevance changes'); assert.ok(button(modal.modalEl, 'Close').focused, 'focus starts on Close');
  const rows = findAll(modal.contentEl, i => hasCls(i, 'vam-relevance-change'));
  assert.deepEqual(rows.map(r => find(r, i => hasCls(i, 'vam-relevance-change-title')).text), ['REM', 'Dreams']);
  const tagTexts = row => findAll(row, i => hasCls(i, 'vam-relevance-tag')).map(tag => tag.children[1].text);
  assert.deepEqual(tagTexts(rows[0]), ['Skippable', 'Must learn']); assert.deepEqual(tagTexts(rows[1]), ['Learn when needed', 'Learn when needed']);
  assert.deepEqual(rows.map(r => find(r, i => hasCls(i, 'vam-relevance-change-reason')).text), ['REM for First goal.', 'A new reason.']);
  assert.equal(find(rows[0], i => hasCls(i, 'vam-relevance-arrow')).attrs['aria-label'], 'changed to');
  assert.equal(find(modal.contentEl, i => i.tag === 'ul').attrs['aria-label'], 'Relevance changes');
  assert.deepEqual([...h.cards].filter(([, card]) => hasCls(card, 'vam-structure-suggested')).map(([id]) => id).sort(), [h.ids.c, h.ids.d].sort(), 'changed cards are marked');
  modal.close();
  assert.equal([...h.cards.values()].filter(card => hasCls(card, 'vam-structure-suggested')).length, 0, 'closing clears the marks');
});

integrationTest('relevance: a first grade shows "Not graded" as the old tag; Enter on an unchanged goal regrades without a history entry', async () => {
  const h = await harness();
  await h.enter('Goal'); await h.settled();
  button(h.bar(), 'View changes').click();
  assert.equal(find(h.opened.at(-1).contentEl, i => hasCls(i, 'vam-relevance-ungraded')).text, 'Not graded');
  await h.enter('Goal'); await h.settled();
  assert.equal(h.control.calls.length, 2, 'regraded');
  assert.equal(h.contents.get(MAP).match(/^  - "/gm).length, 1, 'no new history entry');
  assert.equal(h.view.history.past.length, 2, 'no new goal undo step either');
  assert.equal(h.barText(), 'Graded 4 topics, 0 changed (0 skipped)'); assert.deepEqual(h.barButtons(), ['Dismiss']);
});

integrationTest('relevance: one undo restores every graded note (absent before means removed); the goal is a separate undo step', async () => {
  const h = await harness();
  await h.repo.writeRelevance(h.view.map.nodes.find(n => n.id === h.ids.a).path, { tier: 'side', reason: 'Old reason.' });
  await h.view.hydrate();
  const before = await h.allRelevance();
  await h.enter('Goal'); await h.settled();
  assert.notDeepEqual(await h.allRelevance(), before);
  assert.ok(h.barButtons().includes('Undo'));
  button(h.bar(), 'Undo').click(); await afterTravel(h);
  assert.deepEqual(await h.allRelevance(), before, 'a single undo puts back every previous value');
  assert.equal(await h.repo.readRelevanceGoal(MAP), 'Goal', 'the goal is its own undo step and stays');
  assert.equal(h.barButtons().includes('Undo'), false, 'Undo is only offered while the grading is the latest step');
  await h.view.travel(false);
  assert.equal(await h.repo.readRelevanceGoal(MAP), undefined, 'the second undo removes the goal');
  assert.doesNotMatch(h.contents.get(MAP), /relevance-goal/);
  await h.view.travel(true); await h.view.travel(true);
  assert.equal(await h.repo.readRelevanceGoal(MAP), 'Goal'); assert.equal((await h.relevanceOf('c'))?.[0], 'side', 'redo grades again');
});

integrationTest('relevance: undo and redo never overwrite a note the owner edited after grading; they say how many were left', async () => {
  const h = await harness();
  await h.enter('Goal'); await h.settled();
  const afterGrading = await h.allRelevance();
  const dreams = h.view.map.nodes.find(n => n.id === h.ids.d);
  await h.repo.writeRelevance(dreams.path, { tier: 'side', reason: 'My own opinion.' });
  button(h.bar(), 'Undo').click(); await afterTravel(h);
  assert.deepEqual(await h.relevanceOf('d'), ['side', 'My own opinion.'], 'the owner edit stays');
  assert.equal(await h.relevanceOf('a'), undefined); assert.equal(await h.relevanceOf('c'), undefined, 'the untouched notes are put back');
  assert.deepEqual(h.notices, ['1 topics were edited after grading and were left as they are.']);
  h.notices.length = 0;
  await h.view.travel(true);
  assert.deepEqual(await h.relevanceOf('d'), ['side', 'My own opinion.'], 'redo leaves it alone too');
  assert.deepEqual(await h.relevanceOf('a'), afterGrading.a);
  assert.equal(h.notices.length, 1);
});

integrationTest('relevance: Stop aborts the call, writes no note, keeps the goal and says so; a late reply is dropped', async () => {
  const h = await harness();
  const gate = deferred(); h.control.reply = request => gate.promise.then(() => gradeAll(request));
  await h.enter('Goal'); await until(() => h.control.calls.length);
  assert.equal(h.run().status, 'running');
  button(h.bar(), 'Stop').click();
  assert.equal(h.control.calls[0].signal.aborted, true); assert.equal(h.run().status, 'stopped');
  assert.equal(h.barText(), 'Grading stopped. No topic was changed.'); assert.deepEqual(h.barButtons(), ['Dismiss']);
  gate.resolve(); await tick(); await tick(); await tick();
  assert.deepEqual(await graded(h), [], 'the late result writes nothing');
  assert.equal(h.run().status, 'stopped', 'and does not reopen the status');
  assert.equal(await h.repo.readRelevanceGoal(MAP), 'Goal', 'the confirmed goal is kept');
  assert.equal(h.view.history.past.length, 1, 'only the goal step');
  find(h.bar(), i => i.attrs['aria-label'] === 'Dismiss').click();
  assert.equal(h.bar(), undefined, 'the status can be dismissed'); assert.equal(h.chip().text, 'Goal: Goal');
});

integrationTest('relevance: a reply that is not exactly one valid grade per card writes nothing and the bar names the problem', async () => {
  const cases = {
    'not JSON': () => 'sorry, I cannot',
    'a missing card': r => { const o = gradeAll(r); o.items.pop(); return o; },
    'a duplicate card': r => { const o = gradeAll(r); o.items.push(o.items[0]); return o; },
    'an unknown card': r => { const o = gradeAll(r); o.items.push({ id: 'ghost', tier: 'core', reason: 'x' }); return o; },
    'the top-level card': r => { const o = gradeAll(r); o.items.push({ id: r.nodes[0].id, tier: 'core', reason: 'x' }); return o; },
    'a bad tier': r => { const o = gradeAll(r); o.items[0].tier = 'must'; return o; },
    'a blank reason': r => { const o = gradeAll(r); o.items[0].reason = '  '; return o; },
    'an extra key': r => { const o = gradeAll(r); o.items[0].title = 'x'; return o; },
    'an extra top-level key': r => ({ ...gradeAll(r), goal: 'x' }),
    'a child above its parent': r => { const o = gradeAll(r); o.items.find(i => r.nodes.find(n => n.id === i.id).title === 'Dreams').tier = 'core'; return o; }
  };
  for (const [name, reply] of Object.entries(cases)) {
    const h = await harness();
    h.control.reply = async request => reply(request);
    await h.enter('Goal'); await h.settled();
    assert.equal(h.run().status, 'failed', name);
    assert.match(h.barText(), /^Grading failed\. No topic was changed\. The AI grading could not be used: /, name);
    assert.deepEqual(await graded(h), [], `${name}: no note written`);
    assert.deepEqual(h.barButtons(), ['Dismiss'], name);
    assert.equal(h.view.history.past.length, 1, `${name}: only the goal step`);
  }
});

integrationTest('relevance: a provider error or an over-budget map writes nothing and shows the reason', async () => {
  const { RelevanceGradeError } = load('core/relevance-grade-service.ts');
  const h = await harness();
  h.control.reply = async () => { throw new RelevanceGradeError('over_budget', 'The map is too large to grade at once. Nothing was changed.'); };
  await h.enter('Goal'); await h.settled();
  assert.equal(h.barText(), 'Grading failed. No topic was changed. The map is too large to grade at once. Nothing was changed.');
  assert.deepEqual(await graded(h), []);
  h.control.reply = async () => { throw new Error('provider exploded'); };
  await h.enter('Goal two'); await h.settled();
  assert.equal(h.barText(), 'Grading failed. No topic was changed. provider exploded');
  assert.deepEqual(await graded(h), []);
});

integrationTest('relevance: declining the AI usage notice keeps the goal, calls no AI and writes no note', async () => {
  const h = await harness();
  h.control.decline = true;
  await h.enter('Goal'); await h.settled();
  assert.equal(h.control.calls.length, 0); assert.equal(h.run().status, 'declined');
  assert.equal(h.barText(), 'Grading did not start. The goal was saved; no topic was changed.');
  assert.equal(await h.repo.readRelevanceGoal(MAP), 'Goal'); assert.deepEqual(await graded(h), []);
  assert.equal(h.chip().disabled, false, 'the chip can be used again');
});

integrationTest('relevance: closing the view or leaving the map while grading aborts the call; the late result is never written', async () => {
  for (const how of ['close', 'switch']) {
    const h = await harness();
    const gate = deferred(); h.control.reply = request => gate.promise.then(() => gradeAll(request));
    await h.enter('Goal'); await until(() => h.control.calls.length);
    if (how === 'close') await h.view.onClose(); else h.view.abortRelevanceGrade();
    assert.equal(h.control.calls[0].signal.aborted, true, how);
    assert.equal(h.plugin.relevanceGrades.has(MAP), false, `${how}: the run is forgotten`);
    gate.resolve(); await tick(); await tick(); await tick();
    assert.deepEqual(await graded(h), [], `${how}: nothing written`);
  }
});

integrationTest('relevance: a result for a map the view has since left is dropped even when nothing aborted it', async () => {
  const h = await harness();
  const gate = deferred(); h.control.reply = request => gate.promise.then(() => gradeAll(request));
  await h.enter('Goal'); await until(() => h.control.calls.length);
  h.view.path = 'Agent Workspace/Topics/other/Map.md';
  gate.resolve(); await tick(); await tick(); await tick();
  assert.deepEqual(await graded(h), []);
});

integrationTest('relevance: a card deleted, renamed or moved while the AI worked is skipped and counted; a card added meanwhile stays ungraded', async () => {
  const h = await harness();
  const gate = deferred(); h.control.reply = request => gate.promise.then(() => gradeAll(request));
  await h.repo.writeRelevance(h.view.map.nodes.find(n => n.id === h.ids.c).path, { tier: 'core', reason: 'Old grade for REM.' });
  await h.enter('Goal'); await until(() => h.control.calls.length);
  // While the AI works: Mind is renamed, REM is moved under Mind, Dreams is deleted, and a new card appears under Body.
  const mind = h.view.map.nodes.find(n => n.id === h.ids.b);
  await h.repo.updateNote(mind.path, { title: 'Mind renamed' });
  h.view.map.nodes.find(n => n.id === h.ids.c).parentId = h.ids.b;
  h.view.map.nodes = h.view.map.nodes.filter(n => n.id !== h.ids.d);
  const doc = { id: 'map-a', title: 'Sleep map', version: 1, nodes: h.view.map.nodes, viewport: { x: 0, y: 0, zoom: 1 } };
  const extra = await h.repo.createNote('Extra', 'gpt-6-luna', doc, MAP, 'inherited');
  Object.assign(extra, { parentId: h.ids.a, x: 400, y: 900 }); h.view.map.nodes.push(extra);
  gate.resolve(); await h.settled();
  assert.equal(h.barText(), 'Graded 1 topics, 1 changed (3 skipped)');
  assert.deepEqual(await h.relevanceOf('a'), ['core', 'Body for Goal.']);
  assert.equal(await h.relevanceOf('b'), undefined, 'renamed: skipped'); assert.deepEqual(await h.relevanceOf('c'), ['core', 'Old grade for REM.'], 'moved: the old grade stays');
  assert.equal((await h.repo.readNote(extra.path)).relevance, undefined, 'added later: ungraded');
  button(h.bar(), 'Undo').click(); await afterTravel(h);
  assert.equal(await h.relevanceOf('a'), undefined);
});

integrationTest('relevance: if one note cannot be written the others are, the bar counts the failure, and undo covers only what was written', async () => {
  const h = await harness();
  const real = h.repo.writeRelevance.bind(h.repo);
  const failing = h.view.map.nodes.find(n => n.id === h.ids.b).path;
  h.repo.writeRelevance = async (p, value) => { if (p === failing && value) throw new Error('disk full'); return real(p, value); };
  await h.enter('Goal'); await h.settled();
  assert.equal(h.barText(), 'Graded 3 topics, 3 changed (0 skipped) 1 could not be saved.');
  assert.equal(await h.relevanceOf('b'), undefined); assert.equal(h.run().outcome.changes.length, 3);
  button(h.bar(), 'Undo').click(); await afterTravel(h);
  assert.deepEqual(await graded(h), []);
});

integrationTest('relevance: only one run per map; a second Enter, or a second view of the same map, cannot start another', async () => {
  const h = await harness();
  const gate = deferred(); h.control.reply = request => gate.promise.then(() => gradeAll(request));
  await h.enter('Goal'); await until(() => h.control.calls.length);
  await h.view.submitRelevanceGoal('Another');
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, setTooltip() {} } });
  const other = new VisualAgentMapView({ app: h.app }, h.plugin); Object.assign(other, { path: MAP, map: h.view.map, render() {} });
  await other.submitRelevanceGoal('Third');
  assert.equal(h.control.calls.length, 1); assert.equal(await h.repo.readRelevanceGoal(MAP), 'Goal');
  gate.resolve(); await h.settled();
});

integrationTest('relevance: Esc and focus leaving the group cancel, an empty Enter never reaches the AI, and Esc returns focus to the chip', async () => {
  const h = await harness();
  h.chip().click(); h.input().value = 'ignored'; h.input().fire('keydown', { key: 'Escape' }); await tick();
  assert.equal(h.input(), undefined); assert.equal(h.chip().focused, true); assert.equal(h.chip().text, 'Set goal');
  h.chip().click(); h.input().value = 'ignored too'; h.input().fire('focusout', { relatedTarget: null }); await tick();
  assert.equal(h.input(), undefined); assert.equal(h.chip().text, 'Set goal');
  h.chip().click(); h.input().value = '   '; h.input().fire('keydown', { key: 'Enter' }); await tick();
  assert.equal(h.input(), undefined, 'the field closes'); assert.equal(h.chip().focused, true);
  assert.equal(h.control.calls.length, 0); assert.equal(h.control.usageAsks, 0); assert.equal(h.run(), undefined);
  assert.equal(await h.repo.readRelevanceGoal(MAP), undefined, 'no goal written either');
  // A blur after Enter must not cancel the run that Enter started.
  h.chip().click(); const input = h.input(); input.value = 'Real goal'; input.fire('keydown', { key: 'Enter' }); input.fire('focusout', { relatedTarget: null }); await h.settled();
  assert.equal(h.control.calls.length, 1);
});

integrationTest('relevance: an existing goal prefills the field and the goal is stored at most 200 characters', async () => {
  const h = await harness();
  await h.enter('Existing goal'); await h.settled();
  h.chip().click();
  assert.equal(h.input().value, 'Existing goal'); assert.equal(h.input().maxLength, 200);
  h.input().value = `  ${'x'.repeat(250)}  `; h.input().fire('keydown', { key: 'Enter' }); await h.settled();
  assert.equal((await h.repo.readRelevanceGoal(MAP)).length, 200);
});

integrationTest('relevance: AIM maps and the built-in sample have no goal entry and never grade', async () => {
  const h = await harness();
  h.view.map.aim = { runs: [] };
  await h.view.submitRelevanceGoal('Goal'); assert.equal(h.control.calls.length, 0); assert.equal(h.run(), undefined); assert.equal(await h.repo.readRelevanceGoal(MAP), undefined);
  h.view.map.aim = undefined; h.view.builtIn = true;
  await h.view.submitRelevanceGoal('Goal'); assert.equal(h.control.calls.length, 0); assert.equal(await h.repo.readRelevanceGoal(MAP), undefined);
  // The toolbar entry and the bar sit behind the same guards in the real render.
  const source = fs.readFileSync(path.join(projectRoot, 'experiences/visual-map/view.ts'), 'utf8');
  assert.match(source, /if \(!aimMode\) \{[\s\S]{0,1400}this\.renderRelevanceGoalControl\(tools\);/);
  assert.match(source, /if \(!this\.builtIn && !this\.map\.aim\) this\.renderRelevanceStatus\(this\.contentEl\);/);
});

integrationTest('relevance: grading changes only frontmatter of the graded notes, never a body, and the map structure stays', async () => {
  const h = await harness();
  const bodyOf = text => text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
  const updatedOf = text => /updated: (.*)/.exec(text)?.[1];
  const before = new Map(h.view.map.nodes.map(n => [n.id, h.contents.get(n.path)]));
  const mapBefore = JSON.stringify(await h.saved());
  await h.enter('Goal'); await h.settled();
  for (const n of h.view.map.nodes) {
    assert.equal(bodyOf(h.contents.get(n.path)), bodyOf(before.get(n.id)), 'body unchanged');
    assert.equal(updatedOf(h.contents.get(n.path)), updatedOf(before.get(n.id)), '`updated` unchanged');
  }
  assert.equal(h.contents.get(h.view.map.nodes.find(n => n.id === h.ids.root).path), before.get(h.ids.root), 'the top-level note is byte-identical');
  assert.equal(JSON.stringify(await h.saved()), mapBefore, 'the map structure is unchanged');
});

integrationTest('relevance: the suggested-card ring outranks every status rule that sets a box-shadow (idea cards used to hide it)', () => {
  const css = fs.readFileSync(path.join(projectRoot, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Class-level specificity: classes, attributes and pseudo-classes (:not(x) counts as x); no ids or elements are used.
  const specificity = selector => (selector.replace(/:not\(/g, ' (').match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selectors: m[1].split(',').map(s => s.trim()), body: m[2] }));
  const ring = rules.filter(r => r.selectors.some(s => /\.vam-structure-suggested$/.test(s)) && /box-shadow/.test(r.body));
  assert.ok(ring.length, 'a ring rule exists');
  const ringSpec = Math.max(...ring.flatMap(r => r.selectors.filter(s => s.includes('vam-structure-suggested')).map(specificity)));
  const statusRules = rules.filter(r => r.selectors.some(s => /^\.vam-node:not\(\[data-aim-kind\]\)\[data-status=/.test(s)) && /box-shadow/.test(r.body));
  assert.ok(statusRules.some(r => /data-status="idea"/.test(r.selectors[0])), 'the idea rule that hides shadows is found');
  for (const rule of statusRules) assert.ok(ringSpec > Math.max(...rule.selectors.map(specificity)), `ring beats ${rule.selectors[0]}`);
});

integrationTest('relevance: the goal chip is named "Goal: <goal>" for assistive tech, and "Set goal" when empty (zh too)', async () => {
  const h = await harness();
  assert.equal(h.chip().attrs['aria-label'], 'Set goal');
  await h.enter('Sleep better'); await h.settled();
  assert.equal(h.chip().attrs['aria-label'], 'Goal: Sleep better');
  // The view builds the name from these two keys; each bundle has its own language, so check the zh strings directly.
  const { translate } = load('i18n.ts');
  assert.equal(translate('zh-TW', 'ui.relevance_goal_0', '睡得更好'), '目標：睡得更好');
  assert.equal(translate('zh-TW', 'ui.relevance_goal_set'), '設定目標');
});

integrationTest('relevance: focus inside the status bar survives a repaint (Stop vanishing on completion, Undo by keyboard) and is never stolen', async () => {
  const h = await harness();
  const doc = { activeElement: null };
  h.rootEl.ownerDocument = doc; h.rootEl.root = doc;
  const focus = el => { el.focus(); doc.activeElement = el; };
  // Re-render the way view.render does: capture before, rebuild, restore after.
  const render = h.view.render;
  h.view.render = () => { const restore = h.view.keepRelevanceBarFocus(); render(); restore(); };
  h.control.reply = async request => { await tick(); return gradeAll(request); };
  h.chip().click(); const input = h.input(); input.value = 'Goal'; input.fire('keydown', { key: 'Enter' });
  assert.deepEqual(h.barButtons(), ['Stop']); focus(h.bar().children.find(c => c.tag === 'button'));
  await h.settled(); await tick(); await tick();
  assert.ok(h.barText().startsWith('Graded'));
  h.view.render();
  assert.equal(doc.activeElement.text, 'View changes', 'focus lands on a button that still exists, not on the page');
  // Undo by keyboard: the bar is repainted without the Undo button.
  focus(button(h.bar(), 'Undo')); button(h.bar(), 'Undo').click(); await afterTravel(h);
  assert.equal(h.barButtons().includes('Undo'), false);
  assert.ok(h.bar().contains(doc.activeElement), 'focus stays in the status bar after Undo');
  // Focus elsewhere is left alone.
  const chip = h.chip(); focus(chip); h.view.render();
  assert.equal(h.bar().contains(doc.activeElement), false, 'a repaint never pulls focus into the bar');
  assert.equal(doc.activeElement, chip);
});

// ---- Phase 4: level and context in the same inline group ----------------------------------------------------------
const select = h => find(h.rootEl, i => hasCls(i, 'vam-relevance-level'));
const contextInput = h => find(h.rootEl, i => hasCls(i, 'vam-relevance-context-input'));
const gradeButton = h => find(h.rootEl, i => hasCls(i, 'vam-relevance-grade-button'));
const group = h => find(h.rootEl, i => hasCls(i, 'vam-relevance-setup'));
const open = h => { h.chip().click(); return h.input(); };

integrationTest('relevance: the chip expands into one group: goal, a dropdown level, an optional context and a quiet button (en)', async () => {
  const h = await harness();
  open(h);
  assert.equal(group(h).attrs.role, 'group'); assert.equal(group(h).attrs['aria-label'], 'Map goal');
  assert.ok(hasCls(select(h), 'dropdown'), 'the Obsidian dropdown class');
  assert.deepEqual(select(h).children.map(o => [o.text, o.optionValue]), [['Not set', ''], ['Beginner', 'beginner'], ['Some background', 'intermediate'], ['Familiar', 'familiar']]);
  assert.equal(select(h).value, ''); assert.equal(select(h).attrs['aria-label'], 'Your level');
  assert.equal(contextInput(h).attrs.placeholder, 'Optional: what you already know, conditions or limits'); assert.equal(contextInput(h).attrs['aria-label'], 'Extra context');
  assert.equal(contextInput(h).maxLength, 200);
  assert.equal(gradeButton(h).text, 'Grade with this'); assert.equal(h.input().focused, true, 'focus starts on the goal');
});

integrationTest('relevance: goal, level and context are saved in one write, sent to the AI, and are one undo step; grading stays its own step', async () => {
  const h = await harness();
  open(h); h.input().value = 'Grow herbs'; select(h).value = 'beginner'; contextInput(h).value = '  Half a day\nof sun  ';
  contextInput(h).fire('keydown', { key: 'Enter' }); await h.settled();
  assert.match(frontmatterOf(h), /relevance-goal: "Grow herbs"\nrelevance-level: "beginner"\nrelevance-context: "Half a day of sun"/);
  const request = h.control.calls[0].request;
  assert.equal(request.goal, 'Grow herbs'); assert.equal(request.level, 'beginner'); assert.equal(request.context, 'Half a day of sun');
  assert.match(load('core/relevance-grade-service.ts').buildRelevanceGradePrompt(request), /Learner level \(JSON string[^\n]*: "beginner"\nLearner context \(JSON string, or null\): "Half a day of sun"\n/);
  assert.equal(h.view.history.past.length, 2, 'one setup step plus one grading step');
  assert.equal(h.chip().text, 'Goal: Grow herbs · Beginner'); assert.equal(h.chip().attrs['aria-label'], 'Goal: Grow herbs · Beginner');
  const history = h.contents.get(MAP).match(/^  - "/gm); assert.equal(history.length, 1, 'the history records the goal only');
  assert.doesNotMatch(h.contents.get(MAP), /relevance-goal-history:[\s\S]*Half a day/);
  button(h.bar(), 'Undo').click(); await afterTravel(h);
  await h.view.travel(false);
  assert.doesNotMatch(h.contents.get(MAP), /relevance-(goal|level|context)/, 'the second undo removes all three keys together');
  await h.view.travel(true);
  assert.match(frontmatterOf(h), /relevance-goal: "Grow herbs"\nrelevance-level: "beginner"\nrelevance-context: "Half a day of sun"/);
});

integrationTest('relevance: only a level or context change is one undo step without a new history entry; an unchanged setup regrades with none', async () => {
  const h = await harness();
  await h.enter('Goal'); await h.settled();
  assert.equal(h.view.history.past.length, 2);
  open(h); select(h).value = 'familiar'; h.input().fire('keydown', { key: 'Enter' }); await h.settled();
  assert.equal(h.view.history.past.length, 3, 'a level change adds one setup step; the regrade changed no card, so no grading step');
  assert.equal(h.contents.get(MAP).match(/^  - "/gm).length, 1, 'no history entry: the goal is the same');
  assert.equal(h.control.calls.at(-1).request.level, 'familiar'); assert.equal(h.control.calls.at(-1).request.context, undefined);
  open(h); assert.equal(select(h).value, 'familiar', 'the saved level is preselected'); h.input().fire('keydown', { key: 'Enter' }); await h.settled();
  assert.equal(h.control.calls.length, 3, 'regraded'); assert.equal(h.view.history.past.length, 3, 'nothing changed: no setup step, no grading step');
  // Clearing the level and the context removes their keys.
  open(h); select(h).value = ''; contextInput(h).value = '   '; h.input().fire('keydown', { key: 'Enter' }); await h.settled();
  assert.doesNotMatch(h.contents.get(MAP), /relevance-(level|context)/); assert.equal(h.chip().text, 'Goal: Goal');
  assert.equal(h.control.calls.at(-1).request.level, undefined);
});

integrationTest('relevance: the button confirms; its press cannot count as leaving the group; Tab inside the group does not cancel', async () => {
  const h = await harness();
  open(h); h.input().value = 'Via button';
  let prevented = 0; gradeButton(h).fire('mousedown', { preventDefault() { prevented++; } });
  assert.equal(prevented, 1, 'mousedown on the button keeps focus in the field');
  // Tab from the goal to the select, to the context, to the button: focus stays inside the group.
  h.input().fire('focusout', { relatedTarget: select(h) }); select(h).fire('focusout', { relatedTarget: contextInput(h) });
  contextInput(h).fire('focusout', { relatedTarget: gradeButton(h) });
  assert.ok(group(h), 'still open'); assert.equal(h.control.calls.length, 0);
  gradeButton(h).click(); await h.settled();
  assert.equal(await h.repo.readRelevanceGoal(MAP), 'Via button'); assert.equal(h.control.calls.length, 1);
  // Leaving to somewhere outside (or to nowhere) cancels, from any control.
  const outside = element('button');
  for (const [name, pick] of [['context', contextInput], ['select', select], ['button', gradeButton]]) {
    open(h); assert.ok(group(h)); pick(h).fire('focusout', { relatedTarget: outside }); await tick();
    assert.equal(group(h), undefined, `${name}: focus left the group`); assert.equal(h.control.calls.length, 1);
  }
});

integrationTest('relevance: Esc cancels from any control, an IME-confirming Enter in either text field is ignored, and an empty goal never reaches the AI', async () => {
  const h = await harness();
  for (const pick of [h.input, select, contextInput, gradeButton]) {
    open(h); pick(h).fire('keydown', { key: 'Escape' }); await tick();
    assert.equal(group(h), undefined); assert.equal(h.chip().focused, true, 'focus returns to the chip');
  }
  open(h); h.input().value = 'Goal'; h.input().fire('keydown', { key: 'Enter', isComposing: true }); contextInput(h).fire('keydown', { key: 'Enter', isComposing: true });
  assert.ok(group(h), 'composition Enter does nothing'); assert.equal(h.control.calls.length, 0);
  select(h).fire('keydown', { key: 'Enter' }); assert.ok(group(h), 'Enter on the dropdown does not submit');
  h.input().value = '  '; contextInput(h).value = 'only context'; contextInput(h).fire('keydown', { key: 'Enter' }); await tick();
  assert.equal(group(h), undefined); assert.equal(h.control.calls.length, 0); assert.equal(h.control.usageAsks, 0);
  assert.equal(await h.repo.readRelevanceGoal(MAP), undefined, 'nothing written for a blank goal');
  open(h); h.input().value = ' '; gradeButton(h).click(); await tick();
  assert.equal(h.control.calls.length, 0, 'an empty goal through the button is ignored too');
});

integrationTest('relevance: while a run is going the chip is disabled and no group opens', async () => {
  const h = await harness();
  const gate = deferred(); h.control.reply = request => gate.promise.then(() => gradeAll(request));
  await h.enter('Goal'); await until(() => h.control.calls.length);
  assert.ok(h.chip().disabled); const before = h.renders();
  h.view.editRelevanceGoal(h.rootEl); assert.equal(group(h), undefined, 'a running map opens no group');
  assert.equal(h.renders(), before);
  gate.resolve(); await h.settled();
});

integrationTest('relevance: the level and context keys survive map saves, read back only when valid, and the context is capped at 200', async () => {
  const h = await harness();
  open(h); h.input().value = 'Goal'; select(h).value = 'intermediate'; contextInput(h).value = 'c'.repeat(260); h.input().fire('keydown', { key: 'Enter' }); await h.settled();
  assert.equal((await h.repo.readRelevanceSetup(MAP)).context.length, 200);
  const map = await h.repo.readMap(MAP); map.viewport = { x: 1, y: 2, zoom: 1.5 }; await h.repo.saveMap(MAP, map);
  assert.deepEqual({ ...(await h.repo.readRelevanceSetup(MAP)), context: '' }, { goal: 'Goal', level: 'intermediate', context: '' });
  h.contents.set(MAP, h.contents.get(MAP).replace('relevance-level: "intermediate"', 'relevance-level: "expert"'));
  assert.equal((await h.repo.readRelevanceSetup(MAP)).level, undefined, 'an unrecognised level reads as not set');
});

// ---- Repair round (v2.1) -----------------------------------------------------------------------------------------
const dreamsAboveParent = request => { const o = gradeAll(request); o.items.find(i => request.nodes.find(n => n.id === i.id).title === 'Dreams').tier = 'core'; return o; };

integrationTest('relevance repair: a parent-child violation sends ONE repair request carrying the pairs; a valid repair is written as one history entry', async () => {
  const h = await harness();
  const seen = [];
  h.control.reply = async (request, _signal, prepared) => {
    seen.push(prepared.step.id);
    if (prepared.step.id === 'relevance-grade') return dreamsAboveParent(request);
    seen.push(h.barText());
    const o = gradeAll(request);
    o.items.find(i => request.nodes.find(n => n.id === i.id).title === 'Dreams').reason = 'Dreams, fixed.';
    return o;
  };
  await h.enter('Goal'); await h.settled();
  assert.deepEqual(h.control.calls.map(c => c.step), ['relevance-grade', 'relevance-grade-repair']);
  const mind = h.view.map.nodes.find(n => n.id === h.ids.b).id, dreams = h.view.map.nodes.find(n => n.id === h.ids.d).id;
  assert.ok(h.control.calls[1].prompt.includes(JSON.stringify([{ childId: dreams, childTier: 'core', parentId: mind, parentTier: 'support' }])), 'the pair is in the repair prompt');
  assert.equal(seen[2], 'Fixing parent-child order…', 'the bar shows the repair text while it runs');
  assert.equal(h.run().status, 'done'); assert.equal(h.barText(), 'Graded 4 topics, 4 changed (0 skipped)');
  assert.deepEqual(await h.relevanceOf('d'), ['support', 'Dreams, fixed.']);
  assert.equal(h.view.history.past.length, 2, 'goal step plus ONE grading step');
  assert.equal(h.control.usageAsks, 1, 'one usage notice for both requests');
});

integrationTest('relevance repair: a repair that still violates writes nothing, sends no third request and shows the error bar', async () => {
  const h = await harness();
  h.control.reply = async request => dreamsAboveParent(request);
  await h.enter('Goal'); await h.settled();
  assert.equal(h.control.calls.length, 2, 'exactly one repair, never a third request');
  assert.equal(h.run().status, 'failed'); assert.match(h.barText(), /^Grading failed\. No topic was changed\..*hierarchy/);
  assert.deepEqual(await graded(h), [], 'nothing written'); assert.equal(h.view.history.past.length, 1, 'only the goal step');
});

integrationTest('relevance repair: a failure that is not only about hierarchy sends no repair request', async () => {
  const h = await harness();
  h.control.reply = async request => { const o = dreamsAboveParent(request); o.items.pop(); return o; };
  await h.enter('Goal'); await h.settled();
  assert.equal(h.control.calls.length, 1); assert.equal(h.run().status, 'failed'); assert.deepEqual(await graded(h), []);
});

integrationTest('relevance repair: Stop during the repair aborts it, writes nothing and a late repair reply is dropped', async () => {
  const h = await harness();
  const gate = deferred();
  h.control.reply = async (request, _s, prepared) => prepared.step.id === 'relevance-grade' ? dreamsAboveParent(request) : gate.promise.then(() => gradeAll(request));
  await h.enter('Goal'); await until(() => h.control.calls.length === 2);
  assert.equal(h.barText(), 'Fixing parent-child order…'); assert.deepEqual(h.barButtons(), ['Stop']);
  button(h.bar(), 'Stop').click();
  assert.equal(h.control.calls[1].signal.aborted, true); assert.equal(h.run().status, 'stopped');
  gate.resolve(); await tick(); await tick(); await tick();
  assert.deepEqual(await graded(h), []); assert.equal(h.run().status, 'stopped'); assert.equal(h.view.history.past.length, 1);
});

integrationTest('relevance repair: an over-budget repair is refused with the over-budget message and nothing is sent or written', async () => {
  const h = await harness();
  // The grade request fits; the repair request (original prompt + first reply + pairs) is judged against the same budget.
  const { relevanceGradeRepairStep, RelevanceGradeError } = h.gradeModule;
  const original = relevanceGradeRepairStep.policy;
  relevanceGradeRepairStep.policy = () => { throw new RelevanceGradeError('over_budget', 'The map is too large to grade at once. Nothing was changed.'); };
  try {
    h.control.reply = async request => dreamsAboveParent(request);
    await h.enter('Goal'); await h.settled();
  } finally { relevanceGradeRepairStep.policy = original; }
  assert.equal(h.control.calls.length, 1, 'the repair request is never sent');
  assert.equal(h.barText(), 'Grading failed. No topic was changed. The map is too large to grade at once. Nothing was changed.');
  assert.deepEqual(await graded(h), []);
});
