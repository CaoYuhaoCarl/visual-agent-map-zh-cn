const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, integrationTest, load, core, node, map, plain, withExpansionCoordinator, obsidian, DEFAULT_SETTINGS, fixture, topicNote, deferred, until } = require('../support.cjs');
test('a running expansion batch cannot be overwritten for the same parent', async () => {
  const { ShallowExpansionCoordinator } = load('experiences/visual-map/expansion-batch.ts');
  const active = new Map(), states = new Map(), coordinator = new ShallowExpansionCoordinator(active, states);
  let finishFirst, dispatched = [];
  const accepted = coordinator.start('parent.md', [node('first'), node('second')], async (child, _signal, markAccepted) => {
    dispatched.push(child.path); markAccepted(); if (child.id === 'first') await new Promise(resolve => { finishFirst = resolve; });
  }, () => {});
  await accepted;
  const originalController = active.get('parent.md');
  await assert.rejects(coordinator.start('parent.md', [node('duplicate')], async child => { dispatched.push(child.path); }, () => {}), /already running/);
  assert.equal(active.get('parent.md'), originalController);
  coordinator.stop('parent.md'); finishFirst();
  await until(() => states.get('parent.md').status !== 'running');
  assert.deepEqual(dispatched, ['first.md', 'second.md']);
  assert.equal(states.get('parent.md').status, 'stopped');
  assert.equal(active.has('parent.md'), false);
});
test('a shallow batch with no accepted child rejects after all failures and releases ownership', async () => {
  const { ShallowExpansionCoordinator } = load('experiences/visual-map/expansion-batch.ts');
  const active = new Map(), states = new Map(), coordinator = new ShallowExpansionCoordinator(active, states), calls = [];
  await assert.rejects(coordinator.start('parent.md', [node('first'), node('second')], async child => { calls.push(child.path); throw new Error('not accepted'); }, () => {}), /stopped before launch/);
  assert.deepEqual(calls, ['first.md', 'second.md']);
  assert.equal(states.get('parent.md').completed, 2);
  assert.equal(states.get('parent.md').failures.length, 2);
  assert.equal(active.has('parent.md'), false);
});
integrationTest('pending child suggestions persist across reload and disappear after dismissal', async () => {
  const { PendingSuggestions } = load('pending-suggestions.ts');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vam-proposals-'));
  const file = path.join(directory, 'pending-suggestions.json');
  const errors = [];
  try {
    const first = new PendingSuggestions(file, error => errors.push(error));
    first.set('topic.md', [{ title: 'A', task: 'Research A', contribution: 'Scope A', parentTitle: '' }]);
    await first.flush();
    const second = new PendingSuggestions(file, error => errors.push(error));
    await second.load();
    assert.equal(second.get('topic.md')[0].title, 'A');
    second.delete('topic.md'); await second.flush();
    const third = new PendingSuggestions(file, error => errors.push(error)); await third.load();
    assert.equal(third.has('topic.md'), false);
    assert.deepEqual(errors, []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
integrationTest('proposal persistence reports disk write failure to the caller', async () => {
  const { PendingSuggestions } = load('pending-suggestions.ts');
  const errors = [];
  const store = new PendingSuggestions(path.join(os.tmpdir(), `vam-missing-${Date.now()}`, 'pending.json'), error => errors.push(error));
  store.set('topic.md', [{ title: 'A', task: 'Research A', contribution: '' }]);
  await assert.rejects(store.flush());
  assert.equal(errors.length, 1);
});
integrationTest('selected subtopics move together and copied notes keep their content with new identities', async () => {
  const { repo, app } = fixture(), root = await topicNote(repo, 'Root', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [root], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const first = await repo.createNote('First', 'a', mapDoc, mapPath, 'inherited');
  const second = await repo.createNote('Second', 'a', mapDoc, mapPath, 'inherited');
  first.parentId = root.id; second.parentId = root.id; mapDoc.nodes.push(first, second); await repo.saveMap(mapPath, mapDoc);
  await repo.updateNote(first.path, { detail: 'Original knowledge', preview: 'My handwritten preview' });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  view.multiSelected = new Set([first.id]);
  await view.moveSelected(second);
  assert.equal((await repo.readMap(mapPath)).nodes.find(node => node.id === first.id).parentId, second.id);
  view.multiSelected = new Set([first.id]);
  await view.copySelected(root);
  const saved = await repo.readMap(mapPath), copied = saved.nodes.find(node => node.id !== first.id && node.id !== second.id && node.id !== root.id);
  assert.equal(saved.nodes.length, 4);
  assert.equal(copied.parentId, root.id);
  assert.notEqual(copied.path, first.path);
  const note = await repo.readNote(copied.path);
  assert.equal(note.detail, 'Original knowledge'); assert.equal(note.preview, 'My handwritten preview');
  await view.history.undo().undo();
  assert.equal((await repo.readMap(mapPath)).nodes.length, 3);
  assert.equal((await repo.readNote('Agent Workspace/Topics/map-a/Unassigned/First 副本.md')).topicState, 'unassigned');
  await view.history.redo().redo();
  assert.equal((await repo.readMap(mapPath)).nodes.length, 4);
  assert.equal((await repo.readNote(copied.path)).topicState, 'active');
});
integrationTest('copying a legacy note without a title field keeps its filename as the copy title', async () => {
  const { repo, app } = fixture();
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create('Agent Workspace/Topics/map-a/Notes/budget.md', '---\nagent-map-node: true\nnode-id: original\ntopic-id: map-a\n---\n# budget\n\nOriginal content\n');
  const copy = await repo.duplicateNote('Agent Workspace/Topics/map-a/Notes/budget.md', mapDoc, mapPath);
  assert.equal((await repo.readNote(copy.path)).title, 'budget 副本');
  assert.match(await app.vault.read(app.vault.getAbstractFileByPath(copy.path)), /^---[\s\S]*# budget 副本/m);
});
integrationTest('failed batch copy parks created notes and leaves the map unchanged', async () => {
  const { repo, app } = fixture(), root = await topicNote(repo, 'Root', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [root], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const first = await repo.createNote('First', 'a', mapDoc, mapPath, 'inherited');
  const second = await repo.createNote('Second', 'a', mapDoc, mapPath, 'inherited');
  first.parentId = root.id; second.parentId = root.id; mapDoc.nodes.push(first, second); await repo.saveMap(mapPath, mapDoc);
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {};
  view.multiSelected = new Set([first.id, second.id]);
  const duplicate = repo.duplicateNote.bind(repo); let count = 0;
  repo.duplicateNote = async (...args) => { if (++count === 2) throw new Error('injected duplicate failure'); return duplicate(...args); };
  await assert.rejects(view.copySelected(root), /injected duplicate failure/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 3);
  assert.equal((await repo.readNote('Agent Workspace/Topics/map-a/Unassigned/First 副本.md')).topicState, 'unassigned');
  assert.equal(view.history.canUndo, false);
});
integrationTest('failed map save during copy parks the duplicate without changing the map', async () => {
  const { repo, app } = fixture(), root = await topicNote(repo, 'Root', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [root], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {};
  view.multiSelected = new Set([root.id]);
  const save = repo.saveMap.bind(repo); let fail = true;
  repo.saveMap = async (...args) => { if (fail) { fail = false; throw new Error('injected map save failure'); } return save(...args); };
  await assert.rejects(view.copySelected(root), /injected map save failure/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
  assert.equal((await repo.readNote('Agent Workspace/Topics/map-a/Unassigned/Root 副本.md')).topicState, 'unassigned');
  assert.equal(view.history.canUndo, false);
});
integrationTest('removing selected subtopic branches parks notes and can be undone', async () => {
  const { repo, app } = fixture(), root = await topicNote(repo, 'Root', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [root], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const child = await repo.createNote('Child', 'a', mapDoc, mapPath, 'inherited'); child.parentId = root.id;
  const grandchild = await repo.createNote('Grandchild', 'a', mapDoc, mapPath, 'inherited'); grandchild.parentId = child.id;
  mapDoc.nodes.push(child, grandchild); await repo.saveMap(mapPath, mapDoc);
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {};
  view.multiSelected = new Set([child.id]); await view.removeSelected();
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
  assert.equal((await repo.readNote(`Agent Workspace/Topics/map-a/Unassigned/Child.md`)).topicState, 'unassigned');
  await view.history.undo().undo();
  assert.equal((await repo.readMap(mapPath)).nodes.length, 3);
  assert.ok(app.vault.getAbstractFileByPath(child.path));
});
integrationTest('failed batch removal restores map and active note ownership', async () => {
  const { repo, app } = fixture(), root = await topicNote(repo, 'Root', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [root], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const child = await repo.createNote('Child', 'a', mapDoc, mapPath, 'inherited'); child.parentId = root.id;
  mapDoc.nodes.push(child); await repo.saveMap(mapPath, mapDoc);
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {};
  view.multiSelected = new Set([child.id]);
  const save = repo.saveMap.bind(repo); let fail = true;
  repo.saveMap = async (...args) => { if (fail) { fail = false; throw new Error('injected map save failure'); } return save(...args); };
  await assert.rejects(view.removeSelected(), /injected map save failure/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 2);
  assert.equal((await repo.readNote(child.path)).topicState, 'active');
  assert.equal((await repo.readNote(child.path)).mapId, mapDoc.id);
  assert.equal(view.history.canUndo, false);
});
integrationTest('failed rebuild after batch removal also restores map and notes', async () => {
  const { repo, app } = fixture(), root = await topicNote(repo, 'Root', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [root], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const child = await repo.createNote('Child', 'a', mapDoc, mapPath, 'inherited'); child.parentId = root.id;
  mapDoc.nodes.push(child); await repo.saveMap(mapPath, mapDoc);
  const { VisualAgentMapView } = load('main.ts', { obsidian }); let fail = true;
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => { if (fail) { fail = false; throw new Error('injected rebuild failure'); } } };
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {};
  view.multiSelected = new Set([child.id]);
  await assert.rejects(view.removeSelected(), /injected rebuild failure/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 2);
  assert.equal((await repo.readNote(child.path)).topicState, 'active');
  assert.equal(view.history.canUndo, false);
});
integrationTest('confirmed child batches rebuild derived data only once', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'a'); let rebuilds = 0;
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => { rebuilds++; } }));
  view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  await view.createChildBatch(parent, [
    { title: 'One', task: 'Task one', contribution: 'First' },
    { title: 'Two', task: 'Task two', contribution: 'Second' },
    { title: 'Three', task: 'Task three', contribution: 'Third' }
  ]);
  const saved = await repo.readMap(mapPath);
  assert.equal(saved.nodes.length, 4);
  assert.equal(rebuilds, 1);
  assert.equal((await repo.readNote(saved.nodes[1].path)).prompt, 'Task one');
});
integrationTest('two-level child batches attach grandchildren and still rebuild once', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'a'); let rebuilds = 0;
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => { rebuilds++; } }));
  view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  await view.createChildBatch(parent, [
    { title: 'A', task: 'Explore A', contribution: '' },
    { title: 'B', task: 'Explore B', contribution: '' },
    { title: 'A1', task: 'Explore A1', contribution: '', parentTitle: 'A' }
  ]);
  const saved = await repo.readMap(mapPath);
  assert.equal(saved.nodes.length, 4);
  assert.equal(saved.nodes[3].parentId, saved.nodes[1].id);
  assert.equal(rebuilds, 1);
});
integrationTest('orphan grandchild proposals fail instead of silently disappearing', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} }));
  view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {};
  await assert.rejects(view.createChildBatch(parent, [{ title: 'Orphan', task: '', contribution: '', parentTitle: 'Missing' }]), /Select the parent topic before its child/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
});
integrationTest('duplicate first-level proposal names cannot misplace grandchildren', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} }));
  view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {};
  await assert.rejects(view.createChildBatch(parent, [
    { title: 'Same', task: '', contribution: '' },
    { title: 'Same', task: '', contribution: '' },
    { title: 'Child', task: '', contribution: '', parentTitle: 'Same' }
  ]), /First-level topic names must be unique/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
});
test('ambiguous original AI proposal names are rejected before editing', () => {
  const notices = []; let opened = 0;
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Notice: class { constructor(message) { notices.push(message); } }, Modal: class { open() { opened++; } } } });
  const suggestions = [
    { title: 'Same', task: '', contribution: '', parentTitle: '' },
    { title: 'Same', task: '', contribution: '', parentTitle: '' },
    { title: 'Child', task: '', contribution: '', parentTitle: 'Same' }
  ];
  const plugin = { repo: { readNote: async () => ({}) }, pendingSuggestions: new Map([['parent.md', suggestions]]), pendingResearchOptions: new Map([['parent.md', { researchDepth: 'fast' }]]) };
  const view = new VisualAgentMapView({ app: {} }, plugin);
  view.openChildSuggestions({ id: 'parent', path: 'parent.md' }, suggestions);
  assert.equal(opened, 0);
  assert.match(notices[0], /duplicate first-level names/);
  assert.equal(plugin.pendingSuggestions.has('parent.md'), false);
  assert.equal(plugin.pendingResearchOptions.has('parent.md'), false);
});
integrationTest('structural two-level child creation stores shallow-research settings without dispatching', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  const researched = []; view.runAgent = async node => { researched.push(node.id); await repo.updateNote(node.path, { status: 'running' }); };
  await view.createChildBatch(parent, [
    { title: 'A', task: 'Research A', contribution: '' },
    { title: 'A1', task: 'Research A1', contribution: '', parentTitle: 'A' }
  ], { researchMode: 'research', researchDepth: 'normal', visualMode: 'auto', referenceGroups: [], multiLayer: true });
  const saved = await repo.readMap(mapPath);
  assert.deepEqual(researched, []);
  for (const node of saved.nodes.slice(1)) {
    const note = await repo.readNote(node.path);
    assert.equal(note.researchDepth, 'fast'); assert.equal(note.researchMode, 'research'); assert.equal(note.visualMode, 'auto');
  }
});
integrationTest('guided child creation stores shallow-research settings without dispatching', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {} });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  const researched = []; view.runAgent = async child => { researched.push(child.id); await repo.updateNote(child.path, { status: 'running' }); };
  await view.createChildBatch(parent, [{ title: 'Research me', task: 'Find evidence', contribution: '', parentTitle: '' }], { researchMode: 'local', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: false, shallowResearch: true });
  assert.deepEqual(researched, []);
  assert.equal((await repo.readNote(view.map.nodes.at(-1).path)).researchMode, 'research');
});
integrationTest('one shallow-research startup failure marks that child and does not strand later children', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const failures = [], started = [];
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), quickExpandFailures: new Map(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (context, error) => { failures.push(`${context}: ${error.message}`); return error.message; } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  view.runAgent = async (child, _done, failed, _options, accepted) => {
    const note = await repo.readNote(child.path); started.push(note.title);
    if (note.title === 'First') { await repo.updateNote(child.path, { status: 'error' }); const message = plugin.recordFailure('AI task failed', new Error('startup failed')); failed?.(message); return null; }
    await repo.updateNote(child.path, { status: 'running' }); accepted?.(); return { finished: Promise.resolve() };
  };
  const children = await view.createChildBatch(parent, [
    { title: 'First', task: 'Research first', contribution: '' },
    { title: 'Second', task: 'Research second', contribution: '' }
  ], { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [] });
  await view.startShallowResearch(parent, children, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [] });
  await until(() => plugin.expansionBatches.get(parent.path).status !== 'running');
  const saved = await repo.readMap(mapPath);
  assert.deepEqual(started, ['First', 'Second']);
  assert.equal((await repo.readNote(saved.nodes[1].path)).status, 'error');
  assert.equal((await repo.readNote(saved.nodes[2].path)).status, 'running');
  assert.match(failures[0], /startup failed/);
  assert.deepEqual(plugin.expansionBatches.get(parent.path).failures.length, 1);
});
integrationTest('shallow research uses the research-topic task when a child has no research question', async () => {
  const { repo, app } = fixture('en'), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-s/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-s';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const tasks = [];
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS, language: 'en' }, running: new Set(), quickExpandFailures: new Map(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (_context, error) => error.message });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  view.runAgent = async (_child, _done, _failed, options, accepted) => { tasks.push(options.task); accepted?.(); return { finished: Promise.resolve() }; };
  const options = { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], outputLanguage: 'en', requirements: '' };
  const children = await view.createChildBatch(parent, [{ title: 'Night markets', task: '', contribution: '' }, { title: 'Asked', task: 'Why do they exist?', contribution: '' }], options);
  await view.startShallowResearch(parent, children, options);
  await until(() => plugin.expansionBatches.get(parent.path).status !== 'running');
  const { researchTopicTask } = load('experiences/visual-map/steps/fragments.ts');
  assert.deepEqual(Array.from(tasks), [researchTopicTask('en', 'Night markets'), 'Why do they exist?']);
});
integrationTest('cancelling shallow research stops the batch without marking unstarted children as errors', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const failures = [], started = [], controller = new AbortController(); let finishFirst;
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), quickExpandFailures: new Map(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (context, error) => { failures.push(`${context}: ${error.message}`); return error.message; } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  view.runAgent = async (child, _done, failed, options, accepted) => {
    const note = await repo.readNote(child.path); started.push(note.title); await repo.updateNote(child.path, { status: 'running' }); accepted?.();
    const finished = new Promise(resolve => { finishFirst = resolve; options.signal.addEventListener('abort', async () => { await repo.updateNote(child.path, { status: note.status }); resolve(); }, { once: true }); });
    return { finished };
  };
  const children = await view.createChildBatch(parent, [
    { title: 'First', task: 'Research first', contribution: '' },
    { title: 'Second', task: 'Research second', contribution: '' },
    { title: 'Third', task: 'Research third', contribution: '' },
    { title: 'Fourth', task: 'Research fourth', contribution: '' }
  ], { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [] });
  await view.startShallowResearch(parent, children, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], signal: controller.signal });
  await until(() => started.length === 3);
  plugin.expansionCoordinator.stop(parent.path);
  await until(() => plugin.expansionBatches.get(parent.path).status !== 'running');
  finishFirst?.();
  const saved = await repo.readMap(mapPath);
  assert.deepEqual(started, ['First', 'Second', 'Third']);
  assert.equal(saved.nodes.slice(1).map(child => child.path).join('|'), Array.from(children, child => child.path).join('|'));
  assert.equal((await repo.readNote(saved.nodes[1].path)).status, 'idea');
  assert.equal((await repo.readNote(saved.nodes[2].path)).status, 'idea');
  assert.equal((await repo.readNote(saved.nodes[3].path)).status, 'idea');
  assert.equal((await repo.readNote(saved.nodes[4].path)).status, 'idea');
  assert.deepEqual(failures, []);
});
integrationTest('accepted shallow research is parallel, detached from modal close, and stopped by the parent', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const controller = new AbortController(), started = [], finish = new Map(), signals = [];
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, rebuildDerivedData: async () => {}, recordFailure: (_context, error) => error.message, mutate: async work => work(), views: () => [view] });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  view.runAgent = async (child, _done, _failed, options, accepted) => {
    started.push((await repo.readNote(child.path)).title);
    assert.equal(options.referenceGroups.length, 0); assert.equal(options.onProgress, undefined);
    signals.push(options.signal); accepted();
    return { finished: new Promise(resolve => finish.set(child.path, resolve)) };
  };
  const children = await view.createChildBatch(parent, [
    { title: 'First', task: 'Research first', contribution: '' },
    { title: 'Second', task: 'Research second', contribution: '' }
  ], { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [{ id: 'parent-source', documents: [{ path: 'External.md' }] }] });
  const pending = view.startShallowResearch(parent, children, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [{ id: 'parent-source', documents: [{ path: 'External.md' }] }], shallowResearch: true, signal: controller.signal, onProgress: () => assert.fail('modal progress callback retained') });
  await pending;
  await until(() => started.length === 2);
  assert.deepEqual(started, ['First', 'Second']);
  controller.abort();
  assert.equal(signals[0].aborted, false);
  finish.get(children[0].path)();
  await until(() => started.length === 2);
  assert.deepEqual(started, ['First', 'Second']);
  plugin.expansionCoordinator.stop(parent.path);
  assert.equal(signals[1].aborted, true);
  finish.get(children[1].path)();
  await until(() => plugin.expansionBatches.get(parent.path).status !== 'running');
  assert.equal(plugin.expansionBatches.get(parent.path).status, 'stopped');
  assert.equal(plugin.activeTasks.has(parent.path), false);
});
integrationTest('quick exploration creates two levels directly and leaves them unresearched', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), askModel: async () => ({ summary: '', detail: '', visualReferences: [], suggestions: [
    { title: 'A', task: 'Explore A', contribution: '', parentTitle: '' },
    { title: 'B', task: 'Explore B', contribution: '', parentTitle: '' },
    { title: 'A1', task: 'Explore A1', contribution: '', parentTitle: 'A' },
    { title: 'B1', task: 'Explore B1', contribution: '', parentTitle: 'B' }
  ] }) });
  const view = new VisualAgentMapView({ app }, plugin);
  view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  let reviewed = 0, completed = 0, researched = 0;
  view.runAgent = async () => { researched++; };
  await view.proposeChildren(parent, true, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: false, layers: 2, firstLayerCount: 2, childrenPerParent: 1 }, '', () => { reviewed++; }, message => assert.fail(message), true, () => { completed++; });
  const saved = await repo.readMap(mapPath);
  assert.equal(saved.nodes.length, 5); assert.equal(saved.nodes[3].parentId, saved.nodes[1].id); assert.equal(saved.nodes[4].parentId, saved.nodes[2].id);
  assert.equal(reviewed, 0); assert.equal(completed, 1); assert.equal(researched, 0);
  for (const child of saved.nodes.slice(1)) assert.equal((await repo.readNote(child.path)).status, 'idea');
});
integrationTest('quick exploration rejects zero for multiple levels and ignores unused single-level child count', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  let task = '';
  const plugin = withExpansionCoordinator({ recordFailure: (_label, error) => String(error), repo, settings: { ...DEFAULT_SETTINGS, language: 'en' }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), askModel: async context => {
    task = context.task;
    return { summary: '', detail: '', visualReferences: [], suggestions: Array.from({ length: 10 }, (_, index) => ({ title: `Child ${index + 1}`, task: `Explore ${index + 1}`, contribution: '', parentTitle: '' })) };
  } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  let completed = false;
  let failure = '';
  await view.proposeChildren(parent, true, { multiLayer: true, layers: 2, firstLayerCount: 10, childrenPerParent: 0 }, '', () => assert.fail('invalid shape'), message => { failure = message; }, true);
  assert.match(failure, /positive whole/); assert.equal(task, ''); assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
  await view.proposeChildren(parent, true, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, layers: 1, firstLayerCount: 10, childrenPerParent: NaN }, '', () => assert.fail('quick map should not show review'), message => assert.fail(message), true, () => { completed = true; });
  const saved = await repo.readMap(mapPath);
  assert.equal(saved.nodes.length, 11);
  assert.ok(saved.nodes.slice(1).every(child => child.parentId === parent.id));
  assert.match(task, /1 level/);
  assert.match(task, /total: 10/);
  assert.equal(completed, true);
});
integrationTest('quick exploration gives every parent two children across three levels and starts optional research', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const suggestions = []; let parents = [''];
  for (let depth = 0; depth < 3; depth++) {
    const current = [];
    for (const parentTitle of parents) for (let index = 0; index < 2; index++) {
      const title = `L${depth}-${current.length}`;
      suggestions.push({ title, task: `Research ${title}`, contribution: '', parentTitle }); current.push(title);
    }
    parents = current;
  }
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), quickExpandFailures: new Map(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (_context, error) => error.message, askModel: async () => ({ summary: '', detail: '', visualReferences: [], suggestions }) });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  let researched = 0; view.runAgent = async (child, _done, _failed, _options, accepted) => { researched++; await repo.updateNote(child.path, { status: 'running' }); accepted?.(); return { finished: Promise.resolve() }; };
  await view.proposeChildren(parent, true, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: true, layers: 3, firstLayerCount: 2, childrenPerParent: 2 }, '', () => assert.fail('quick map should not show review'), message => assert.fail(message), true);
  await until(() => plugin.expansionBatches.get(parent.path).status !== 'running');
  const saved = await repo.readMap(mapPath);
  assert.equal(saved.nodes.length, 15); assert.equal(researched, 14);
  const byTitle = new Map(); for (const item of saved.nodes.slice(1)) byTitle.set((await repo.readNote(item.path)).title, item);
  for (const item of suggestions) assert.equal(byTitle.get(item.title).parentId, item.parentTitle ? byTitle.get(item.parentTitle).id : parent.id);
});
integrationTest('quick exploration rejects an uneven branch before creating any topic', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md'; const mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const suggestions = [
    { title: 'A', task: 'Explore A', contribution: '', parentTitle: '' },
    { title: 'B', task: 'Explore B', contribution: '', parentTitle: '' },
    { title: 'A1', task: 'Explore A1', contribution: '', parentTitle: 'A' },
    { title: 'A2', task: 'Explore A2', contribution: '', parentTitle: 'A' }
  ];
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (_context, error) => error.message, askModel: async () => ({ summary: '', detail: '', visualReferences: [], suggestions }) });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  let failure = '';
  await view.proposeChildren(parent, true, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, layers: 2, firstLayerCount: 2, childrenPerParent: 1 }, '', () => assert.fail('uneven map accepted'), message => { failure = message; }, true);
  assert.match(failure, /level counts and parent-child structure/);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
});
integrationTest('quick AI wait leaves map mutations free and uses the latest parent position', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md'; const mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  let resolveModel, tail = Promise.resolve();
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, recordFailure: (_context, error) => error.message,
    askModel: () => new Promise(resolve => { resolveModel = resolve; }), mutate(work) { const job = tail.then(work); tail = job.catch(() => {}); return job; } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  const options = { researchMode: 'local', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: false, layers: 1, firstLayerCount: 1, childrenPerParent: 1 };
  const job = view.startQuickExpansion(parent, options, '', message => assert.fail(message), () => {});
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(plugin.quickExpandPending.has(parent.path), true);
  let moved = false;
  const change = plugin.mutate(async () => { await view.mapChange(map => { map.nodes[0].x = 500; }, false); moved = true; });
  const progressed = await Promise.race([change.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 100))]);
  resolveModel({ summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Child', task: 'Explore', contribution: '', parentTitle: '' }] });
  await job;
  assert.equal(progressed, true); assert.equal(moved, true);
  const saved = await repo.readMap(mapPath); assert.equal(saved.nodes.length, 2); assert.equal(saved.nodes[1].x, 860);
  assert.equal(plugin.quickExpandPending.size, 0);
});
integrationTest('accepted quick expansion closes its modal but completes after a deferred provider result', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const pending = deferred(), modalController = new AbortController(); let accepted = false, created = 0;
  const plugin = withExpansionCoordinator({
    repo, settings: { ...DEFAULT_SETTINGS, language: 'en' }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(),
    rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (_context, error) => error.message,
    askModel: (_context, _model, _reasoning, _signal, _exchange, onAccepted) => { onAccepted?.(); return pending.promise; }
  });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  const options = { researchMode: 'local', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: false, layers: 1, firstLayerCount: 1, childrenPerParent: 1, signal: modalController.signal };
  const job = view.startQuickExpansion(parent, options, '', message => assert.fail(message), () => { created++; }, () => { accepted = true; modalController.abort(); });
  await until(() => accepted);
  assert.equal(modalController.signal.aborted, true);
  assert.ok(plugin.running.has(parent.path));
  assert.ok(plugin.activeTasks.has(parent.path));
  assert.equal(plugin.activeTasks.get(parent.path).signal.aborted, false);
  pending.resolve({ summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Accepted child', task: 'Explore this', contribution: '', parentTitle: '' }] });
  await job;
  assert.equal(created, 1);
  assert.equal(plugin.activeTasks.has(parent.path), false);
  assert.equal(plugin.quickExpandPending.has(parent.path), false);
  const saved = await repo.readMap(mapPath);
  assert.equal(saved.nodes.length, 2);
  assert.equal((await repo.readNote(saved.nodes[1].path)).title, 'Accepted child');
});
integrationTest('stopping quick shallow research before child acceptance keeps created nodes without an expansion failure', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const failures = [], plugin = withExpansionCoordinator({
    repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(),
    rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (context, error) => { failures.push(`${context}: ${error.message}`); return error.message; },
    askModel: async (_context, _model, _reasoning, _signal, _exchange, accepted) => {
      accepted?.();
      return { summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Accepted child', task: 'Explore this', contribution: '', parentTitle: '' }] };
    }
  });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  let childSignal, failure = '';
  view.runAgent = async (_child, _done, failed, options) => {
    childSignal = options.signal;
    return new Promise(resolve => childSignal.addEventListener('abort', () => resolve(null), { once: true }));
  };
  const job = view.startQuickExpansion(parent, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: true, layers: 1, firstLayerCount: 1, childrenPerParent: 1 }, '', message => { failure = message; }, () => {});
  await until(() => childSignal);
  plugin.expansionCoordinator.stop(parent.path);
  await job;
  const saved = await repo.readMap(mapPath);
  assert.equal(saved.nodes.length, 2);
  assert.equal((await repo.readNote(saved.nodes[1].path)).title, 'Accepted child');
  assert.equal(childSignal.aborted, true);
  assert.equal(plugin.expansionBatches.get(parent.path).status, 'stopped');
  assert.equal(plugin.expansionBatches.get(parent.path).failures.length, 0);
  assert.equal(plugin.quickExpandFailures.has(parent.path), false);
  assert.equal(plugin.quickExpandPending.has(parent.path), false);
  assert.deepEqual(failures, []);
  assert.equal(failure, '');
});
integrationTest('quick expansion keeps a genuine provider failure visible', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  let attempts = 0;
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (_context, error) => error.message,
    askModel: async (_context, _model, _reasoning, _signal, _exchange, accepted) => {
      attempts++;
      if (attempts === 1) {
        accepted?.();
        return { summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Stopped child', task: 'Explore this', contribution: '', parentTitle: '' }] };
      }
      throw new Error('provider unavailable');
    } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  let childSignal;
  view.runAgent = async (_child, _done, _failed, options) => { childSignal = options.signal; return new Promise(resolve => childSignal.addEventListener('abort', () => resolve(null), { once: true })); };
  const research = view.startQuickExpansion(parent, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: true, layers: 1, firstLayerCount: 1, childrenPerParent: 1 }, '', message => assert.fail(message), () => {});
  await until(() => childSignal);
  plugin.expansionCoordinator.stop(parent.path);
  await research;
  assert.equal(plugin.expansionBatches.get(parent.path).status, 'stopped');
  assert.equal(plugin.quickExpandFailures.has(parent.path), false);
  let failure = '';
  await view.startQuickExpansion(parent, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: false, layers: 1, firstLayerCount: 1, childrenPerParent: 1 }, '', message => { failure = message; }, () => {});
  assert.equal(failure, 'provider unavailable');
  assert.equal(plugin.quickExpandFailures.get(parent.path), 'provider unavailable');
});
integrationTest('Map Stop before accepted decomposition ignores a late answer without creating children', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  let resolveModel, accepted = false, recorded = [];
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (context, error) => { recorded.push(`${context}: ${error.message}`); return error.message; },
    askModel: (_context, _model, _reasoning, _signal, _exchange, onAccepted) => { onAccepted?.(); accepted = true; return new Promise(resolve => { resolveModel = resolve; }); } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  const job = view.startQuickExpansion(parent, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: true, layers: 1, firstLayerCount: 1, childrenPerParent: 1 }, '', message => assert.fail(message), () => {});
  await until(() => accepted && plugin.activeTasks.has(parent.path));
  plugin.activeTasks.get(parent.path).abort();
  resolveModel({ summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Late child', task: 'Explore this', contribution: '', parentTitle: '' }] });
  await job;
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
  assert.equal(plugin.quickExpandFailures.has(parent.path), false);
  assert.equal(plugin.quickExpandPending.has(parent.path), false);
  assert.equal(plugin.activeTasks.has(parent.path), false);
  assert.deepEqual(recorded, []);
});
integrationTest('Map Stop during accepted decomposition treats provider AbortError and cancellation rejection as cancellation', async () => {
  for (const makeError of [
    () => { const error = new Error('aborted'); error.name = 'AbortError'; return error; },
    () => new Error('AI task cancelled')
  ]) {
    const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
    const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
    await app.vault.create(mapPath, core.serializeMap(mapDoc));
    let accepted = false, failed = [], providerSignal;
    const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (context, error) => { failed.push(`${context}: ${error.message}`); return error.message; },
      askModel: (_context, _model, _reasoning, signal, _exchange, onAccepted) => {
        providerSignal = signal;
        onAccepted?.(); accepted = true;
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(makeError()), { once: true }));
      } });
    const { VisualAgentMapView } = load('main.ts', { obsidian });
    const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
    let failedCallback = '';
    const job = view.startQuickExpansion(parent, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: true, layers: 1, firstLayerCount: 1, childrenPerParent: 1 }, '', message => { failedCallback = message; }, () => {});
    await until(() => accepted && plugin.activeTasks.has(parent.path));
    assert.equal(plugin.activeTasks.get(parent.path).signal.aborted, false);
    plugin.activeTasks.get(parent.path).abort();
    await job;
    assert.equal(providerSignal.aborted, true);
    assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
    assert.equal(plugin.quickExpandFailures.has(parent.path), false);
    assert.equal(failedCallback, '');
    assert.deepEqual(failed, []);
    assert.equal(plugin.activeTasks.has(parent.path), false);
    assert.equal(plugin.running.has(parent.path), false);
    assert.equal(plugin.quickExpandPending.has(parent.path), false);
  }
});
integrationTest('quick expansion reports a terminal render exception through its outer failure handler', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  let accepted = false, providerSignal, terminalRenderFailed = false;
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), recordFailure: (_context, error) => error.message,
    askModel: (_context, _model, _reasoning, signal, _exchange, onAccepted) => {
      providerSignal = signal;
      onAccepted?.(); accepted = true;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); }, { once: true }));
    } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.hydrate = async () => {}; view.focusNode = () => {};
  view.render = () => { if (providerSignal?.aborted && !terminalRenderFailed) { terminalRenderFailed = true; throw new Error('terminal render failure'); } };
  let failure = '';
  const job = view.startQuickExpansion(parent, { researchMode: 'research', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: false, layers: 1, firstLayerCount: 1, childrenPerParent: 1 }, '', message => { failure = message; }, () => {});
  await until(() => accepted && plugin.activeTasks.has(parent.path));
  plugin.activeTasks.get(parent.path).abort();
  await assert.rejects(job, /terminal render failure/);
  assert.equal(terminalRenderFailed, true);
  assert.equal(failure, '');
  assert.equal(plugin.quickExpandFailures.get(parent.path), 'Error: terminal render failure');
  assert.equal(plugin.activeTasks.has(parent.path), false);
  assert.equal(plugin.running.has(parent.path), false);
});
integrationTest('quick map discards a delayed answer when its parent has been removed', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md'; const mapDoc = map([parent]); mapDoc.id = 'map-a';
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  let resolveModel, tail = Promise.resolve(), error = '';
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, recordFailure: (_context, failure) => failure.message,
    askModel: () => new Promise(resolve => { resolveModel = resolve; }), mutate(work) { const job = tail.then(work); tail = job.catch(() => {}); return job; } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  const options = { researchMode: 'local', researchDepth: 'fast', visualMode: 'off', referenceGroups: [], multiLayer: true, shallowResearch: false, layers: 1, firstLayerCount: 1, childrenPerParent: 1 };
  const job = view.startQuickExpansion(parent, options, '', message => { error = message; }, () => assert.fail('stale result created nodes'));
  await new Promise(resolve => setTimeout(resolve, 0));
  await plugin.mutate(() => view.mapChange(map => { map.nodes = []; }));
  resolveModel({ summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Stale child', task: 'Explore', contribution: '', parentTitle: '' }] });
  await job;
  assert.match(error, /map or parent topic changed/); assert.equal((await repo.readMap(mapPath)).nodes.length, 0);
  assert.equal(plugin.quickExpandPending.size, 0); assert.ok(plugin.quickExpandFailures.has(parent.path));
});
integrationTest('pending proposals use this run\'s shallow research choice and serialize creation', async () => {
  const suggestions = [{ title: 'Existing', task: 'Research', contribution: '', parentTitle: '' }];
  let queued = 0, insideMutation = false, create, used;
  const plugin = withExpansionCoordinator({ repo: { readNote: async () => ({}) }, pendingSuggestions: new Map([['parent.md', suggestions]]), pendingResearchOptions: new Map(), mutate: async work => { queued++; insideMutation = true; try { return await work(); } finally { insideMutation = false; } } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app: {} }, plugin);
  view.render = () => {};
  let startedResearch;
  view.createChildBatch = async (_parent, _items, options) => { used = options; return [node('created')]; };
  view.startShallowResearch = async (_parent, children, options) => { assert.equal(insideMutation, false); startedResearch = { children, options, queued }; };
  const options = { researchMode: 'local', researchDepth: 'fast', visualMode: 'off', referenceGroups: [{ name: 'Reference map', documents: [{ path: 'map/topic.md', content: 'private source' }] }], multiLayer: false, shallowResearch: true };
  await view.proposeChildren({ id: 'parent', path: 'parent.md' }, true, options, '', (_items, confirm) => { create = confirm; }, message => assert.fail(message));
  const storedChoices = plugin.pendingResearchOptions.get('parent.md');
  assert.equal(storedChoices.researchMode, 'local'); assert.equal(storedChoices.researchDepth, 'fast'); assert.equal(storedChoices.visualMode, 'off');
  assert.equal(storedChoices.referenceGroups.length, 0); assert.equal(storedChoices.signal, undefined); assert.equal(storedChoices.onProgress, undefined);
  await create(suggestions);
  assert.equal(queued, 1); assert.equal(used.researchMode, 'local'); assert.equal(used.researchDepth, 'fast'); assert.equal(used.visualMode, 'off'); assert.equal(used.referenceGroups.length, 0); assert.notEqual(used, options); assert.equal(plugin.pendingSuggestions.has('parent.md'), false);
  assert.equal(startedResearch.queued, 1); assert.equal(startedResearch.children.length, 1); assert.equal(startedResearch.options.referenceGroups.length, 0);
  plugin.pendingSuggestions.set('parent.md', suggestions); plugin.pendingResearchOptions.set('parent.md', options);
  await view.proposeChildren({ id: 'parent', path: 'parent.md' }, true, { ...options, shallowResearch: false }, '', () => {}, message => assert.fail(message));
  assert.equal(plugin.pendingResearchOptions.has('parent.md'), false);
});
integrationTest('two views cannot create the same pending proposals twice', async () => {
  const suggestions = [{ title: 'Child', task: 'Research', contribution: '', parentTitle: '' }];
  let tail = Promise.resolve(), created = 0;
  const plugin = withExpansionCoordinator({ repo: { readNote: async () => ({}) }, pendingSuggestions: new Map([['parent.md', suggestions]]), pendingResearchOptions: new Map(), mutate(work) { const job = tail.then(work); tail = job.catch(() => {}); return job; } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const first = new VisualAgentMapView({ app: {} }, plugin), second = new VisualAgentMapView({ app: {} }, plugin);
  for (const view of [first, second]) { view.render = () => {}; view.createChildBatch = async () => { created++; return []; }; }
  let acceptFirst, acceptSecond;
  await first.proposeChildren({ id: 'parent', path: 'parent.md' }, true, undefined, '', (_items, accept) => { acceptFirst = accept; });
  await second.proposeChildren({ id: 'parent', path: 'parent.md' }, true, undefined, '', (_items, accept) => { acceptSecond = accept; });
  const outcomes = await Promise.allSettled([acceptFirst(suggestions), acceptSecond(suggestions)]);
  assert.equal(created, 1);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['fulfilled', 'rejected']);
  assert.match(outcomes[1].reason.message, /Expansion suggestions changed/);
});
integrationTest('partial child creation invalidates the proposal so retry cannot duplicate nodes', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const suggestions = [{ title: 'First', task: 'A', contribution: '', parentTitle: '' }, { title: 'Second', task: 'B', contribution: '', parentTitle: '' }];
  let queued = 0, changes = 0, create, persisted = [];
  const pendingSuggestions = new Map([[parent.path, suggestions]]);
  pendingSuggestions.flush = async () => { persisted = JSON.parse(JSON.stringify([...pendingSuggestions])); };
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, pendingSuggestions, pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => { queued++; return work(); } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {}; view.focusNode = () => {};
  view.noteChange = async () => { if (++changes === 2) throw new Error('injected note write failure'); };
  await view.proposeChildren(parent, true, undefined, '', (_items, confirm) => { create = confirm; }, message => assert.fail(message));
  await assert.rejects(create(suggestions), /Some subtopics were created/);
  assert.equal(queued, 1); assert.equal(plugin.pendingSuggestions.has(parent.path), false);
  assert.deepEqual(persisted, []);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 3);
});
integrationTest('synthesis directions and draft are separate steps; only confirmed draft updates the parent', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const child = await repo.createNote('Child', 'model-a', mapDoc, mapPath, 'workspace'); child.parentId = parent.id; mapDoc.nodes.push(child); await repo.saveMap(mapPath, mapDoc);
  await repo.updateNote(parent.path, { rules: 'Legacy sentinel' });
  const contexts = [];
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), mutate: async work => work(), askModel: async context => { contexts.push(context); return contexts.length === 1 ? { summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Common ground', task: 'Find shared constraints', contribution: 'A shared view', parentTitle: '' }] } : { summary: 'Draft summary', detail: 'Draft detail', visualReferences: [], suggestions: [] }; } };
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {}; view.ancestorContext = async () => '';
  let choose, save;
  const options = { requirements: 'Only compare cost', researchMode: 'local', researchDepth: 'normal', visualMode: 'off', referenceGroups: [{ id: 'picked', name: 'Picked', location: '/refs', documents: [{ path: '/refs/selected.md', content: 'Selected note content', external: true }] }] };
  await view.proposeIntegrationDirections(parent, options, (items, draft) => { assert.equal(items[0].title, 'Common ground'); choose = draft; }, (_result, commit) => { save = commit; }, message => assert.fail(message));
  assert.equal(contexts.length, 1); assert.equal(contexts[0].referenceGroups.flatMap(group => group.documents).some(document => document.path === '/refs/selected.md'), true); assert.notEqual((await repo.readNote(parent.path)).summary, 'Draft summary');
  await choose('Find shared constraints');
  assert.equal(contexts[1].task, 'Find shared constraints\n\nOnly compare cost');
  for (const context of contexts) { assert.equal(context.rules, ''); assert.match(context.task, /Only compare cost/); assert.ok(context.referenceGroups.flatMap(group => group.documents).some(document => document.path === '/refs/selected.md')); assert.doesNotMatch(JSON.stringify(context), /Legacy sentinel/); } assert.notEqual((await repo.readNote(parent.path)).summary, 'Draft summary');
  await save('Edited summary', 'Edited detail');
  const saved = await repo.readNote(parent.path);
  assert.equal(saved.rules, 'Legacy sentinel');
  assert.equal(saved.summary, 'Edited summary'); assert.match(saved.detail, /Edited detail/);
});
integrationTest('synthesis content is explicit for one, three and four children, with full default and no descendants', async () => {
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const { referenceBatches } = load('ai/reference-materials.ts', { obsidian });
  for (const count of [1, 3, 4]) for (const choice of [undefined, 'full', 'summary']) {
    const { repo, app, contents } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
    await repo.updateNote(parent.path, { rules: 'LEGACY_PARENT_RULES' });
    const children = [];
    for (let index = 0; index < count; index++) {
      const child = await topicNote(repo, `Child ${index}`, 'model-a'); child.parentId = parent.id;
      await repo.updateNote(child.path, { summary: `Summary ${index}`, detail: `DETAIL_START_${index}\n${'body '.repeat(3500)}\nBODY_ONLY_CONDITION_${index}\n${'rest '.repeat(3500)}\nDETAIL_END_${index}`, newFindings: `Finding ${index}`, rules: `LEGACY_CHILD_${index}` });
      children.push(child);
    }
    const grandchild = await topicNote(repo, 'Grandchild', 'model-a'); grandchild.parentId = children[0].id;
    await repo.updateNote(grandchild.path, { detail: 'EXCLUDED_GRANDCHILD' });
    const unrelated = await topicNote(repo, 'Unrelated', 'model-a');
    await repo.updateNote(unrelated.path, { detail: 'EXCLUDED_UNRELATED' });
    const selected = { id: 'extra', name: 'Extra', location: '/refs', documents: [{ path: '/refs/extra.md', content: 'EXTRA_FULL_BODY', external: true }] };
    const before = new Map(contents);
    const contexts = [];
    const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), mutate: async work => work(), recordFailure: (_label, error) => error.message,
      askModel: async context => { contexts.push(context); return contexts.length === 1 ? { suggestions: [{ title: 'Direction', task: 'Compare evidence', contribution: '' }] } : { summary: 'Draft', detail: 'Draft', visualReferences: [], suggestions: [] }; } };
    const view = new VisualAgentMapView({ app }, plugin); view.map = map([parent, ...children, grandchild, unrelated]); view.render = () => {}; view.hydrate = async () => {}; view.ancestorContext = async () => '';
    let draft, save;
    const options = { researchMode: 'local', researchDepth: 'normal', visualMode: 'off', requirements: 'Respect the budget', referenceGroups: [selected], ...(choice ? { synthesisContent: choice } : {}) };
    await view.proposeIntegrationDirections(parent, options, (_items, next) => { draft = next; }, (_result, commit) => { save = commit; }, message => assert.fail(message));
    await draft('Compare evidence');
    assert.equal(typeof save, 'function'); assert.equal(contexts.length, 2);
    for (const context of contexts) {
      assert.equal(context.rules, ''); assert.match(context.task, /Respect the budget/);
      const docs = context.referenceGroups.flatMap(group => group.documents);
      const automatic = docs.filter(doc => !doc.external);
      assert.deepEqual(Array.from(docs, doc => doc.path), ['/refs/extra.md', ...children.map(child => child.path)]);
      assert.equal(docs[0].content, 'EXTRA_FULL_BODY');
      const batches = referenceBatches(context.referenceGroups).join('\n');
      assert.doesNotMatch(batches, /EXCLUDED_GRANDCHILD|EXCLUDED_UNRELATED|LEGACY_CHILD/);
      for (let index = 0; index < count; index++) {
        assert.ok(automatic[index].content.includes(`Summary ${index}`)); assert.ok(automatic[index].content.includes(`Finding ${index}`));
        if (choice === 'summary') assert.ok(!automatic[index].content.includes(`BODY_ONLY_CONDITION_${index}`));
        else {
          const detail = (await repo.readNote(children[index].path)).detail;
          assert.ok(automatic[index].content.includes(detail), `full source lost Detail for ${count}/${choice}/${index}`);
          for (const marker of [`DETAIL_START_${index}`, `BODY_ONLY_CONDITION_${index}`, `DETAIL_END_${index}`]) assert.ok(batches.includes(marker));
          assert.ok(batches.includes(children[index].path));
        }
      }
    }
    assert.doesNotMatch(JSON.stringify(contexts), /LEGACY_PARENT_RULES/);
    assert.equal((await repo.readNote(parent.path)).rules, 'LEGACY_PARENT_RULES');
    for (const child of [...children, grandchild, unrelated]) assert.equal(contents.get(child.path), before.get(child.path));
    assert.notEqual((await repo.readNote(parent.path)).summary, 'Draft');
  }
});
integrationTest('multi-select synthesis honors content choice and leaves unselected topics and extra Markdown unchanged', async () => {
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  for (const choice of [undefined, 'full', 'summary']) {
    const { repo, app, contents } = fixture(), a = await topicNote(repo, 'Selected A', 'model-a'), b = await topicNote(repo, 'Selected B', 'model-a'), excluded = await topicNote(repo, 'Not selected', 'model-a');
    await repo.updateNote(a.path, { summary: 'A summary', detail: 'A_BODY_ONLY', rules: 'OLD_RULE_A' });
    await repo.updateNote(b.path, { summary: 'B summary', detail: 'B_BODY_ONLY' });
    const before = new Map(contents);
    const extra = { id: 'extra', name: 'Extra', location: '/refs', documents: [{ path: '/refs/source.md', content: 'EXTRA_BODY_UNCHANGED', external: true }] };
    const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, askModel: async context => {
      const docs = context.referenceGroups.flatMap(group => group.documents);
      const automatic = docs.filter(doc => !doc.external);
      assert.deepEqual(Array.from(docs, doc => doc.path), ['/refs/source.md', a.path, b.path]);
      assert.equal(automatic[0].content.includes('A_BODY_ONLY'), choice !== 'summary');
      assert.equal(automatic[1].content.includes('B_BODY_ONLY'), choice !== 'summary');
      assert.equal(docs[0].content, 'EXTRA_BODY_UNCHANGED');
      assert.match(context.task, /This run only/); assert.equal(context.rules, '');
      throw new Error('Stop before any write');
    } };
    const view = new VisualAgentMapView({ app }, plugin); view.map = map([a, b, excluded]); view.render = () => {};
    await assert.rejects(view.createIntegratedNode('Draft', [a, b], 'Compare', '', { synthesisContent: choice, requirements: 'This run only', referenceGroups: [extra] }, true), /Stop before any write/);
    assert.deepEqual(new Map(contents), before);
  }
});
integrationTest('explicit full Markdown wins over overlapping automatic summaries in both synthesis paths', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent'), a = await topicNote(repo, 'A'), b = await topicNote(repo, 'B');
  a.parentId = parent.id; b.parentId = parent.id;
  await repo.updateNote(a.path, { summary: 'A summary', detail: 'FULL_OVERLAP_CONDITION' });
  const { referenceBatches } = load('ai/reference-materials.ts', { obsidian });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const full = await app.vault.read(repo.file(a.path));
  const extra = { id: 'shared-map', name: 'Other map', location: 'Other/Map.md', documents: [{ path: a.path, content: full }] };
  let calls = 0;
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), mutate: async work => work(), recordFailure: (_label, error) => error.message, askModel: async context => {
    const batches = referenceBatches(context.referenceGroups).join('\n');
    assert.match(batches, /FULL_OVERLAP_CONDITION/);
    assert.equal(batches.split('FULL_OVERLAP_CONDITION').length - 1, 1);
    calls++;
    return { summary: 'Draft', detail: 'Draft', visualReferences: [], suggestions: [{ title: 'Angle', task: 'Compare', contribution: '' }] };
  } };
  const view = new VisualAgentMapView({ app }, plugin); view.map = map([parent, a, b]); view.render = () => {}; view.hydrate = async () => {}; view.ancestorContext = async () => '';
  const options = { synthesisContent: 'summary', referenceGroups: [extra], researchMode: 'local', researchDepth: 'normal', visualMode: 'off' };
  let draft;
  await view.proposeIntegrationDirections(parent, options, (_items, next) => { draft = next; }, () => {}, message => assert.fail(message));
  await draft('Compare');
  view.saveIntegratedNode = async () => {};
  await view.createIntegratedNode('Combined', [a, b], 'Compare', '', options);
  assert.equal(calls, 3);
  assert.equal(await app.vault.read(repo.file(a.path)), full);
});
integrationTest('synthesis can use selected notes when a topic has no children', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const contexts = [];
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), mutate: async work => work(), recordFailure: (_context, error) => error.message, askModel: async context => { contexts.push(context); return contexts.length === 1 ? { summary: '', detail: '', suggestions: [{ title: 'Shared view', task: 'Combine notes', contribution: '' }] } : { summary: 'Combined', detail: 'Combined detail', suggestions: [] }; } };
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.map = map([parent]); view.render = () => {}; view.hydrate = async () => {}; view.ancestorContext = async () => '';
  const empty = { researchMode: 'local', researchDepth: 'normal', visualMode: 'off', referenceGroups: [] };
  let failure = '';
  await view.proposeIntegrationDirections(parent, empty, () => assert.fail('missing sources'), () => {}, message => { failure = message; });
  assert.match(failure, /Choose another note source first/);
  assert.equal(contexts.length, 0);
  await view.proposeIntegrationDirections(parent, { ...empty, referenceGroups: [{ id: 'empty', name: 'Empty', location: '', documents: [] }] }, () => assert.fail('empty source'), () => {}, message => { failure = message; });
  assert.match(failure, /Choose another note source first/);
  assert.equal(contexts.length, 0);
  let draft, save;
  const selectedGroup = { id: 'selected', name: 'Selected', location: '/refs', documents: [{ path: '/refs/selected.md', content: 'Selected note content', external: true }] };
  await view.proposeIntegrationDirections(parent, { ...empty, referenceGroups: [selectedGroup] }, (_items, next) => { draft = next; }, (_result, commit) => { save = commit; }, message => assert.fail(message));
  assert.ok(contexts[0].referenceGroups.flatMap(group => group.documents).some(document => document.path === '/refs/selected.md'));
  await draft('Combine notes');
  assert.ok(contexts[1].referenceGroups.flatMap(group => group.documents).some(document => document.path === '/refs/selected.md'));
  await save('Combined', 'Combined detail');
  assert.equal((await repo.readNote(parent.path)).summary, 'Combined');
});
integrationTest('decomposition accepts 1 to 7 proposals and does not write nodes before confirmation', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), askModel: async () => ({ summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Only one', task: '', contribution: '' }, { title: 'Only two', task: '', contribution: '' }] }) });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {}; view.openChildSuggestions = () => {};
  await view.proposeChildren(parent, true);
  assert.equal(plugin.pendingSuggestions.get(parent.path).length, 2);
  plugin.pendingSuggestions.clear();
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
  plugin.askModel = async () => ({ summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Only one', task: '', contribution: '' }] });
  await view.proposeChildren(parent, true);
  assert.equal(plugin.pendingSuggestions.get(parent.path).length, 1);
  plugin.pendingSuggestions.clear();
  plugin.askModel = async () => ({ summary: '', detail: '', visualReferences: [], suggestions: Array.from({ length: 8 }, (_, index) => ({ title: `Suggestion ${index + 1}`, task: '', contribution: '' })) });
  await view.proposeChildren(parent, true);
  assert.equal(plugin.pendingSuggestions.get(parent.path).length, 7);
  assert.equal((await repo.readMap(mapPath)).nodes.length, 1);
});
integrationTest('English expansion uses English-generated task instructions', async () => {
  const { repo, app } = fixture('en'), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'Map', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc, 'en'));
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  let task = '';
  const plugin = withExpansionCoordinator({ recordFailure: (_label, error) => String(error), repo, settings: { ...DEFAULT_SETTINGS, language: 'en' }, running: new Set(), pendingSuggestions: new Map(), askModel: async context => { task = context.task; return { summary: '', detail: '', visualReferences: [], suggestions: Array.from({ length: 3 }, (_, index) => ({ title: `Idea ${index}`, task: 'Research', contribution: '' })) }; } });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {}; view.openChildSuggestions = () => {}; view.ancestorContext = async () => '';
  await view.proposeChildren(parent, true);
  assert.match(task, /Existing direct subtopics/);
  assert.doesNotMatch(task, /[一-龥]/);
});
integrationTest('decomposition receives existing child topics to avoid duplicate proposals', async () => {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Travel', 'model-a');
  await repo.updateNote(parent.path, { researchMode: 'local' });
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const child = await repo.createNote('交通', 'model-a', mapDoc, mapPath, 'workspace');
  child.parentId = parent.id; mapDoc.nodes.push(child); await repo.saveMap(mapPath, mapDoc);
  let captured;
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), askModel: async context => { captured = context; return { summary: 'No split', detail: '', visualReferences: [], suggestions: [] }; } });
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.notes.set(child.id, await repo.readNote(child.path)); view.render = () => {}; view.hydrate = async () => {};
  await view.proposeChildren(parent, true);
  assert.match(captured.task, /Existing direct subtopics/);
  assert.match(captured.task, /交通/);
  assert.match(captured.task, /do not pad the count/);
  assert.equal(captured.researchMode, 'research');
  assert.equal(captured.referenceGroups, undefined);
  assert.equal(plugin.pendingSuggestions.size, 0);
});
integrationTest('guided proposals support zero, one, two and seven, saving selected edits and rejecting a switched map', async () => {
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  for (const count of [0, 1, 2, 7]) {
    const { repo, app } = fixture('en');
    const path = await repo.createMap('Guided'), doc = await repo.readMap(path);
    const parent = await repo.createNote('Parent', 'model-a', doc, path, 'workspace'); doc.nodes.push(parent); await repo.saveMap(path, doc);
    const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), mutate: async work => work(), rebuildDerivedData: async () => {}, askModel: async () => ({ summary: '', detail: 'No useful split', suggestions: Array.from({length: count}, (_, i) => ({title: 'Child ' + i, task: 'Explore', contribution: ''})) }) });
    const view = new VisualAgentMapView({app}, plugin); Object.assign(view, {path, map: doc, contentEl: {querySelector: () => null}, render() {}, async hydrate() {}, focusNode() {}});
    let offered, confirm, failure, renderedPending;
    view.render = () => { renderedPending = plugin.pendingSuggestions.size; };
    await view.proposeChildren(parent, true, {}, '', (items, create) => { offered = items; confirm = create; }, message => { failure = message; });
    assert.equal((await repo.readMap(path)).nodes.length, 1);
    if (!count) { assert.equal(failure, 'No useful split'); continue; }
    assert.equal(offered.length, count);
    view.map = { ...doc, id: 'other', nodes: [] }; view.path = 'Other/Map.md';
    await assert.rejects(confirm(offered), /changed/);
    assert.equal((await repo.readMap(path)).nodes.length, 1);
    view.map = doc; view.path = path;
    await confirm([{...offered[0], title: 'Edited choice'}]);
    const reopened = await repo.readMap(path); assert.equal(reopened.nodes.length, 2);
    assert.equal((await repo.readNote(reopened.nodes[1].path)).title, 'Edited choice');
    assert.equal(plugin.pendingSuggestions.size, 0); assert.equal(renderedPending, 0);
  }
});
async function backgroundSynthesisFixture(askModel) {
  const { repo, app } = fixture(), parent = await topicNote(repo, 'Parent', 'model-a');
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md';
  const mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [parent], viewport: { x: 0, y: 0, zoom: 1 } };
  await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const child = await repo.createNote('Child', 'model-a', mapDoc, mapPath, 'workspace'); child.parentId = parent.id; mapDoc.nodes.push(child); await repo.saveMap(mapPath, mapDoc);
  await repo.updateNote(parent.path, { status: 'completed', summary: 'Existing conclusion', detail: 'Existing knowledge' });
  const contexts = [];
  const plugin = { repo, settings: { ...DEFAULT_SETTINGS }, running: new Set(), activeTasks: new Map(), mutate: async work => work(), recordFailure: (_context, error) => error.message, askModel: (context, model, reasoning, signal, onExchange, onAccepted) => { contexts.push(context); return askModel(contexts.length, signal, onAccepted); } };
  const { VisualAgentMapView } = load('main.ts', { obsidian });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.render = () => {}; view.hydrate = async () => {}; view.ancestorContext = async () => '';
  const options = () => ({ researchMode: 'local', researchDepth: 'normal', visualMode: 'off', referenceGroups: [] });
  const directionsResult = { summary: '', detail: '', visualReferences: [], suggestions: [{ title: 'Common ground', task: 'Find shared constraints', contribution: 'A shared view', parentTitle: '' }] };
  const draftResult = { summary: 'Draft summary', detail: 'Draft detail', visualReferences: [], suggestions: [] };
  return { repo, parent, plugin, view, contexts, options, directionsResult, draftResult };
}
integrationTest('closing the modal after dispatch does not abort background synthesis; directions then draft then save', async () => {
  const gate = deferred(); let seenSignal;
  const f = await backgroundSynthesisFixture(async (call, signal, onAccepted) => { seenSignal = signal; onAccepted(); await gate.promise; return call === 1 ? f.directionsResult : f.draftResult; });
  const modalController = new AbortController(); let acceptedCalls = 0, failures = [];
  const started = f.view.startSynthesis(f.parent, { ...f.options(), signal: modalController.signal }, null, message => failures.push(message), () => { acceptedCalls++; modalController.abort(); });
  await until(() => acceptedCalls === 1);
  assert.equal(f.view.synthesisTasks.get(f.parent.path).state, 'running'); assert.equal(f.plugin.activeTasks.has(f.parent.path), true);
  assert.equal(seenSignal.aborted, false, 'closing the modal must not abort the background task');
  gate.resolve(); await started;
  const task = f.view.synthesisTasks.get(f.parent.path);
  assert.equal(task.state, 'directions'); assert.equal(task.directions[0].title, 'Common ground'); assert.equal(f.plugin.activeTasks.size, 0); assert.equal(f.plugin.running.size, 0); assert.deepEqual(failures, []);
  assert.equal((await f.repo.readNote(f.parent.path)).summary, 'Existing conclusion');
  await f.view.startSynthesis(f.parent, f.options(), 'Find shared constraints', message => failures.push(message), () => {});
  assert.equal(f.contexts[1].task, 'Find shared constraints'); assert.equal(task.state, 'draft'); assert.equal(task.draft.summary, 'Draft summary'); assert.equal((await f.repo.readNote(f.parent.path)).summary, 'Existing conclusion');
  await task.save('Edited summary', 'Edited detail');
  const saved = await f.repo.readNote(f.parent.path);
  assert.equal(saved.summary, 'Edited summary'); assert.match(saved.detail, /Edited detail/); assert.equal(saved.status, 'completed'); assert.deepEqual(failures, []);
});
integrationTest('a synthesis draft is refused when the parent topic changed after the draft was made', async () => {
  const f = await backgroundSynthesisFixture(async call => call === 1 ? f.directionsResult : f.draftResult);
  await f.view.startSynthesis(f.parent, f.options(), null, message => assert.fail(message), () => {});
  await f.view.startSynthesis(f.parent, f.options(), 'Find shared constraints', message => assert.fail(message), () => {});
  const task = f.view.synthesisTasks.get(f.parent.path); assert.equal(task.state, 'draft');
  await f.repo.updateNote(f.parent.path, { summary: 'Edited meanwhile' });
  await assert.rejects(task.save('Edited summary', 'Edited detail'), /the synthesis draft was not saved/i);
  assert.equal((await f.repo.readNote(f.parent.path)).summary, 'Edited meanwhile');
});
integrationTest('Stop on the node cancels background synthesis and preserves the topic', async () => {
  const f = await backgroundSynthesisFixture((_call, signal, onAccepted) => new Promise((_resolve, reject) => { onAccepted(); signal.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); }, { once: true }); }));
  let accepted = 0; const failures = [];
  const started = f.view.startSynthesis(f.parent, f.options(), null, message => failures.push(message), () => accepted++);
  await until(() => accepted === 1);
  f.view.synthesisTasks.get(f.parent.path).controller.abort(); await started;
  const task = f.view.synthesisTasks.get(f.parent.path);
  assert.equal(task.state, 'cancelled'); assert.equal(f.plugin.activeTasks.size, 0); assert.equal(f.plugin.running.size, 0);
  assert.match(failures[0], /stopped|preserved/i);
  const after = await f.repo.readNote(f.parent.path); assert.equal(after.status, 'completed'); assert.equal(after.summary, 'Existing conclusion');
});
integrationTest('a second synthesis start on a busy topic is refused without a second AI call', async () => {
  const gate = deferred();
  const f = await backgroundSynthesisFixture(async (call, _signal, onAccepted) => { onAccepted(); await gate.promise; return call === 1 ? f.directionsResult : f.draftResult; });
  let accepted = 0; const failures = [];
  const first = f.view.startSynthesis(f.parent, f.options(), null, message => failures.push(message), () => accepted++);
  await until(() => accepted === 1);
  await f.view.startSynthesis(f.parent, f.options(), null, message => failures.push(message), () => assert.fail('second start must not be accepted'));
  assert.equal(failures.length, 1); assert.equal(f.contexts.length, 1);
  gate.resolve(); await first;
  assert.equal(f.view.synthesisTasks.get(f.parent.path).state, 'directions');
  await f.view.startSynthesis(f.parent, f.options(), null, message => failures.push(message), () => assert.fail('pending directions must be handled first'));
  assert.equal(failures.length, 2); assert.equal(f.contexts.length, 1);
});
integrationTest('a parent topic edited while the draft AI call is pending refuses the save and keeps the content', async () => {
  const gate = deferred();
  const f = await backgroundSynthesisFixture(async (call, _signal, onAccepted) => { onAccepted(); if (call === 2) await gate.promise; return call === 1 ? f.directionsResult : f.draftResult; });
  await f.view.startSynthesis(f.parent, f.options(), null, message => assert.fail(message), () => {});
  let accepted = 0;
  const drafting = f.view.startSynthesis(f.parent, f.options(), 'Find shared constraints', message => assert.fail(message), () => accepted++);
  await until(() => accepted === 1);
  await f.repo.updateNote(f.parent.path, { summary: 'Edited while drafting' });
  gate.resolve(); await drafting;
  const task = f.view.synthesisTasks.get(f.parent.path); assert.equal(task.state, 'draft');
  await assert.rejects(task.save('Edited summary', 'Edited detail'), /the synthesis draft was not saved/i);
  const after = await f.repo.readNote(f.parent.path); assert.equal(after.summary, 'Edited while drafting'); assert.equal(after.detail, 'Existing knowledge');
});
integrationTest('aborting before dispatch acceptance leaves a cancelled synthesis on the node and no running state', async () => {
  const f = await backgroundSynthesisFixture((_call, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); }, { once: true }); }));
  const modalController = new AbortController(); const failures = [];
  const started = f.view.startSynthesis(f.parent, { ...f.options(), signal: modalController.signal }, null, message => failures.push(message), () => assert.fail('must not be accepted'));
  await until(() => f.contexts.length === 1);
  modalController.abort(); await started;
  assert.equal(f.view.synthesisTasks.get(f.parent.path).state, 'cancelled'); assert.equal(f.plugin.activeTasks.size, 0); assert.equal(f.plugin.running.size, 0); assert.equal(failures.length, 1);
  assert.equal((await f.repo.readNote(f.parent.path)).status, 'completed');
});

integrationTest('a provider failure before acceptance keeps a failed synthesis with its message on the node', async () => {
  const f = await backgroundSynthesisFixture(async () => { throw new Error('Codex is not signed in'); });
  const failures = [];
  await f.view.startSynthesis(f.parent, f.options(), null, message => failures.push(message), () => assert.fail('must not be accepted'));
  const task = f.view.synthesisTasks.get(f.parent.path);
  assert.equal(task.state, 'failed'); assert.match(task.progress, /Codex is not signed in/); assert.equal(failures.length, 1);
  assert.equal(f.plugin.activeTasks.size, 0); assert.equal(f.plugin.running.size, 0);
  assert.equal((await f.repo.readNote(f.parent.path)).status, 'completed');
});
async function multiResearchHarness(titles, overrides = {}) {
  const { repo, app } = fixture('en'), notices = [], runs = [], finish = new Map();
  const mapPath = 'Agent Workspace/Topics/map-a/Map.md', mapDoc = { id: 'map-a', title: 'map-a', version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
  await repo.ensureTopicFolders('Agent Workspace/Topics/map-a'); await app.vault.create(mapPath, core.serializeMap(mapDoc));
  const nodes = [];
  for (const title of titles) { const created = await repo.createNote(title, 'model-a', mapDoc, mapPath, 'workspace'); mapDoc.nodes.push(created); nodes.push(created); }
  await repo.saveMap(mapPath, mapDoc);
  const confirms = [];
  const plugin = withExpansionCoordinator({ repo, settings: { ...DEFAULT_SETTINGS, language: 'en', cliModel: 'gpt-6-luna' }, running: new Set(), pendingSuggestions: new Map(), pendingResearchOptions: new Map(), rebuildDerivedData: async () => {}, mutate: async work => work(), confirmAiUsage: async (model, run) => { confirms.push(model); await run(); return true; }, ...overrides });
  const { VisualAgentMapView } = load('main.ts', { obsidian: { ...obsidian, Notice: class { constructor(message) { notices.push(message); } } } });
  const view = new VisualAgentMapView({ app }, plugin); view.path = mapPath; view.map = mapDoc; view.contentEl = { querySelector: () => null }; view.render = () => {}; view.hydrate = async () => {};
  view.runAgent = async (child, _done, failed, options, accepted) => {
    const note = await repo.readNote(child.path);
    runs.push({ title: note.title, options }); plugin.running.add(child.path); accepted();
    const finished = new Promise(resolve => { finish.set(note.title, (message) => { plugin.running.delete(child.path); if (message) failed(message); resolve(); }); options.signal.addEventListener('abort', () => { plugin.running.delete(child.path); resolve(); }, { once: true }); });
    return { finished };
  };
  const request = { researchMode: 'research', researchDepth: 'fast', requirements: '' };
  return { repo, view, plugin, nodes, notices, runs, finish, confirms, request, key: `multi-research:${mapPath}` };
}
integrationTest('multi research runs selected topics in the background with the chosen options and a map-level key', async () => {
  const h = await multiResearchHarness(['A', 'B']);
  await h.repo.updateNote(h.nodes[1].path, { prompt: 'Custom prompt for B' });
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch({ researchMode: 'local', researchDepth: 'deep', requirements: 'Focus on 2025' });
  await until(() => h.runs.length === 2);
  assert.deepEqual(plain(h.confirms), ['gpt-6-luna']);
  const [a, b] = h.runs;
  assert.match(a.options.task, /A/); assert.match(a.options.task, /Focus on 2025$/);
  assert.match(b.options.task, /^Custom prompt for B\n\nFocus on 2025$/);
  for (const run of h.runs) { assert.equal(run.options.researchMode, 'local'); assert.equal(run.options.researchDepth, 'deep'); assert.equal(run.options.visualMode, 'off'); assert.deepEqual(plain(run.options.referenceGroups), []); }
  assert.equal(h.plugin.expansionBatches.get(h.key).total, 2);
  assert.ok(!h.nodes.some(n => h.plugin.expansionBatches.has(n.path)), 'no per-node batch badge');
  h.finish.get('A')(); h.finish.get('B')();
  await until(() => h.plugin.expansionBatches.get(h.key).status === 'completed');
  assert.equal(h.plugin.activeTasks.has(h.key), false);
});
integrationTest('multi research without requirements uses the topic prompt alone and web search maps to research', async () => {
  const h = await multiResearchHarness(['Solo']);
  h.view.multiSelected = new Set([h.nodes[0].id]);
  await h.view.startMultiResearch(h.request);
  await until(() => h.runs.length === 1);
  assert.doesNotMatch(h.runs[0].options.task, /\n\n$/); assert.equal(h.runs[0].options.researchMode, 'research');
  h.finish.get('Solo')(); await until(() => h.plugin.expansionBatches.get(h.key).status === 'completed');
});
integrationTest('multi research runs at most three topics at once and stop aborts every running one', async () => {
  const h = await multiResearchHarness(['A', 'B', 'C', 'D', 'E']);
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch(h.request);
  await until(() => h.runs.length === 3); await new Promise(r => setTimeout(r, 20));
  assert.equal(h.runs.length, 3);
  h.finish.get('A')(); await until(() => h.runs.length === 4);
  assert.equal(h.plugin.expansionBatches.get(h.key).completed, 1);
  h.view.stopMultiResearch();
  await until(() => h.plugin.expansionBatches.get(h.key).status === 'stopped');
  assert.equal(h.runs.length, 4); assert.equal(h.plugin.running.size, 0);
  assert.ok(h.runs.every(run => run.options.signal.aborted));
});
integrationTest('multi research skips topics already running AI and tells the owner how many', async () => {
  const h = await multiResearchHarness(['A', 'B', 'C', 'D']);
  h.plugin.running.add(h.nodes[0].path); h.plugin.quickExpandPending.add(h.nodes[1].path); h.plugin.activeTasks.set(h.nodes[2].path, new AbortController());
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch(h.request);
  await until(() => h.runs.length === 1);
  assert.deepEqual(plain(h.runs.map(r => r.title)), ['D']);
  assert.equal(h.plugin.expansionBatches.get(h.key).total, 1);
  assert.ok(h.notices.some(m => /Skipped 3 /.test(m)), h.notices.join('|'));
  h.finish.get('D')(); await until(() => h.plugin.expansionBatches.get(h.key).status === 'completed');
});
integrationTest('multi research starts no batch when every selected topic is already running', async () => {
  const h = await multiResearchHarness(['A', 'B']);
  for (const n of h.nodes) h.plugin.running.add(n.path);
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch(h.request);
  assert.equal(h.plugin.expansionBatches.has(h.key), false); assert.equal(h.runs.length, 0);
  assert.equal(h.notices.length, 1); assert.match(h.notices[0], /already running/);
});
integrationTest('a second multi research batch on the same map is refused while one is running', async () => {
  const h = await multiResearchHarness(['A', 'B', 'C']);
  h.view.multiSelected = new Set([h.nodes[0].id]);
  await h.view.startMultiResearch(h.request); await until(() => h.runs.length === 1);
  h.view.multiSelected = new Set([h.nodes[1].id, h.nodes[2].id]);
  h.confirms.length = 0;
  await h.view.startMultiResearch(h.request);
  assert.equal(h.runs.length, 1); assert.equal(h.confirms.length, 0);
  assert.ok(h.notices.some(m => /already running on this map/.test(m)));
  assert.equal(h.plugin.expansionBatches.get(h.key).total, 1);
  h.finish.get('A')(); await until(() => h.plugin.expansionBatches.get(h.key).status === 'completed');
});
integrationTest('a failing topic is recorded and does not stop the others', async () => {
  const h = await multiResearchHarness(['A', 'B', 'C']);
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch(h.request);
  await until(() => h.runs.length === 3);
  h.finish.get('B')('model exploded'); h.finish.get('A')(); h.finish.get('C')();
  await until(() => h.plugin.expansionBatches.get(h.key).status === 'completed');
  const state = h.plugin.expansionBatches.get(h.key);
  assert.equal(state.completed, 3); assert.equal(state.failures.length, 1); assert.match(state.failures[0], /model exploded/);
  assert.ok(h.notices.some(m => /1 failed/.test(m)), h.notices.join('|'));
});
integrationTest('multi research is not offered on AIM maps and needs at least one topic', async () => {
  const h = await multiResearchHarness(['A']);
  h.view.multiSelected = new Set(); await h.view.startMultiResearch(h.request);
  assert.equal(h.plugin.expansionBatches.size, 0);
  h.view.map.aim = { version: 1, branches: [], runs: [], pendingCommits: [] }; h.view.multiSelected = new Set([h.nodes[0].id]);
  await h.view.startMultiResearch(h.request);
  assert.equal(h.plugin.expansionBatches.size, 0); assert.equal(h.runs.length, 0);
});
integrationTest('selection bar shows Research; starting leaves selection mode and the top status bar shows progress and Stop', async () => {
  const h = await multiResearchHarness(['A', 'B']);
  const element = (tag, o = {}) => ({ tag, text: o.text ?? '', cls: o.cls ?? '', disabled: false, children: [], listeners: {},
    createDiv(v) { const c = element('div', { cls: typeof v === 'string' ? v : v?.cls }); this.children.push(c); return c; },
    createEl(n, v = {}) { const c = element(n, v); this.children.push(c); return c; }, createSpan(v = {}) { const c = element('span', v); this.children.push(c); return c; },
    addEventListener(n, fn) { this.listeners[n] = fn; }, addClass(n) { this.cls = `${this.cls} ${n}`.trim(); }, setAttr() {} });
  const all = root => [root, ...root.children.flatMap(all)];
  const bar = (view = h.view) => { const root = element('workspace'); view.renderSelectionBar(root); return all(root); };
  const toolbar = () => { const root = element('content'); h.view.renderMultiResearchStatus(root); return all(root); };
  h.view.notes = new Map(h.nodes.map(n => [n.id, { title: n.id }]));
  let items = bar(); const research = () => items.find(i => i.tag === 'button' && i.text === 'Research');
  items = bar(); assert.ok(research()); assert.equal(research().disabled, true);
  h.view.multiSelected = new Set([h.nodes[0].id]); items = bar(); assert.equal(research().disabled, false);
  h.view.map.aim = {}; items = bar(); assert.equal(research(), undefined); delete h.view.map.aim;
  assert.equal(toolbar().length, 1);
  h.view.integrationMode = true;
  await h.view.startMultiResearch(h.request); await until(() => h.runs.length === 1);
  assert.equal(h.view.integrationMode, false); assert.equal(h.view.multiSelected.size, 0);
  h.view.multiSelected = new Set([h.nodes[1].id]); items = bar(); assert.equal(research().disabled, true);
  assert.equal(items.find(i => i.text === 'Researching 0/1'), undefined);
  items = toolbar();
  assert.ok(items.find(i => i.tag === 'span' && i.text === `Researching 0/1 · ${h.nodes[0].id}`), items.map(i => i.text).join('|'));
  assert.ok(items.find(i => i.tag === 'div' && /vam-aim-statusbar/.test(i.cls)));
  const stop = items.find(i => i.tag === 'button' && i.text === 'Stop research'); assert.ok(stop);
  stop.listeners.click({ stopPropagation() {} });
  await until(() => h.plugin.expansionBatches.get(h.key).status === 'stopped');
  assert.equal(toolbar().length, 1);
});
integrationTest('multi research with a chosen model saves it on each started topic and confirms usage for it', async () => {
  const h = await multiResearchHarness(['A', 'B', 'C']);
  h.plugin.running.add(h.nodes[2].path);
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch({ ...h.request, model: 'model-b' });
  await until(() => h.runs.length === 2);
  assert.deepEqual(plain(h.confirms), ['model-b']);
  for (const node of h.nodes.slice(0, 2)) {
    const note = await h.repo.readNote(node.path);
    assert.equal(note.model, 'model-b'); assert.equal(note.modelSource, 'manual');
  }
  assert.equal((await h.repo.readNote(h.nodes[2].path)).model, 'model-a');
  h.finish.get('A')(); h.finish.get('B')();
});
integrationTest('multi research without a chosen model keeps each topic model', async () => {
  const h = await multiResearchHarness(['A']);
  h.view.multiSelected = new Set([h.nodes[0].id]);
  await h.view.startMultiResearch(h.request); await until(() => h.runs.length === 1);
  const note = await h.repo.readNote(h.nodes[0].path);
  assert.equal(note.model, 'model-a'); assert.equal(note.modelSource, 'workspace');
  h.finish.get('A')();
});
integrationTest('multi research keeps selection mode when nothing starts', async () => {
  const h = await multiResearchHarness(['A']);
  h.plugin.running.add(h.nodes[0].path);
  h.view.integrationMode = true; h.view.multiSelected = new Set([h.nodes[0].id]);
  await h.view.startMultiResearch(h.request);
  assert.equal(h.view.integrationMode, true); assert.equal(h.view.multiSelected.size, 1);
});
integrationTest('multi research: stop before any topic is accepted gives exactly one summary Notice and no launch error', async () => {
  const h = await multiResearchHarness(['A']);
  h.view.runAgent = async () => { h.view.stopMultiResearch(); return undefined; };
  h.view.multiSelected = new Set([h.nodes[0].id]);
  await h.view.startMultiResearch(h.request);
  await until(() => h.plugin.expansionBatches.get(h.key).status !== 'running');
  assert.equal(h.notices.length, 1, h.notices.join('|'));
  assert.equal(h.notices[0], 'Research stopped: 0 of 1 succeeded, 0 failed, 0 skipped.');
});
integrationTest('multi research: a topic that became busy before dispatch is skipped, not failed', async () => {
  const h = await multiResearchHarness(['A', 'B', 'C', 'D']);
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch(h.request);
  await until(() => h.runs.length === 3);
  h.plugin.running.add(h.nodes[3].path);
  h.finish.get('A')(); h.finish.get('B')(); h.finish.get('C')();
  await until(() => h.plugin.expansionBatches.get(h.key).status === 'completed');
  assert.equal(h.runs.length, 3);
  const state = h.plugin.expansionBatches.get(h.key);
  assert.equal(state.failures.length, 0);
  assert.equal(h.notices.at(-1), 'Research finished: 3 of 4 succeeded, 0 failed, 1 skipped.');
});
integrationTest('multi research summary counts only successful topics as succeeded', async () => {
  const h = await multiResearchHarness(['A', 'B']);
  h.view.multiSelected = new Set(h.nodes.map(n => n.id));
  await h.view.startMultiResearch(h.request);
  await until(() => h.runs.length === 2);
  h.finish.get('A')('boom'); h.finish.get('B')();
  await until(() => h.plugin.expansionBatches.get(h.key).status === 'completed');
  assert.equal(h.notices.at(-1), 'Research finished: 1 of 2 succeeded, 1 failed, 0 skipped.');
});
